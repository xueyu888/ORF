import type { PoolClient } from "pg";
import {
  compareReleaseVersions,
  type ClientUpdateNativePlatform,
  type ClientUpdateReceiptStage,
} from "../../src/features/client-updates/clientUpdateModel";
import { pool } from "../db/client";

export const clientUpdateReceiptRetentionVersions = 20;
export const clientUpdateRecentActivityWindowMinutes = 2;

export type ClientUpdateCoverage = {
  activatedUserCount: number;
  activeAccountCount: number;
  androidPushAttemptedUserCount: number;
  checkedUserCount: number;
  installStartedUserCount: number;
  promptedUserCount: number;
  recentActiveUserCount: number;
};

type CountRow = {
  activated_user_count: number | string;
  active_account_count: number | string;
  android_push_attempted_user_count: number | string;
  checked_user_count: number | string;
  install_started_user_count: number | string;
  prompted_user_count: number | string;
  recent_active_user_count: number | string;
};

export async function recordClientUpdateReceipt(input: {
  currentVersion: string;
  platform: ClientUpdateNativePlatform;
  releaseVersion: string;
  stage: ClientUpdateReceiptStage;
  teamId: string;
  userId: string;
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const observedAt = new Date().toISOString();
    const stageTimestamps = clientUpdateReceiptStageTimestamps(input.stage, observedAt);
    await client.query(
      `
        INSERT INTO client_update_receipts (
          team_id, user_id, release_version, platform, current_version,
          checked_at, prompted_at, install_started_at, activated_at,
          created_at, updated_at
        )
        VALUES ($1, $2::uuid, $3, $4, $5, $6::timestamptz, $7::timestamptz, $8::timestamptz, $9::timestamptz, $6::timestamptz, $6::timestamptz)
        ON CONFLICT (team_id, user_id, release_version, platform)
        DO UPDATE SET
          current_version = EXCLUDED.current_version,
          checked_at = LEAST(client_update_receipts.checked_at, EXCLUDED.checked_at),
          prompted_at = CASE
            WHEN client_update_receipts.prompted_at IS NULL THEN EXCLUDED.prompted_at
            WHEN EXCLUDED.prompted_at IS NULL THEN client_update_receipts.prompted_at
            ELSE LEAST(client_update_receipts.prompted_at, EXCLUDED.prompted_at)
          END,
          install_started_at = CASE
            WHEN client_update_receipts.install_started_at IS NULL THEN EXCLUDED.install_started_at
            WHEN EXCLUDED.install_started_at IS NULL THEN client_update_receipts.install_started_at
            ELSE LEAST(client_update_receipts.install_started_at, EXCLUDED.install_started_at)
          END,
          activated_at = CASE
            WHEN client_update_receipts.activated_at IS NULL THEN EXCLUDED.activated_at
            WHEN EXCLUDED.activated_at IS NULL THEN client_update_receipts.activated_at
            ELSE LEAST(client_update_receipts.activated_at, EXCLUDED.activated_at)
          END,
          updated_at = EXCLUDED.updated_at
      `,
      [
        input.teamId,
        input.userId,
        input.releaseVersion,
        input.platform,
        input.currentVersion,
        observedAt,
        stageTimestamps.promptedAt,
        stageTimestamps.installStartedAt,
        stageTimestamps.activatedAt,
      ],
    );
    await pruneOldClientUpdateReceiptVersions(client, input.teamId);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function getClientUpdateCoverage(teamId: string, releaseVersion: string): Promise<ClientUpdateCoverage> {
  const { rows } = await pool.query<CountRow>(
    `
      WITH active_users AS (
        SELECT DISTINCT u.id, u.last_online_at
        FROM users u
        INNER JOIN team_members tm ON tm.user_id = u.id
        WHERE tm.team_id = $1
          AND COALESCE(u.status, 'active') = 'active'
      ), receipt_counts AS (
        SELECT
          COUNT(DISTINCT r.user_id) FILTER (WHERE r.checked_at IS NOT NULL) AS checked_user_count,
          COUNT(DISTINCT r.user_id) FILTER (WHERE r.prompted_at IS NOT NULL) AS prompted_user_count,
          COUNT(DISTINCT r.user_id) FILTER (WHERE r.install_started_at IS NOT NULL) AS install_started_user_count,
          COUNT(DISTINCT r.user_id) FILTER (WHERE r.activated_at IS NOT NULL) AS activated_user_count
        FROM client_update_receipts r
        INNER JOIN active_users u ON u.id = r.user_id
        WHERE r.team_id = $1
          AND r.release_version = $2
      ), android_push_attempts AS (
        SELECT d.user_id
        FROM push_devices d
        INNER JOIN active_users u ON u.id = d.user_id
        WHERE d.team_id = $1
          AND d.last_client_update_version = $2
        UNION
        SELECT d.user_id
        FROM push_vendor_devices d
        INNER JOIN active_users u ON u.id = d.user_id
        WHERE d.team_id = $1
          AND d.last_client_update_version = $2
      )
      SELECT
        (SELECT COUNT(*) FROM active_users) AS active_account_count,
        (SELECT COUNT(*) FROM active_users WHERE last_online_at >= NOW() - INTERVAL '${clientUpdateRecentActivityWindowMinutes} minutes') AS recent_active_user_count,
        receipt_counts.checked_user_count,
        receipt_counts.prompted_user_count,
        receipt_counts.install_started_user_count,
        receipt_counts.activated_user_count,
        (SELECT COUNT(*) FROM android_push_attempts) AS android_push_attempted_user_count
      FROM receipt_counts
    `,
    [teamId, releaseVersion],
  );
  const row = rows[0];
  return {
    activatedUserCount: toCount(row?.activated_user_count),
    activeAccountCount: toCount(row?.active_account_count),
    androidPushAttemptedUserCount: toCount(row?.android_push_attempted_user_count),
    checkedUserCount: toCount(row?.checked_user_count),
    installStartedUserCount: toCount(row?.install_started_user_count),
    promptedUserCount: toCount(row?.prompted_user_count),
    recentActiveUserCount: toCount(row?.recent_active_user_count),
  };
}

export function retainedClientUpdateReceiptVersions(versions: string[], limit = clientUpdateReceiptRetentionVersions) {
  return Array.from(new Set(versions))
    .sort((left, right) => compareReleaseVersions(right, left) || right.localeCompare(left))
    .slice(0, Math.max(0, limit));
}

export function clientUpdateReceiptStageTimestamps(stage: ClientUpdateReceiptStage, observedAt: string) {
  return {
    activatedAt: stage === "activated" ? observedAt : null,
    installStartedAt: stage === "install_started" ? observedAt : null,
    promptedAt: stage === "prompted" ? observedAt : null,
  };
}

async function pruneOldClientUpdateReceiptVersions(client: PoolClient, teamId: string) {
  const { rows } = await client.query<{ release_version: string }>(
    `SELECT DISTINCT release_version FROM client_update_receipts WHERE team_id = $1`,
    [teamId],
  );
  const retained = retainedClientUpdateReceiptVersions(rows.map((row) => row.release_version));
  if (retained.length === 0) return;
  await client.query(
    `DELETE FROM client_update_receipts WHERE team_id = $1 AND NOT (release_version = ANY($2::text[]))`,
    [teamId, retained],
  );
}

function toCount(value: number | string | null | undefined) {
  const count = Number(value ?? 0);
  return Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
}
