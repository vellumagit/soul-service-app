import "server-only";

/**
 * Landing-form spam scoring — tuned against the actual spam svit.live
 * receives, not generic rules. Every signal below appears verbatim in real
 * captured spam ("Eric Jones" widget spam, searchregister.* domain listing
 * scams, cold SEO/web-design pitches from spoofed lookalike addresses).
 *
 * Philosophy: NOTHING is deleted. A submission that scores as spam is stored
 * with status='spam' and shown in a collapsed section of the inbox with a
 * one-tap "Not spam" restore — so a real person tripping the filter costs a
 * click, not a lost soul. What spam loses is the ATTENTION: no email to
 * Svitlana, no confirmation back to the sender (backscatter), no inbox badge.
 *
 * Thresholds err toward letting things through: her real inquiries are short,
 * personal, link-free notes — often in Ukrainian or Russian — and none of
 * these signals fire on that shape.
 */

export type SpamVerdict = {
  spam: boolean;
  score: number;
  reasons: string[];
};

const SPAM_THRESHOLD = 3;

// Phrases that appear in marketing/SEO cold-pitch spam and essentially never
// in a genuine "I'd like to work with you" note. Lowercase substrings.
const MARKETING_PHRASES = [
  "seo",
  "search engine",
  "google search",
  "search results",
  "search rankings",
  "backlink",
  "crawl issues",
  "web traffic",
  "traffic to your",
  "generate more leads",
  "leads for your",
  "web visitors into leads",
  "website audit",
  "your website",
  "your web site",
  "your domain",
  "new domain",
  "we design",
  "web design",
  "build your website",
  "digital marketing",
  "marketing agency",
  "increase sales",
  "guest post",
  "link building",
  "top of google",
  "page one of google",
  "domain registration",
  "domain listing",
  "unsubscribe",
];

// Salutations addressed to the SITE, not the person. Real humans write to
// Svitlana; bots scrape the domain and mail "the owner".
const SITE_SALUTATIONS = [
  "svit live owner",
  "svit.live owner",
  "website owner",
  "site owner",
  "hello svit.live",
  "hello http",
  "dear owner",
  "to the owner",
];

export function scoreLandingLead(input: {
  name: string;
  email: string;
  message: string;
}): SpamVerdict {
  const name = input.name.trim().toLowerCase();
  const email = input.email.trim().toLowerCase();
  const msg = input.message.toLowerCase();
  const emailDomain = email.split("@")[1] ?? "";

  let score = 0;
  const reasons: string[] = [];

  // Spoofed lookalike sender: the address contains her own domain but isn't
  // hers ("domains@search-svit.live", "noreply@noreply-svit.live"). No real
  // client writes from an address containing the practice's domain.
  if (emailDomain.includes("svit") && emailDomain !== "svit.live") {
    score += 3;
    reasons.push("lookalike sender domain");
  }
  if (email.startsWith("noreply") || emailDomain.startsWith("noreply")) {
    score += 2;
    reasons.push("noreply sender");
  }

  // Links in the message. Genuine inquiries here are personal notes; one link
  // is suspicious, several is a pitch.
  const linkCount = (msg.match(/https?:\/\/|www\./g) ?? []).length;
  if (linkCount >= 2) {
    score += 3;
    reasons.push(`${linkCount} links`);
  } else if (linkCount === 1) {
    score += 2;
    reasons.push("contains a link");
  }

  // Addressed to the website, not to a person.
  if (SITE_SALUTATIONS.some((s) => msg.includes(s))) {
    score += 3;
    reasons.push("addressed to the site, not a person");
  }

  // Marketing vocabulary. One phrase can be coincidence; two is a pitch.
  const hits = MARKETING_PHRASES.filter((p) => msg.includes(p));
  if (hits.length >= 2) {
    score += 3;
    reasons.push(`marketing language (${hits.slice(0, 3).join(", ")})`);
  } else if (hits.length === 1) {
    score += 1;
    reasons.push(`marketing phrase ("${hits[0]}")`);
  }

  // The famous "Eric Jones" form-spam bot and kin — a name that IS an email
  // handle pattern seen in the wild.
  if (email.includes("ericjones") || name === "eric jones") {
    score += 3;
    reasons.push("known spam signature");
  }

  return { spam: score >= SPAM_THRESHOLD, score, reasons };
}
