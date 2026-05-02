import "dotenv/config";
import { z } from "zod";

const postgresUrl = z.string().startsWith("postgresql://");

const envSchema = z.object({
  DATABASE_URL: postgresUrl.optional(),
  REMOTE_DATABASE_URL: postgresUrl.optional(),
  BACKTEST_DB_URL: postgresUrl.optional(),
  SERVER_HOST: z.string().default("0.0.0.0"),
  SERVER_PORT: z.coerce.number().int().positive().default(8787),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
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
