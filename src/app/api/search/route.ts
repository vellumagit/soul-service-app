import { NextResponse } from "next/server";
import { search } from "@/db/queries";
import { requireSession } from "@/lib/session-cookies";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { accountId } = await requireSession();
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const results = await search(accountId, q);
  return NextResponse.json({ results });
}
