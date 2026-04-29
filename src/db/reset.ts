// Wipes ALL rows from every table. Schema stays intact.
// Run with: npm run db:reset
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { db } from "./index";
import { attachments, goals, sessions, clients } from "./schema";

async function reset() {
  console.log("Wiping every row…");
  await db.delete(attachments);
  await db.delete(goals);
  await db.delete(sessions);
  await db.delete(clients);
  console.log("Database is now empty.");
}

reset()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
