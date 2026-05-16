// Side-effect: load .env.local into process.env before any DB module reads it.
// Imported first by every script in this folder.
import { config } from "dotenv";
config({ path: ".env.local" });
