"use client";

// Portrait-photo control for Settings → Landing page. Lets the practitioner
// pick a photo straight from her computer/phone; it uploads to Blob and goes
// live on the public landing page immediately. A hidden input mirrors the
// current URL so that a later full "Save changes" on the settings form keeps
// the photo instead of wiping it. An "or paste a link" escape hatch remains
// for the advanced case (a /public file or an external hosted image).

import { useRef, useState } from "react";
import { uploadLandingPortrait, removeLandingPortrait } from "@/lib/uploads";
import { rethrowIfRedirect } from "@/lib/redirect-error";
import { inputCls } from "./Form";

export function LandingPortraitField({
  initialUrl,
}: {
  initialUrl: string | null;
}) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLink, setShowLink] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function onFile(file: File) {
    setError(null);
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await uploadLandingPortrait(fd);
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
      await removeLandingPortrait();
      setUrl("");
    } catch (e) {
      rethrowIfRedirect(e);
      setError(e instanceof Error ? e.message : "Couldn't remove the photo");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {/* Keeps the URL in the settings form so a later full Save preserves it. */}
      <input type="hidden" name="landingPortraitUrl" value={url} readOnly />

      <div className="flex items-start gap-4">
        <div className="w-24 h-28 rounded-md overflow-hidden bg-plum-100 text-plum-600 flex items-center justify-center shrink-0 border border-ink-100">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt="Portrait preview"
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-[10px] uppercase tracking-wider font-mono">
              No photo
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
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
              {busy ? "Uploading…" : url ? "Replace photo" : "Upload photo"}
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
            Pick a photo from your computer or phone — it goes live on your
            landing page right away. JPG or PNG, under 5&nbsp;MB.
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
              placeholder="https://…/photo.jpg  or  /svitlana.jpg"
            />
          )}

          {error && (
            <p className="text-[11px] text-red-700 mt-2">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
