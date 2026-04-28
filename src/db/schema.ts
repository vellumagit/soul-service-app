import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  numeric,
  timestamp,
  date,
  pgEnum,
  jsonb,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

export const readingTypeEnum = pgEnum("reading_type", [
  "soul_reading",
  "heart_clearing",
  "ancestral_reading",
  "love_alignment",
  "inner_child",
  "forgiveness_ritual",
  "first_reading_intake",
  "reconnection_call",
  "cord_cutting",
]);

export const readingStatusEnum = pgEnum("reading_status", [
  "scheduled",
  "completed",
  "cancelled",
  "no_show",
]);

export const documentTypeEnum = pgEnum("document_type", [
  "note",
  "intake",
  "consent",
  "recording",
  "altar_photo",
  "voice_memo",
  "letter",
]);

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "sent",
  "paid",
  "outstanding",
  "overdue",
  "void",
]);

export const soulStatusEnum = pgEnum("soul_status", [
  "active",
  "new",
  "dormant",
  "archived",
]);

// ─────────────────────────────────────────────────────────────────────────────
// souls — the central entity. Each row = one person Maya is reading for.
// ─────────────────────────────────────────────────────────────────────────────

export const souls = pgTable(
  "souls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: varchar("code", { length: 16 }).notNull().unique(), // human-readable like #S-01
    fullName: text("full_name").notNull(),
    pronouns: varchar("pronouns", { length: 32 }),
    dob: date("dob"),

    email: text("email"),
    phone: varchar("phone", { length: 32 }),
    city: text("city"),
    timezone: varchar("timezone", { length: 64 }),

    // What the practitioner is holding for this soul — pinned, free-form
    pinnedNote: text("pinned_note"),
    // Short phrase shown in directory: the love-work theme
    workingOn: text("working_on"),
    // Where they came from (referral, instagram, quiz, etc.)
    source: text("source"),

    primaryReadingType: readingTypeEnum("primary_reading_type"),
    status: soulStatusEnum("status").default("active").notNull(),

    // Maya's emergency contact for this soul
    emergencyName: text("emergency_name"),
    emergencyPhone: varchar("emergency_phone", { length: 32 }),

    // Arbitrary flags for the directory chips: ["overdue", "consent-exp", "intake", "dormant"]
    flags: jsonb("flags").$type<string[]>().default([]).notNull(),

    avatarTone: varchar("avatar_tone", { length: 16 }).default("ink"), // flame, green, rose, ink, etc

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    statusIdx: index("souls_status_idx").on(t.status),
    nameIdx: index("souls_name_idx").on(t.fullName),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// readings — every scheduled or completed reading for a soul.
// ─────────────────────────────────────────────────────────────────────────────

export const readings = pgTable(
  "readings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    soulId: uuid("soul_id")
      .notNull()
      .references(() => souls.id, { onDelete: "cascade" }),

    type: readingTypeEnum("type").notNull(),
    status: readingStatusEnum("status").default("scheduled").notNull(),

    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(60),

    // The soul's stated intention for this reading, in her own words
    intention: text("intention"),

    // Pre/post check-in metrics (1–10 scales) and short body-state phrases
    preHeartOpen: integer("pre_heart_open"),
    preSelfLove: integer("pre_self_love"),
    preBody: text("pre_body"),
    postHeartOpen: integer("post_heart_open"),
    postSelfLove: integer("post_self_love"),
    postBody: text("post_body"),

    // The full reading log — practitioner's free-text observations
    log: text("log"),

    // Google Meet link for this reading
    meetUrl: text("meet_url"),
    googleEventId: text("google_event_id"), // for calendar sync

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    soulIdx: index("readings_soul_idx").on(t.soulId),
    scheduledIdx: index("readings_scheduled_idx").on(t.scheduledAt),
    statusIdx: index("readings_status_idx").on(t.status),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// documents — files attached to a soul (and optionally to a specific reading)
// ─────────────────────────────────────────────────────────────────────────────

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    soulId: uuid("soul_id")
      .notNull()
      .references(() => souls.id, { onDelete: "cascade" }),
    readingId: uuid("reading_id").references(() => readings.id, {
      onDelete: "set null",
    }),

    name: text("name").notNull(),
    type: documentTypeEnum("type").notNull(),
    storageUrl: text("storage_url").notNull(), // public or signed URL
    sizeBytes: integer("size_bytes"),
    mimeType: varchar("mime_type", { length: 128 }),

    // For consent docs — when does this expire / need renewal?
    expiresAt: date("expires_at"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    soulIdx: index("documents_soul_idx").on(t.soulId),
    typeIdx: index("documents_type_idx").on(t.type),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// goals — the love-work goals tracked per soul (3–5 active per file)
// ─────────────────────────────────────────────────────────────────────────────

export const goals = pgTable("goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  soulId: uuid("soul_id")
    .notNull()
    .references(() => souls.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  progress: integer("progress").notNull().default(0), // 0–100
  note: text("note"),
  archived: boolean("archived").default(false).notNull(),
  position: integer("position").default(0).notNull(), // for ordering
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─────────────────────────────────────────────────────────────────────────────
// themes — recurring patterns the practitioner has noticed across readings
// (tag cloud on Soul log tab)
// ─────────────────────────────────────────────────────────────────────────────

export const themes = pgTable("themes", {
  id: uuid("id").primaryKey().defaultRandom(),
  soulId: uuid("soul_id")
    .notNull()
    .references(() => souls.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─────────────────────────────────────────────────────────────────────────────
// observations — bulleted "what I keep receiving for her" notes
// ─────────────────────────────────────────────────────────────────────────────

export const observations = pgTable("observations", {
  id: uuid("id").primaryKey().defaultRandom(),
  soulId: uuid("soul_id")
    .notNull()
    .references(() => souls.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─────────────────────────────────────────────────────────────────────────────
// invoices — exchange ledger
// ─────────────────────────────────────────────────────────────────────────────

export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  number: varchar("number", { length: 32 }).notNull().unique(), // INV-1048
  soulId: uuid("soul_id")
    .notNull()
    .references(() => souls.id, { onDelete: "restrict" }),
  readingId: uuid("reading_id").references(() => readings.id, {
    onDelete: "set null",
  }),

  amountCents: integer("amount_cents").notNull(), // store in cents to avoid float
  currency: varchar("currency", { length: 8 }).default("USD").notNull(),

  issuedAt: date("issued_at").notNull(),
  dueAt: date("due_at"),
  paidAt: date("paid_at"),

  status: invoiceStatusEnum("status").default("sent").notNull(),
  description: text("description"), // "Soul reading · Apr 17"

  stripePaymentId: text("stripe_payment_id"), // future Stripe integration

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─────────────────────────────────────────────────────────────────────────────
// consents — per-soul consent records (care, recording, channeling, etc.)
// ─────────────────────────────────────────────────────────────────────────────

export const consents = pgTable("consents", {
  id: uuid("id").primaryKey().defaultRandom(),
  soulId: uuid("soul_id")
    .notNull()
    .references(() => souls.id, { onDelete: "cascade" }),
  label: text("label").notNull(), // "Care & recording consent"
  status: text("status").notNull(), // "Signed 2025-03-20" / "Yes" / etc
  signedAt: date("signed_at"),
  expiresAt: date("expires_at"),
  documentId: uuid("document_id").references(() => documents.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─────────────────────────────────────────────────────────────────────────────
// intake_answers — Q&A from the soul intake form
// ─────────────────────────────────────────────────────────────────────────────

export const intakeAnswers = pgTable("intake_answers", {
  id: uuid("id").primaryKey().defaultRandom(),
  soulId: uuid("soul_id")
    .notNull()
    .references(() => souls.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  answer: text("answer"),
  position: integer("position").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─────────────────────────────────────────────────────────────────────────────
// timeline_events — derived/manual events shown on the Timeline tab
// Most events derive from readings/documents/invoices but practitioner can add manual ones
// ─────────────────────────────────────────────────────────────────────────────

export const timelineEventKindEnum = pgEnum("timeline_event_kind", [
  "session_upcoming",
  "session",
  "note",
  "upload",
  "invoice_paid",
  "invoice_overdue",
  "intake_pending",
  "file_open",
  "voice_memo",
  "manual",
]);

export const timelineEvents = pgTable(
  "timeline_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    soulId: uuid("soul_id")
      .notNull()
      .references(() => souls.id, { onDelete: "cascade" }),
    kind: timelineEventKindEnum("kind").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    title: text("title").notNull(),
    body: text("body"),

    // Optional links to related entities
    readingId: uuid("reading_id").references(() => readings.id, {
      onDelete: "cascade",
    }),
    documentId: uuid("document_id").references(() => documents.id, {
      onDelete: "cascade",
    }),
    invoiceId: uuid("invoice_id").references(() => invoices.id, {
      onDelete: "cascade",
    }),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    soulOccurredIdx: index("timeline_soul_occurred_idx").on(
      t.soulId,
      t.occurredAt
    ),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Relations
// ─────────────────────────────────────────────────────────────────────────────

export const soulsRelations = relations(souls, ({ many }) => ({
  readings: many(readings),
  documents: many(documents),
  goals: many(goals),
  themes: many(themes),
  observations: many(observations),
  invoices: many(invoices),
  consents: many(consents),
  intakeAnswers: many(intakeAnswers),
  timelineEvents: many(timelineEvents),
}));

export const readingsRelations = relations(readings, ({ one, many }) => ({
  soul: one(souls, { fields: [readings.soulId], references: [souls.id] }),
  documents: many(documents),
  invoices: many(invoices),
}));

export const documentsRelations = relations(documents, ({ one }) => ({
  soul: one(souls, { fields: [documents.soulId], references: [souls.id] }),
  reading: one(readings, {
    fields: [documents.readingId],
    references: [readings.id],
  }),
}));

export const invoicesRelations = relations(invoices, ({ one }) => ({
  soul: one(souls, { fields: [invoices.soulId], references: [souls.id] }),
  reading: one(readings, {
    fields: [invoices.readingId],
    references: [readings.id],
  }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Type exports for use in app code
// ─────────────────────────────────────────────────────────────────────────────

export type Soul = typeof souls.$inferSelect;
export type NewSoul = typeof souls.$inferInsert;
export type Reading = typeof readings.$inferSelect;
export type NewReading = typeof readings.$inferInsert;
export type Document = typeof documents.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type Theme = typeof themes.$inferSelect;
export type Observation = typeof observations.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type Consent = typeof consents.$inferSelect;
export type IntakeAnswer = typeof intakeAnswers.$inferSelect;
export type TimelineEvent = typeof timelineEvents.$inferSelect;
