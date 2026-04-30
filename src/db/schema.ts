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

// ─────────────────────────────────────────────────────────────────────────────
// clients — the central entity
// ─────────────────────────────────────────────────────────────────────────────

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fullName: text("full_name").notNull(),
    avatarUrl: text("avatar_url"),

    pronouns: varchar("pronouns", { length: 32 }),
    dob: date("dob"),

    email: text("email"),
    phone: varchar("phone", { length: 32 }),
    city: text("city"),
    timezone: varchar("timezone", { length: 64 }),

    // Free-text fields the practitioner edits in the profile form
    aboutClient: text("about_client"), // was "pinnedNote" — what she's holding for them
    workingOn: text("working_on"), // short phrase shown in directory
    intakeNotes: text("intake_notes"), // replaces the old intake-answers table — single freeform field
    howTheyFoundMe: text("how_they_found_me"),

    // Comma/tag list — themes/patterns the practitioner notices
    tags: text("tags").array().default([]).notNull(),

    primarySessionType: text("primary_session_type"), // free-form (e.g. "Soul reading")

    emergencyName: text("emergency_name"),
    emergencyPhone: varchar("emergency_phone", { length: 32 }),

    status: clientStatusEnum("status").default("active").notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    nameIdx: index("clients_name_idx").on(t.fullName),
    statusIdx: index("clients_status_idx").on(t.status),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// sessions — every scheduled or past session for a client
// (replaces "readings". Payment lives on the session row itself.)
// ─────────────────────────────────────────────────────────────────────────────

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),

    type: text("type").notNull().default("Soul reading"), // free-form
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

    // Payment lives here (Venmo/Zelle/cash style — no separate invoice entity)
    paid: boolean("paid").default(false).notNull(),
    paymentMethod: paymentMethodEnum("payment_method"),
    paymentAmountCents: integer("payment_amount_cents"),
    paidAt: date("paid_at"),
    paymentNote: text("payment_note"), // optional — confirmation # / "venmo: @maya"

    // Generated invoice PDF (Vercel Blob URL). Auto-generated on completion if enabled.
    invoiceUrl: text("invoice_url"),
    invoiceNumber: text("invoice_number"),
    invoiceGeneratedAt: timestamp("invoice_generated_at"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    clientIdx: index("sessions_client_idx").on(t.clientId),
    scheduledIdx: index("sessions_scheduled_idx").on(t.scheduledAt),
    statusIdx: index("sessions_status_idx").on(t.status),
    paidIdx: index("sessions_paid_idx").on(t.paid),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// attachments — files uploaded for a client (and optionally tied to a session)
// ─────────────────────────────────────────────────────────────────────────────

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
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
// goals — what the client is working on (tracked over time)
// ─────────────────────────────────────────────────────────────────────────────

export const goals = pgTable("goals", {
  id: uuid("id").primaryKey().defaultRandom(),
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
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  archived: boolean("archived").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─────────────────────────────────────────────────────────────────────────────
// note_templates — reusable note structures (insert into session/client notes)
// ─────────────────────────────────────────────────────────────────────────────

export const noteTemplates = pgTable("note_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
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

  businessName: text("business_name"),
  practitionerName: text("practitioner_name"), // "Maya"
  businessEmail: text("business_email"),
  businessPhone: text("business_phone"),
  businessAddress: text("business_address"),
  websiteUrl: text("website_url"),

  // Default rate (used when generating invoices if no amount is set)
  defaultRateCents: integer("default_rate_cents").default(13500).notNull(),
  defaultCurrency: varchar("default_currency", { length: 8 })
    .default("USD")
    .notNull(),

  // Payment instructions printed on invoices (e.g. "Venmo @maya / Zelle 555-1234")
  paymentInstructions: text("payment_instructions"),
  invoiceFooter: text("invoice_footer"), // "Thank you. With love, Maya."
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
  birthdayReminderDays: integer("birthday_reminder_days").default(3), // create task N days before

  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const clientsRelations = relations(clients, ({ many }) => ({
  sessions: many(sessions),
  attachments: many(attachments),
  goals: many(goals),
  tasks: many(tasks),
  communications: many(communications),
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
export type Task = typeof tasks.$inferSelect;
export type Communication = typeof communications.$inferSelect;
export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type NoteTemplate = typeof noteTemplates.$inferSelect;
export type PractitionerSettings = typeof practitionerSettings.$inferSelect;
