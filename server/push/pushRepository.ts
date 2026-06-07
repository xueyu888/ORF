import { createHash, randomUUID } from "node:crypto";
import { compareReleaseVersions } from "../../src/features/client-updates/clientUpdateModel";
import { pool } from "../db/client";

export type PushPlatform = "android";

export type PushDeviceRecord = {
  id: string;
  teamId: string;
  userId: string;
  platform: PushPlatform;
  tokenHash: string;
  token: string;
  appVersion: string | null;
  appBuild: string | null;
  deviceLabel: string | null;
  lastClientUpdateVersion: string | null;
  lastClientUpdatePushedAt: string | null;
};

type PushDeviceRow = {
  app_build: string | null;
  app_version: string | null;
  device_label: string | null;
  id: string;
  last_client_update_pushed_at: Date | string | null;
  last_client_update_version: string | null;
  platform: string;
  team_id: string;
  token: string;
  token_hash: string;
  user_id: string;
};

export type RegisterPushDeviceInput = {
  appBuild?: string | null;
  appVersion?: string | null;
  deviceLabel?: string | null;
  platform: PushPlatform;
  token: string;
};

export function hashPushToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function registerPushDeviceForUser(teamId: string, userId: string, input: RegisterPushDeviceInput) {
  const token = normalizedPushToken(input.token);
  const tokenHash = hashPushToken(token);
  const now = nowIso();
  const [row] = await pool.query<PushDeviceRow>(
    `
      INSERT INTO push_devices (
        id, team_id, user_id, platform, token_hash, token, app_version, app_build, device_label,
        enabled, created_at, updated_at, last_seen_at, revoked_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10, $10, $10, null)
      ON CONFLICT (team_id, platform, token_hash)
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        token = EXCLUDED.token,
        app_version = EXCLUDED.app_version,
        app_build = EXCLUDED.app_build,
        device_label = EXCLUDED.device_label,
        enabled = true,
        updated_at = EXCLUDED.updated_at,
        last_seen_at = EXCLUDED.last_seen_at,
        revoked_at = null
      RETURNING id, team_id, user_id, platform, token_hash, token, app_version, app_build, device_label,
        last_client_update_version, last_client_update_pushed_at
    `,
    [
      makePushDeviceId(),
      teamId,
      userId,
      input.platform,
      tokenHash,
      token,
      cleanOptionalText(input.appVersion, 64),
      cleanOptionalText(input.appBuild, 64),
      cleanOptionalText(input.deviceLabel, 120),
      now,
    ],
  ).then((result) => result.rows);
  if (!row) {
    throw new Error("Failed to register push device");
  }
  return toPushDeviceRecord(row);
}

export async function revokePushDeviceForUser(teamId: string, userId: string, input: { platform: PushPlatform; token: string }) {
  const tokenHash = hashPushToken(normalizedPushToken(input.token));
  const { rowCount } = await pool.query(
    `
      UPDATE push_devices
      SET enabled = false, revoked_at = $4, updated_at = $4
      WHERE team_id = $1
        AND user_id = $2
        AND platform = $3
        AND token_hash = $5
    `,
    [teamId, userId, input.platform, nowIso(), tokenHash],
  );
  return rowCount ?? 0;
}

export async function disablePushDevicesByTokenHashes(teamId: string, platform: PushPlatform, tokenHashes: string[]) {
  const hashes = Array.from(new Set(tokenHashes.filter(Boolean)));
  if (hashes.length === 0) return 0;
  const { rowCount } = await pool.query(
    `
      UPDATE push_devices
      SET enabled = false, revoked_at = $3, updated_at = $3
      WHERE team_id = $1
        AND platform = $2
        AND token_hash = ANY($4::text[])
    `,
    [teamId, platform, nowIso(), hashes],
  );
  return rowCount ?? 0;
}

