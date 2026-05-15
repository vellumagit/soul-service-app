// CSV export of all sessions for the signed-in account, joined with client name.
import { eq, desc } from "drizzle-orm";
import { db, sessions, clients } from "@/db";
import { requireSession } from "@/lib/session-cookies";
import { csvResponse, rowsToCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

export async function GET() {
  const { accountId } = await requireSession();

  const rows = await db
    .select({
      id: sessions.id,
      clientId: sessions.clientId,
      clientName: clients.fullName,
      type: sessions.type,
      status: sessions.status,
      scheduledAt: sessions.scheduledAt,
      durationMinutes: sessions.durationMinutes,
      intention: sessions.intention,
      arrivedAs: sessions.arrivedAs,
      leftAs: sessions.leftAs,
      notes: sessions.notes,
      meetUrl: sessions.meetUrl,
      paid: sessions.paid,
      paymentMethod: sessions.paymentMethod,
      paymentAmountCents: sessions.paymentAmountCents,
      paidAt: sessions.paidAt,
      invoiceNumber: sessions.invoiceNumber,
      invoiceUrl: sessions.invoiceUrl,
      createdAt: sessions.createdAt,
    })
    .from(sessions)
    .innerJoin(clients, eq(sessions.clientId, clients.id))
    .where(eq(sessions.accountId, accountId))
    .orderBy(desc(sessions.scheduledAt));

  const headers = [
    "id",
    "client_id",
    "client_name",
    "type",
    "status",
    "scheduled_at",
    "duration_minutes",
    "intention",
    "arrived_as",
    "left_as",
    "notes",
    "meet_url",
    "paid",
    "payment_method",
    "payment_amount",
    "paid_at",
    "invoice_number",
    "invoice_url",
    "created_at",
  ];

  const data = rows.map((s) => [
    s.id,
    s.clientId,
    s.clientName,
    s.type,
    s.status,
    s.scheduledAt,
    s.durationMinutes,
    s.intention,
    s.arrivedAs,
    s.leftAs,
    s.notes,
    s.meetUrl,
    s.paid,
    s.paymentMethod,
    s.paymentAmountCents != null ? (s.paymentAmountCents / 100).toFixed(2) : "",
    s.paidAt,
    s.invoiceNumber,
    s.invoiceUrl,
    s.createdAt,
  ]);

  const ymd = new Date().toISOString().slice(0, 10);
  return csvResponse(
    `soul-service-sessions-${ymd}.csv`,
    rowsToCsv(headers, data)
  );
}
