// Idempotent seeder for default settings + email/note templates.
// Re-runnable: updates existing rows so renames + tweaks propagate.
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { db } from "./index";
import {
  practitionerSettings,
  emailTemplates,
  noteTemplates,
} from "./schema";
import { eq, sql } from "drizzle-orm";

const PRACTITIONER_NAME = "Svitlana";

// These are STARTER templates — deliberately neutral and brief so the practitioner
// can edit them into her own voice. Every body ends with a "— [Your name]" stub
// rather than a hardcoded sign-off so she doesn't inherit a tone she didn't choose.
const DEFAULT_EMAIL_TEMPLATES = [
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
    name: "Starter · 3-month check-in",
    subject: "How are things, {{firstName}}?",
    body: `Hi {{firstName}},

It's been a few months since we worked together — I wanted to reach out and see how you've been.

If you'd like to come back in, the door is open. And if there's something you'd like to share about what's been going on, I'd love to hear.

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
  {
    name: "Starter · Birthday",
    subject: "Thinking of you today",
    body: `Hi {{firstName}},

Just wanted to wish you a happy birthday. Hope today is a good one for you.

— [Your name]`,
  },
];

// Starter note templates — generic structures the practitioner can rename and
// rewrite into her own way of working. Two short ones, plus a quick log.
const DEFAULT_NOTE_TEMPLATES = [
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

// Names we used in earlier seeds but no longer want — clean them out.
const DEPRECATED_EMAIL_TEMPLATES = [
  "Re-engagement — checking in",
  "Aftercare — post-session follow-up",
  "Welcome — first session confirmation",
  "1-week follow-up",
  "1-month follow-up",
  "3-month deeper follow-up",
  "Aftercare — same-day post-session",
  "Payment reminder — gentle",
  "Birthday — happy day",
];

const DEPRECATED_NOTE_TEMPLATES = [
  "Standard session — soul reading",
  "First session / intake",
  "Quick log — short session",
];

async function seed() {
  console.log("Seeding defaults…");

  // Drop deprecated templates by name
  for (const name of DEPRECATED_EMAIL_TEMPLATES) {
    await db
      .delete(emailTemplates)
      .where(sql`${emailTemplates.name} = ${name}`);
  }
  for (const name of DEPRECATED_NOTE_TEMPLATES) {
    await db
      .delete(noteTemplates)
      .where(sql`${noteTemplates.name} = ${name}`);
  }

  // Settings: upsert single row
  const settingsRows = await db.select().from(practitionerSettings);
  const baseSettings = {
    practitionerName: PRACTITIONER_NAME,
    defaultRateCents: 13500,
    defaultCurrency: "USD",
    paymentInstructions:
      "Edit me in Settings — e.g. Venmo @yourhandle · Zelle to you@example.com",
    invoiceFooter: `Thank you. — ${PRACTITIONER_NAME}`,
    invoicePrefix: "INV",
    autoInvoiceOnComplete: true,
    birthdayReminderDays: 3,
  };
  if (settingsRows.length === 0) {
    await db.insert(practitionerSettings).values(baseSettings);
    console.log("  ✓ practitioner_settings (created)");
  } else {
    // Update name + payment instructions to match the new owner.
    // Don't overwrite fields she may have customized (rate, business name, etc.).
    await db
      .update(practitionerSettings)
      .set({
        practitionerName: PRACTITIONER_NAME,
        updatedAt: new Date(),
      })
      .where(eq(practitionerSettings.id, settingsRows[0].id));
    console.log("  ✓ practitioner_settings (renamed to Svitlana)");
  }

  // Email templates: upsert by name. If name exists → update body/subject.
  for (const t of DEFAULT_EMAIL_TEMPLATES) {
    const existing = await db
      .select({ id: emailTemplates.id })
      .from(emailTemplates)
      .where(sql`${emailTemplates.name} = ${t.name}`)
      .limit(1);
    if (existing[0]) {
      await db
        .update(emailTemplates)
        .set({ subject: t.subject, body: t.body, updatedAt: new Date() })
        .where(eq(emailTemplates.id, existing[0].id));
      console.log(`  ↻ email template: ${t.name}`);
    } else {
      await db.insert(emailTemplates).values(t);
      console.log(`  + email template: ${t.name}`);
    }
  }

  // Note templates: upsert by name
  for (const t of DEFAULT_NOTE_TEMPLATES) {
    const existing = await db
      .select({ id: noteTemplates.id })
      .from(noteTemplates)
      .where(sql`${noteTemplates.name} = ${t.name}`)
      .limit(1);
    if (existing[0]) {
      await db
        .update(noteTemplates)
        .set({ body: t.body, updatedAt: new Date() })
        .where(eq(noteTemplates.id, existing[0].id));
      console.log(`  ↻ note template: ${t.name}`);
    } else {
      await db.insert(noteTemplates).values(t);
      console.log(`  + note template: ${t.name}`);
    }
  }

  console.log("Done.");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
