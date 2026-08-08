import { closeDb, pool } from "../server/db/client";
import { formatNotificationChatBody } from "../server/notifications/notificationEventModel";
import type { NotificationKind, NotificationTargetType } from "../src/types/orf";

type NotificationRepairRow = {
  event_body: string;
  event_id: string;
  event_metadata: Record<string, string> | null;
  event_target_href: string;
  event_target_id: string;
  event_target_type: string;
  event_title: string;
  kind: string;
  message_body: string | null;
  message_id: string | null;
  system_metadata: Record<string, unknown> | null;
};

type NotificationRepairPlan = {
  body: string;
  eventId: string;
  eventBody: string;
  eventTargetHref: string;
  kind: string;
  messageId: string | null;
  systemMetadata: Record<string, unknown> | null;
};

const knownNotificationKinds = new Set<NotificationKind>([
  "objective.published",
  "challenge.application.created",
  "challenge.application.approved",
  "challenge.application.rejected",
  "objective.recruitment.created",
  "objective.reinforcement.added",
  "objective.challenge.accepted",
  "objective.alignment.requested",
  "objective.alignment.reviewed",
  "objective.loot.submitted",
  "objective.revision.required",
  "objective.peerReview.requested",
  "objective.settlement.updated",
  "objective.settled",
  "feedback.created",
  "feedback.comment.created",
  "feedback.lifecycle.changed",
  "feedback.assignee.changed",
  "feedback.assignee.digest",
  "comment.reply.created",
  "comment.thread.status.changed",
  "comment.mention.created",
  "data.sync.conflict",
  "worklog.submitted",
  "worklog.reminder",
]);

const knownTargetTypes = new Set<NotificationTargetType>(["objective", "objectiveLoot", "comment", "feedback", "workLog", "dataSync"]);
const repairableNotificationKinds = [...knownNotificationKinds, "codex.task.completed"];

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function argValue(name: string) {
  const equalsPrefix = `--${name}=`;
  const equalsMatched = process.argv.find((arg) => arg.startsWith(equalsPrefix));
  if (equalsMatched) return equalsMatched.slice(equalsPrefix.length).trim();
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1]?.trim() ?? "" : "";
}

function positiveIntegerArg(name: string) {
  const value = Number(argValue(name));
  return Number.isInteger(value) && value > 0 ? value : null;
}

