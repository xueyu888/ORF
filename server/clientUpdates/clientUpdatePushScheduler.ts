import type { FastifyBaseLogger } from "fastify";
import { compareReleaseVersions, selectClientUpdateAsset } from "../../src/features/client-updates/clientUpdateModel";
import { env } from "../env";
import { isFirebasePushConfigured } from "../push/firebasePushClient";
import { clientUpdatePushChannelId, sendPushToDevices } from "../push/pushService";
import {
  listActivePushDeviceTeamIds,
  listPushDevicesNeedingClientUpdate,
  markClientUpdatePushAttempt,
} from "../push/pushRepository";
import { publishClientUpdateAnnouncement } from "./clientUpdateAnnouncement";
import { getCachedLatestClientRelease, type ClientUpdateReleaseResponse } from "./clientReleaseRepository";
import { realtimeOnlineTeamIds } from "../realtime/realtimeEventBus";

let schedulerStarted = false;
let latestObservedReleaseVersion: string | null = null;

export function startClientUpdatePushScheduler(log: FastifyBaseLogger) {
  if (schedulerStarted || !env.ORF_CLIENT_UPDATE_PUSH_ENABLED) {
    return () => undefined;
  }

  schedulerStarted = true;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const { release } = await getCachedLatestClientRelease();
      broadcastNewClientUpdateToOnlineClients(log, release);
      await pushLatestClientUpdateToOutdatedAndroidDevices(log, release);
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
    latestObservedReleaseVersion = null;
  };
}

function broadcastNewClientUpdateToOnlineClients(log: FastifyBaseLogger, release: ClientUpdateReleaseResponse["release"]) {
  if (!selectClientUpdateAsset(release.assets, "desktop-windows")) {
    return;
  }

  const previousVersion = latestObservedReleaseVersion;
  if (!previousVersion) {
    latestObservedReleaseVersion = release.version;
    return;
  }

  if (compareReleaseVersions(release.version, previousVersion) <= 0) {
    return;
  }
  latestObservedReleaseVersion = release.version;

  const teamIds = realtimeOnlineTeamIds();
  for (const teamId of teamIds) {
    const result = publishClientUpdateAnnouncement({ mode: "automatic", release, teamId });
    if (result.skipped) {
      continue;
    }
    log.info({
      realtimeRecipientUserCount: result.realtimeRecipientUserCount,
      releaseVersion: result.releaseVersion,
      teamId,
    }, "Broadcast ORF client update announcement to realtime-connected clients");
  }
}

async function pushLatestClientUpdateToOutdatedAndroidDevices(log: FastifyBaseLogger, release: ClientUpdateReleaseResponse["release"]) {
  if (!env.ORF_PUSH_ENABLED || !hasClientUpdatePushChannel()) return;

  const androidAsset = selectClientUpdateAsset(release.assets, "android");
  if (!androidAsset) return;

  const fcmTeamIds = isFirebasePushConfigured() ? await listActivePushDeviceTeamIds("android") : [];
  const teamIds = Array.from(new Set(fcmTeamIds));
  for (const teamId of teamIds) {
    const fcmDevices = isFirebasePushConfigured() ? await listPushDevicesNeedingClientUpdate({ releaseVersion: release.version, teamId }) : [];
    if (fcmDevices.length === 0) continue;

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

    const delivery = await sendPushToDevices({ ...commonPush, devices: fcmDevices });

    if (delivery.targetDeviceCount > 0) {
      await markClientUpdatePushAttempt(teamId, fcmDevices.map((device) => device.id), release.version);
    }
    if (delivery.targetDeviceCount > 0) {
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

function hasClientUpdatePushChannel() {
  return isFirebasePushConfigured();
}
