import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  timestamp,
  date,
  pgEnum,
  boolean,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

export const sessionStatusEnum = pgEnum("session_status", [
  "scheduled",
  "completed",
  "cancelled",
  "no_show",
]);

export const clientStatusEnum = pgEnum("client_status", [
  "active",
  "new",
  "dormant",
  "archived",
]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "venmo",
  "zelle",
  "etransfer",
  "cash",
  "paypal",
  "stripe",
  "other",
]);

export const attachmentKindEnum = pgEnum("attachment_kind", [
  "note",
  "intake",
  "consent",
  "recording",
  "photo",
  "other",
]);

export const communicationKindEnum = pgEnum("communication_kind", [
  "email_sent",
  "email_received",
  "call_logged",
  "sms_sent",
  "note",
]);

export const taskSourceEnum = pgEnum("task_source", [
  "manual",
  "rule",
]);

export const seriesFrequencyEnum = pgEnum("series_frequency", [
  "weekly",      // every 7 days
  "biweekly",    // every 14 days
  "monthly",     // every month on the same day-of-month
]);

// ─────────────────────────────────────────────────────────────────────────────
// accounts — one row per signed-in user. Every user-data row carries an
// accountId so the test account and the production account never see each
// other's data. Auth is just "type your email" — see lib/session.ts.
// ─────────────────────────────────────────────────────────────────────────────

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"), // display name — defaults to "Practitioner"
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─────────────────────────────────────────────────────────────────────────────
// clients — the central entity
// ─────────────────────────────────────────────────────────────────────────────

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    fullName: text("full_name").notNull(),
    avatarUrl: text("avatar_url"),

    pronouns: varchar("pronouns", { length: 32 }),
    dob: date("dob"),

    email: text("email"),
    phone: varchar("phone", { length: 32 }),
    city: text("city"),
    timezone: varchar("timezone", { length: 64 }),

    // Free-text fields the practitioner edits in the profile form
    aboutClient: text("about_client"), // anything she wants to remember about who they are
    workingOn: text("working_on"), // short phrase shown in directory
    intakeNotes: text("intake_notes"), // single freeform intake field
    howTheyFoundMe: text("how_they_found_me"),

    // ISO 639-1 code: "en" | "ru" | "uk". Null = fall back to UI language.
    // Used to filter email templates and (later) localize generated invoices.
    preferredLanguage: text("preferred_language"),

    // Free-form tags — practitioner picks her own vocabulary
    tags: text("tags").array().default([]).notNull(),

    // Sensitivity flags shown at the top of the file. Things to handle gently
    // — practitioner's free-form descriptions, never shared with the client.
    sensitivities: text("sensitivities").array().default([]).notNull(),

    // Practitioner-only private notes — never exported, never shown to the client.
    privateNotes: text("private_notes"),

    primarySessionType: text("primary_session_type"), // free-form (the practitioner's own label)

    emergencyName: text("emergency_name"),
    emergencyPhone: varchar("emergency_phone", { length: 32 }),

    status: clientStatusEnum("status").default("active").notNull(),

    // Network — light contact-book layer on top of the client folder.
    // `isLead` is true while she's noted them but they haven't had a first
    // session yet. Auto-flips to false the moment a session is scheduled
    // for them (see scheduleSession action). She can also flip it back
    // manually if she wants to demote someone from client back to network.
    // `metOn` is the date she first met them (often earlier than the first
    // session; optional). `metViaClientId` is an optional FK to another
    // client — for tracking "Sarah referred them" as a structured link.
    // The pre-existing `howTheyFoundMe` free-text field is reused as the
    // source description ("Olga's birthday party", "Insight Timer DM").
    isLead: boolean("is_lead").default(false).notNull(),
    metOn: date("met_on"),
    metViaClientId: uuid("met_via_client_id"),

    // Client portal — per-client opt-in. Practitioner flips it ON in
    // EditClientDialog and clicks "Send portal invite" to email the magic
    // link. Default OFF so existing clients don't accidentally get access
    // until the practitioner consciously enables it for each one.
    portalEnabled: boolean("portal_enabled").default(false).notNull(),
    lastPortalVisitAt: timestamp("last_portal_visit_at"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    accountIdx: index("clients_account_idx").on(t.accountId),
    nameIdx: index("clients_name_idx").on(t.fullName),
    statusIdx: index("clients_status_idx").on(t.status),
    leadIdx: index("clients_lead_idx").on(t.accountId, t.isLead),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// sessions — every scheduled or past session for a client.
// Payment lives on the session row itself (no separate invoice entity).
// ─────────────────────────────────────────────────────────────────────────────

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),

    type: text("type").notNull().default("Session"), // free-form — practitioner renames to fit her own modality
    status: sessionStatusEnum("status").default("scheduled").notNull(),

    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(60),

    // IANA timezone captured from the practitioner's browser at schedule time
    // (e.g. "America/Toronto"). scheduledAt is a true instant; this records the
    // wall-clock zone she MEANT when booking, so reminder/confirmation emails
    // (rendered server-side in UTC) can show the right local time even when she
    // travels. Null on legacy rows → callers fall back to the practice zone.
    timezone: text("timezone"),

    // Optional context
    intention: text("intention"), // client's stated intention, in their own words
    arrivedAs: text("arrived_as"), // how they showed up (free text)
    leftAs: text("left_as"), // how they left (free text)
    notes: text("notes"), // practitioner's session notes

    // The Closing — a quiet ritual the app offers after a session is marked
    // complete. Three optional prompts, separate from notes so the timeline
    // and arc views can read them cheaply. closingCompletedAt is set when
    // she finishes (saved OR explicitly skipped) so the UI stops nagging.
    closingLanded: text("closing_landed"),
    closingRemember: text("closing_remember"),
    closingNeverForget: text("closing_never_forget"),
    closingCompletedAt: timestamp("closing_completed_at"),

    // Milestone — she can pin a session as a named anchor moment ("first
    // breakthrough", "she said it out loud"). Null label = not a milestone.
    // milestoneAt records when she pinned it (which can differ from the
    // session's scheduledAt if she comes back later to mark a past session).
    milestoneLabel: text("milestone_label"),
    milestoneAt: timestamp("milestone_at"),

    meetUrl: text("meet_url"),
    googleEventId: text("google_event_id"),

    // Recurring-series linkage. Null = standalone session. When set, this
    // session was generated as part of a series — useful for "session 3 of 12"
    // labels and for bulk operations (e.g. cancel all future).
    seriesId: uuid("series_id"),
    occurrenceIndex: integer("occurrence_index"), // 1-based

    // Payment lives here (Venmo/Zelle/cash style — no separate invoice entity)
    paid: boolean("paid").default(false).notNull(),
    paymentMethod: paymentMethodEnum("payment_method"),
    paymentAmountCents: integer("payment_amount_cents"),
    paidAt: date("paid_at"),
    paymentNote: text("payment_note"), // optional — confirmation # or short note

    // Generated invoice PDF (Vercel Blob URL). Auto-generated on completion if enabled.
    invoiceUrl: text("invoice_url"),
    invoiceNumber: text("invoice_number"),
    invoiceGeneratedAt: timestamp("invoice_generated_at"),

    // Reminder bookkeeping — set when the hourly cron sends a reminder so we
    // never double-send. Cleared if the session is rescheduled (so a moved
    // session gets a fresh reminder for the new time).
    clientReminderSentAt: timestamp("client_reminder_sent_at"),
    practitionerReminderSentAt: timestamp("practitioner_reminder_sent_at"),

    // Recall.ai auto-notes pipeline — a meeting bot we spawned joins the
    // Meet, records, transcribes, and webhooks the transcript back. We then
    // structure it via Claude and write into `notes`. recall_bot_id is the
    // Recall UUID for the bot tied to this session (null = no bot).
    // recall_bot_status mirrors the bot.status_change.code we receive
    // (joining_call, in_call_recording, done, fatal, etc.).
    // recall_transcript_received_at is set the moment the transcript.done
    // webhook fires AND we successfully wrote notes — drives the "✓
    // Auto-notes" chip and prevents re-running the pipeline twice.
    recallBotId: text("recall_bot_id"),
    recallBotStatus: text("recall_bot_status"),
    recallTranscriptReceivedAt: timestamp("recall_transcript_received_at"),

    // Notetaker output, kept as three distinct fields separate from `notes`
    // (which stays HER own writing):
    //   - transcript: the full verbatim, speaker-attributed meeting transcript
    //   - aiSummary: Claude's structured markdown summary ("the quick look-back")
    //   - aiSummaryTldr: a 2–3 sentence "at a glance" for the fastest glance
    transcript: text("transcript"),
    aiSummary: text("ai_summary"),
    aiSummaryTldr: text("ai_summary_tldr"),

    // Portal three-room expansion:
    //   - clientStatedIntention: what the CLIENT writes (from the portal)
    //     for themselves before a session. Separate from `intention`,
    //     which the practitioner writes. Both surface together in The
    //     Threshold so she walks in holding both.
    //   - clientVisibleNote: a short note the practitioner can choose to
    //     share with the client. Surfaces on the portal Today view
    //     ("Since your last session…") and on every Arc-tab row.
    clientStatedIntention: text("client_stated_intention"),
    clientVisibleNote: text("client_visible_note"),

    // Recap video hosted on Cloudflare Stream. video_id is the Cloudflare
    // UID; we generate signed playback URLs server-side per page render so
    // the iframe src expires every 24h even if the underlying URL is
    // captured.
    recapVideoId: text("recap_video_id"),
    recapVideoUploadedAt: timestamp("recap_video_uploaded_at"),
    recapVideoDurationSeconds: integer("recap_video_duration_seconds"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    accountIdx: index("sessions_account_idx").on(t.accountId),
    clientIdx: index("sessions_client_idx").on(t.clientId),
    scheduledIdx: index("sessions_scheduled_idx").on(t.scheduledAt),
    statusIdx: index("sessions_status_idx").on(t.status),
    paidIdx: index("sessions_paid_idx").on(t.paid),
    recallBotIdx: index("sessions_recall_bot_idx").on(t.recallBotId),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// session_series — a recurring booking. Spawns N sessions when created.
// Editing or cancelling the series lets the practitioner act on all future
// occurrences in one shot.
// ─────────────────────────────────────────────────────────────────────────────

export const sessionSeries = pgTable(
  "session_series",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),

    type: text("type").notNull().default("Session"),
    frequency: seriesFrequencyEnum("frequency").notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(60),

    // The first occurrence's full timestamp — defines time-of-day + day-of-week
    // pattern for the rest of the series.
    firstAt: timestamp("first_at", { withTimezone: true }).notNull(),

    // How many sessions were generated. Stored so we can render "session 3/12"
    // without re-counting, and so we know when a series is "complete".
    occurrenceCount: integer("occurrence_count").notNull(),

    intention: text("intention"),

    // Cancelled (vs deleted) — we keep the row + past sessions but stop future ones.
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    accountIdx: index("session_series_account_idx").on(t.accountId),
    clientIdx: index("session_series_client_idx").on(t.clientId),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// attachments — files uploaded for a client (and optionally tied to a session)
// ─────────────────────────────────────────────────────────────────────────────

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => sessions.id, {
      onDelete: "set null",
    }),

    name: text("name").notNull(),
    kind: attachmentKindEnum("kind").default("other").notNull(),
    url: text("url").notNull(), // Vercel Blob URL
    pathname: text("pathname"), // for deletion via Vercel Blob API
    sizeBytes: integer("size_bytes"),
    mimeType: varchar("mime_type", { length: 128 }),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    clientIdx: index("attachments_client_idx").on(t.clientId),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// important_people — the people who matter in a client's life
