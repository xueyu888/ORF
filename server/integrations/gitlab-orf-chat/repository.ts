import { pool } from "../../db/client";
import type { ChatActor } from "../../repositories/chatRepository";
import { nowIso } from "../../repositories/chatRepositoryModel";
import {
  ensureOrfChatBotActor,
  ensureOrfChatChannelMembership,
  ensureOrfChatNamedChannel,
  sendOrfChatMessage,
} from "../orf-chat-delivery";
import type { GitLabOrfChatConfig } from "./config";
import {
  buildGitLabProjectChannelDisplayName,
  buildGitLabProjectChannelHeader,
  buildGitLabProjectChannelName,
  buildGitLabProjectChannelPurpose,
  type GitLabOrfChatProject,
} from "./model";
import type {
  GitLabOrfChatChannelOption,
  GitLabOrfChatProjectMapping,
} from "./settingsModel";

type GitLabProjectChannelRow = {
  archived_at: Date | string | null;
  chat_channel_id: string;
  channel_id: string | null;
  type: string | null;
};

export async function ensureGitLabOrfChatBotActor(input: {
  botEmail: string;
  botName: string;
  teamId: string;
}): Promise<ChatActor> {
  return ensureOrfChatBotActor(input);
}

export async function ensureGitLabOrfProjectChannel(input: {
  actor: ChatActor;
  channelType: GitLabOrfChatConfig["GITLAB_ORF_CHAT_CHANNEL_TYPE"];
  project: GitLabOrfChatProject;
  teamId: string;
}) {
  const existing = await findMappedProjectChannel(input.teamId, input.project.id);
  if (existing?.channel_id && existing.archived_at === null && existing.type !== "direct") {
    await updateGitLabProjectChannelMapping({
      chatChannelId: existing.channel_id,
      project: input.project,
      teamId: input.teamId,
    });
    await ensureOrfChatChannelMembership({ channelId: existing.channel_id, teamId: input.teamId, userId: input.actor.id });
    return { channelId: existing.channel_id, created: false };
  }

  const channelId = await createGitLabProjectChannel({
    actor: input.actor,
    channelType: input.channelType,
    project: input.project,
    teamId: input.teamId,
  });
  await upsertGitLabProjectChannelMapping({
    chatChannelId: channelId,
    project: input.project,
    teamId: input.teamId,
  });
  return { channelId, created: true };
}

