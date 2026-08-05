// Shrink a photo in the browser before it's uploaded.
//
// WHY THIS EXISTS: every upload in this app goes through a Server Action, and
// Next.js caps a Server Action's request body (1MB by default; we raise it in
// next.config, but Vercel itself refuses request bodies over ~4.5MB, so the
// ceiling can't simply be raised away). A photo straight off a phone is
// routinely 3–8MB, which is how "Add a review → choose photo" ended up failing
// with a bare "Body exceeded 1 MB limit" server error.
//
// Resizing here fixes it at the source AND makes her pages faster: a review
// avatar renders at ~56px and a portrait at a few hundred — there was never a
// reason to ship 8MB of pixels for either.
//
// Safety rule: this must NEVER be the reason an upload fails. Anything it
// can't handle — SVG, GIF, a decode error, a browser without the APIs — comes
// back as the original file untouched, and the server's own size check has the
// final word.

/** Formats we deliberately pass through rather than re-encode. */
function isPassThrough(file: File): boolean {
  return (
    !file.type.startsWith("image/") ||
    file.type === "image/svg+xml" || // vector: resizing would rasterise it
    file.type === "image/gif" // re-encoding would drop the animation
  );
}

export type DownscaleOptions = {
  /** Longest edge of the result, in pixels. */
  maxDimension?: number;
  /** JPEG quality, 0–1. Ignored for PNG. */
  quality?: number;
  /** Files at or under this stay untouched — no point re-encoding a small one. */
  skipUnderBytes?: number;
};

/**
 * Return a smaller version of `file`, or the original when shrinking isn't
 * possible or wouldn't help.
 *
 * PNG in → PNG out, so a logo keeps its transparency. Everything else comes
 * back as JPEG, which is dramatically smaller for photographs.
 */
export async function downscaleImage(
  file: File,
  opts: DownscaleOptions = {}
): Promise<File> {
  const {
    maxDimension = 1600,
    quality = 0.85,
    skipUnderBytes = 400 * 1024,
  } = opts;

  if (isPassThrough(file)) return file;
  if (file.size <= skipUnderBytes) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const longest = Math.max(width, height);
    const scale = longest > maxDimension ? maxDimension / longest : 1;

    // Already small enough in pixel terms — but a big file at modest
    // dimensions is still worth re-encoding, so we carry on rather than
    // bailing out here.
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    bitmap.close?.();

    const keepPng = file.type === "image/png";
    const mime = keepPng ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, mime, keepPng ? undefined : quality)
    );
    if (!blob) return file;

    // Re-encoding can make a file BIGGER (an already-optimised JPEG, a flat
    // PNG). Keep whichever is smaller.
    if (blob.size >= file.size) return file;

    const base = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${base}.${keepPng ? "png" : "jpg"}`, {
      type: mime,
      lastModified: Date.now(),
    });
  } catch {
    // Decode failed, canvas unavailable, tainted image — upload the original
    // and let the server decide.
    return file;
  }
}
