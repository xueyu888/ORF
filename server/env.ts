import "dotenv/config";
import { z } from "zod";

const postgresUrl = z.string().startsWith("postgresql://");

const envSchema = z.object({
  DATABASE_URL: postgresUrl,
  BACKTEST_DB_URL: postgresUrl.optional(),
  SERVER_HOST: z.string().default("0.0.0.0"),
  SERVER_PORT: z.coerce.number().int().positive().default(8787),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
});

export const env = envSchema.parse(process.env);
