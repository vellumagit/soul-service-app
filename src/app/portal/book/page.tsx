// "Book another session" — client-initiated request for a NEW session.
//
// NOT self-serve scheduling. The practitioner controls the calendar;
// this is just a structured message saying "I'd like another one,
// here's when works." Lands in Loose Ends → "Session requests" on
// her side.
//
// Form fields:
//   - preferred_times: free-text ("weekday evenings, or Saturday morning")
//   - reason: optional message
//
// One pending request per client at a time is allowed; sending a fresh
// one while a pending exists is fine — both queue in Loose Ends.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { clientBookingRequests } from "@/db/schema";
import { requirePortalSession } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

async function submitBookingRequest(formData: FormData): Promise<void> {
  "use server";
  const portal = await requirePortalSession();
  const preferredTimesRaw = formData.get("preferredTimes");
  const reasonRaw = formData.get("reason");

  const preferredTimes =
    typeof preferredTimesRaw === "string"
      ? preferredTimesRaw.trim().slice(0, 500)
      : "";
  const reason =
    typeof reasonRaw === "string" ? reasonRaw.trim().slice(0, 1000) : "";

  // Require at least one of the two — a fully blank request isn't
  // actionable. Don't trip silently, but the form has client-side
  // validation so this should be rare.
  if (preferredTimes.length === 0 && reason.length === 0) return;

  await db.insert(clientBookingRequests).values({
    accountId: portal.accountId,
    clientId: portal.clientId,
    preferredTimes: preferredTimes.length > 0 ? preferredTimes : null,
    reason: reason.length > 0 ? reason : null,
    status: "pending",
  });

  revalidatePath("/portal/book");
  revalidatePath("/loose-ends");
  revalidatePath(`/clients/${portal.clientId}`);
  redirect("/portal/book?submitted=1");
}

export default async function PortalBookPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string }>;
}) {
  const portal = await requirePortalSession();
  const { submitted } = await searchParams;
  const firstName =
    portal.clientFullName.split(" ")[0] ?? portal.clientFullName;

  // Show their pending requests so they don't accidentally double-send.
  const pending = await db
    .select({
      id: clientBookingRequests.id,
      preferredTimes: clientBookingRequests.preferredTimes,
      reason: clientBookingRequests.reason,
      createdAt: clientBookingRequests.createdAt,
    })
    .from(clientBookingRequests)
    .where(
      and(
        eq(clientBookingRequests.accountId, portal.accountId),
        eq(clientBookingRequests.clientId, portal.clientId),
        eq(clientBookingRequests.status, "pending")
      )
    )
    .orderBy(desc(clientBookingRequests.createdAt));

  return (
    <div className="max-w-xl mx-auto px-4 md:px-6 py-8 md:py-10">
      <Link
        href="/portal"
        className="text-xs text-ink-500 hover:text-ink-900 inline-flex items-center gap-1 mb-6"
      >
        ← Back to your space
      </Link>

      <header className="mb-7">
        <h1
          className="text-2xl md:text-3xl text-ink-900 serif mb-1"
          style={{ fontWeight: 500, letterSpacing: "-0.015em" }}
        >
          Book another session
        </h1>
        <p className="text-sm text-ink-500 italic serif-italic">
          Send a note. Your practitioner will reach out to find a time —
          this isn&apos;t auto-scheduled.
        </p>
      </header>

      {submitted === "1" ? (
        <section
          className="rounded-md p-5 mb-6"
          style={{
            background: "var(--color-honey-50)",
            border: "1px solid var(--color-honey-100)",
            color: "var(--color-honey-700)",
          }}
        >
          <p className="font-medium mb-1 text-sm">Sent.</p>
          <p className="text-sm leading-relaxed">
            Your practitioner has been notified. She&apos;ll be in touch to
            find a time.
          </p>
          <Link
            href="/portal"
            className="inline-block text-xs text-honey-700 hover:underline font-medium mt-3"
          >
            Back to your space →
          </Link>
        </section>
      ) : (
        <>
          {pending.length > 0 && (
            <section className="paper-card p-5 mb-6">
              <p className="text-[10px] uppercase tracking-widest text-plum-700 font-mono mb-2">
                You&apos;ve already requested
              </p>
              <ul className="space-y-3">
                {pending.map((r) => (
                  <li
                    key={r.id}
                    className="text-sm pl-3 border-l-2 border-plum-200"
                  >
                    {r.preferredTimes && (
                      <p className="text-ink-700 mb-1">
                        Times: <span className="italic">{r.preferredTimes}</span>
                      </p>
                    )}
                    {r.reason && (
                      <p className="serif-italic text-ink-700" style={{ fontWeight: 400 }}>
                        &ldquo;{r.reason}&rdquo;
                      </p>
                    )}
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-ink-500 italic mt-3 leading-snug">
                If you want to add to the conversation, you can send another
                — both will be visible to {firstName}.
              </p>
            </section>
          )}

          <section className="paper-card paper-card--feature p-6 md:p-8">
            <form action={submitBookingRequest} className="space-y-5">
              <label className="block">
                <span
                  className="serif-italic text-base text-plum-700 block mb-2"
                  style={{ fontWeight: 400 }}
                >
                  When works for you?
                </span>
                <p className="text-[12px] text-ink-500 italic mb-2 leading-snug">
                  A rough sketch is enough — &ldquo;weekday evenings,&rdquo;
                  &ldquo;mornings before 10,&rdquo; &ldquo;Saturday or Sunday
                  any time after lunch.&rdquo;
                </p>
                <textarea
                  name="preferredTimes"
                  rows={3}
                  maxLength={500}
                  placeholder="Weekday evenings or Saturday afternoons…"
                  className="w-full px-3 py-2 text-sm leading-relaxed border border-ink-200 rounded-md bg-white outline-none focus:border-plum-500 focus:ring-1 focus:ring-plum-100 resize-y"
                />
              </label>

              <label className="block">
                <span
                  className="serif-italic text-base text-plum-700 block mb-2"
                  style={{ fontWeight: 400 }}
                >
                  Anything you&apos;d like to mention? (optional)
                </span>
                <textarea
                  name="reason"
                  rows={4}
                  maxLength={1000}
                  placeholder="Something on your mind, a reason you&apos;d like to talk, or nothing at all."
                  className="w-full px-3 py-2 text-sm leading-relaxed border border-ink-200 rounded-md bg-white outline-none focus:border-plum-500 focus:ring-1 focus:ring-plum-100 resize-y"
                />
              </label>

              <button
                type="submit"
                className="px-4 py-2 text-sm bg-plum-700 hover:bg-plum-600 text-white rounded-md font-medium transition-colors"
              >
                Send the request
              </button>
            </form>
          </section>
        </>
      )}
    </div>
  );
}
