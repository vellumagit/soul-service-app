// Iframe wrapper for the Cloudflare Stream signed playback URL. Server
// component on purpose: the signed URL is minted server-side and embedded
// straight into the iframe src.
//
// If signedUrl is null the parent should not render this component —
// guard at the call site so we don't ship an empty iframe.

interface Props {
  signedUrl: string;
  title?: string;
  /** Aspect ratio (default 16:9). */
  aspectRatio?: string;
}

export function RecapPlayer({
  signedUrl,
  title = "Session recap",
  aspectRatio = "16 / 9",
}: Props) {
  return (
    <div
      className="w-full rounded-md overflow-hidden bg-ink-900"
      style={{ aspectRatio }}
    >
      <iframe
        src={signedUrl}
        title={title}
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
        allowFullScreen
        className="w-full h-full border-0"
      />
    </div>
  );
}
