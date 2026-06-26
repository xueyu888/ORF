import { randomUUID } from "node:crypto";
import { pool } from "../../db/client";
import type { ChatActor } from "../../repositories/chatRepository";
import { nowIso } from "../../repositories/chatRepositoryModel";
import { runtimeScopeStorageId } from "../../repositories/runtimeScope";
import {
  ensureOrfChatBotActor,
  ensureOrfChatChannelMembership,
  sendOrfChatMessage,
} from "../orf-chat-delivery";
import type { GitLabOrfChatConfig } from "./config";
import {
  gitLabOrfChatEventTypes,
  normalizeGitLabOrfChatEventTypes,
  normalizeGitLabPath,
  type GitLabOrfChatEventType,
  type GitLabOrfChatProject,
  type GitLabWebhookEvent,
} from "./model";
import type {
  GitLabOrfChatChannelOption,
  GitLabOrfChatSubscription,
  GitLabOrfChatSubscriptionScope,
} from "./settingsModel";

type SubscriptionRow = {
  channel_display_name: string;
  channel_id: string;
  channel_type: "public" | "private";
  created_at: Date | string;
  enabled: boolean;
  event_types: unknown;
  gitlab_group_path: string;
  gitlab_project_id: string | null;
  gitlab_project_path: string | null;
  gitlab_project_url: string;
  id: string;
  updated_at: Date | string;
};

export type GitLabOrfChatMatchingSubscription = GitLabOrfChatSubscription & {
  project: GitLabOrfChatProject;
};

export async function ensureGitLabOrfChatBotActor(input: {
  botEmail: string;
  botName: string;
  teamId: string;
}): Promise<ChatActor> {
  return ensureOrfChatBotActor(input);
}

export async function listGitLabOrfChatChannelOptions(teamId: string): Promise<GitLabOrfChatChannelOption[]> {
  const { rows } = await pool.query<{
    display_name: string;
    id: string;
    member_count: number;
    name: string | null;
    type: "public" | "private";
  }>(
    `
      SELECT
        c.id,
        c.type,
        c.name,
        c.display_name,
        count(cm.user_id)::int AS member_count
      FROM chat_channels c
      LEFT JOIN chat_channel_members cm ON cm.channel_id = c.id
      WHERE c.team_id = $1
        AND c.type IN ('public', 'private')
        AND c.system_kind IS NULL
        AND c.archived_at IS NULL
      GROUP BY c.id
      ORDER BY c.type, lower(c.display_name), c.id
    `,
    [teamId],
  );
  return rows.map((row) => ({
    displayName: row.display_name,
    id: row.id,
    memberCount: row.member_count,
    name: row.name,
    type: row.type,
  }));
}

export async function listGitLabOrfChatSubscriptions(input: {
  channelId?: string;
  teamId: string;
}): Promise<GitLabOrfChatSubscription[]> {
  const values: string[] = [input.teamId];
  let channelFilter = "";
  if (input.channelId) {
    values.push(input.channelId);
    channelFilter = `AND subscription.chat_channel_id = $${values.length}`;
  }

  const { rows } = await pool.query<SubscriptionRow>(
    `
      SELECT
        subscription.id,
        subscription.chat_channel_id AS channel_id,
        channel.display_name AS channel_display_name,
        channel.type::text AS channel_type,
        subscription.gitlab_group_path,
        subscription.gitlab_project_id,
        subscription.gitlab_project_path,
        subscription.gitlab_project_url,
        subscription.event_types,
        subscription.enabled,
        subscription.created_at,
        subscription.updated_at
      FROM gitlab_orf_channel_subscriptions subscription
      INNER JOIN chat_channels channel
        ON channel.id = subscription.chat_channel_id
       AND channel.team_id = subscription.team_id
       AND channel.type IN ('public', 'private')
       AND channel.system_kind IS NULL
       AND channel.archived_at IS NULL
      WHERE subscription.team_id = $1
        ${channelFilter}
      ORDER BY lower(channel.display_name), subscription.gitlab_project_path NULLS FIRST, subscription.gitlab_group_path, subscription.created_at
    `,
    values,
  );
  return rows.map(subscriptionFromRow);
}

export async function listVisibleGitLabOrfChatSubscriptions(input: {
  actor: ChatActor;
  channelId: string;
}): Promise<GitLabOrfChatSubscription[]> {
  if (!input.actor.canRead) {
    throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
  }
  await requireVisibleSubscribableChannel(input.actor, input.channelId);
  return listGitLabOrfChatSubscriptions({
    channelId: input.channelId,
    teamId: runtimeScopeStorageId(input.actor.scope),
  });
}

