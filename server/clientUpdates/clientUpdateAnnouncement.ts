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
  skipped: boolean;
};

export function publishClientUpdateAnnouncement(input: {
  createdAt?: Date;
  mode?: "automatic" | "manual";
  release: ClientUpdateRelease;
  teamId: string;
}): ClientUpdateAnnouncementResult {
  const mode = input.mode ?? "manual";
  const dedupeKey = clientUpdateAnnouncementDedupeKey(input.teamId, input.release.version);
  if (mode === "automatic" && automaticClientUpdateAnnouncements.has(dedupeKey)) {
    return {
      onlineUserCount: realtimeOnlineUserIds(input.teamId).size,
      releaseTag: input.release.tagName,
      releaseVersion: input.release.version,
      skipped: true,
    };
  }

  const createdAt = input.createdAt ?? new Date();
  const announcement = buildClientUpdateAnnouncement(input.release, createdAt);

  publishRealtimeSystemBroadcast(input.teamId, announcement.broadcast);
  publishRealtimeClientUpdateAvailable(input.teamId, announcement.update);

  if (mode === "automatic") {
    automaticClientUpdateAnnouncements.add(dedupeKey);
  }

  return {
    onlineUserCount: realtimeOnlineUserIds(input.teamId).size,
    releaseTag: input.release.tagName,
    releaseVersion: input.release.version,
    skipped: false,
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

const automaticClientUpdateAnnouncements = new Set<string>();

function clientUpdateAnnouncementDedupeKey(teamId: string, releaseVersion: string) {
  return `${teamId}:${releaseVersion}`;
}