// (mom, partner, ex, kid, dog, boss). Helps the practitioner walk into a
// session with the bigger picture in mind, not just the client in isolation.
// ─────────────────────────────────────────────────────────────────────────────

export const importantPeople = pgTable(
  "important_people",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    relationship: text("relationship").notNull(), // free-form: mom, partner, ex, etc
    notes: text("notes"), // dynamic, current temperature, what they mean
    isAlive: boolean("is_alive").default(true).notNull(),
    position: integer("position").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    clientIdx: index("important_people_client_idx").on(t.clientId),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// themes — recurring patterns the practitioner notices across this client's
// sessions. Tag-cloud-style.
// ─────────────────────────────────────────────────────────────────────────────

export const themes = pgTable(
  "themes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    clientIdx: index("themes_client_idx").on(t.clientId),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// observations — running practitioner observations / hunches / hypotheses
// that build up over time as bullet notes.
// ─────────────────────────────────────────────────────────────────────────────

export const observations = pgTable(
  "observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    clientIdx: index("observations_client_idx").on(t.clientId),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// goals — what the client is working on (tracked over time)
// ─────────────────────────────────────────────────────────────────────────────

export const goals = pgTable("goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  progress: integer("progress").notNull().default(0), // 0–100
  note: text("note"),
  archived: boolean("archived").default(false).notNull(),
  position: integer("position").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Relations
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// tasks — to-dos. Optionally tied to a client.
// ─────────────────────────────────────────────────────────────────────────────

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, {
      onDelete: "cascade",
    }),
    sessionId: uuid("session_id").references(() => sessions.id, {
      onDelete: "set null",
    }),

    title: text("title").notNull(),
    body: text("body"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),

    source: taskSourceEnum("source").default("manual").notNull(), // 'rule' = auto-created by automation

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    accountIdx: index("tasks_account_idx").on(t.accountId),
    clientIdx: index("tasks_client_idx").on(t.clientId),
    dueIdx: index("tasks_due_idx").on(t.dueAt),
    completedIdx: index("tasks_completed_idx").on(t.completedAt),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// communications — every email sent / call logged / SMS recorded
// (mailto-based composing means we log "I clicked send" rather than confirming delivery)
// ─────────────────────────────────────────────────────────────────────────────

export const communications = pgTable(
  "communications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    kind: communicationKindEnum("kind").notNull(),
    subject: text("subject"),
    body: text("body"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    templateId: uuid("template_id"), // soft ref — if it was sent from a template
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    accountIdx: index("communications_account_idx").on(t.accountId),
    clientIdx: index("communications_client_idx").on(t.clientId),
    occurredIdx: index("communications_occurred_idx").on(t.occurredAt),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// email_templates — reusable email/message templates
// Body supports {{client.firstName}}, {{client.fullName}}, {{session.date}}, etc.
// ─────────────────────────────────────────────────────────────────────────────

export const emailTemplates = pgTable("email_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  // ISO 639-1 code identifying which language this template is written in.
  // EmailComposer filters templates by the recipient client's preferredLanguage.
  language: text("language").default("en").notNull(),
  archived: boolean("archived").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─────────────────────────────────────────────────────────────────────────────
// note_templates — reusable note structures (insert into session/client notes)
// ─────────────────────────────────────────────────────────────────────────────

export const noteTemplates = pgTable("note_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  body: text("body").notNull(),
  archived: boolean("archived").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─────────────────────────────────────────────────────────────────────────────
// practitioner_settings — single row holding biz info + automation toggles
// ─────────────────────────────────────────────────────────────────────────────

export const practitionerSettings = pgTable("practitioner_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id")
    .notNull()
    .unique()
    .references(() => accounts.id, { onDelete: "cascade" }),

  businessName: text("business_name"),
  practitionerName: text("practitioner_name"), // how the practitioner signs emails / appears on invoices
  // ISO 639-1: "en" | "ru" | "uk". Default UI language for the practitioner.
  uiLanguage: text("ui_language").default("en").notNull(),
  businessEmail: text("business_email"),
  businessPhone: text("business_phone"),
  businessAddress: text("business_address"),
  websiteUrl: text("website_url"),

  // Landing page copy — public-facing content the practitioner edits from
  // /settings. All optional; the landing page falls back to sensible
  // defaults if any are NULL so it stays presentable on day one before
  // she's written anything.
  landingTagline: text("landing_tagline"),
  landingAbout: text("landing_about"),
  landingHowItWorks: text("landing_how_it_works"),
  landingWhatToExpect: text("landing_what_to_expect"),

  // Availability config — drives smart scheduling in ScheduleSessionDialog
  // (conflict warnings against her Google Calendar) and the public
  // "available windows" hint on the storefront inquiry form. workingHours
  // is a free-shape JSON keyed by 3-letter weekday → {from, to} HH:MM.
  // Missing/null day = not working that day. sabbathDays is the legacy
  // toggle and still works as an override.
  workingHours: jsonb("working_hours"),
  bufferMinutes: integer("buffer_minutes").default(15).notNull(),
  defaultSessionMinutes: integer("default_session_minutes")
    .default(60)
    .notNull(),
  showAvailabilityPublicly: boolean("show_availability_publicly")
    .default(false)
    .notNull(),

  // Default rate (used when generating invoices if no amount is set)
  defaultRateCents: integer("default_rate_cents").default(13500).notNull(),
  defaultCurrency: varchar("default_currency", { length: 8 })
    .default("USD")
    .notNull(),

  // Payment instructions printed on invoices (e.g. "Venmo @yourhandle / Zelle you@example.com")
  paymentInstructions: text("payment_instructions"),
  invoiceFooter: text("invoice_footer"), // single closing line — e.g. "Thank you. — Your name"
  invoicePrefix: text("invoice_prefix").default("INV").notNull(),
  nextInvoiceNumber: integer("next_invoice_number").default(1001).notNull(),

  // Automation toggles
  autoInvoiceOnComplete: boolean("auto_invoice_on_complete")
    .default(true)
    .notNull(),
  autoFollowupTaskDays: integer("auto_followup_task_days").default(2), // null = disabled
  autoFollowupTaskTitle: text("auto_followup_task_title").default(
    "Send aftercare email"
  ),
  // When true, AI-generated notes are saved straight to the session instead
  // of waiting for the practitioner to click "Insert into notes". Lets her
  // run a transcript and walk away.
  autoUploadAiNotes: boolean("auto_upload_ai_notes").default(false).notNull(),

  // When true, accepting a lead/inquiry as a client (from /network/inbox)
  // automatically turns on their portal access AND emails them a sign-in
  // link — collapsing the two manual steps (toggle + invite) into the
  // accept action. Off → she enables + invites by hand as before. Only
  // fires when the accepted client has a valid email on file.
  autoPortalInviteOnAccept: boolean("auto_portal_invite_on_accept")
    .default(true)
    .notNull(),

  // Standing meeting room link reused for every Circle (group session). Set
  // once here; the welcome email + reminders use it for all circles unless a
  // specific session has its own meet_url. e.g. a recurring Zoom/Meet room.
  circleRoomUrl: text("circle_room_url"),

  // Master switch for public Circle sign-ups. OFF (default) → the storefront
  // hides the "Upcoming Circles" section and the public /circles/[id] page
  // shows a "reach out to join" message instead of the sign-up form, so the
  // storefront is info + pricing + contact only. Flip ON when payment +
  // emails are ready to take live sign-ups.
  circleSignupsOpen: boolean("circle_signups_open").default(false).notNull(),

  // Portrait photo shown in the landing "About / Who I am" section. When
  // set, the image renders in the portrait frame; blank → the soft gradient
  // placeholder. Any image URL (a file in /public → "/svitlana.jpg", or any
  // hosted URL). Editable from Settings → Landing page.
  landingPortraitUrl: text("landing_portrait_url"),

  // Session reminder windows. The hourly cron at /api/cron/reminders looks
  // for sessions ~N hours out where the relevant `*_reminder_sent_at` is
  // still null, sends an email via Resend, then marks the timestamp.
  // 0 = disabled for that audience.
  clientReminderHours: integer("client_reminder_hours").default(24).notNull(),
  practitionerReminderHours: integer("practitioner_reminder_hours")
    .default(1)
    .notNull(),

  // Sabbath days — lowercase ISO weekday names she's marked off.
  // ("monday", "tuesday", ..., "sunday"). Empty by default; the app
  // never assumes she rests on any particular day. When set, calendar
  // views render those columns differently and scheduling shows a soft
  // reminder. Reminders that would fire on a sabbath day get skipped.
  sabbathDays: text("sabbath_days")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),

  // Recall.ai meeting-bot auto-notes pipeline. Off by default until she's
  // read the consent copy and turned it on; bot name kept neutral so the
  // client sees something like "Notetaker" rather than a tool name.
  // `recallAutoAdd` controls whether every new session with a Meet URL gets
  // a bot automatically vs requiring her to use the per-session manual
  // "Add bot now" button.
  recallEnabled: boolean("recall_enabled").default(false).notNull(),
  recallBotName: text("recall_bot_name").default("Notetaker"),
  recallAutoAdd: boolean("recall_auto_add").default(true).notNull(),

  // Google Calendar OAuth (one practitioner per app — single connected account).
  // Refresh tokens are long-lived; access tokens auto-refresh in google-calendar.ts.
  googleAccessToken: text("google_access_token"),
  googleRefreshToken: text("google_refresh_token"),
  googleTokenExpiresAt: timestamp("google_token_expires_at"),
  googleCalendarEmail: text("google_calendar_email"), // the connected Google account
  googleConnectedAt: timestamp("google_connected_at"),
  // Last error the Calendar sync hit for this account. Updated by
  // syncSessionToGoogle on every failure, cleared on the next success.
  // Surfaced on /status so she (and we) can see why sync is failing without
  // having to dig through Vercel logs. Includes the raw message from Google
  // — "Google Calendar API has not been used in project N", "invalid_grant",
  // scope errors, etc.
  googleLastError: text("google_last_error"),
  googleLastErrorAt: timestamp("google_last_error_at"),

  // The practice's home IANA timezone (e.g. "America/Toronto"). The anchor for
  // formatting reminder/confirmation emails and the fallback when a session or
  // client has no zone of its own. Auto-seeded from the first booking's browser
  // zone if unset; editable in Settings.
  timezone: text("timezone"),

  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const clientsRelations = relations(clients, ({ many }) => ({
  sessions: many(sessions),
  attachments: many(attachments),
  goals: many(goals),
  tasks: many(tasks),
  communications: many(communications),
  importantPeople: many(importantPeople),
  themes: many(themes),
  observations: many(observations),
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  client: one(clients, {
    fields: [sessions.clientId],
    references: [clients.id],
  }),
  attachments: many(attachments),
}));

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  client: one(clients, {
    fields: [attachments.clientId],
    references: [clients.id],
  }),
  session: one(sessions, {
    fields: [attachments.sessionId],
    references: [sessions.id],
  }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// LEAD CAPTURE — external forms (lead magnets, embed widgets, Make.com
// scenarios) POST to /api/leads/intake with a per-form Bearer token. Each
// submission lands in lead_submissions; she triages on /network/inbox.
// Forms can optionally forward to an outbound webhook_url so Brian can wire
// nurture downstream via Make.com — Soul Service is the source of truth +
// triage UI, not the email sender.
// ─────────────────────────────────────────────────────────────────────────────

export const leadForms = pgTable(
  "lead_forms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    // SHA-256 hex of the cleartext token. Cleartext is shown once at create
    // (or rotate) and never persisted. token_prefix is the first 8 chars of
    // the cleartext so the UI can render "lf_AbCd1234…" without needing it.
    tokenHash: text("token_hash").notNull(),
    tokenPrefix: text("token_prefix").notNull(),
    autoAccept: boolean("auto_accept").default(false).notNull(),
    defaultIntent: text("default_intent"),
    webhookUrl: text("webhook_url"),
    submissionCount: integer("submission_count").default(0).notNull(),
    lastSubmissionAt: timestamp("last_submission_at"),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    accountIdx: index("lead_forms_account_idx").on(t.accountId),
    tokenIdx: index("lead_forms_token_hash_idx").on(t.tokenHash),
  })
);

export const leadSubmissions = pgTable(
  "lead_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    formId: uuid("form_id")
      .notNull()
      .references(() => leadForms.id, { onDelete: "cascade" }),
    name: text("name"),
    email: text("email"),
    phone: text("phone"),
    /** Free-shape JSON for whatever else the form sent. */
    fields: jsonb("fields").default({}).notNull(),
    sourceIp: text("source_ip"),
    userAgent: text("user_agent"),
    referer: text("referer"),
    /** pending | accepted | rejected | duplicate */
    status: text("status").default("pending").notNull(),
    promotedClientId: uuid("promoted_client_id").references(() => clients.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at"),
    reviewedAction: text("reviewed_action"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    accountIdx: index("lead_submissions_account_idx").on(t.accountId),
    formIdx: index("lead_submissions_form_idx").on(t.formId),
    statusIdx: index("lead_submissions_status_idx").on(
      t.accountId,
      t.status
    ),
    emailDedupIdx: index("lead_submissions_email_dedup_idx").on(
      t.formId,
      t.email
    ),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Client portal — magic-link-authenticated surface where her clients see
// their upcoming sessions, request a reschedule, and view what they owe.
// Auth tables mirror lead-token hashing: cleartext only in the emailed URL
// or browser cookie; SHA-256 hex stored. See drizzle/0017_client_portal.sql
// for the full rationale.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// user_magic_links — practitioner sign-in via email magic link.
// Mirrors clientPortalTokens but keyed by email rather than client_id.
// ─────────────────────────────────────────────────────────────────────────────

export const userMagicLinks = pgTable(
  "user_magic_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    /** SHA-256 hex of the cleartext URL token. Single-use, 30-min expiry. */
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    consumedAt: timestamp("consumed_at"),
    requestedIp: text("requested_ip"),
    requestedUserAgent: text("requested_user_agent"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    hashIdx: index("user_magic_links_hash_idx").on(t.tokenHash),
    emailIdx: index("user_magic_links_email_idx").on(t.email),
  })
);

export const clientPortalTokens = pgTable(
  "client_portal_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    /** SHA-256 hex of the cleartext URL token. Single-use, 30-min expiry. */
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    consumedAt: timestamp("consumed_at"),
    requestedIp: text("requested_ip"),
    requestedUserAgent: text("requested_user_agent"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    hashIdx: index("client_portal_tokens_hash_idx").on(t.tokenHash),
    clientIdx: index("client_portal_tokens_client_idx").on(t.clientId),
  })
);

export const clientPortalSessions = pgTable(
  "client_portal_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    /** SHA-256 hex of the cleartext cookie value. */
    cookieHash: text("cookie_hash").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
    createdIp: text("created_ip"),
    createdUserAgent: text("created_user_agent"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    cookieIdx: index("client_portal_sessions_cookie_idx").on(t.cookieHash),
    clientIdx: index("client_portal_sessions_client_idx").on(t.clientId),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// client_reflections — the journal room of the client portal.
// Free-form text entries the client writes between sessions, optionally
// attached to a specific past session. Practitioner sees recent ones on
// the client overview as pre-session context.
// ─────────────────────────────────────────────────────────────────────────────

export const clientReflections = pgTable(
  "client_reflections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    /** Optional — null means a standalone reflection ("just something
     *  I noticed this week"). When set, the reflection ties to a specific
     *  past session and surfaces on that session's Arc-tab row. */
    sessionId: uuid("session_id").references(() => sessions.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    accountIdx: index("client_reflections_account_idx").on(t.accountId),
    clientIdx: index("client_reflections_client_idx").on(t.clientId),
    sessionIdx: index("client_reflections_session_idx").on(t.sessionId),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// client_booking_requests — client-initiated request for a NEW session.
// Distinct from reschedule_requests (which targets an existing session).
// Surfaces in Loose Ends → "Session requests" so the practitioner can
// reach out and confirm, then resolve.
// ─────────────────────────────────────────────────────────────────────────────

export const clientBookingRequests = pgTable(
  "client_booking_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    /** Free-text preferred times from the client. Optional. */
    preferredTimes: text("preferred_times"),
    /** Optional message accompanying the request. */
    reason: text("reason"),
    /** pending | acknowledged | resolved */
    status: text("status").default("pending").notNull(),
    reviewedAt: timestamp("reviewed_at"),
    reviewedNote: text("reviewed_note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    accountStatusIdx: index("client_booking_requests_account_status_idx").on(
      t.accountId,
      t.status
    ),
    clientIdx: index("client_booking_requests_client_idx").on(t.clientId),
  })
);

export const rescheduleRequests = pgTable(
  "reschedule_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    /** Free-text reason from the client. Length-capped at the app layer. */
    reason: text("reason"),
    /** Optional preferred alternative times, as ISO strings in JSON array. */
    preferredTimes: jsonb("preferred_times"),
    /** pending | acknowledged | resolved */
    status: text("status").default("pending").notNull(),
    reviewedAt: timestamp("reviewed_at"),
    reviewedNote: text("reviewed_note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    accountStatusIdx: index("reschedule_requests_account_status_idx").on(
      t.accountId,
      t.status
    ),
    clientIdx: index("reschedule_requests_client_idx").on(t.clientId),
    sessionIdx: index("reschedule_requests_session_idx").on(t.sessionId),
  })
);

export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Attachment = typeof attachments.$inferSelect;
export type ClientPortalToken = typeof clientPortalTokens.$inferSelect;
export type ClientPortalSession = typeof clientPortalSessions.$inferSelect;
export type RescheduleRequest = typeof rescheduleRequests.$inferSelect;
export type ClientReflection = typeof clientReflections.$inferSelect;
export type ClientBookingRequest = typeof clientBookingRequests.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// Groups — group/class infrastructure. The Circle is the original use case
// ($20 weekly women's group); the same shape works for workshops, classes,
// retreats. See drizzle/0023_groups.sql for the full rationale.
// ─────────────────────────────────────────────────────────────────────────────

export const groups = pgTable(
  "groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    defaultCapacity: integer("default_capacity").default(20).notNull(),
    defaultDurationMinutes: integer("default_duration_minutes")
      .default(120)
      .notNull(),
    defaultPriceCents: integer("default_price_cents").default(2000).notNull(),
    defaultCurrency: varchar("default_currency", { length: 8 })
      .default("USD")
      .notNull(),
    paymentInstructions: text("payment_instructions"),
    published: boolean("published").default(true).notNull(),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    accountIdx: index("groups_account_idx").on(t.accountId),
  })
);

export const groupSessions = pgTable(
  "group_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes").default(120).notNull(),
    capacity: integer("capacity").default(20).notNull(),
    priceCents: integer("price_cents").default(2000).notNull(),
    /** Per-session theme — "grief", "boundaries", etc. */
    topic: text("topic"),
    /** scheduled | completed | cancelled */
    status: text("status").default("scheduled").notNull(),
    meetUrl: text("meet_url"),
    googleEventId: text("google_event_id"),
    notes: text("notes"),
    recallBotId: text("recall_bot_id"),
    recallBotStatus: text("recall_bot_status"),
    recallTranscriptReceivedAt: timestamp("recall_transcript_received_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    groupIdx: index("group_sessions_group_idx").on(t.groupId),
    accountScheduledIdx: index("group_sessions_account_scheduled_idx").on(
      t.accountId,
      t.scheduledAt
    ),
  })
);

export const groupAttendees = pgTable(
  "group_attendees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    groupSessionId: uuid("group_session_id")
      .notNull()
      .references(() => groupSessions.id, { onDelete: "cascade" }),
    /** Optional — links to an existing client row when one exists. */
    clientId: uuid("client_id").references(() => clients.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    /** pending | confirmed | cancelled */
    status: text("status").default("pending").notNull(),
    paid: boolean("paid").default(false).notNull(),
    paidAt: timestamp("paid_at"),
    paymentMethod: text("payment_method"),
    attended: boolean("attended"),
    practitionerNotes: text("practitioner_notes"),
    sourceIp: text("source_ip"),
    userAgent: text("user_agent"),
    // Stripe — set when the seat was reserved via card checkout. Null for
    // manual (Venmo/cash) sign-ups.
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    // Fulfillment + reminder idempotency stamps. Each is set once, then the
    // cron / webhook skips anyone already stamped.
    welcomeSentAt: timestamp("welcome_sent_at"),
    reminder24hSentAt: timestamp("reminder_24h_sent_at"),
    reminder1hSentAt: timestamp("reminder_1h_sent_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    sessionIdx: index("group_attendees_session_idx").on(t.groupSessionId),
    accountStatusIdx: index("group_attendees_account_status_idx").on(
      t.accountId,
      t.status
    ),
    emailPerSessionIdx: index("group_attendees_email_per_session_idx").on(
      t.groupSessionId,
      t.email
    ),
  })
);

// ─── Products (storefront video offerings) ──────────────────────────────
export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    priceCents: integer("price_cents").default(0).notNull(),
    currency: varchar("currency", { length: 8 }).default("USD").notNull(),
    videoId: text("video_id"),
    videoUploadedAt: timestamp("video_uploaded_at"),
    videoDurationSeconds: integer("video_duration_seconds"),
    paymentInstructions: text("payment_instructions"),
    published: boolean("published").default(false).notNull(),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    accountIdx: index("products_account_idx").on(t.accountId),
  })
);