export async function createGitLabOrfChatSubscription(input: {
  actor: ChatActor;
  channelId: string;
  config: GitLabOrfChatConfig;
  enabled?: boolean;
  eventTypes?: readonly string[];
  project?: GitLabOrfChatProject | null;
  scope: GitLabOrfChatSubscriptionScope;
}) {
  if (!input.actor.canRead) {
    throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
  }
  const channel = await requireVisibleSubscribableChannel(input.actor, input.channelId);
  const now = nowIso();
  const project = input.scope === "project" ? requiredProject(input.project) : null;
  const eventTypes = normalizeGitLabOrfChatEventTypes(input.eventTypes);
  await pool.query(
    `
      INSERT INTO gitlab_orf_channel_subscriptions (
        id,
        team_id,
        chat_channel_id,
        gitlab_group_path,
        gitlab_project_id,
        gitlab_project_path,
        gitlab_project_url,
        event_types,
        enabled,
        created_by_user_id,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $11)
    `,
    [
      `gitlab-subscription-${randomUUID()}`,
      runtimeScopeStorageId(input.actor.scope),
      channel.id,
      normalizeGitLabPath(input.config.GITLAB_ORF_CHAT_GROUP),
      project?.id ?? null,
      project ? normalizeGitLabPath(project.path) : null,
      project?.url ?? "",
      JSON.stringify(eventTypes),
      input.enabled ?? true,
      input.actor.id,
      now,
    ],
  );
}

export async function updateGitLabOrfChatSubscription(input: {
  actor: ChatActor;
  channelId: string;
  enabled?: boolean;
  eventTypes?: readonly string[];
  subscriptionId: string;
}) {
  if (!input.actor.canRead) {
    throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
  }
  await requireVisibleSubscribableChannel(input.actor, input.channelId);
  const assignments: string[] = [];
  const values: unknown[] = [
    runtimeScopeStorageId(input.actor.scope),
    input.channelId,
    input.subscriptionId,
  ];

  if (input.eventTypes) {
    values.push(JSON.stringify(normalizeGitLabOrfChatEventTypes(input.eventTypes)));
    assignments.push(`event_types = $${values.length}::jsonb`);
  }
  if (typeof input.enabled === "boolean") {
    values.push(input.enabled);
    assignments.push(`enabled = $${values.length}`);
  }

  if (assignments.length === 0) return;

  values.push(nowIso());
  const result = await pool.query(
    `
      UPDATE gitlab_orf_channel_subscriptions
      SET ${assignments.join(", ")},
          updated_at = $${values.length}
      WHERE team_id = $1
        AND chat_channel_id = $2
        AND id = $3
    `,
    values,
  );
  if (result.rowCount === 0) {
    throw Object.assign(new Error("GitLab ORF chat subscription not found"), { statusCode: 404 });
  }
}

export async function deleteGitLabOrfChatSubscription(input: {
  actor: ChatActor;
  channelId: string;
  subscriptionId: string;
}) {
  if (!input.actor.canRead) {
    throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
  }
  await requireVisibleSubscribableChannel(input.actor, input.channelId);
  const result = await pool.query(
    `
      DELETE FROM gitlab_orf_channel_subscriptions
      WHERE team_id = $1
        AND chat_channel_id = $2
        AND id = $3
    `,
    [runtimeScopeStorageId(input.actor.scope), input.channelId, input.subscriptionId],
  );
  if (result.rowCount === 0) {
    throw Object.assign(new Error("GitLab ORF chat subscription not found"), { statusCode: 404 });
  }
}

export async function listMatchingGitLabOrfChatSubscriptions(input: {
  event: GitLabWebhookEvent;
  teamId: string;
}): Promise<GitLabOrfChatMatchingSubscription[]> {
  if (!gitLabOrfChatEventTypes.includes(input.event.eventType as GitLabOrfChatEventType)) {
    return [];
  }

  const normalizedProjectPath = normalizeGitLabPath(input.event.project.path);
  const { rows } = await pool.query<SubscriptionRow>(
    `
      SELECT
        subscription.id,
        subscription.chat_channel_id AS channel_id,
        channel.display_name AS channel_display_name,
        channel.type::text AS channel_type,
        subscription.gitlab_group_path,
        subscription.gitlab_project_id,
        subscription.gitlab_project_path,
        subscription.gitlab_project_url,
        subscription.event_types,
        subscription.enabled,
        subscription.created_at,
        subscription.updated_at
      FROM gitlab_orf_channel_subscriptions subscription
      INNER JOIN chat_channels channel
        ON channel.id = subscription.chat_channel_id
       AND channel.team_id = subscription.team_id
       AND channel.type IN ('public', 'private')
       AND channel.system_kind IS NULL
       AND channel.archived_at IS NULL
      WHERE subscription.team_id = $1
        AND subscription.enabled = true
        AND subscription.event_types @> jsonb_build_array($2::text)
        AND (
          (
            subscription.gitlab_project_id IS NOT NULL
            AND subscription.gitlab_project_id = $3
          )
          OR (
            subscription.gitlab_project_id IS NULL
            AND (
              $4 = subscription.gitlab_group_path
              OR $4 LIKE subscription.gitlab_group_path || '/%'
            )
          )
        )
      ORDER BY (subscription.gitlab_project_id IS NOT NULL) DESC, subscription.created_at
    `,
    [input.teamId, input.event.eventType, input.event.project.id, normalizedProjectPath],
  );

  return rows.map((row) => ({
    ...subscriptionFromRow(row),
    project: input.event.project,
  }));
}

