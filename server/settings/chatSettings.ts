import { z } from "zod";
import { env } from "../env";
import { readSystemSettingsFile, updateSystemSettingsFile } from "./systemSettingsStore";

export const CHAT_ATTACHMENT_MIN_BYTES = 1 * 1024 * 1024;
export const CHAT_ATTACHMENT_DEFAULT_MAX_BYTES = 2 * 1024 * 1024 * 1024;

export type ChatSettings = {
  attachmentMaxBytes: number;
  infrastructureMaxBytes: number;
};

export const chatSettingsPatchSchema = z.object({
  attachmentMaxBytes: z.coerce.number().int().min(CHAT_ATTACHMENT_MIN_BYTES).max(env.ORF_INFRA_UPLOAD_MAX_BYTES),
});

function normalizeAttachmentMaxBytes(value: unknown) {
  const parsed = z.coerce.number().int().safeParse(value);
  if (!parsed.success) {
    return CHAT_ATTACHMENT_DEFAULT_MAX_BYTES;
  }
  return Math.max(CHAT_ATTACHMENT_MIN_BYTES, Math.min(env.ORF_INFRA_UPLOAD_MAX_BYTES, parsed.data));
}

function normalizeChatSettings(input: Record<string, unknown> | null | undefined): ChatSettings {
  return {
    attachmentMaxBytes: normalizeAttachmentMaxBytes(input?.attachmentMaxBytes),
    infrastructureMaxBytes: env.ORF_INFRA_UPLOAD_MAX_BYTES,
  };
}

export async function readChatSettings(): Promise<ChatSettings> {
  const settings = await readSystemSettingsFile();
  return normalizeChatSettings(settings.chat);
}

export async function saveChatSettings(input: z.infer<typeof chatSettingsPatchSchema>) {
  const patch = chatSettingsPatchSchema.parse(input);
  return updateSystemSettingsFile((settings) => {
    const current = normalizeChatSettings(settings.chat);
    const next: ChatSettings = {
      ...current,
      attachmentMaxBytes: patch.attachmentMaxBytes,
      infrastructureMaxBytes: env.ORF_INFRA_UPLOAD_MAX_BYTES,
    };
    settings.chat = {
      ...(settings.chat ?? {}),
      attachmentMaxBytes: next.attachmentMaxBytes,
    };
    return next;
  });
}

export function chatSettingsError(error: unknown) {
  if (error instanceof z.ZodError) {
    return { status: 400, code: 40001, message: "invalid chat settings" };
  }
  return { status: 500, code: 50001, message: "chat settings failed" };
}
