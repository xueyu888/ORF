import "dotenv/config";
import { z } from "zod";

const postgresUrl = z.string().startsWith("postgresql://");

const envSchema = z.object({
  DATABASE_URL: postgresUrl.optional(),
  REMOTE_DATABASE_URL: postgresUrl.optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(4),
  DATABASE_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  DATABASE_QUERY_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  DATABASE_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  SERVER_HOST: z.string().default("0.0.0.0"),
  SERVER_PORT: z.coerce.number().int().positive().default(8787),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  ORF_APP_URL: z.string().url().default("http://127.0.0.1:5173"),
  ORY_PUBLIC_URL: z.string().url().default("http://127.0.0.1:4433"),
  ORY_ADMIN_URL: z.string().url().optional(),
  OBJECT_STORAGE_DRIVER: z.enum(["s3"]).default("s3"),
  OBJECT_STORAGE_ENDPOINT: z.string().url().default("http://127.0.0.1:9000"),
  OBJECT_STORAGE_REGION: z.string().trim().min(1).default("us-east-1"),
  OBJECT_STORAGE_BUCKET: z.string().trim().min(1).default("orf-comment-attachments"),
  OBJECT_STORAGE_ACCESS_KEY: z.string().trim().min(1).default("orf-dev-minio"),
  OBJECT_STORAGE_SECRET_KEY: z.string().trim().min(1).default("orf-dev-minio-secret"),
  OBJECT_STORAGE_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
  OBJECT_STORAGE_UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
  CHAT_FILE_UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(100 * 1024 * 1024),
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
