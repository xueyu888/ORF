import { env } from "../env";
import { disablePushDevicesByTokenHashes, hashPushToken, listPushDevicesForUsers, type PushDeviceRecord } from "./pushRepository";
import { sendFcmPushMessage } from "./firebasePushClient";

export const chatPushChannelId = "orf-chat-messages";
export const clientUpdatePushChannelId = "orf-client-updates";

export type OrfPushKind =
  | "chat.message.created"
  | "client.update.available"
  | "diagnostic.push";

export type SendPushToUsersInput = {
  body: string;
  channelId: string;
  collapseKey?: string;
  data?: Record<string, string | null | undefined>;
  kind: OrfPushKind;
  recipientUserIds: string[];
  tag?: string;
  targetPath: string;
  teamId: string;
  title: string;
};

export async function sendPushToUsers(input: SendPushToUsersInput) {
  if (!env.ORF_PUSH_ENABLED) return emptyPushDelivery();
  const fcmDevices = await listPushDevicesForUsers(input.teamId, input.recipientUserIds, "android");
  return sendPushToDevices({ ...input, devices: fcmDevices });
}

export async function sendPushToDevices(input: Omit<SendPushToUsersInput, "recipientUserIds"> & { devices: PushDeviceRecord[] }) {
  if (!env.ORF_PUSH_ENABLED || input.devices.length === 0) return emptyPushDelivery();

  const tokens = input.devices.map((device) => device.token);
  const display = displayContent(input);
  const result = await sendFcmPushMessage({
    body: display.body,
    channelId: input.channelId,
    collapseKey: input.collapseKey,
    data: pushData({ ...input.data, kind: input.kind, targetPath: safeTargetPath(input.targetPath), teamId: input.teamId }),
    tag: input.tag,
    title: display.title,
    tokens,
  });

  if (result.invalidTokens.length > 0) {
    const invalidHashes = result.invalidTokens.map(hashPushToken);
    await disablePushDevicesByTokenHashes(input.teamId, "android", invalidHashes);
  }

  return {
    failureCount: result.failureCount,
    invalidTokenCount: result.invalidTokens.length,
    successCount: result.successCount,
    targetDeviceCount: input.devices.length,
  };
}

function displayContent(input: Pick<SendPushToUsersInput, "body" | "kind" | "title">) {
  if (env.ORF_PUSH_CONTENT_MODE === "preview" || input.kind === "client.update.available") {
    return { body: input.body, title: input.title };
  }

  if (input.kind === "chat.message.created") {
    return { body: "你有新的聊天消息。", title: "ORF 聊天消息" };
  }

  return { body: input.body, title: input.title };
}

function pushData(input: Record<string, string | null | undefined>) {
  return Object.fromEntries(
    Object.entries(input).flatMap(([key, value]) => {
      if (value === null || value === undefined) return [];
      return [[key, String(value).slice(0, 1024)]];
    }),
  );
}

function safeTargetPath(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function emptyPushDelivery() {
  return {
    failureCount: 0,
    invalidTokenCount: 0,
    successCount: 0,
    targetDeviceCount: 0,
  };
}