export async function reserveGitLabOrfEventDelivery(input: {
  channelId: string;
  eventKey: string;
  eventType: string;
  project: GitLabOrfChatProject;
  subscriptionId: string;
  teamId: string;
}) {
  const now = nowIso();
  const result = await pool.query<{ external_event_key: string }>(
    `
      INSERT INTO gitlab_orf_event_deliveries (
        team_id,
        external_event_key,
        subscription_id,
        gitlab_project_id,
        gitlab_project_path,
        gitlab_project_url,
        event_type,
        chat_channel_id,
        status,
        received_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'reserved', $9, $9)
      ON CONFLICT (team_id, chat_channel_id, external_event_key)
      DO UPDATE SET
        subscription_id = EXCLUDED.subscription_id,
        gitlab_project_id = EXCLUDED.gitlab_project_id,
        gitlab_project_path = EXCLUDED.gitlab_project_path,
        gitlab_project_url = EXCLUDED.gitlab_project_url,
        event_type = EXCLUDED.event_type,
        chat_message_id = null,
        status = 'reserved',
        error = null,
        received_at = EXCLUDED.received_at,
        delivered_at = null,
        updated_at = EXCLUDED.updated_at
      WHERE gitlab_orf_event_deliveries.status = 'failed'
         OR (
           gitlab_orf_event_deliveries.status = 'reserved'
           AND gitlab_orf_event_deliveries.updated_at < now() - interval '10 minutes'
         )
      RETURNING external_event_key
    `,
    [
      input.teamId,
      input.eventKey,
      input.subscriptionId,
      input.project.id,
      normalizeGitLabPath(input.project.path),
      input.project.url,
      input.eventType,
      input.channelId,
      now,
    ],
  );
  return result.rows.length > 0;
}

export async function markGitLabOrfEventDelivered(input: {
  channelId: string;
  chatMessageId: string;
  eventKey: string;
  teamId: string;
}) {
  const now = nowIso();
  await pool.query(
    `
      UPDATE gitlab_orf_event_deliveries
      SET status = 'delivered',
          chat_message_id = $4,
          delivered_at = $5,
          updated_at = $5,
          error = null
      WHERE team_id = $1
        AND chat_channel_id = $2
        AND external_event_key = $3
    `,
    [input.teamId, input.channelId, input.eventKey, input.chatMessageId, now],
  );
}

export async function markGitLabOrfEventFailed(input: {
  channelId: string;
  error: string;
  eventKey: string;
  teamId: string;
}) {
  const now = nowIso();
  await pool.query(
    `
      UPDATE gitlab_orf_event_deliveries
      SET status = 'failed',
          error = $4,
          updated_at = $5
      WHERE team_id = $1
        AND chat_channel_id = $2
        AND external_event_key = $3
    `,
    [input.teamId, input.channelId, input.eventKey, input.error.slice(0, 1000), now],
  );
}

export async function sendGitLabOrfChatMessage(input: {
  actor: ChatActor;
  body: string;
  channelId: string;
}) {
  await ensureOrfChatChannelMembership({ channelId: input.channelId, teamId: runtimeScopeStorageId(input.actor.scope), userId: input.actor.id });
  return sendOrfChatMessage(input);
}

function subscriptionFromRow(row: SubscriptionRow): GitLabOrfChatSubscription {
  const scope: GitLabOrfChatSubscriptionScope = row.gitlab_project_id ? "project" : "group";
  return {
    channelDisplayName: row.channel_display_name,
    channelId: row.channel_id,
    channelType: row.channel_type,
    createdAt: iso(row.created_at),
    enabled: row.enabled,
    eventTypes: normalizeGitLabOrfChatEventTypes(Array.isArray(row.event_types) ? row.event_types.map(String) : null),
    gitlabGroupPath: row.gitlab_group_path,
    gitlabProjectId: row.gitlab_project_id,
    gitlabProjectPath: row.gitlab_project_path,
    gitlabProjectUrl: row.gitlab_project_url,
    id: row.id,
    scope,
    updatedAt: iso(row.updated_at),
  };
}

async function requireVisibleSubscribableChannel(actor: ChatActor, channelId: string) {
  const { rows } = await pool.query<{
    id: string;
    type: "public" | "private";
  }>(
    `
      SELECT c.id, c.type
      FROM chat_channels c
      INNER JOIN chat_channel_members cm
        ON cm.channel_id = c.id
       AND cm.user_id = $2
      WHERE c.team_id = $1
        AND c.id = $3
        AND c.type IN ('public', 'private')
        AND c.system_kind IS NULL
        AND c.archived_at IS NULL
      LIMIT 1
    `,
    [runtimeScopeStorageId(actor.scope), actor.id, channelId],
  );
  const row = rows[0];
  if (!row) {
    throw Object.assign(new Error("GitLab ORF chat channel is not subscribable"), { statusCode: 404 });
  }
  return row;
}

function requiredProject(project: GitLabOrfChatProject | null | undefined): GitLabOrfChatProject {
  if (!project?.id || !project.path) {
    throw Object.assign(new Error("GitLab project subscription requires project id and path"), { statusCode: 400 });
  }
  return project;
}

function iso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}
