import type { FastifyBaseLogger } from "fastify";
import { selectClientUpdateAsset } from "../../src/features/client-updates/clientUpdateModel";
import { env } from "../env";
import { isFirebasePushConfigured } from "../push/firebasePushClient";
import { clientUpdatePushChannelId, sendPushToDevices, sendPushToVendorDevices } from "../push/pushService";
import {
  listActivePushDeviceTeamIds,
  listPushDevicesNeedingClientUpdate,
  markClientUpdatePushAttempt,
} from "../push/pushRepository";
import { isVivoPushConfigured } from "../push/vivoPushClient";
import {
  listActivePushVendorDeviceTeamIds,
  listPushVendorDevicesNeedingClientUpdate,
  markVendorClientUpdatePushAttempt,
} from "../push/vendorPushRepository";
import { getCachedLatestClientRelease } from "./clientReleaseRepository";

let schedulerStarted = false;

export function startClientUpdatePushScheduler(log: FastifyBaseLogger) {
  if (schedulerStarted || !env.ORF_CLIENT_UPDATE_PUSH_ENABLED || !env.ORF_PUSH_ENABLED || !hasClientUpdatePushChannel()) {
    return () => undefined;
  }

  schedulerStarted = true;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await pushLatestClientUpdateToOutdatedAndroidDevices(log);
    } catch (error) {
      log.warn({ error }, "ORF client update push scheduler failed");
    } finally {
      running = false;
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), env.ORF_CLIENT_UPDATE_PUSH_POLL_INTERVAL_MS);
  return () => {
    clearInterval(timer);
    schedulerStarted = false;
  };
}

async function pushLatestClientUpdateToOutdatedAndroidDevices(log: FastifyBaseLogger) {
  const { release } = await getCachedLatestClientRelease();
  const androidAsset = selectClientUpdateAsset(release.assets, "android");
  if (!androidAsset) return;

  const fcmTeamIds = isFirebasePushConfigured() ? await listActivePushDeviceTeamIds("android") : [];
  const vendorTeamIds = isVivoPushConfigured() ? await listActivePushVendorDeviceTeamIds("android", "vivo") : [];
  const teamIds = Array.from(new Set([...fcmTeamIds, ...vendorTeamIds]));
  for (const teamId of teamIds) {
    const vendorDevices = isVivoPushConfigured()
      ? await listPushVendorDevicesNeedingClientUpdate({ releaseVersion: release.version, teamId, vendor: "vivo" })
      : [];
    const vendorUserIds = new Set(vendorDevices.map((device) => device.userId));
    const fcmDevices = isFirebasePushConfigured()
      ? (await listPushDevicesNeedingClientUpdate({ releaseVersion: release.version, teamId }))
        .filter((device) => !vendorUserIds.has(device.userId))
      : [];
    if (fcmDevices.length === 0 && vendorDevices.length === 0) continue;

    const commonPush = {
      body: `发现 ORF 客户端 ${release.version}，点击查看更新。`,
      channelId: clientUpdatePushChannelId,
      collapseKey: `client-update-${release.version}`,
      data: {
        assetName: androidAsset.name,
        releaseTag: release.tagName,
        releaseVersion: release.version,
      },
      kind: "client.update.available",
      tag: `client-update-${release.version}`,
      targetPath: "/",
      teamId,
      title: `发现 ORF 客户端 ${release.version}`,
    } as const;

    const [fcmDelivery, vendorDelivery] = await Promise.all([
      sendPushToDevices({ ...commonPush, devices: fcmDevices }),
      sendPushToVendorDevices({ ...commonPush, devices: vendorDevices }),
    ]);
    const delivery = combineDeliveryCounts(fcmDelivery, vendorDelivery);

    if (fcmDelivery.targetDeviceCount > 0) {
      await markClientUpdatePushAttempt(teamId, fcmDevices.map((device) => device.id), release.version);
    }
    if (vendorDelivery.targetDeviceCount > 0) {
      await markVendorClientUpdatePushAttempt(teamId, vendorDevices.map((device) => device.id), release.version);
    }
    if (delivery.targetDeviceCount > 0) {
      log.info(
        {
          fcmTargetDeviceCount: fcmDelivery.targetDeviceCount,
          failureCount: delivery.failureCount,
          invalidTokenCount: delivery.invalidTokenCount,
          releaseVersion: release.version,
          successCount: delivery.successCount,
          targetDeviceCount: delivery.targetDeviceCount,
          teamId,
          vivoTargetDeviceCount: vendorDelivery.targetDeviceCount,
        },
        "Sent ORF client update push notifications",
      );
    }
  }
}

function hasClientUpdatePushChannel() {
  return isFirebasePushConfigured() || isVivoPushConfigured();
}

function combineDeliveryCounts(...deliveries: Array<{
  failureCount: number;
  invalidTokenCount: number;
  successCount: number;
  targetDeviceCount: number;
}>) {
  return deliveries.reduce(
    (total, delivery) => ({
      failureCount: total.failureCount + delivery.failureCount,
      invalidTokenCount: total.invalidTokenCount + delivery.invalidTokenCount,
      successCount: total.successCount + delivery.successCount,
      targetDeviceCount: total.targetDeviceCount + delivery.targetDeviceCount,
    }),
    {
      failureCount: 0,
      invalidTokenCount: 0,
      successCount: 0,
      targetDeviceCount: 0,
    },
  );
}
