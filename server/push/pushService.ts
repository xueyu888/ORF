import { env } from "../env";
import { disablePushDevicesByTokenHashes, hashPushToken, listPushDevicesForUsers, type PushDeviceRecord } from "./pushRepository";
import { sendFcmPushMessage } from "./firebasePushClient";
import { isVivoPushConfigured, sendVivoPushMessage } from "./vivoPushClient";
import { disablePushVendorDevicesByTokenHashes, listPushVendorDevicesForUsers, type PushVendorDeviceRecord } from "./vendorPushRepository";

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
  const vendorDevices = isVivoPushConfigured() ? await listPushVendorDevicesForUsers(input.teamId, input.recipientUserIds, "android") : [];
  const vendorUserIds = new Set(vendorDevices.map((device) => device.userId));
  const fcmRecipientUserIds = input.recipientUserIds.filter((userId) => !vendorUserIds.has(userId));
  const fcmDevices = await listPushDevicesForUsers(input.teamId, fcmRecipientUserIds, "android");
  const [fcmDelivery, vendorDelivery] = await Promise.all([
    sendPushToDevices({ ...input, devices: fcmDevices }),
    sendPushToVendorDevices({ ...input, devices: vendorDevices }),
  ]);
  return combinePushDeliveries(fcmDelivery, vendorDelivery);
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

export async function sendPushToVendorDevices(input: Omit<SendPushToUsersInput, "recipientUserIds"> & { devices: PushVendorDeviceRecord[] }) {
  if (!env.ORF_PUSH_ENABLED || input.devices.length === 0) return emptyPushDelivery();

  const display = displayContent(input);
  const result = await sendVivoPushMessage({
    body: display.body,
    data: pushData({ ...input.data, kind: input.kind, targetPath: safeTargetPath(input.targetPath), teamId: input.teamId }),
    devices: input.devices,
    title: display.title,
  });

  if (result.invalidTokens.length > 0) {
    const invalidHashes = result.invalidTokens.map(hashPushToken);
    await disablePushVendorDevicesByTokenHashes(input.teamId, "android", "vivo", invalidHashes);
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

function combinePushDeliveries(...deliveries: ReturnType<typeof emptyPushDelivery>[]) {
  return deliveries.reduce(
    (total, delivery) => ({
      failureCount: total.failureCount + delivery.failureCount,
      invalidTokenCount: total.invalidTokenCount + delivery.invalidTokenCount,
      successCount: total.successCount + delivery.successCount,
      targetDeviceCount: total.targetDeviceCount + delivery.targetDeviceCount,
    }),
    emptyPushDelivery(),
  );
}
