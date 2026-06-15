import "dotenv/config";
import { z } from "zod";

const postgresUrl = z.string().startsWith("postgresql://");
const booleanString = (defaultValue: "true" | "false") =>
  z.enum(["true", "false"]).default(defaultValue).transform((value) => value === "true");
const optionalSecret = z.string().trim().min(16).optional();

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
  ORF_INFRA_UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024 * 1024),
  OBJECT_STORAGE_UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
  ORF_PUSH_ENABLED: booleanString("false"),
  ORF_PUSH_CONTENT_MODE: z.enum(["private", "preview"]).default("private"),
  ORF_FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  ORF_FIREBASE_SERVICE_ACCOUNT_PATH: z.string().optional(),
  ORF_FIREBASE_HTTP_PROXY: z.string().url().optional(),
  ORF_VIVO_PUSH_ENABLED: booleanString("false"),
  ORF_VIVO_PUSH_API_BASE_URL: z.string().url().default("https://api-push.vivo.com.cn"),
  ORF_VIVO_PUSH_APP_ID: z.string().trim().optional(),
  ORF_VIVO_PUSH_APP_KEY: z.string().trim().optional(),
  ORF_VIVO_PUSH_APP_SECRET: z.string().trim().optional(),
  ORF_CLIENT_UPDATE_PUSH_ENABLED: booleanString("true"),
  ORF_CLIENT_UPDATE_PUSH_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(10 * 60 * 1000),
  ORF_CLIENT_UPDATE_BROADCAST_SECRET: optionalSecret,
  ORF_LOCAL_SETTLEMENT_SERVICE_URL: z.string().url().default("http://127.0.0.1:8799"),
  ORF_LOCAL_SETTLEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
  ORF_WORK_LOG_REMINDER_ENABLED: booleanString("true"),
  ORF_WORK_LOG_REMINDER_TIME_ZONE: z.string().trim().min(1).default("Asia/Shanghai"),
  ORF_WORK_LOG_REMINDER_HOUR: z.coerce.number().int().min(0).max(23).default(17),
  ORF_WORK_LOG_REMINDER_MINUTE: z.coerce.number().int().min(0).max(59).default(20),
  ORF_WORK_LOG_REMINDER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(60 * 1000),
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
