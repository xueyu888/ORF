import { defineConfig } from "drizzle-kit";
import "dotenv/config";
import { createDrizzleCredentials } from "./server/db/connectionOptions";

const databaseUrl = process.env.DATABASE_URL ?? process.env.REMOTE_DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL or REMOTE_DATABASE_URL is required");
}

export default defineConfig({
  schema: "./server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  migrations: {
    schema: "orf_current",
    table: "__drizzle_migrations",
  },
  dbCredentials: createDrizzleCredentials(databaseUrl),
});
