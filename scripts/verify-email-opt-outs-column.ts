// Applies migration 0063 (idempotent) and confirms the column exists.
import "./_load-env";
import { neon } from "@neondatabase/serverless";
async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "email_opt_outs" text[] NOT NULL DEFAULT '{}'`;
  const cols = (await sql`
    SELECT column_name, data_type, column_default FROM information_schema.columns
    WHERE table_name='clients' AND column_name='email_opt_outs'
  `) as Array<{ column_name: string; data_type: string; column_default: string }>;
  console.log("email_opt_outs column:");
  for (const c of cols) console.log(`  ${c.column_name} (${c.data_type}) default ${c.column_default}`);
  const [n] = (await sql`SELECT count(*)::int AS n, count(*) FILTER (WHERE cardinality(email_opt_outs) > 0)::int AS opted FROM clients`) as Array<{ n: number; opted: number }>;
  console.log(`  ${n.n} clients, ${n.opted} with any opt-out`);
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
