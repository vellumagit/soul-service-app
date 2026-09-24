// Structured data for search engines, as a <script type="application/ld+json">.
// Escaping "<" keeps any of her copy from closing the script tag early.

export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
