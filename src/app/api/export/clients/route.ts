// CSV export of all clients for the signed-in account.
import { eq, asc } from "drizzle-orm";
import { db, clients } from "@/db";
import { requireSession } from "@/lib/session-cookies";
import { csvResponse, rowsToCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

export async function GET() {
  const { accountId } = await requireSession();

  const rows = await db
    .select()
    .from(clients)
    .where(eq(clients.accountId, accountId))
    .orderBy(asc(clients.fullName));

  const headers = [
    "id",
    "full_name",
    "pronouns",
    "email",
    "phone",
    "city",
    "timezone",
    "preferred_language",
    "status",
    "primary_session_type",
    "working_on",
    "about",
    "intake_notes",
    "private_notes",
    "how_they_found_me",
    "tags",
    "sensitivities",
    "emergency_name",
    "emergency_phone",
    "created_at",
    "updated_at",
  ];

  const data = rows.map((c) => [
    c.id,
    c.fullName,
    c.pronouns,
    c.email,
    c.phone,
    c.city,
    c.timezone,
    c.preferredLanguage,
    c.status,
    c.primarySessionType,
    c.workingOn,
    c.aboutClient,
    c.intakeNotes,
    c.privateNotes,
    c.howTheyFoundMe,
    (c.tags ?? []).join("; "),
    (c.sensitivities ?? []).join("; "),
    c.emergencyName,
    c.emergencyPhone,
    c.createdAt,
    c.updatedAt,
  ]);

  const ymd = new Date().toISOString().slice(0, 10);
  return csvResponse(
    `soul-service-clients-${ymd}.csv`,
    rowsToCsv(headers, data)
  );
}
