import { z } from "zod";

const optionalNonEmptyString = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed || undefined;
  })
  .pipe(z.string().min(1).optional());

const booleanEnv = (defaultValue: "true" | "false") =>
  z.enum(["true", "false"]).default(defaultValue).transform((value) => value === "true");

const configSchema = z.object({
  GITLAB_ORF_CHAT_ENABLED: booleanEnv("false"),
  GITLAB_URL: optionalNonEmptyString.pipe(z.string().url().optional()),
  GITLAB_ORF_CHAT_GROUP: optionalNonEmptyString.default("develop"),
  GITLAB_ORF_CHAT_RECONCILE_INTERVAL_SECONDS: z.coerce.number().int().positive().default(60),
  GITLAB_ORF_CHAT_ACCESS_TOKEN: optionalNonEmptyString,
  GITLAB_ORF_CHAT_WEBHOOK_URL: optionalNonEmptyString.pipe(z.string().url().optional()),
  GITLAB_ORF_CHAT_WEBHOOK_SECRET: optionalNonEmptyString,
  GITLAB_ORF_CHAT_WEBHOOK_MAX_BODY_BYTES: z.coerce.number().int().positive().default(1024 * 1024),
  GITLAB_ORF_CHAT_CHANNEL_TYPE: z.enum(["public", "private"]).default("public"),
  GITLAB_ORF_CHAT_BOT_NAME: optionalNonEmptyString.default("GitLab"),
  GITLAB_ORF_CHAT_BOT_EMAIL: optionalNonEmptyString.default("gitlab@orf.local"),
});

export type GitLabOrfChatConfig = z.infer<typeof configSchema>;

export function readGitLabOrfChatConfig(env: NodeJS.ProcessEnv = process.env) {
  return configSchema.parse(env);
}

export function gitLabOrfChatWebhookConfigured(config: GitLabOrfChatConfig) {
  return Boolean(config.GITLAB_ORF_CHAT_ENABLED && config.GITLAB_ORF_CHAT_WEBHOOK_SECRET);
}

export function gitLabOrfChatReconcilerConfigured(config: GitLabOrfChatConfig) {
  return Boolean(
    config.GITLAB_ORF_CHAT_ENABLED &&
      config.GITLAB_URL &&
      config.GITLAB_ORF_CHAT_ACCESS_TOKEN &&
      config.GITLAB_ORF_CHAT_WEBHOOK_URL &&
      config.GITLAB_ORF_CHAT_WEBHOOK_SECRET,
  );
}