export async function reserveGitLabOrfEventDelivery(input: {
  channelId: string;
  eventKey: string;
  eventType: string;
  projectId: string;
  teamId: string;
}) {
  const now = nowIso();
  const result = await pool.query<{ external_event_key: string }>(
    `
      INSERT INTO gitlab_orf_event_deliveries (
        team_id,
        external_event_key,
        gitlab_project_id,
        event_type,
        chat_channel_id,
        status,
        received_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, 'reserved', $6, $6)
      ON CONFLICT (team_id, external_event_key)
      DO UPDATE SET
        gitlab_project_id = EXCLUDED.gitlab_project_id,
        event_type = EXCLUDED.event_type,
        chat_channel_id = EXCLUDED.chat_channel_id,
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
    [input.teamId, input.eventKey, input.projectId, input.eventType, input.channelId, now],
  );
  return result.rows.length > 0;
}

export async function markGitLabOrfEventDelivered(input: {
  chatMessageId: string;
  eventKey: string;
  teamId: string;
}) {
  const now = nowIso();
  await pool.query(
    `
      UPDATE gitlab_orf_event_deliveries
      SET status = 'delivered',
          chat_message_id = $3,
          delivered_at = $4,
          updated_at = $4,
          error = null
      WHERE team_id = $1
        AND external_event_key = $2
    `,
    [input.teamId, input.eventKey, input.chatMessageId, now],
  );
}

export async function markGitLabOrfEventFailed(input: {
  error: string;
  eventKey: string;
  teamId: string;
}) {
  const now = nowIso();
  await pool.query(
    `
      UPDATE gitlab_orf_event_deliveries
      SET status = 'failed',
          error = $3,
          updated_at = $4
      WHERE team_id = $1
        AND external_event_key = $2
    `,
    [input.teamId, input.eventKey, input.error.slice(0, 1000), now],
  );
}

export async function sendGitLabOrfChatMessage(input: {
  actor: ChatActor;
  body: string;
  channelId: string;
}) {
  return sendOrfChatMessage(input);
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

export async function listGitLabOrfProjectChannelMappings(teamId: string): Promise<GitLabOrfChatProjectMapping[]> {
  const { rows } = await pool.query<{
    channel_display_name: string | null;
    channel_id: string;
    channel_type: "public" | "private" | null;
    created_at: Date | string;
    gitlab_project_id: string;
    gitlab_project_path: string;
    gitlab_project_url: string;
    last_seen_at: Date | string;
    updated_at: Date | string;
  }>(
    `
      SELECT
        mapping.gitlab_project_id,
        mapping.gitlab_project_path,
        mapping.gitlab_project_url,
        mapping.chat_channel_id AS channel_id,
        mapping.created_at,
        mapping.updated_at,
        mapping.last_seen_at,
        channel.display_name AS channel_display_name,
        CASE
          WHEN channel.type IN ('public', 'private') THEN channel.type::text
          ELSE NULL
        END AS channel_type
      FROM gitlab_orf_project_channels mapping
      LEFT JOIN chat_channels channel
        ON channel.id = mapping.chat_channel_id
       AND channel.team_id = mapping.team_id
       AND channel.archived_at IS NULL
      WHERE mapping.team_id = $1
      ORDER BY lower(mapping.gitlab_project_path), mapping.gitlab_project_id
    `,
    [teamId],
  );
  return rows.map((row) => ({
    channelDisplayName: row.channel_display_name,
    channelId: row.channel_id,
    channelType: row.channel_type,
    createdAt: iso(row.created_at),
    lastSeenAt: iso(row.last_seen_at),
    projectId: row.gitlab_project_id,
    projectPath: row.gitlab_project_path,
    projectUrl: row.gitlab_project_url,
    updatedAt: iso(row.updated_at),
  }));
}

export async function bindGitLabOrfProjectChannel(input: {
  actor: ChatActor;
  channelId: string;
  project: GitLabOrfChatProject;
  teamId: string;
}) {
  const channel = await getBindableChatChannel(input.teamId, input.channelId);
  if (!channel) {
    throw Object.assign(new Error("GitLab ORF chat channel is not bindable"), { statusCode: 404 });
  }
  await ensureOrfChatChannelMembership({ channelId: channel.id, teamId: input.teamId, userId: input.actor.id });
  await upsertGitLabProjectChannelMapping({
    chatChannelId: channel.id,
    project: input.project,
    teamId: input.teamId,
  });
}

function iso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

async function getBindableChatChannel(teamId: string, channelId: string) {
  const { rows } = await pool.query<{ id: string }>(
    `
      SELECT id
      FROM chat_channels
      WHERE team_id = $1
        AND id = $2
        AND type IN ('public', 'private')
        AND archived_at IS NULL
      LIMIT 1
    `,
    [teamId, channelId],
  );
  return rows[0] ?? null;
}

async function findMappedProjectChannel(teamId: string, projectId: string) {
  const { rows } = await pool.query<GitLabProjectChannelRow>(
    `
      SELECT
        mapping.chat_channel_id,
        channel.id AS channel_id,
        channel.type,
        channel.archived_at
      FROM gitlab_orf_project_channels mapping
      LEFT JOIN chat_channels channel
        ON channel.id = mapping.chat_channel_id
       AND channel.team_id = mapping.team_id
      WHERE mapping.team_id = $1
        AND mapping.gitlab_project_id = $2
      LIMIT 1
    `,
    [teamId, projectId],
  );
  return rows[0] ?? null;
}

async function createGitLabProjectChannel(input: {
  actor: ChatActor;
  channelType: GitLabOrfChatConfig["GITLAB_ORF_CHAT_CHANNEL_TYPE"];
  project: GitLabOrfChatProject;
  teamId: string;
}) {
  const channel = await ensureOrfChatNamedChannel({
    actor: input.actor,
    displayName: buildGitLabProjectChannelDisplayName(input.project),
    header: buildGitLabProjectChannelHeader(input.project),
    name: buildGitLabProjectChannelName(input.project),
    purpose: buildGitLabProjectChannelPurpose(input.project),
    teamId: input.teamId,
    type: input.channelType,
  });
  return channel.channelId;
}

async function upsertGitLabProjectChannelMapping(input: {
  chatChannelId: string;
  project: GitLabOrfChatProject;
  teamId: string;
}) {
  const now = nowIso();
  await pool.query(
    `
      INSERT INTO gitlab_orf_project_channels (
        team_id,
        gitlab_project_id,
        gitlab_project_path,
        gitlab_project_url,
        chat_channel_id,
        created_at,
        updated_at,
        last_seen_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $6, $6)
      ON CONFLICT (team_id, gitlab_project_id)
      DO UPDATE SET
        gitlab_project_path = EXCLUDED.gitlab_project_path,
        gitlab_project_url = EXCLUDED.gitlab_project_url,
        chat_channel_id = EXCLUDED.chat_channel_id,
        updated_at = EXCLUDED.updated_at,
        last_seen_at = EXCLUDED.last_seen_at
    `,
    [input.teamId, input.project.id, input.project.path, input.project.url, input.chatChannelId, now],
  );
}

async function updateGitLabProjectChannelMapping(input: {
  chatChannelId: string;
  project: GitLabOrfChatProject;
  teamId: string;
}) {
  const now = nowIso();
  await pool.query(
    `
      UPDATE gitlab_orf_project_channels
      SET gitlab_project_path = $3,
          gitlab_project_url = $4,
          chat_channel_id = $5,
          updated_at = $6,
          last_seen_at = $6
      WHERE team_id = $1
        AND gitlab_project_id = $2
    `,
    [input.teamId, input.project.id, input.project.path, input.project.url, input.chatChannelId, now],
  );
}
