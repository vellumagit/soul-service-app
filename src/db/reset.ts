// Wipes ALL rows from every table. Schema stays intact.
// Run with: npm run db:reset
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { db } from "./index";
import {
  timelineEvents,
  intakeAnswers,
  consents,
  invoices,
  observations,
  themes,
  goals,
  documents,
  readings,
  souls,
} from "./schema";

async function reset() {
  console.log("Wiping every row…");
  await db.delete(timelineEvents);
  await db.delete(intakeAnswers);
  await db.delete(consents);
  await db.delete(invoices);
  await db.delete(observations);
  await db.delete(themes);
  await db.delete(goals);
  await db.delete(documents);
  await db.delete(readings);
  await db.delete(souls);
  console.log("Database is now empty.");
}

reset()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
