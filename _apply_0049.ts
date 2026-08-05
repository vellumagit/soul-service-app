// One-off: apply migration 0049 (landing_offers) to prod and seed the six
// offers currently on the storefront ladder.
//
// Written in TS and run with tsx so it can IMPORT the copy dictionary directly
// rather than having the strings retyped here. Retyping is how a live page
// quietly acquires wording nobody approved — especially the Ukrainian, which
// I can't eyeball for correctness.
//
// Idempotent: table IF NOT EXISTS, and only seeds an account with zero offers.

import fs from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { getLandingCopy } from "./src/lib/landing-copy";

const env = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
const url = env
  .split(/\r?\n/)
  .find((l) => l.startsWith("DATABASE_URL="))!
  .split("=")
  .slice(1)
  .join("=")
  .trim()
  .replace(/^["']|["']$/g, "");

const sql = neon(url);

const EN = getLandingCopy("en");
const UK = getLandingCopy("uk");

type Key = "quiz" | "circle" | "single" | "retainer" | "journey" | "talk";

// Structure (which row, card style, where the button goes, price suffix) — the
// parts that aren't language-specific. Mirrors the markup being replaced.
const SHAPE: {
  key: Key;
  linkKind: string;
  variant: string;
  lane: string;
  suffix: null | "perSession" | "perMonth" | "per3Months" | "aRealConversation";
}[] = [
  { key: "quiz", linkKind: "quiz", variant: "free", lane: "entry", suffix: null },
  { key: "circle", linkKind: "circle", variant: "plain", lane: "entry", suffix: "perSession" },
  { key: "single", linkKind: "contact", variant: "plain", lane: "entry", suffix: null },
  { key: "retainer", linkKind: "contact", variant: "plain", lane: "deep", suffix: "perMonth" },
  { key: "journey", linkKind: "contact", variant: "feature", lane: "deep", suffix: "per3Months" },
  { key: "talk", linkKind: "contact", variant: "plain", lane: "deep", suffix: "aRealConversation" },
];

async function main() {
  const ddl = fs.readFileSync(
    path.join(process.cwd(), "drizzle", "0049_landing_offers.sql"),
    "utf8"
  );
  const stripped = ddl
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
  for (const stmt of stripped.split(";").map((x) => x.trim()).filter(Boolean)) {
    await sql.query(stmt);
  }
  console.log("✔ landing_offers table ready");

  const [target] = await sql.query(`
    SELECT ps.account_id,
           (SELECT COUNT(*)::int FROM sessions s WHERE s.account_id = ps.account_id) AS sessions,
           (SELECT COUNT(*)::int FROM clients c WHERE c.account_id = ps.account_id) AS clients
    FROM practitioner_settings ps
    ORDER BY sessions DESC, clients DESC, ps.updated_at DESC
    LIMIT 1
  `);
  if (!target) {
    console.log("… no practitioner_settings rows");
    return;
  }
  const accountId = target.account_id as string;
  console.log(`→ storefront account ${accountId}`);

  const [{ count }] = await sql.query(
    "SELECT COUNT(*)::int AS count FROM landing_offers WHERE account_id = $1",
    [accountId]
  );
  if (count > 0) {
    console.log(`… already has ${count} offer(s) — skipping seed`);
    return;
  }

  for (let i = 0; i < SHAPE.length; i++) {
    const s = SHAPE[i];
    const en = EN.ways[s.key];
    const uk = UK.ways[s.key];
    await sql.query(
      `INSERT INTO landing_offers
         (account_id, step_en, step_uk, title_en, title_uk,
          price_en, price_uk, price_suffix_en, price_suffix_uk,
          description_en, description_uk, cta_en, cta_uk,
          link_kind, variant, lane, published, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,true,$17)`,
      [
        accountId,
        en.step, uk.step,
        en.title, uk.title,
        en.price, uk.price,
        s.suffix ? EN.ways[s.suffix] : "",
        s.suffix ? UK.ways[s.suffix] : "",
        en.desc, uk.desc,
        en.cta, uk.cta,
        s.linkKind, s.variant, s.lane, i,
      ]
    );
  }
  console.log(`✔ seeded ${SHAPE.length} offers straight from the dictionary`);

  console.table(
    await sql.query(
      `SELECT sort_order, lane, variant, link_kind, title_en, title_uk, price_en
       FROM landing_offers WHERE account_id = $1 ORDER BY sort_order`,
      [accountId]
    )
  );
}

main();
