// Account bootstrapping — find-or-create the account row for a given email,
// and on first creation, seed the starter email + note templates and create
// the practitioner_settings row.
//
// Called from the sign-in flow: when an allowlisted email signs in for the
// first time, we set them up with a clean workspace; on subsequent sign-ins
// we just return the existing account id.
import "server-only";

import { eq } from "drizzle-orm";
import {
  db,
  accounts,
  emailTemplates,
  noteTemplates,
  practitionerSettings,
} from "@/db";

// ─────────────────────────────────────────────────────────────────────────────
// Starter templates — same content as src/db/seed-defaults.ts but scoped
// to a single account. Kept here so they can be seeded inline at sign-in
// without needing a separate CLI run.
// ─────────────────────────────────────────────────────────────────────────────

const STARTER_EMAIL_TEMPLATES = [
  {
    name: "Starter · First session confirmation",
    subject: "Confirming our first session, {{firstName}}",
    body: `Hi {{firstName}},

Looking forward to working together. Here are the details:

· When: {{nextSessionWhen}}
· Where: Google Meet — {{meetUrl}}
· Length: {{nextSessionDuration}}

A quiet, private spot works best. If anything comes up before we meet that you'd like me to know, feel free to share.

See you soon,
— [Your name]`,
  },
  {
    name: "Starter · 1-week check-in",
    subject: "Checking in after our session",
    body: `Hi {{firstName}},

Just checking in after our session last week. How has it landed?

If anything has come up you'd like to bring to our next time together, jot it down whenever it surfaces — no need to reply.

— [Your name]`,
  },
  {
    name: "Starter · 1-month check-in",
    subject: "Thinking of you, {{firstName}}",
    body: `Hi {{firstName}},

It's been about a month since we last sat together. I wanted to check in — how are things going?

If you'd like to schedule another session, just reply and we'll find a time.

— [Your name]`,
  },
  {
    name: "Starter · Aftercare (same-day)",
    subject: "After our session today",
    body: `Hi {{firstName}},

Thank you for showing up today. A few small things for the rest of the day:

· Drink some water.
· Take it slow if you can.
· Reach out if you need anything before our next session.

What we worked on today is yours — at your pace.

— [Your name]`,
  },
  {
    name: "Starter · Payment reminder",
    subject: "Quick note about our last session",
    body: `Hi {{firstName}},

Hope you're well. A gentle reminder — payment for our session on {{lastSessionDate}} ({{amount}}) is still open.

How to pay:
{{paymentInstructions}}

No rush, just letting you know. Let me know if anything's unclear.

— [Your name]`,
  },
];

const STARTER_NOTE_TEMPLATES = [
  {
    name: "Starter · Standard session",
    body: `## What they came in with
(in their own words if possible)

## What we covered
-

## Observations
-

## What they're taking away
-

## Follow up next time
- `,
  },
  {
    name: "Starter · First session / intake",
    body: `## What brings them
(reason for booking — in their words)

## Background worth noting
-

## What they're hoping for
-

## Anything to be mindful of
(things to handle gently — note privately, never exported)

## What we agreed on for next steps
1.
2.
3. `,
  },
  {
    name: "Starter · Quick log",
    body: `## Main thing today
-

## What landed
-

## For next time
- `,
  },
];

/**
 * Get the account id for the given email. Creates the account + seeds starter
 * templates + creates the settings row on first call.
 *
 * Idempotent: subsequent calls for the same email just return the existing id.
 */
export async function getOrCreateAccount(
  email: string
): Promise<{ accountId: string; isNew: boolean }> {
  const normalized = email.trim().toLowerCase();

  // Already exists?
  const existing = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.email, normalized))
    .limit(1);

  if (existing[0]) {
    return { accountId: existing[0].id, isNew: false };
  }

  // Create the account
  const [created] = await db
    .insert(accounts)
    .values({ email: normalized })
    .returning({ id: accounts.id });

  // Settings row (1:1 with account)
  await db.insert(practitionerSettings).values({
    accountId: created.id,
    paymentInstructions:
      "Edit me in Settings — e.g. Venmo @yourhandle · Zelle to you@example.com",
    invoiceFooter: "Thank you.",
    invoicePrefix: "INV",
    autoInvoiceOnComplete: true,
  });

  // Starter email templates
  await db.insert(emailTemplates).values(
    STARTER_EMAIL_TEMPLATES.map((t) => ({
      accountId: created.id,
      name: t.name,
      subject: t.subject,
      body: t.body,
    }))
  );

  // Starter note templates
  await db.insert(noteTemplates).values(
    STARTER_NOTE_TEMPLATES.map((t) => ({
      accountId: created.id,
      name: t.name,
      body: t.body,
    }))
  );

  return { accountId: created.id, isNew: true };
}

/**
 * Look up an existing account by email — does NOT create. Used in proxy /
 * session-reading paths where we want to fail rather than create.
 */
export async function findAccountByEmail(
  email: string
): Promise<{ accountId: string } | null> {
  const rows = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.email, email.trim().toLowerCase()))
    .limit(1);
  if (!rows[0]) return null;
  return { accountId: rows[0].id };
}