export async function listPushDevicesForUsers(teamId: string, userIds: string[], platform: PushPlatform = "android") {
  const ids = Array.from(new Set(userIds.map((id) => id.trim()).filter(Boolean)));
  if (ids.length === 0) return [];
  const { rows } = await pool.query<PushDeviceRow>(
    `
      SELECT d.id, d.team_id, d.user_id, d.platform, d.token_hash, d.token, d.app_version, d.app_build, d.device_label,
             d.last_client_update_version, d.last_client_update_pushed_at
      FROM push_devices d
      INNER JOIN users u ON u.id = d.user_id AND COALESCE(u.status, 'active') = 'active'
      INNER JOIN team_members tm ON tm.team_id = d.team_id AND tm.user_id = d.user_id
      WHERE d.team_id = $1
        AND d.user_id = ANY($2::uuid[])
        AND d.platform = $3
        AND d.enabled = true
        AND d.revoked_at IS NULL
      ORDER BY d.updated_at DESC
    `,
    [teamId, ids, platform],
  );
  return rows.map(toPushDeviceRecord);
}

export async function listActivePushDeviceTeamIds(platform: PushPlatform = "android") {
  const { rows } = await pool.query<{ team_id: string }>(
    `
      SELECT DISTINCT d.team_id
      FROM push_devices d
      INNER JOIN users u ON u.id = d.user_id AND COALESCE(u.status, 'active') = 'active'
      INNER JOIN team_members tm ON tm.team_id = d.team_id AND tm.user_id = d.user_id
      WHERE d.platform = $1
        AND d.enabled = true
        AND d.revoked_at IS NULL
      ORDER BY d.team_id
    `,
    [platform],
  );
  return rows.map((row) => row.team_id);
}

export async function listPushDevicesNeedingClientUpdate(input: {
  platform?: PushPlatform;
  releaseVersion: string;
  teamId: string;
}) {
  const { rows } = await pool.query<PushDeviceRow>(
    `
      SELECT d.id, d.team_id, d.user_id, d.platform, d.token_hash, d.token, d.app_version, d.app_build, d.device_label,
             d.last_client_update_version, d.last_client_update_pushed_at
      FROM push_devices d
      INNER JOIN users u ON u.id = d.user_id AND COALESCE(u.status, 'active') = 'active'
      INNER JOIN team_members tm ON tm.team_id = d.team_id AND tm.user_id = d.user_id
      WHERE d.team_id = $1
        AND d.platform = $2
        AND d.enabled = true
        AND d.revoked_at IS NULL
        AND d.app_version IS NOT NULL
        AND d.app_version <> ''
        AND (d.last_client_update_version IS NULL OR d.last_client_update_version <> $3)
      ORDER BY d.updated_at DESC
    `,
    [input.teamId, input.platform ?? "android", input.releaseVersion],
  );
  return rows
    .map(toPushDeviceRecord)
    .filter((device) => device.appVersion !== null && compareReleaseVersions(input.releaseVersion, device.appVersion) > 0);
}

export async function markClientUpdatePushAttempt(teamId: string, deviceIds: string[], releaseVersion: string) {
  const ids = Array.from(new Set(deviceIds.filter(Boolean)));
  if (ids.length === 0) return 0;
  const { rowCount } = await pool.query(
    `
      UPDATE push_devices
      SET last_client_update_version = $3,
          last_client_update_pushed_at = $4,
          updated_at = $4
      WHERE team_id = $1
        AND id = ANY($2::text[])
    `,
    [teamId, ids, releaseVersion, nowIso()],
  );
  return rowCount ?? 0;
}

function normalizedPushToken(token: string) {
  const normalized = token.trim();
  if (normalized.length < 20 || normalized.length > 4096) {
    throw new Error("Invalid push token");
  }
  return normalized;
}

function cleanOptionalText(value: string | null | undefined, maxLength: number) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function makePushDeviceId() {
  return `push-device-${Date.now()}-${randomUUID()}`;
}

function nowIso() {
  return new Date().toISOString();
}

function iso(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function toPushDeviceRecord(row: PushDeviceRow): PushDeviceRecord {
  return {
    id: row.id,
    teamId: row.team_id,
    userId: row.user_id,
    platform: "android",
    tokenHash: row.token_hash,
    token: row.token,
    appVersion: row.app_version,
    appBuild: row.app_build,
    deviceLabel: row.device_label,
    lastClientUpdateVersion: row.last_client_update_version,
    lastClientUpdatePushedAt: iso(row.last_client_update_pushed_at),
  };
}
