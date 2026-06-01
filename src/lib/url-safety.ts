// SSRF guard for user-supplied URLs that the server will later fetch
// (the outbound webhook URL on lead-capture forms, in particular).
//
// Without this, a practitioner could configure a webhook URL like
// `http://169.254.169.254/latest/meta-data/iam/security-credentials/`
// and the Soul Service server would happily POST every lead submission
// to it, exfiltrating EC2/Lambda instance metadata (including IAM
// credentials) one form-submit at a time. SSR-style requests from the
// app's runtime have whatever privileges the runtime has; we have to
// gate them at the input layer.
//
// What this blocks:
//   - non-http(s) schemes (file://, gopher://, etc.)
//   - loopback (127.*, ::1, localhost)
//   - private RFC 1918 (10/8, 172.16-31/12, 192.168/16)
//   - link-local (169.254/16 — covers AWS/GCP/Azure metadata endpoints)
//   - "all interfaces" (0.0.0.0)
//   - IPv6 ULA (fc00::/7) and link-local (fe80::/10)
//
// What this does NOT do:
//   - DNS resolution. A hostname that resolves to a private IP at fetch
//     time would still slip through. Vercel functions run in cloud, so
//     in practice the relevant attack is direct-IP exfiltration to
//     169.254.169.254 — covered.
//   - Verification that the URL is actually reachable.
//
// This is "good enough" for the practitioner-tool threat model. A more
// paranoid version would resolve the hostname and recheck immediately
// before each fetch, then connect by IP to defeat DNS rebinding.

export type UrlValidationResult =
  | { ok: true }
  | { ok: false; error: string };

export function validatePublicWebhookUrl(input: string): UrlValidationResult {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return { ok: false, error: "Not a valid URL" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      ok: false,
      error: "URL must start with http:// or https://",
    };
  }

  const host = parsed.hostname.toLowerCase();

  // Hostname blocks (DNS could lie, but these are the most common
  // local-targeting hostnames a misconfigured webhook URL would use).
  if (host === "localhost" || host.endsWith(".localhost")) {
    return { ok: false, error: "Loopback hostnames are not allowed" };
  }
  if (host === "" || host === "0.0.0.0" || host === "::" || host === "[::]") {
    return {
      ok: false,
      error: "Wildcard / unspecified addresses are not allowed",
    };
  }

  // SSRF-bypass-aware: reject "compressed" IPv4 forms that browsers and
  // common HTTP clients still resolve to a private IP.
  //   2130706433        — 127.0.0.1 as a 32-bit decimal integer
  //   0x7f.0.0.1        — hex octet
  //   0177.0.0.1        — octal octet
  //   017700000001      — full octal
  //
  // A pure numeric hostname (no dots) is always one of these; legitimate
  // public hosts always have at least one dot (a TLD).
  if (/^\d+$/.test(host)) {
    return ssrfErr("numeric IPv4 (decimal integer form)");
  }
  // Any octet starting with `0x` is hex; any octet that's `0` followed by
  // more digits is octal. Both are valid per inet_aton but only used for
  // bypass tricks.
  if (host.includes(".")) {
    const parts = host.split(".");
    for (const part of parts) {
      if (/^0x[0-9a-f]+$/i.test(part)) {
        return ssrfErr("hex-encoded IPv4 octet");
      }
      // 0-prefixed numeric (e.g. "0177" = 127 in octal). Single "0" is
      // fine — that's just the literal zero octet.
      if (/^0\d+$/.test(part)) {
        return ssrfErr("octal IPv4 octet");
      }
    }
  }

  // IPv4 literal range checks.
  const ipv4Match = host.match(
    /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
  );
  if (ipv4Match) {
    const octets = ipv4Match.slice(1, 5).map((s) => parseInt(s, 10));
    if (octets.some((n) => n < 0 || n > 255)) {
      return { ok: false, error: "Malformed IPv4 address" };
    }
    const [a, b] = octets;
    // RFC 1122 loopback
    if (a === 127) return ssrfErr("loopback");
    // RFC 1918 private
    if (a === 10) return ssrfErr("private (10.0.0.0/8)");
    if (a === 172 && b >= 16 && b <= 31)
      return ssrfErr("private (172.16.0.0/12)");
    if (a === 192 && b === 168) return ssrfErr("private (192.168.0.0/16)");
    // Link-local — this is the AWS/GCP/Azure cloud metadata range. The
    // single most important block on this list.
    if (a === 169 && b === 254)
      return ssrfErr("link-local / cloud metadata (169.254.0.0/16)");
    // "All interfaces"
    if (a === 0) return ssrfErr("unspecified (0.0.0.0/8)");
    // Multicast / experimental — block these too while we're here.
    if (a >= 224) return ssrfErr("multicast / reserved (224.0.0.0/4+)");
  }

  // IPv6 literal range checks. URL hostnames for IPv6 literals are
  // bracketed (e.g. [::1]); `parsed.hostname` strips the brackets.
  if (host.includes(":")) {
    const lower = host.toLowerCase();
    // Loopback ::1
    if (lower === "::1" || lower === "0:0:0:0:0:0:0:1")
      return ssrfErr("IPv6 loopback");
    // ULA fc00::/7 (first byte 0xFC or 0xFD)
    if (lower.startsWith("fc") || lower.startsWith("fd"))
      return ssrfErr("IPv6 ULA (fc00::/7)");
    // Link-local fe80::/10
    if (lower.startsWith("fe8") || lower.startsWith("fe9") ||
        lower.startsWith("fea") || lower.startsWith("feb"))
      return ssrfErr("IPv6 link-local (fe80::/10)");
    // Unspecified
    if (lower === "::" || lower === "0:0:0:0:0:0:0:0")
      return ssrfErr("IPv6 unspecified");
  }

  return { ok: true };
}

function ssrfErr(label: string): UrlValidationResult {
  return {
    ok: false,
    error: `Webhook URL points to a ${label} address — use a public URL instead`,
  };
}
