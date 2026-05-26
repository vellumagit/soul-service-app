import "./_load-env";
import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const r = (await sql`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name='practitioner_settings' AND column_name LIKE 'google%'
    ORDER BY column_name
  `) as Array<{ column_name: string; data_type: string }>;
  console.log("Google columns on practitioner_settings:");
  for (const c of r) console.log(`  ${c.column_name}  (${c.data_type})`);
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
