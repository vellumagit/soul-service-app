import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { db } from "./index";
import {
  souls,
  readings,
  documents,
  goals,
  themes,
  observations,
  invoices,
  consents,
  intakeAnswers,
  timelineEvents,
} from "./schema";

// Descriptive seed — every value below is a field-description placeholder,
// not example data. Mirrors the spec mode of the static prototype.
const SEED_SOULS = [
  {
    code: "#S-01",
    fullName: "[Soul 01 — full name]",
    workingOn: "{Short practitioner phrase naming the love work this soul is currently in}",
    avatarTone: "flame",
    flags: [],
    status: "active" as const,
    primaryReadingType: "soul_reading" as const,
    pinnedNote:
      "{Practitioner-authored running observation about this soul. Captures: ongoing themes, cautions, language that lands, where the work is now.}",
    pronouns: "{pronouns}",
    email: "{soul's email}",
    phone: "{soul's phone}",
    city: "{city}",
    timezone: "{timezone}",
    source: "{referral source}",
    emergencyName: "{Emergency contact name + relationship}",
    emergencyPhone: "{Emergency phone}",
  },
  {
    code: "#S-02",
    fullName: "[Soul 02 — full name]",
    workingOn: "{Love work summary for this soul}",
    avatarTone: "ink",
    flags: ["overdue"],
    status: "active" as const,
    primaryReadingType: "soul_reading" as const,
    pinnedNote: "{Pinned observation note}",
  },
  {
    code: "#S-03",
    fullName: "[Soul 03 — full name]",
    workingOn: "{Love work summary}",
    avatarTone: "green",
    flags: [],
    status: "active" as const,
    primaryReadingType: "soul_reading" as const,
  },
  {
    code: "#S-04",
    fullName: "[Soul 04 — full name]",
    workingOn: "{Love work summary}",
    avatarTone: "blue",
    flags: [],
    status: "active" as const,
    primaryReadingType: "heart_clearing" as const,
  },
  {
    code: "#S-05",
    fullName: "[Soul 05 — full name]",
    workingOn: "{Love work summary}",
    avatarTone: "purple",
    flags: ["consent-exp"],
    status: "active" as const,
    primaryReadingType: "love_alignment" as const,
  },
  {
    code: "#S-06",
    fullName: "[Soul 06 — full name]",
    workingOn: "{Love work summary}",
    avatarTone: "ink",
    flags: ["dormant"],
    status: "dormant" as const,
    primaryReadingType: "ancestral_reading" as const,
  },
  {
    code: "#S-07",
    fullName: "[Soul 07 — full name]",
    workingOn: "{New soul · intake pending}",
    avatarTone: "amber",
    flags: ["intake"],
    status: "new" as const,
    primaryReadingType: "first_reading_intake" as const,
  },
  {
    code: "#S-08",
    fullName: "[Soul 08 — full name]",
    workingOn: "{Love work summary}",
    avatarTone: "ink",
    flags: ["dormant"],
    status: "dormant" as const,
    primaryReadingType: "soul_reading" as const,
  },
  {
    code: "#S-09",
    fullName: "[Soul 09 — full name]",
    workingOn: "{Love work summary}",
    avatarTone: "green",
    flags: [],
    status: "active" as const,
    primaryReadingType: "love_alignment" as const,
  },
];

// Helper to make a date relative to "today" (which we anchor at 2026-04-19 Sun)
const TODAY = new Date("2026-04-19T13:00:00Z");
const offsetDays = (days: number, hour = 14, minutes = 0) => {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + days);
  d.setHours(hour, minutes, 0, 0);
  return d;
};

