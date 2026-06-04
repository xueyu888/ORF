import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { z } from "zod";
import { createPgPoolConfig } from "../../server/db/connectionOptions";
import * as schema from "../../server/db/schema";

const postgresUrl = z.string().startsWith("postgresql://");

const testdDbEnvSchema = z.object({
  DATABASE_URL: postgresUrl.optional(),
  REMOTE_DATABASE_URL: postgresUrl.optional(),
  TESTD_DATABASE_POOL_MAX: z.coerce.number().int().positive().default(1),
  DATABASE_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  DATABASE_QUERY_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  DATABASE_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
}).transform((value, context) => {
  const databaseUrl = value.DATABASE_URL ?? value.REMOTE_DATABASE_URL;

  if (!databaseUrl) {
    context.addIssue({
      code: "custom",
      message: "DATABASE_URL or REMOTE_DATABASE_URL is required",
      path: ["DATABASE_URL"],
    });
    return z.NEVER;
  }

  return {
    ...value,
    DATABASE_URL: databaseUrl,
  };
});

const testdDbEnv = testdDbEnvSchema.parse(process.env);
const { Pool } = pg;

export const testdPool = new Pool(
  createPgPoolConfig(testdDbEnv.DATABASE_URL, {
    max: testdDbEnv.TESTD_DATABASE_POOL_MAX,
    connectionTimeoutMillis: testdDbEnv.DATABASE_CONNECTION_TIMEOUT_MS,
    queryTimeoutMillis: testdDbEnv.DATABASE_QUERY_TIMEOUT_MS,
    idleTimeoutMillis: testdDbEnv.DATABASE_IDLE_TIMEOUT_MS,
  }),
);

export const db = drizzle(testdPool, { schema });

export async function closeTestdDb() {
  await testdPool.end();
}
