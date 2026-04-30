// Idempotent seeder for default settings + email/note templates.
// Safe to re-run: only inserts if the row/templates don't already exist.
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { db } from "./index";
import {
  practitionerSettings,
  emailTemplates,
  noteTemplates,
} from "./schema";
import { sql } from "drizzle-orm";

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

— Maya`,
  },
  {
    name: "Aftercare — post-session follow-up",
    subject: "After our session today",
    body: `Hi {{firstName}},

Thank you for showing up today. Some gentle reminders for the rest of the day:

· Drink water.
· Be slow with yourself — let what surfaced settle.
· Journal if anything wants to come through.
· Reach out if you need anything before our next time.

What we touched on today is yours to keep working with at your own pace.

With love,
Maya`,
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
Maya`,
  },
  {
    name: "Birthday — happy day",
    subject: "Thinking of you today",
    body: `Hi {{firstName}},

Just wanted to send a little light your way today. Hope it's a beautiful one — that the people who love you find their way to you and that you take a moment to feel chosen.

If anything wants to come up, the door is open.

Sending love,
Maya`,
  },
  {
    name: "Re-engagement — checking in",
    subject: "Thinking of you, {{firstName}}",
    body: `Hi {{firstName}},

It's been a little while since our last session and you popped into my mind. No pressure either way — just wanted to say hi and let you know the door is always open if you want to come back.

Sending love,
Maya`,
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

async function seed() {
  console.log("Seeding defaults…");

  // Settings — only insert if no row exists
  const settingsCount = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(practitionerSettings);
  if ((settingsCount[0]?.count ?? 0) === 0) {
    await db.insert(practitionerSettings).values({
      practitionerName: "Maya",
      defaultRateCents: 13500,
      defaultCurrency: "USD",
      paymentInstructions:
        "Venmo @maya · Zelle to your-email@example.com · cash welcomed in person",
      invoiceFooter: "Thank you, with love. — Maya",
      invoicePrefix: "INV",
      nextInvoiceNumber: 1001,
      autoInvoiceOnComplete: true,
      autoFollowupTaskDays: 2,
      autoFollowupTaskTitle: "Send aftercare email",
      birthdayReminderDays: 3,
    });
    console.log("  ✓ practitioner_settings");
  } else {
    console.log("  · practitioner_settings already exists, skipped");
  }

  // Email templates — insert any that don't already exist by name
  for (const t of DEFAULT_EMAIL_TEMPLATES) {
    const existing = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(emailTemplates)
      .where(sql`${emailTemplates.name} = ${t.name}`);
    if ((existing[0]?.count ?? 0) === 0) {
      await db.insert(emailTemplates).values(t);
      console.log(`  ✓ email template: ${t.name}`);
    }
  }

  for (const t of DEFAULT_NOTE_TEMPLATES) {
    const existing = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(noteTemplates)
      .where(sql`${noteTemplates.name} = ${t.name}`);
    if ((existing[0]?.count ?? 0) === 0) {
      await db.insert(noteTemplates).values(t);
      console.log(`  ✓ note template: ${t.name}`);
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
