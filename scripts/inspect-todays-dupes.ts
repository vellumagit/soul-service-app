import "./_load-env";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { sql, and, eq } from "drizzle-orm";

async function main() {
  const rows = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.accountId, "8041ea06-4cdc-4cd3-aaea-3754a11998b1"),
        sql`${sessions.scheduledAt} = '2026-05-23 20:00:00'`
      )
    );
  for (const r of rows) {
    console.log(JSON.stringify(r, null, 2));
    console.log("---");
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
