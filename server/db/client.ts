import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { env } from "../env";
import * as schema from "./schema";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });

export async function closeDb() {
  await pool.end();
}
