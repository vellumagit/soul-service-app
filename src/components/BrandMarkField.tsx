"use client";

// Logo / favicon control for Settings → Branding. Same shape as the landing
// portrait field: pick a file, it uploads to Blob and goes live everywhere
// immediately — no hosting step, no redeploy. A hidden input mirrors the URL
// so a later full "Save changes" keeps it instead of wiping it.
//
// The two marks preview differently on purpose: the logo shows on the same
// parchment the sidebar uses, the favicon shows inside a little mock browser
// tab, because 16px is the size that actually matters and a mark that looks
// great at 512px often turns to mud there.

import { useRef, useState } from "react";
import {
  uploadBrandMark,
  removeBrandMark,
  type BrandMark,
} from "@/lib/uploads";
import { rethrowIfRedirect } from "@/lib/redirect-error";
import { inputCls } from "./Form";

export function BrandMarkField({
  kind,
  initialUrl,
  siteName,
}: {
  kind: BrandMark;
  initialUrl: string | null;
  /** Shown in the mock tab beside the favicon preview. */
  siteName?: string;
}) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLink, setShowLink] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const isFavicon = kind === "favicon";
  const noun = isFavicon ? "favicon" : "logo";

  async function onFile(file: File) {
    setError(null);
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", kind);
    try {
      const res = await uploadBrandMark(fd);
      setUrl(res.url);
    } catch (e) {
      rethrowIfRedirect(e);
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    setError(null);
    setBusy(true);
    try {
      await removeBrandMark(kind);
      setUrl("");
    } catch (e) {
      rethrowIfRedirect(e);
      setError(e instanceof Error ? e.message : `Couldn't remove the ${noun}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <input
        type="hidden"
        name={isFavicon ? "faviconUrl" : "logoUrl"}
        value={url}
        readOnly
      />

      <div className="flex items-start gap-4">
        {/* Preview */}
        {isFavicon ? (
          <div className="shrink-0">
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-t-md bg-ink-100 border border-b-0 border-ink-200 w-[136px]">
              <div className="w-4 h-4 rounded-sm overflow-hidden bg-white flex items-center justify-center shrink-0">
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={url}
                    alt=""
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <span className="w-2.5 h-2.5 rounded-full border border-ink-300" />
                )}
              </div>
              <span className="text-[10px] text-ink-500 truncate">
                {siteName || "svit.live"}
              </span>
            </div>
            <div className="h-6 rounded-b-md border border-ink-200 bg-white w-[136px]" />
          </div>
        ) : (
          <div className="w-28 h-20 rounded-md overflow-hidden bg-[#fdf9f1] border border-ink-100 flex items-center justify-center shrink-0 p-2">
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url}
                alt="Logo preview"
                className="max-w-full max-h-full object-contain"
              />
            ) : (
              <span className="text-[10px] uppercase tracking-wider font-mono text-ink-400">
                No logo
              </span>
            )}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <input
            ref={fileRef}
            type="file"
            accept={isFavicon ? "image/png,image/svg+xml,image/x-icon" : "image/*"}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.currentTarget.value = ""; // allow re-picking the same file
            }}
          />

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="px-3 py-1.5 rounded-md bg-plum-700 text-white text-sm hover:bg-plum-800 disabled:opacity-50"
            >
              {busy
                ? "Uploading…"
                : url
                  ? `Replace ${noun}`
                  : `Upload ${noun}`}
            </button>
            {url && !busy && (
              <button
                type="button"
                onClick={onRemove}
                className="px-3 py-1.5 rounded-md border border-ink-200 text-ink-600 text-sm hover:text-ink-900 hover:border-ink-300"
              >
                Remove
              </button>
            )}
          </div>

          <p className="text-[11px] text-ink-400 mt-2 leading-relaxed">
            {isFavicon ? (
              <>
                The little icon on the browser tab. A <strong>square</strong>{" "}
                PNG or SVG works best — 512×512 is plenty. Keep it simple: it
                renders about the size of this text. Already-open tabs may need
                a hard refresh to catch up; everyone else sees it right away.
              </>
            ) : (
              <>
                Shown in your sidebar and at the top of your public pages, in
                place of the text wordmark. PNG or SVG with a{" "}
                <strong>transparent background</strong> looks best. Under
                5&nbsp;MB.
              </>
            )}
          </p>

          <button
            type="button"
            onClick={() => setShowLink((s) => !s)}
            className="text-[11px] text-plum-700 hover:underline mt-1"
          >
            {showLink ? "Hide link option" : "Or paste an image link instead"}
          </button>

          {showLink && (
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              maxLength={500}
              className={`${inputCls} mt-2`}
              placeholder={`https://…/${noun}.png`}
            />
          )}

          {error && <p className="text-[11px] text-red-700 mt-2">{error}</p>}
        </div>
      </div>
    </div>
  );
}
