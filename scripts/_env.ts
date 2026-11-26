// MUST be the first import of every script: loads .env.local then .env (never commits secrets).
import { config } from "dotenv";
config({ path: ".env.local" });
config();
