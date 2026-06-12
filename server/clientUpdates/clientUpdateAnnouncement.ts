import type { ClientUpdateReleaseResponse } from "./clientReleaseRepository";
import {
  publishRealtimeClientUpdateAvailable,
  publishRealtimeSystemBroadcast,
  realtimeOnlineUserIds,
} from "../realtime/realtimeEventBus";
import type { ClientUpdateAvailable, SystemBroadcast } from "../../src/types/realtime";

type ClientUpdateRelease = ClientUpdateReleaseResponse["release"];

export type ClientUpdateAnnouncementResult = {
  onlineUserCount: number;
  releaseTag: string;
  releaseVersion: string;
};

export function publishClientUpdateAnnouncement(input: {
  createdAt?: Date;
  release: ClientUpdateRelease;
  teamId: string;
}): ClientUpdateAnnouncementResult {
  const createdAt = input.createdAt ?? new Date();
  const announcement = buildClientUpdateAnnouncement(input.release, createdAt);

  publishRealtimeSystemBroadcast(input.teamId, announcement.broadcast);
  publishRealtimeClientUpdateAvailable(input.teamId, announcement.update);

  return {
    onlineUserCount: realtimeOnlineUserIds(input.teamId).size,
    releaseTag: input.release.tagName,
    releaseVersion: input.release.version,
  };
}

export function buildClientUpdateAnnouncement(release: ClientUpdateRelease, createdAt: Date) {
  const createdAtIso = createdAt.toISOString();
  const id = `client-update-${release.version}`;
  const title = `ORF 客户端 ${release.version} 已发布`;
  const body = "Win11 客户端可打开“版本与更新”检查并安装新版。";
  const update: ClientUpdateAvailable = {
    id,
    body,
    createdAt: createdAtIso,
    htmlUrl: release.htmlUrl,
    releaseTag: release.tagName,
    releaseVersion: release.version,
    title,
  };
  const broadcast: SystemBroadcast = {
    id,
    body,
    createdAt: createdAtIso,
    targetHref: "/",
    title,
    tone: "clientUpdate",
  };

  return { broadcast, update };
}
