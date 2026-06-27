import "./_load-env";
import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`ALTER TABLE group_attendees ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT`;
  await sql`ALTER TABLE group_attendees ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT`;
  await sql`ALTER TABLE group_attendees ADD COLUMN IF NOT EXISTS welcome_sent_at TIMESTAMP`;
  await sql`ALTER TABLE group_attendees ADD COLUMN IF NOT EXISTS reminder_24h_sent_at TIMESTAMP`;
  await sql`ALTER TABLE group_attendees ADD COLUMN IF NOT EXISTS reminder_1h_sent_at TIMESTAMP`;
  await sql`ALTER TABLE practitioner_settings ADD COLUMN IF NOT EXISTS circle_room_url TEXT`;

  const a = (await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'group_attendees'
      AND column_name IN ('stripe_checkout_session_id','stripe_payment_intent_id','welcome_sent_at','reminder_24h_sent_at','reminder_1h_sent_at')
    ORDER BY column_name
  `) as Array<{ column_name: string }>;
  console.log("group_attendees columns:");
  for (const c of a) console.log(`  ${c.column_name}`);

  const s = (await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'practitioner_settings' AND column_name = 'circle_room_url'
  `) as Array<{ column_name: string }>;
  console.log("practitioner_settings:");
  for (const c of s) console.log(`  ${c.column_name}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
