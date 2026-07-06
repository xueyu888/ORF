import fs from "node:fs";
import {
  parseDataSyncEventPayload,
  selectDataSyncRecipientMembership,
  DATA_SYNC_NOTIFICATION_KIND,
  DATA_SYNC_NOTIFICATION_TARGET_TYPE,
  dataSyncEventMetadata,
  type DataSyncRecipientMembership,
} from "../server/notifications/dataSyncNotificationModel";
import { closeDb, pool } from "../server/db/client";
import { publishNotificationEvent } from "../server/notifications/publisher";

function argValue(name: string) {
  const equalsPrefix = `--${name}=`;
  const equalsMatched = process.argv.find((arg) => arg.startsWith(equalsPrefix));
  if (equalsMatched) return equalsMatched.slice(equalsPrefix.length).trim();
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1]?.trim() ?? "";
  return "";
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function envValue(name: string) {
  return process.env[name]?.trim() ?? "";
}

async function listActiveNotificationMemberships(): Promise<DataSyncRecipientMembership[]> {
  const { rows } = await pool.query<{
    email: string | null;
    name: string;
    team_id: string;
    user_id: string;
  }>(
    `
      SELECT
        u.id::text AS user_id,
        u.name,
        u.email,
        tm.team_id
      FROM team_members tm
      INNER JOIN users u ON u.id = tm.user_id
      WHERE COALESCE(u.status, 'active') = 'active'
      ORDER BY tm.team_id, u.name, u.id::text
    `,
  );
  return rows.map((row) => ({
    email: row.email,
    name: row.name,
    teamId: row.team_id,
    userId: row.user_id,
  }));
}

async function main() {
  const eventFile = argValue("event-file");
  if (!eventFile) {
    throw new Error("missing --event-file");
  }

  const event = parseDataSyncEventPayload(JSON.parse(fs.readFileSync(eventFile, "utf8")));
  const recipient = selectDataSyncRecipientMembership(await listActiveNotificationMemberships(), {
    email: argValue("recipient-email") || envValue("DATA_SYNC_ORF_RECIPIENT_EMAIL"),
    name: argValue("recipient-name") || envValue("DATA_SYNC_ORF_RECIPIENT_NAME"),
    teamId: argValue("team-id") || envValue("DATA_SYNC_ORF_TEAM_ID"),
    userId: argValue("recipient-user-id") || envValue("DATA_SYNC_ORF_RECIPIENT_USER_ID"),
  });

  if (hasFlag("dry-run")) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          eventFile,
          fingerprint: event.fingerprint,
          recipientName: recipient.name,
          recipientUserId: recipient.userId,
          teamId: recipient.teamId,
        },
        null,
        2,
      ),
    );
    return;
  }

  const notifications = await publishNotificationEvent({
    actorName: "Data Sync",
    actorUserId: null,
    body: event.body,
    kind: DATA_SYNC_NOTIFICATION_KIND,
    metadata: dataSyncEventMetadata(event),
    recipientUserIds: [recipient.userId],
    stream: "personalNotification",
    targetHref: "/chat/system/personalNotifications",
    targetId: event.fingerprint,
    targetType: DATA_SYNC_NOTIFICATION_TARGET_TYPE,
    teamId: recipient.teamId,
    title: event.title,
  });

  if (notifications.length !== 1 || notifications[0]?.recipientUserId !== recipient.userId) {
    throw new Error(`expected exactly one ORF notification receipt for ${recipient.name}; got ${notifications.length}`);
  }

  console.log(
    JSON.stringify(
      {
        delivered: true,
        notificationId: notifications[0].id,
        recipientName: recipient.name,
        recipientUserId: recipient.userId,
        teamId: recipient.teamId,
      },
      null,
      2,
    ),
  );
}

main()
  .finally(() => closeDb().catch(() => undefined))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