export const productPurchases = pgTable(
  "product_purchases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    purchaserName: text("purchaser_name").notNull(),
    purchaserEmail: text("purchaser_email").notNull(),
    purchaserPhone: text("purchaser_phone"),
    /** pending | confirmed | refunded */
    status: text("status").default("pending").notNull(),
    paid: boolean("paid").default(false).notNull(),
    paidAt: timestamp("paid_at"),
    paymentMethod: text("payment_method"),
    accessToken: text("access_token").notNull(),
    confirmedAt: timestamp("confirmed_at"),
    practitionerNotes: text("practitioner_notes"),
    sourceIp: text("source_ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    productIdx: index("product_purchases_product_idx").on(t.productId),
    accountStatusIdx: index("product_purchases_account_status_idx").on(
      t.accountId,
      t.status
    ),
    emailIdx: index("product_purchases_email_idx").on(t.purchaserEmail),
  })
);

export type Product = typeof products.$inferSelect;
export type ProductPurchase = typeof productPurchases.$inferSelect;

export type Group = typeof groups.$inferSelect;
export type GroupSession = typeof groupSessions.$inferSelect;
export type GroupAttendee = typeof groupAttendees.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type ImportantPerson = typeof importantPeople.$inferSelect;
export type Theme = typeof themes.$inferSelect;
export type Observation = typeof observations.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Communication = typeof communications.$inferSelect;
export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type NoteTemplate = typeof noteTemplates.$inferSelect;
export type PractitionerSettings = typeof practitionerSettings.$inferSelect;
export type SessionSeries = typeof sessionSeries.$inferSelect;
export type NewSessionSeries = typeof sessionSeries.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type LeadForm = typeof leadForms.$inferSelect;
export type NewLeadForm = typeof leadForms.$inferInsert;
export type LeadSubmission = typeof leadSubmissions.$inferSelect;
export type NewLeadSubmission = typeof leadSubmissions.$inferInsert;
