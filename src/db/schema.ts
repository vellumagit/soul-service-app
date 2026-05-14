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
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

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

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    accountIdx: index("clients_account_idx").on(t.accountId),
    nameIdx: index("clients_name_idx").on(t.fullName),
    statusIdx: index("clients_status_idx").on(t.status),
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

    // Optional context
    intention: text("intention"), // client's stated intention, in their own words
    arrivedAs: text("arrived_as"), // how they showed up (free text)
    leftAs: text("left_as"), // how they left (free text)
    notes: text("notes"), // practitioner's session notes

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

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    accountIdx: index("sessions_account_idx").on(t.accountId),
    clientIdx: index("sessions_client_idx").on(t.clientId),
    scheduledIdx: index("sessions_scheduled_idx").on(t.scheduledAt),
    statusIdx: index("sessions_status_idx").on(t.status),
    paidIdx: index("sessions_paid_idx").on(t.paid),
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

  // Google Calendar OAuth (one practitioner per app — single connected account).
  // Refresh tokens are long-lived; access tokens auto-refresh in google-calendar.ts.
  googleAccessToken: text("google_access_token"),
  googleRefreshToken: text("google_refresh_token"),
  googleTokenExpiresAt: timestamp("google_token_expires_at"),
  googleCalendarEmail: text("google_calendar_email"), // the connected Google account
  googleConnectedAt: timestamp("google_connected_at"),

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

export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Attachment = typeof attachments.$inferSelect;
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
