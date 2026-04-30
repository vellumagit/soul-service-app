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

const DEFAULT_EMAIL_TEMPLATES = [
  {
    name: "Welcome — first session confirmation",
    subject: "Looking forward to our first session, {{firstName}}",
    body: `Hi {{firstName}},

So glad we're connecting. Quick logistics for our session:

· When: {{nextSessionWhen}}
· Where: Google Meet ({{meetUrl}})
· Length: {{nextSessionDuration}}

A few notes before we begin:
· Find a quiet, private space where you won't be interrupted.
· Have water nearby.
· You don't need to prepare anything specific — just come as you are.

If anything comes up beforehand you'd like me to know, feel free to share. Otherwise, see you {{nextSessionWhen}}.

Holding space for you.

— ${PRACTITIONER_NAME}`,
  },
  {
    name: "1-week follow-up",
    subject: "Checking in after our session",
    body: `Hi {{firstName}},

It's been a week since our session — wanted to gently check in. How has the week landed for you?

If anything came up that you'd like to bring into our next time, jot it down whenever it surfaces.

With love,
${PRACTITIONER_NAME}`,
  },
  {
    name: "1-month follow-up",
    subject: "Thinking of you, {{firstName}}",
    body: `Hi {{firstName}},

A month has passed since we sat together. I wanted to check in — how are things? What's shifted, what's still here?

If you'd like to come back in for another session, the door is open. If something specific has come up, I'd love to hear about it.

With love,
${PRACTITIONER_NAME}`,
  },
  {
    name: "3-month deeper follow-up",
    subject: "Three months on — how is your heart?",
    body: `Hi {{firstName}},

Three months ago we worked together. I find myself thinking of you and wanted to send love.

Sometimes the deeper changes take time to surface. If you've noticed something — small or big — I'd love to hear. And if you're ready for another session, just say the word.

With love,
${PRACTITIONER_NAME}`,
  },
  {
    name: "Aftercare — same-day post-session",
    subject: "After our session today",
    body: `Hi {{firstName}},

Thank you for showing up today. Some gentle reminders for the rest of the day:

· Drink water.
· Be slow with yourself — let what surfaced settle.
· Journal if anything wants to come through.
· Reach out if you need anything before our next time.

What we touched on today is yours to keep working with at your own pace.

With love,
${PRACTITIONER_NAME}`,
  },
  {
    name: "Payment reminder — gentle",
    subject: "A friendly note re: our last session",
    body: `Hi {{firstName}},

Hope you're well. Just a gentle nudge — the exchange for our session on {{lastSessionDate}} ({{amount}}) is still open.

Easiest options:
{{paymentInstructions}}

No rush — just letting you know it's there. Reply if anything's unclear.

Warmly,
${PRACTITIONER_NAME}`,
  },
  {
    name: "Birthday — happy day",
    subject: "Thinking of you today",
    body: `Hi {{firstName}},

Just wanted to send a little light your way today. Hope it's a beautiful one — that the people who love you find their way to you and that you take a moment to feel chosen.

If anything wants to come up, the door is open.

Sending love,
${PRACTITIONER_NAME}`,
  },
];

const DEFAULT_NOTE_TEMPLATES = [
  {
    name: "Standard session — soul reading",
    body: `## Their intention
(in their own words)

## What came through
-

## Guides / energy that showed up
-

## What I noticed in their body / energy field
- Pre:
- Post:

## What I said / what they said
-

## What to suggest between now and next session
-

## Themes recurring
- `,
  },
  {
    name: "First session / intake",
    body: `## What brings them
(reason for booking, in their words)

## Where love is currently feeling blocked
-

## Who they need to forgive (themselves / others)
-

## What I noticed energetically on first read
-

## Trauma / nervous system notes (anything to be careful about)
-

## Goals we co-set today
1.
2.
3.

## What I told them to expect / next steps
- `,
  },
  {
    name: "Quick log — short session",
    body: `## Top theme
-

## What landed
-

## Action item for them
- `,
  },
];

// Names we used in earlier seeds but no longer want — clean them out.
const DEPRECATED_EMAIL_TEMPLATES = [
  "Re-engagement — checking in",
  "Aftercare — post-session follow-up",
];

async function seed() {
  console.log("Seeding defaults…");

  // Drop deprecated templates by name
  for (const name of DEPRECATED_EMAIL_TEMPLATES) {
    await db
      .delete(emailTemplates)
      .where(sql`${emailTemplates.name} = ${name}`);
  }

  // Settings: upsert single row
  const settingsRows = await db.select().from(practitionerSettings);
  const baseSettings = {
    practitionerName: PRACTITIONER_NAME,
    defaultRateCents: 13500,
    defaultCurrency: "USD",
    paymentInstructions:
      "Venmo @svitlana · Zelle to your-email@example.com · cash welcomed in person",
    invoiceFooter: `Thank you, with love. — ${PRACTITIONER_NAME}`,
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
