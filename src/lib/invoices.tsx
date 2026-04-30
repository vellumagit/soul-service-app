// Server-side PDF invoice generator using @react-pdf/renderer.
// Stores PDF in Vercel Blob and saves the URL on the session.
import "server-only";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";
import { put } from "@vercel/blob";
import { db } from "@/db";
import { sessions, clients, practitionerSettings } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 11, color: "#1c1917", fontFamily: "Helvetica" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 32,
  },
  brand: { flexDirection: "column" },
  brandName: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  meta: { color: "#78716c", fontSize: 9, lineHeight: 1.4 },
  invoiceMeta: { textAlign: "right" },
  invoiceLabel: {
    color: "#a8a29e",
    fontSize: 9,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  invoiceNumber: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    marginBottom: 6,
  },
  toRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 32,
  },
  toBlock: { flex: 1 },
  smallLabel: {
    color: "#a8a29e",
    fontSize: 8,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  bigName: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  table: { borderTop: 1, borderTopColor: "#e7e5e4", marginBottom: 24 },
  row: {
    flexDirection: "row",
    paddingVertical: 12,
    borderBottom: 1,
    borderBottomColor: "#e7e5e4",
  },
  rowDesc: { flex: 3 },
  rowAmount: { flex: 1, textAlign: "right", fontFamily: "Helvetica-Bold" },
  rowSub: { color: "#78716c", fontSize: 9, marginTop: 2 },
  totalRow: {
    flexDirection: "row",
    paddingVertical: 16,
  },
  totalLabel: {
    flex: 3,
    textAlign: "right",
    color: "#78716c",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  totalAmount: {
    flex: 1,
    textAlign: "right",
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
  },
  payBlock: {
    backgroundColor: "#fef6ee",
    padding: 16,
    borderRadius: 4,
    marginTop: 12,
  },
  payLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    color: "#9a3412",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  payText: { fontSize: 10, color: "#44403c", lineHeight: 1.5 },
  footer: {
    position: "absolute",
    bottom: 36,
    left: 48,
    right: 48,
    textAlign: "center",
    color: "#a8a29e",
    fontSize: 9,
    fontStyle: "italic",
  },
});

type InvoiceData = {
  invoiceNumber: string;
  issuedAt: Date;
  dueAt?: Date | null;

  practitionerName: string;
  businessName?: string | null;
  businessEmail?: string | null;
  businessPhone?: string | null;
  businessAddress?: string | null;
  websiteUrl?: string | null;

  clientName: string;
  clientEmail?: string | null;
  clientAddress?: string | null;

  description: string;
  sessionDate: Date;
  amountCents: number;
  currency: string;
  paid: boolean;
  paymentMethod?: string | null;
  paidAt?: string | null;

  paymentInstructions?: string | null;
  footer?: string | null;
};

function formatCurrency(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function InvoiceDocument({ data }: { data: InvoiceData }) {
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.brand}>
            <Text style={styles.brandName}>
              {data.businessName ?? data.practitionerName}
            </Text>
            <Text style={styles.meta}>{data.practitionerName}</Text>
            {data.businessAddress && (
              <Text style={styles.meta}>{data.businessAddress}</Text>
            )}
            {data.businessEmail && (
              <Text style={styles.meta}>{data.businessEmail}</Text>
            )}
            {data.businessPhone && (
              <Text style={styles.meta}>{data.businessPhone}</Text>
            )}
            {data.websiteUrl && (
              <Text style={styles.meta}>{data.websiteUrl}</Text>
            )}
          </View>
          <View style={styles.invoiceMeta}>
            <Text style={styles.invoiceLabel}>Invoice</Text>
            <Text style={styles.invoiceNumber}>{data.invoiceNumber}</Text>
            <Text style={styles.meta}>Issued {formatDate(data.issuedAt)}</Text>
            {data.dueAt && (
              <Text style={styles.meta}>Due {formatDate(data.dueAt)}</Text>
            )}
            {data.paid && (
              <Text
                style={{
                  ...styles.meta,
                  color: "#15803d",
                  fontFamily: "Helvetica-Bold",
                  marginTop: 4,
                }}
              >
                PAID{data.paidAt ? ` · ${data.paidAt}` : ""}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.toRow}>
          <View style={styles.toBlock}>
            <Text style={styles.smallLabel}>Bill to</Text>
            <Text style={styles.bigName}>{data.clientName}</Text>
            {data.clientEmail && (
              <Text style={styles.meta}>{data.clientEmail}</Text>
            )}
            {data.clientAddress && (
              <Text style={styles.meta}>{data.clientAddress}</Text>
            )}
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.row}>
            <View style={styles.rowDesc}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>
                {data.description}
              </Text>
              <Text style={styles.rowSub}>
                Session date · {formatDate(data.sessionDate)}
              </Text>
            </View>
            <Text style={styles.rowAmount}>
              {formatCurrency(data.amountCents, data.currency)}
            </Text>
          </View>
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total due</Text>
          <Text style={styles.totalAmount}>
            {formatCurrency(data.amountCents, data.currency)}
          </Text>
        </View>

        {data.paymentInstructions && !data.paid && (
          <View style={styles.payBlock}>
            <Text style={styles.payLabel}>How to pay</Text>
            <Text style={styles.payText}>{data.paymentInstructions}</Text>
          </View>
        )}

        {data.footer && <Text style={styles.footer}>{data.footer}</Text>}
      </Page>
    </Document>
  );
}

