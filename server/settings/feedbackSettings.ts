import { z } from "zod";
import { env } from "../env";
import { readSystemSettingsFile, updateSystemSettingsFile } from "./systemSettingsStore";

export const FEEDBACK_ATTACHMENT_MIN_BYTES = 1 * 1024 * 1024;
export const FEEDBACK_ATTACHMENT_DEFAULT_MAX_BYTES = 2 * 1024 * 1024 * 1024;

export type FeedbackSettings = {
  attachmentMaxBytes: number;
  infrastructureMaxBytes: number;
};

export const feedbackSettingsPatchSchema = z.object({
  attachmentMaxBytes: z.coerce.number().int().min(FEEDBACK_ATTACHMENT_MIN_BYTES).max(env.ORF_INFRA_UPLOAD_MAX_BYTES),
});

function normalizeAttachmentMaxBytes(value: unknown) {
  const parsed = z.coerce.number().int().safeParse(value);
  if (!parsed.success) {
    return Math.min(FEEDBACK_ATTACHMENT_DEFAULT_MAX_BYTES, env.ORF_INFRA_UPLOAD_MAX_BYTES);
  }
  return Math.max(FEEDBACK_ATTACHMENT_MIN_BYTES, Math.min(env.ORF_INFRA_UPLOAD_MAX_BYTES, parsed.data));
}

function normalizeFeedbackSettings(input: Record<string, unknown> | null | undefined): FeedbackSettings {
  return {
    attachmentMaxBytes: normalizeAttachmentMaxBytes(input?.attachmentMaxBytes),
    infrastructureMaxBytes: env.ORF_INFRA_UPLOAD_MAX_BYTES,
  };
}

export async function readFeedbackSettings(): Promise<FeedbackSettings> {
  const settings = await readSystemSettingsFile();
  return normalizeFeedbackSettings(settings.feedback);
}

export async function saveFeedbackSettings(input: z.infer<typeof feedbackSettingsPatchSchema>) {
  const patch = feedbackSettingsPatchSchema.parse(input);
  return updateSystemSettingsFile((settings) => {
    const current = normalizeFeedbackSettings(settings.feedback);
    const next: FeedbackSettings = {
      ...current,
      attachmentMaxBytes: patch.attachmentMaxBytes,
      infrastructureMaxBytes: env.ORF_INFRA_UPLOAD_MAX_BYTES,
    };
    settings.feedback = {
      ...(settings.feedback ?? {}),
      attachmentMaxBytes: next.attachmentMaxBytes,
    };
    return next;
  });
}

export function feedbackSettingsError(error: unknown) {
  if (error instanceof z.ZodError) {
    return { status: 400, code: 40001, message: "invalid feedback settings" };
  }
  return { status: 500, code: 50001, message: "feedback settings failed" };
}
