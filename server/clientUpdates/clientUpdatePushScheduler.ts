import type { FastifyBaseLogger } from "fastify";
import { selectClientUpdateAsset } from "../../src/features/client-updates/clientUpdateModel";
import { env } from "../env";
import { isFirebasePushConfigured } from "../push/firebasePushClient";
import { clientUpdatePushChannelId, sendPushToDevices } from "../push/pushService";
import {
  listActivePushDeviceTeamIds,
  listPushDevicesNeedingClientUpdate,
  markClientUpdatePushAttempt,
} from "../push/pushRepository";
import { getCachedLatestClientRelease } from "./clientReleaseRepository";

let schedulerStarted = false;

export function startClientUpdatePushScheduler(log: FastifyBaseLogger) {
  if (schedulerStarted || !env.ORF_CLIENT_UPDATE_PUSH_ENABLED || !env.ORF_PUSH_ENABLED || !isFirebasePushConfigured()) {
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

  const teamIds = await listActivePushDeviceTeamIds("android");
  for (const teamId of teamIds) {
    const devices = await listPushDevicesNeedingClientUpdate({ releaseVersion: release.version, teamId });
    if (devices.length === 0) continue;

    const delivery = await sendPushToDevices({
      body: `发现 ORF 客户端 ${release.version}，点击查看更新。`,
      channelId: clientUpdatePushChannelId,
      collapseKey: `client-update-${release.version}`,
      data: {
        assetName: androidAsset.name,
        releaseTag: release.tagName,
        releaseVersion: release.version,
      },
      devices,
      kind: "client.update.available",
      tag: `client-update-${release.version}`,
      targetPath: "/",
      teamId,
      title: `发现 ORF 客户端 ${release.version}`,
    });

    if (delivery.targetDeviceCount > 0) {
      await markClientUpdatePushAttempt(teamId, devices.map((device) => device.id), release.version);
      log.info(
        {
          failureCount: delivery.failureCount,
          invalidTokenCount: delivery.invalidTokenCount,
          releaseVersion: release.version,
          successCount: delivery.successCount,
          targetDeviceCount: delivery.targetDeviceCount,
          teamId,
        },
        "Sent ORF client update push notifications",
      );
    }
  }
}
