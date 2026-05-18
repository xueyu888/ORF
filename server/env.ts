import "dotenv/config";
import { z } from "zod";

const postgresUrl = z.string().startsWith("postgresql://");

const envSchema = z.object({
  DATABASE_URL: postgresUrl.optional(),
  REMOTE_DATABASE_URL: postgresUrl.optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  DATABASE_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  DATABASE_QUERY_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  DATABASE_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  SERVER_HOST: z.string().default("0.0.0.0"),
  SERVER_PORT: z.coerce.number().int().positive().default(8787),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  ORF_APP_URL: z.string().url().default("http://127.0.0.1:5173"),
  ORY_PUBLIC_URL: z.string().url().default("http://127.0.0.1:4433"),
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

export const env = envSchema.parse(process.env);
