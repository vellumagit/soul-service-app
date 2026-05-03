// Google Calendar + Meet integration. Single-user app — one OAuth connection
// per practitioner_settings row.
//
// What this does:
// - Builds the OAuth consent URL (for "Connect Google Calendar" button)
// - Exchanges the auth code for tokens (in /api/auth/google/callback)
// - Refreshes expired access tokens using the refresh token
// - Creates / updates / deletes Calendar events with auto-generated Meet links
// - Adds the client (by email) as an attendee so they get a calendar invite
//
// All event ops are best-effort: if Google fails, we still save the session
// locally and surface a warning rather than crashing the user's flow.
import "server-only";
import { google } from "googleapis";
import { db } from "@/db";
import { practitionerSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

// Scopes we request: full calendar event management (read + write own events).
// "calendar.events" is narrower than "calendar" — only events, not calendar lists.
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "openid",
  "email",
];

function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = getRedirectUri();
  if (!clientId || !clientSecret) {
    throw new Error(
      "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set. See README → Google Calendar setup."
    );
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function getRedirectUri(): string {
  // Vercel sets VERCEL_URL automatically. NEXTAUTH_URL or APP_URL can override
  // (useful for custom domains or localhost dev).
  const explicit = process.env.APP_URL ?? process.env.NEXTAUTH_URL;
  if (explicit) {
    return `${explicit.replace(/\/$/, "")}/api/auth/google/callback`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/api/auth/google/callback`;
  }
  return "http://localhost:3000/api/auth/google/callback";
}

// Public — used by the "Connect Google Calendar" server action
export function getGoogleAuthUrl(): string {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline", // required to get a refresh token
    prompt: "consent", // forces refresh_token even on re-consent
    scope: SCOPES,
  });
}

// Public — exchange the OAuth code for tokens and persist on the settings row
export async function exchangeGoogleCode(code: string) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);

  if (!tokens.refresh_token) {
    // This usually means the user has already granted consent before. Tell them
    // to revoke at https://myaccount.google.com/permissions and try again.
    throw new Error(
      "Google didn't return a refresh token. Revoke this app's access at https://myaccount.google.com/permissions and connect again."
    );
  }

  // Get the connected user's email (for display in Settings)
  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const userInfo = await oauth2.userinfo.get();
  const email = userInfo.data.email ?? null;

  // Save on settings row
  const settingsRows = await db.select().from(practitionerSettings);
  if (settingsRows.length === 0) {
    await db.insert(practitionerSettings).values({
      googleAccessToken: tokens.access_token ?? null,
      googleRefreshToken: tokens.refresh_token,
      googleTokenExpiresAt: tokens.expiry_date
        ? new Date(tokens.expiry_date)
        : null,
      googleCalendarEmail: email,
      googleConnectedAt: new Date(),
    });
  } else {
    await db
      .update(practitionerSettings)
      .set({
        googleAccessToken: tokens.access_token ?? null,
        googleRefreshToken: tokens.refresh_token,
        googleTokenExpiresAt: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : null,
        googleCalendarEmail: email,
        googleConnectedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(practitionerSettings.id, settingsRows[0].id));
  }

  return { email };
}

// Public — disconnect: revoke the token at Google, then null out our copy
export async function disconnectGoogle() {
  const settingsRows = await db.select().from(practitionerSettings).limit(1);
  const settings = settingsRows[0];
  if (!settings?.googleRefreshToken) return;

  try {
    const client = getOAuthClient();
    client.setCredentials({ refresh_token: settings.googleRefreshToken });
    await client.revokeCredentials();
  } catch (e) {
    console.warn("Google revoke failed (continuing with local clear):", e);
  }

  await db
    .update(practitionerSettings)
    .set({
      googleAccessToken: null,
      googleRefreshToken: null,
      googleTokenExpiresAt: null,
      googleCalendarEmail: null,
      googleConnectedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(practitionerSettings.id, settings.id));
}

// Returns an authed OAuth2 client with a fresh access token, or null if not
// connected. Auto-refreshes expired tokens and persists the new access token.
async function getAuthedClient() {
  const settingsRows = await db.select().from(practitionerSettings).limit(1);
  const settings = settingsRows[0];
  if (!settings?.googleRefreshToken) return null;

  const client = getOAuthClient();
  client.setCredentials({
    access_token: settings.googleAccessToken,
    refresh_token: settings.googleRefreshToken,
    expiry_date: settings.googleTokenExpiresAt?.getTime() ?? null,
  });

  // googleapis auto-refreshes when expired — listen for new tokens and persist.
  client.on("tokens", async (tokens) => {
    if (tokens.access_token) {
      await db
        .update(practitionerSettings)
        .set({
          googleAccessToken: tokens.access_token,
          googleTokenExpiresAt: tokens.expiry_date
            ? new Date(tokens.expiry_date)
            : null,
          updatedAt: new Date(),
        })
        .where(eq(practitionerSettings.id, settings.id));
    }
  });

  return client;
}

// Public — check connected status (used by Settings UI)
export async function getGoogleConnectionStatus(): Promise<{
  connected: boolean;
  email: string | null;
  connectedAt: Date | null;
}> {
  const settingsRows = await db
    .select({
      googleRefreshToken: practitionerSettings.googleRefreshToken,
      googleCalendarEmail: practitionerSettings.googleCalendarEmail,
      googleConnectedAt: practitionerSettings.googleConnectedAt,
    })
    .from(practitionerSettings)
    .limit(1);
  const s = settingsRows[0];
  return {
    connected: !!s?.googleRefreshToken,
    email: s?.googleCalendarEmail ?? null,
    connectedAt: s?.googleConnectedAt ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Event CRUD
// ─────────────────────────────────────────────────────────────────────────────

export type CalendarEventInput = {
  summary: string;
  description?: string;
  startAt: Date;
  durationMinutes: number;
  attendeeEmail?: string | null; // the client
  practitionerEmail?: string | null; // for the description/owner
};

export type CalendarEventResult = {
  eventId: string;
  meetUrl: string | null;
  htmlLink: string | null;
};

// Create a new event with an auto-generated Meet link.
// Returns null if Google isn't connected (caller should treat this as a no-op).
export async function createCalendarEvent(
  input: CalendarEventInput
): Promise<CalendarEventResult | null> {
  const auth = await getAuthedClient();
  if (!auth) return null;

  const calendar = google.calendar({ version: "v3", auth });
  const end = new Date(input.startAt.getTime() + input.durationMinutes * 60000);

  const requestId = `soul-service-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;

  const res = await calendar.events.insert({
    calendarId: "primary",
    sendUpdates: input.attendeeEmail ? "all" : "none",
    conferenceDataVersion: 1, // required for Meet auto-creation
    requestBody: {
      summary: input.summary,
      description: input.description,
      start: { dateTime: input.startAt.toISOString() },
      end: { dateTime: end.toISOString() },
      attendees: input.attendeeEmail
        ? [{ email: input.attendeeEmail }]
        : undefined,
      conferenceData: {
        createRequest: {
          requestId,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: "email", minutes: 24 * 60 }, // day-before email
          { method: "popup", minutes: 30 }, // 30-min popup
        ],
      },
    },
  });

  const meetUrl =
    res.data.conferenceData?.entryPoints?.find(
      (e) => e.entryPointType === "video"
    )?.uri ?? res.data.hangoutLink ?? null;

  return {
    eventId: res.data.id!,
    meetUrl,
    htmlLink: res.data.htmlLink ?? null,
  };
}

// Update an existing event (typically when the session is rescheduled).
export async function updateCalendarEvent(
  eventId: string,
  input: CalendarEventInput
): Promise<CalendarEventResult | null> {
  const auth = await getAuthedClient();
  if (!auth) return null;

  const calendar = google.calendar({ version: "v3", auth });
  const end = new Date(input.startAt.getTime() + input.durationMinutes * 60000);

  try {
    const res = await calendar.events.patch({
      calendarId: "primary",
      eventId,
      sendUpdates: input.attendeeEmail ? "all" : "none",
      requestBody: {
        summary: input.summary,
        description: input.description,
        start: { dateTime: input.startAt.toISOString() },
        end: { dateTime: end.toISOString() },
        attendees: input.attendeeEmail
          ? [{ email: input.attendeeEmail }]
          : undefined,
      },
    });

    const meetUrl =
      res.data.conferenceData?.entryPoints?.find(
        (e) => e.entryPointType === "video"
      )?.uri ?? res.data.hangoutLink ?? null;

    return {
      eventId: res.data.id!,
      meetUrl,
      htmlLink: res.data.htmlLink ?? null,
    };
  } catch (err) {
    // Event was deleted on Google's side — return null so caller can clear our ref
    if (isNotFoundError(err)) return null;
    throw err;
  }
}

// Delete an event. Best-effort — swallows "already gone" errors.
export async function deleteCalendarEvent(eventId: string): Promise<void> {
  const auth = await getAuthedClient();
  if (!auth) return;

  const calendar = google.calendar({ version: "v3", auth });
  try {
    await calendar.events.delete({
      calendarId: "primary",
      eventId,
      sendUpdates: "all",
    });
  } catch (err) {
    if (isNotFoundError(err)) return; // already gone, fine
    throw err;
  }
}

function isNotFoundError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: number; status?: number };
  return e.code === 404 || e.status === 404 || e.code === 410 || e.status === 410;
}
