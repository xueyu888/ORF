import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { feedbackDatabaseSchema } from "@orf/feedback-module/server";
import { env } from "../env";
import { createPgPoolConfig } from "./connectionOptions";
import * as hostSchema from "./schema";

const { Pool } = pg;

export const pool = new Pool(
  createPgPoolConfig(env.DATABASE_URL, {
    max: env.DATABASE_POOL_MAX,
    connectionTimeoutMillis: env.DATABASE_CONNECTION_TIMEOUT_MS,
    queryTimeoutMillis: env.DATABASE_QUERY_TIMEOUT_MS,
    idleTimeoutMillis: env.DATABASE_IDLE_TIMEOUT_MS,
  }),
);

export const db = drizzle(pool, { schema: { ...hostSchema, ...feedbackDatabaseSchema } });

export async function closeDb() {
  await pool.end();
}