async function seed() {
  console.log("Seeding…");

  // Wipe (in dependency order) for idempotent reseeding
  await db.delete(timelineEvents);
  await db.delete(intakeAnswers);
  await db.delete(consents);
  await db.delete(invoices);
  await db.delete(observations);
  await db.delete(themes);
  await db.delete(goals);
  await db.delete(documents);
  await db.delete(readings);
  await db.delete(souls);

  // Insert souls
  const insertedSouls = await db.insert(souls).values(SEED_SOULS).returning();
  console.log(`  Souls: ${insertedSouls.length}`);

  // For Soul 01 specifically, attach a fully-fleshed descriptive file.
  const soul01 = insertedSouls.find((s) => s.code === "#S-01")!;

  // Goals
  await db.insert(goals).values([
    {
      soulId: soul01.id,
      label: "{Goal 1 — short phrase the soul + practitioner co-named}",
      progress: 55,
      note: "{1-line status update}",
      position: 0,
    },
    {
      soulId: soul01.id,
      label: "{Goal 2}",
      progress: 40,
      note: "{1-line status update}",
      position: 1,
    },
    {
      soulId: soul01.id,
      label: "{Goal 3}",
      progress: 65,
      note: "{1-line status update}",
      position: 2,
    },
  ]);

  // Readings — one upcoming today, three completed in the past
  const insertedReadings = await db
    .insert(readings)
    .values([
      {
        soulId: soul01.id,
        type: "soul_reading",
        status: "scheduled",
        scheduledAt: offsetDays(0, 14, 0),
        durationMinutes: 60,
        intention:
          "{Intention the soul stated for this reading, in her own words}",
        meetUrl: "https://meet.google.com/{slug-1}",
      },
      {
        soulId: soul01.id,
        type: "soul_reading",
        status: "completed",
        scheduledAt: offsetDays(-2, 14, 0),
        durationMinutes: 60,
        intention: "{Intention quote}",
        preHeartOpen: 5,
        preSelfLove: 4,
        preBody: "{body-state phrase pre-reading}",
        postHeartOpen: 9,
        postSelfLove: 8,
        postBody: "{body-state phrase post-reading}",
        log: "{Full reading log: what came through, guides, energetic shifts, client quotes, recommendations}",
      },
      {
        soulId: soul01.id,
        type: "soul_reading",
        status: "completed",
        scheduledAt: offsetDays(-9, 14, 0),
        durationMinutes: 60,
        intention: "{Intention quote}",
        preHeartOpen: 6,
        preSelfLove: 5,
        preBody: "{phrase}",
        postHeartOpen: 8,
        postSelfLove: 7,
        postBody: "{phrase}",
        log: "{Full reading log}",
      },
      {
        soulId: soul01.id,
        type: "first_reading_intake",
        status: "completed",
        scheduledAt: offsetDays(-30, 14, 0),
        durationMinutes: 45,
        intention: "{First-reading intention quote}",
        log: "{Full reading log}",
      },
    ])
    .returning();

  // Documents
  await db.insert(documents).values([
    {
      soulId: soul01.id,
      readingId: insertedReadings[1].id,
      name: "{filename · auto-generated from date + soul + type}",
      type: "note",
      storageUrl: "/{placeholder-url}",
      sizeBytes: 4096,
      mimeType: "text/markdown",
    },
    {
      soulId: soul01.id,
      readingId: insertedReadings[1].id,
      name: "{altar-photo filename}",
      type: "altar_photo",
      storageUrl: "/{placeholder-url}",
      sizeBytes: 2_400_000,
      mimeType: "image/jpeg",
    },
    {
      soulId: soul01.id,
      name: "{intake-form filename}",
      type: "intake",
      storageUrl: "/{placeholder-url}",
      sizeBytes: 296_000,
      mimeType: "application/pdf",
    },
    {
      soulId: soul01.id,
      name: "{consent filename}",
      type: "consent",
      storageUrl: "/{placeholder-url}",
      sizeBytes: 118_000,
      mimeType: "application/pdf",
    },
  ]);

  // Themes
  await db.insert(themes).values(
    [1, 2, 3, 4, 5, 6].map((n) => ({
      soulId: soul01.id,
      label: `{theme tag ${n}}`,
    }))
  );

  // Observations
  await db.insert(observations).values([
    { soulId: soul01.id, body: "{Pattern observation across multiple readings — what the practitioner has noticed repeating}" },
    { soulId: soul01.id, body: "{Pattern observation}" },
    { soulId: soul01.id, body: "{Pattern observation}" },
  ]);

  // Invoices
  await db.insert(invoices).values([
    {
      soulId: soul01.id,
      readingId: insertedReadings[1].id,
      number: "INV-1048",
      amountCents: 13500,
      currency: "USD",
      issuedAt: "2026-04-18",
      dueAt: "2026-04-25",
      paidAt: "2026-04-19",
      status: "paid",
      description: "{Reading reference}",
    },
    {
      soulId: soul01.id,
      readingId: insertedReadings[2].id,
      number: "INV-1037",
      amountCents: 13500,
      currency: "USD",
      issuedAt: "2026-04-11",
      dueAt: "2026-04-18",
      paidAt: "2026-04-12",
      status: "paid",
      description: "{Reading reference}",
    },
  ]);

  // Consents
  await db.insert(consents).values([
    {
      soulId: soul01.id,
      label: "Care & recording consent",
      status: "{Signed date OR Not yet}",
      signedAt: "2026-03-20",
    },
    {
      soulId: soul01.id,
      label: "Permission to channel guides",
      status: "{Yes / No / Conditional note}",
    },
    {
      soulId: soul01.id,
      label: "Permission to share voice memos between sessions",
      status: "{Yes / No}",
    },
  ]);

  // Intake answers
  const intakeQs = [
    "{Q1: What brings you to me?}",
    "{Q2: Where in your life is love feeling blocked?}",
    "{Q3: Who do you most need to forgive?}",
    "{Q4: Earliest memory of feeling truly loved}",
    "{Q5: What would more love in your life look like?}",
    "{Q6: Open to channeled messages from guides?}",
    "{Q7: Open to ancestral work?}",
    "{Q8: Anything I should know about your nervous system?}",
    "{Q9: Pronouns}",
    "{Q10: How did you find me?}",
  ];
  await db.insert(intakeAnswers).values(
    intakeQs.map((q, i) => ({
      soulId: soul01.id,
      question: q,
      answer: "{Soul's answer in her own words}",
      position: i,
    }))
  );

  // Timeline events for soul 01
  await db.insert(timelineEvents).values([
    {
      soulId: soul01.id,
      kind: "session_upcoming",
      occurredAt: offsetDays(0, 14, 0),
      title: "{Reading type · duration · scheduled date}",
      body: "{Practitioner's prep notes for the upcoming reading}",
    },
    {
      soulId: soul01.id,
      kind: "note",
      occurredAt: offsetDays(-2, 15, 0),
      title: "{Title of this note}",
      body: "{Free-text reading log entry}",
    },
    {
      soulId: soul01.id,
      kind: "invoice_paid",
      occurredAt: offsetDays(-2, 16, 0),
      title: "{Exchange received · amount}",
      body: "{Payment method · any client message included}",
    },
    {
      soulId: soul01.id,
      kind: "session",
      occurredAt: offsetDays(-9, 14, 0),
      title: "{Reading type · duration · date}",
      body: "{Summary of completed reading}",
    },
    {
      soulId: soul01.id,
      kind: "file_open",
      occurredAt: offsetDays(-60, 9, 0),
      title: "File opened",
      body: "{How this soul came to the practice}",
    },
  ]);

  // For other souls — give them sparse readings to populate the calendar
  const otherSouls = insertedSouls.filter((s) => s.code !== "#S-01");
  const calendarSlots = [
    { dayOffset: 0, hour: 16, dur: 90, soulCode: "#S-04" },
    { dayOffset: 0, hour: 18, minutes: 30, dur: 45, soulCode: "#S-07" },
    { dayOffset: 1, hour: 9, dur: 60, soulCode: "#S-09" },
    { dayOffset: 1, hour: 14, dur: 60, soulCode: "#S-03" },
    { dayOffset: 1, hour: 17, dur: 60, soulCode: "#S-08" },
    { dayOffset: 2, hour: 10, dur: 60, soulCode: "#S-02" },
    { dayOffset: 2, hour: 15, dur: 60, soulCode: "#S-06" },
    { dayOffset: 3, hour: 9, dur: 45, soulCode: "#S-05" },
    { dayOffset: 5, hour: 11, dur: 60, soulCode: "#S-03" },
    { dayOffset: 5, hour: 14, dur: 60, soulCode: "#S-09" },
    { dayOffset: 5, hour: 16, dur: 60, soulCode: "#S-02" },
  ];
  const calReadings = calendarSlots
    .map((slot) => {
      const s = otherSouls.find((x) => x.code === slot.soulCode);
      if (!s) return null;
      return {
        soulId: s.id,
        type: s.primaryReadingType ?? "soul_reading",
        status: "scheduled" as const,
        scheduledAt: offsetDays(slot.dayOffset, slot.hour, slot.minutes ?? 0),
        durationMinutes: slot.dur,
        meetUrl: "https://meet.google.com/{slug}",
      };
    })
    .filter(Boolean) as never[];
  if (calReadings.length) await db.insert(readings).values(calReadings);

  console.log("Done.");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
