// CSV export of payment records for the signed-in account.
// Filters to sessions that are paid OR completed-but-unpaid — i.e. anything
// with payment-relevant state. Useful for accounting / tax exports.
import { and, eq, desc, or } from "drizzle-orm";
import { db, sessions, clients } from "@/db";
import { requireSession } from "@/lib/session-cookies";
import { csvResponse, rowsToCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

export async function GET() {
  const { accountId } = await requireSession();

  const rows = await db
    .select({
      id: sessions.id,
      clientName: clients.fullName,
      clientEmail: clients.email,
      sessionType: sessions.type,
      scheduledAt: sessions.scheduledAt,
      durationMinutes: sessions.durationMinutes,
      paid: sessions.paid,
      paymentMethod: sessions.paymentMethod,
      paymentAmountCents: sessions.paymentAmountCents,
      paymentNote: sessions.paymentNote,
      paidAt: sessions.paidAt,
      invoiceNumber: sessions.invoiceNumber,
      invoiceUrl: sessions.invoiceUrl,
      status: sessions.status,
    })
    .from(sessions)
    .innerJoin(clients, eq(sessions.clientId, clients.id))
    .where(
      and(
        eq(sessions.accountId, accountId),
        // Include either paid sessions OR completed unpaid (anything with money relevance)
        or(eq(sessions.paid, true), eq(sessions.status, "completed"))
      )
    )
    .orderBy(desc(sessions.scheduledAt));

  const headers = [
    "session_id",
    "client_name",
    "client_email",
    "session_type",
    "session_date",
    "duration_minutes",
    "status",
    "paid",
    "payment_method",
    "amount",
    "paid_at",
    "payment_note",
    "invoice_number",
    "invoice_url",
  ];

  const data = rows.map((r) => [
    r.id,
    r.clientName,
    r.clientEmail,
    r.sessionType,
    r.scheduledAt,
    r.durationMinutes,
    r.status,
    r.paid,
    r.paymentMethod,
    r.paymentAmountCents != null ? (r.paymentAmountCents / 100).toFixed(2) : "",
    r.paidAt,
    r.paymentNote,
    r.invoiceNumber,
    r.invoiceUrl,
  ]);

  const ymd = new Date().toISOString().slice(0, 10);
  return csvResponse(
    `soul-service-payments-${ymd}.csv`,
    rowsToCsv(headers, data)
  );
}
