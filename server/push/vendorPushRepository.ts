import { randomUUID } from "node:crypto";
import { pool } from "../db/client";
import { hashPushToken, type PushPlatform } from "./pushRepository";

export type PushVendor = "vivo";

export type PushVendorDeviceRecord = {
  appBuild: string | null;
  appVersion: string | null;
  deviceLabel: string | null;
  deviceManufacturer: string | null;
  deviceModel: string | null;
  id: string;
  notificationPermission: string | null;
  osVersion: string | null;
  platform: PushPlatform;
  sdkInt: number | null;
  teamId: string;
  token: string;
  tokenHash: string;
  userId: string;
  vendor: PushVendor;
};

type PushVendorDeviceRow = {
  app_build: string | null;
  app_version: string | null;
  device_label: string | null;
  device_manufacturer: string | null;
  device_model: string | null;
  id: string;
  notification_permission: string | null;
  os_version: string | null;
  platform: string;
  sdk_int: number | null;
  team_id: string;
  token: string;
  token_hash: string;
  user_id: string;
  vendor: string;
};

export type RegisterPushVendorDeviceInput = {
  appBuild?: string | null;
  appVersion?: string | null;
  deviceLabel?: string | null;
  deviceManufacturer?: string | null;
  deviceModel?: string | null;
  notificationPermission?: string | null;
  osVersion?: string | null;
  platform: PushPlatform;
  sdkInt?: number | null;
  token: string;
  vendor: PushVendor;
};

export type PushVendorRegistrationStatus = "starting" | "unavailable" | "registering" | "token_registered" | "registration_error";

export type UpsertPushVendorRegistrationStatusInput = Omit<RegisterPushVendorDeviceInput, "token"> & {
  detail?: string | null;
  reason?: string | null;
  status: PushVendorRegistrationStatus;
};

export async function registerPushVendorDeviceForUser(teamId: string, userId: string, input: RegisterPushVendorDeviceInput) {
  const token = normalizedVendorToken(input.token);
  const tokenHash = hashPushToken(token);
  const now = nowIso();
  const [row] = await pool.query<PushVendorDeviceRow>(
    `
      INSERT INTO push_vendor_devices (
        id, team_id, user_id, platform, vendor, token_hash, token, app_version, app_build, device_label,
        device_manufacturer, device_model, os_version, sdk_int, notification_permission,
        enabled, created_at, updated_at, last_seen_at, revoked_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, true, $16, $16, $16, null)
      ON CONFLICT (team_id, vendor, platform, token_hash)
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        token = EXCLUDED.token,
        app_version = EXCLUDED.app_version,
        app_build = EXCLUDED.app_build,
        device_label = EXCLUDED.device_label,
        device_manufacturer = EXCLUDED.device_manufacturer,
        device_model = EXCLUDED.device_model,
        os_version = EXCLUDED.os_version,
        sdk_int = EXCLUDED.sdk_int,
        notification_permission = EXCLUDED.notification_permission,
        enabled = true,
        updated_at = EXCLUDED.updated_at,
        last_seen_at = EXCLUDED.last_seen_at,
        revoked_at = null
      RETURNING id, team_id, user_id, platform, vendor, token_hash, token, app_version, app_build, device_label,
        device_manufacturer, device_model, os_version, sdk_int, notification_permission
    `,
    [
      makePushVendorDeviceId(),
      teamId,
      userId,
      input.platform,
      input.vendor,
      tokenHash,
      token,
      cleanOptionalText(input.appVersion, 64),
      cleanOptionalText(input.appBuild, 64),
      cleanOptionalText(input.deviceLabel, 120),
      cleanOptionalText(input.deviceManufacturer, 80),
      cleanOptionalText(input.deviceModel, 120),
      cleanOptionalText(input.osVersion, 80),
      cleanOptionalInteger(input.sdkInt),
      cleanOptionalText(input.notificationPermission, 32),
      now,
    ],
  ).then((result) => result.rows);
  if (!row) {
    throw new Error("Failed to register vendor push device");
  }
  await upsertPushVendorRegistrationStatusForUser(teamId, userId, {
    ...input,
    status: "token_registered",
  });
  return toPushVendorDeviceRecord(row);
}