function addSearchParam(href: string, key: string, value: string) {
  const trimmedHref = href.trim();
  const trimmedValue = value.trim();
  if (!trimmedHref || !trimmedValue) return trimmedHref;

  const hashIndex = trimmedHref.indexOf("#");
  const pathAndSearch = hashIndex >= 0 ? trimmedHref.slice(0, hashIndex) : trimmedHref;
  const hash = hashIndex >= 0 ? trimmedHref.slice(hashIndex) : "";
  const queryIndex = pathAndSearch.indexOf("?");
  const pathname = queryIndex >= 0 ? pathAndSearch.slice(0, queryIndex) : pathAndSearch;
  const params = new URLSearchParams(queryIndex >= 0 ? pathAndSearch.slice(queryIndex + 1) : "");
  params.set(key, trimmedValue);
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}${hash}`;
}

function dateFromHrefOrMetadata(href: string, metadata: Record<string, string> | null) {
  const workDate = metadata?.workDate?.trim();
  if (workDate) return workDate;
  try {
    const url = new URL(href, "https://orf.local");
    return url.searchParams.get("date")?.trim() || "";
  } catch {
    return "";
  }
}

function dateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : "";
}

function stripFeedbackDigestActionLink(body: string) {
  return body
    .replace(/\n{0,2}\[打开反馈列表\]\([^)]+\)\s*$/u, "")
    .trimEnd();
}

function nextTargetHref(row: NotificationRepairRow) {
  const metadata = row.event_metadata ?? {};
  if (row.kind === "worklog.submitted") {
    const date = dateFromHrefOrMetadata(row.event_target_href, metadata);
    return date && row.event_target_id
      ? `/work-logs?date=${encodeURIComponent(date)}&view=today&entry=${encodeURIComponent(row.event_target_id)}`
      : row.event_target_href;
  }

  if (row.kind === "worklog.reminder") {
    const date = dateFromHrefOrMetadata(row.event_target_href, metadata);
    return date ? `/work-logs?date=${encodeURIComponent(date)}&view=today` : row.event_target_href;
  }

  if (row.kind === "objective.settled" || row.kind === "objective.settlement.updated") {
    const settledDate = dateOnly(metadata.settledAt ?? "");
    if (!settledDate || !row.event_target_id) return row.event_target_href;
    return `/reports?date=${encodeURIComponent(settledDate)}&objective=${encodeURIComponent(row.event_target_id)}`;
  }

  if (row.kind === "objective.loot.submitted" || row.kind === "objective.alignment.requested") {
    const legacyMatch = row.event_target_href.match(/^\/objectives\/([^/]+)\/loot$/u);
    if (legacyMatch?.[1]) {
      return `/tasks/objectives/${legacyMatch[1]}/loot`;
    }
  }

  if (row.kind.startsWith("comment.") || row.kind === "feedback.comment.created") {
    const commentId = metadata.commentMessageId?.trim() || metadata.commentThreadId?.trim() || "";
    return commentId ? addSearchParam(row.event_target_href, "comment", commentId) : row.event_target_href;
  }

  return row.event_target_href;
}

function eventBodyFor(row: NotificationRepairRow) {
  return row.kind === "feedback.assignee.digest" ? stripFeedbackDigestActionLink(row.event_body) : row.event_body;
}

function chatBodyFor(row: NotificationRepairRow, eventBody: string, targetHref: string) {
  if (knownNotificationKinds.has(row.kind as NotificationKind) && knownTargetTypes.has(row.event_target_type as NotificationTargetType)) {
    return formatNotificationChatBody({
      body: eventBody,
      kind: row.kind as NotificationKind,
      targetHref,
      targetType: row.event_target_type as NotificationTargetType,
      title: row.event_title,
    });
  }

  if (row.kind === "codex.task.completed") {
    const content = eventBody.trim() ? `**${row.event_title.trim()}**\n\n${eventBody.trim()}` : `**${row.event_title.trim()}**`;
    return `${content}\n\n[打开通知中心](/chat/system/personalNotifications)`;
  }

  return row.message_body ?? "";
}

function repairPlanFor(row: NotificationRepairRow): NotificationRepairPlan | null {
  const eventBody = eventBodyFor(row);
  const eventTargetHref = nextTargetHref(row);
  const body = chatBodyFor(row, eventBody, eventTargetHref);
  const currentSystemTargetHref = typeof row.system_metadata?.targetHref === "string" ? row.system_metadata.targetHref : "";
  const systemMetadata = row.system_metadata
    ? { ...row.system_metadata, targetHref: eventTargetHref }
    : null;
  const messageBodyChanged = Boolean(row.message_id) && body !== (row.message_body ?? "");
  const messageMetadataChanged = Boolean(row.message_id && row.system_metadata) && currentSystemTargetHref !== eventTargetHref;

  if (
    eventBody === row.event_body &&
    eventTargetHref === row.event_target_href &&
    !messageBodyChanged &&
    !messageMetadataChanged
  ) {
    return null;
  }

  return {
    body,
    eventBody,
    eventId: row.event_id,
    eventTargetHref,
    kind: row.kind,
    messageId: row.message_id,
    systemMetadata,
  };
}

async function loadRepairRows(limit: number | null) {
  const { rows } = await pool.query<NotificationRepairRow>(
    `
      SELECT
        ne.id AS event_id,
        ne.kind,
        ne.title AS event_title,
        ne.body AS event_body,
        ne.target_href AS event_target_href,
        ne.target_id AS event_target_id,
        ne.target_type AS event_target_type,
        ne.metadata AS event_metadata,
        cm.id AS message_id,
        cm.body AS message_body,
        cm.system_metadata
      FROM notification_events ne
      LEFT JOIN chat_messages cm
        ON cm.source = 'system'
       AND cm.system_metadata->>'notificationEventId' = ne.id
      WHERE ne.kind = ANY($1::text[])
      ORDER BY ne.created_at, ne.id, cm.id
      ${limit ? "LIMIT $2" : ""}
    `,
    limit ? [repairableNotificationKinds, limit] : [repairableNotificationKinds],
  );
  return rows;
}

async function applyRepairPlans(plans: readonly NotificationRepairPlan[]) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const plan of plans) {
      await client.query(
        "UPDATE notification_events SET body = $2, target_href = $3 WHERE id = $1",
        [plan.eventId, plan.eventBody, plan.eventTargetHref],
      );
      if (plan.messageId && plan.systemMetadata) {
        await client.query(
          "UPDATE chat_messages SET body = $2, system_metadata = $3::jsonb, updated_at = NOW() WHERE id = $1",
          [plan.messageId, plan.body, JSON.stringify(plan.systemMetadata)],
        );
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  const limit = positiveIntegerArg("limit");
  const apply = hasFlag("apply");
  const rows = await loadRepairRows(limit);
  const plans = rows.map(repairPlanFor).filter((plan): plan is NotificationRepairPlan => Boolean(plan));

  if (apply) {
    await applyRepairPlans(plans);
  }

  const byKind = plans.reduce<Record<string, number>>((counts, plan) => {
    counts[plan.kind] = (counts[plan.kind] ?? 0) + 1;
    return counts;
  }, {});

  console.log(JSON.stringify({
    apply,
    changed: plans.length,
    byKind,
    sampled: plans.slice(0, 20).map((plan) => ({
      eventId: plan.eventId,
      eventTargetHref: plan.eventTargetHref,
      kind: plan.kind,
      messageId: plan.messageId,
    })),
  }, null, 2));
}

main()
  .finally(() => closeDb().catch(() => undefined))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
