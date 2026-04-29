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

export const clientsRelations = relations(clients, ({ many }) => ({
  sessions: many(sessions),
  attachments: many(attachments),
  goals: many(goals),
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
