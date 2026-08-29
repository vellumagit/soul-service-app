// Browser-direct upload for lead-magnet assets (PDF / image). The file goes
// straight from her browser to Vercel Blob via a short-lived client token, so
// it isn't bound by the 4 MB server-action body limit (see next.config.ts).
// The client then submits only the returned URL through saveLeadMagnet.
//
// Only a signed-in practitioner can mint a token. The route sits outside the
// PUBLIC prefixes in proxy.ts, so the session gate already fronts it; the
// getSessionEmail() check here is defence in depth.

import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getSessionEmail } from "@/lib/session-cookies";
import { findAccountByEmail } from "@/lib/account";

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const email = await getSessionEmail();
        if (!email) throw new Error("Not signed in.");
        const account = await findAccountByEmail(email);
        if (!account) throw new Error("No account for this session.");
        // Scope the token to this account's own prefix, so a signed-in
        // practitioner can't mint an upload token for another account's blob
        // path (the DB is multi-tenant even if the deploy is single-practice).
        if (!pathname.startsWith(`accounts/${account.accountId}/`)) {
          throw new Error("Upload path not allowed.");
        }
        return {
          allowedContentTypes: [
            "application/pdf",
            "image/png",
            "image/jpeg",
            "image/webp",
            "image/gif",
          ],
          maximumSizeInBytes: 30 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
      // No-op: nothing to persist here — saveLeadMagnet records the URL when
      // she saves the magnet. (Runs on Vercel's servers after the upload.)
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(json);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 400 }
    );
  }
}