// Generate (or regenerate) the invoice PDF for a session.
// Uploads to Vercel Blob and saves the URL + invoice number on the session row.
export async function generateInvoiceForSession(sessionId: string) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is not set — connect Vercel Blob to enable invoice generation."
    );
  }

  const sessionRow = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  const session = sessionRow[0];
  if (!session) throw new Error("Session not found");

  const clientRow = await db
    .select()
    .from(clients)
    .where(eq(clients.id, session.clientId))
    .limit(1);
  const client = clientRow[0];
  if (!client) throw new Error("Client not found");

  const settingsRow = await db.select().from(practitionerSettings).limit(1);
  let settings = settingsRow[0];
  if (!settings) {
    const [created] = await db.insert(practitionerSettings).values({}).returning();
    settings = created;
  }

  const amountCents =
    session.paymentAmountCents ?? settings.defaultRateCents;

  // Pick + reserve the next invoice number atomically
  const invoiceNumber =
    session.invoiceNumber ??
    `${settings.invoicePrefix}-${settings.nextInvoiceNumber}`;
  if (!session.invoiceNumber) {
    await db
      .update(practitionerSettings)
      .set({
        nextInvoiceNumber: sql`${practitionerSettings.nextInvoiceNumber} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(practitionerSettings.id, settings.id));
  }

  const issuedAt = new Date();
  const dueAt = new Date(issuedAt);
  dueAt.setDate(dueAt.getDate() + 14);

  const data: InvoiceData = {
    invoiceNumber,
    issuedAt,
    dueAt,

    practitionerName: settings.practitionerName ?? "Maya",
    businessName: settings.businessName,
    businessEmail: settings.businessEmail,
    businessPhone: settings.businessPhone,
    businessAddress: settings.businessAddress,
    websiteUrl: settings.websiteUrl,

    clientName: client.fullName,
    clientEmail: client.email,
    clientAddress: client.city,

    description: `${session.type} (${session.durationMinutes} min)`,
    sessionDate: session.scheduledAt,
    amountCents,
    currency: settings.defaultCurrency,
    paid: session.paid,
    paymentMethod: session.paymentMethod,
    paidAt: session.paidAt,

    paymentInstructions: settings.paymentInstructions,
    footer: settings.invoiceFooter,
  };

  // @react-pdf/renderer's pdf().toBuffer() actually returns a Node ReadableStream;
  // consume it into a real Buffer for upload.
  const stream = await pdf(<InvoiceDocument data={data} />).toBuffer();
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);

  const safeName = `${invoiceNumber}-${client.fullName
    .replace(/[^a-zA-Z0-9]/g, "_")
    .toLowerCase()}.pdf`;

  const blob = await put(`invoices/${safeName}`, buffer, {
    access: "public",
    addRandomSuffix: true,
    allowOverwrite: true,
    contentType: "application/pdf",
  });

  await db
    .update(sessions)
    .set({
      invoiceUrl: blob.url,
      invoiceNumber,
      invoiceGeneratedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(sessions.id, sessionId));

  return { url: blob.url, invoiceNumber };
}