export async function upsertPushVendorRegistrationStatusForUser(teamId: string, userId: string, input: UpsertPushVendorRegistrationStatusInput) {
  const now = nowIso();
  await pool.query(
    `
      INSERT INTO push_vendor_registration_statuses (
        team_id, user_id, platform, vendor, status, reason, detail, app_version, app_build, device_label,
        device_manufacturer, device_model, os_version, sdk_int, notification_permission, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $16)
      ON CONFLICT (team_id, user_id, platform, vendor)
      DO UPDATE SET
        status = EXCLUDED.status,
        reason = EXCLUDED.reason,
        detail = EXCLUDED.detail,
        app_version = EXCLUDED.app_version,
        app_build = EXCLUDED.app_build,
        device_label = EXCLUDED.device_label,
        device_manufacturer = EXCLUDED.device_manufacturer,
        device_model = EXCLUDED.device_model,
        os_version = EXCLUDED.os_version,
        sdk_int = EXCLUDED.sdk_int,
        notification_permission = EXCLUDED.notification_permission,
        updated_at = EXCLUDED.updated_at
    `,
    [
      teamId,
      userId,
      input.platform,
      input.vendor,
      input.status,
      cleanOptionalText(input.reason, 80),
      cleanOptionalText(input.detail, 200),
      cleanOptionalText(input.appVersion, 64),
      cleanOptionalText(input.appBuild, 64),
      cleanOptionalText(input.deviceLabel, 120),
      cleanOptionalText(input.deviceManufacturer, 80),
      cleanOptionalText(input.deviceModel, 120),
      cleanOptionalText(input.osVersion, 80),
      cleanOptionalInteger(input.sdkInt),
      cleanOptionalText(input.notificationPermission, 32),
      now,
    ],
  );
}

export async function revokePushVendorDeviceForUser(teamId: string, userId: string, input: { platform: PushPlatform; token: string; vendor: PushVendor }) {
  const tokenHash = hashPushToken(normalizedVendorToken(input.token));
  const { rowCount } = await pool.query(
    `
      UPDATE push_vendor_devices
      SET enabled = false, revoked_at = $5, updated_at = $5
      WHERE team_id = $1
        AND user_id = $2
        AND platform = $3
        AND vendor = $4
        AND token_hash = $6
    `,
    [teamId, userId, input.platform, input.vendor, nowIso(), tokenHash],
  );
  return rowCount ?? 0;
}

export async function disablePushVendorDevicesByTokenHashes(teamId: string, platform: PushPlatform, vendor: PushVendor, tokenHashes: string[]) {
  const hashes = Array.from(new Set(tokenHashes.filter(Boolean)));
  if (hashes.length === 0) return 0;
  const { rowCount } = await pool.query(
    `
      UPDATE push_vendor_devices
      SET enabled = false, revoked_at = $4, updated_at = $4
      WHERE team_id = $1
        AND platform = $2
        AND vendor = $3
        AND token_hash = ANY($5::text[])
    `,
    [teamId, platform, vendor, nowIso(), hashes],
  );
  return rowCount ?? 0;
}

export async function listPushVendorDevicesForUsers(teamId: string, userIds: string[], platform: PushPlatform = "android") {
  const ids = Array.from(new Set(userIds.map((id) => id.trim()).filter(Boolean)));
  if (ids.length === 0) return [];
  const { rows } = await pool.query<PushVendorDeviceRow>(
    `
      SELECT d.id, d.team_id, d.user_id, d.platform, d.vendor, d.token_hash, d.token, d.app_version, d.app_build, d.device_label,
             d.device_manufacturer, d.device_model, d.os_version, d.sdk_int, d.notification_permission
      FROM push_vendor_devices d
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
  return rows.map(toPushVendorDeviceRecord);
}

function normalizedVendorToken(token: string) {
  const normalized = token.trim();
  if (normalized.length < 8 || normalized.length > 512) {
    throw new Error("Invalid vendor push token");
  }
  return normalized;
}

function cleanOptionalText(value: string | null | undefined, maxLength: number) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function cleanOptionalInteger(value: number | null | undefined) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function makePushVendorDeviceId() {
  return `push-vendor-device-${Date.now()}-${randomUUID()}`;
}

function nowIso() {
  return new Date().toISOString();
}

function toPushVendorDeviceRecord(row: PushVendorDeviceRow): PushVendorDeviceRecord {
  return {
    appBuild: row.app_build,
    appVersion: row.app_version,
    deviceLabel: row.device_label,
    deviceManufacturer: row.device_manufacturer,
    deviceModel: row.device_model,
    id: row.id,
    notificationPermission: row.notification_permission,
    osVersion: row.os_version,
    platform: "android",
    sdkInt: row.sdk_int,
    teamId: row.team_id,
    token: row.token,
    tokenHash: row.token_hash,
    userId: row.user_id,
    vendor: "vivo",
  };
}
