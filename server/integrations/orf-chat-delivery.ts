import { randomUUID } from "node:crypto";
import { pool } from "../db/client";
import { createChatChannel, sendChatMessage, type ChatActor } from "../repositories/chatRepository";
import { nowIso } from "../repositories/chatRepositoryModel";
import { runtimeScope } from "../repositories/runtimeScope";

type BotUserRow = {
  id: string;
  name: string;
  role: string | null;
  status: string | null;
};

export type OrfChatChannelType = "public" | "private";

export async function ensureOrfChatBotActor(input: {
  botEmail: string;
  botName: string;
  teamId: string;
}): Promise<ChatActor> {
  const email = input.botEmail.trim().toLowerCase();
  const name = input.botName.trim() || "ORF";
  const existing = await findBotUser(input.teamId, email);
  const user = existing ?? await createBotUser({ email, name });

  if (user.status && user.status !== "active") {
    throw new Error(`ORF chat bot user ${email} is ${user.status}`);
  }

  await pool.query(
    `
      INSERT INTO team_members (team_id, user_id, role)
      VALUES ($1, $2, 'member')
      ON CONFLICT (team_id, user_id) DO NOTHING
    `,
    [input.teamId, user.id],
  );

  return {
    id: user.id,
    name: user.name || name,
    role: user.role === "admin" ? "admin" : "member",
    scope: runtimeScope(input.teamId),
    canCreatePrivateChannel: true,
    canCreatePublicChannel: true,
    canManageAnyChannel: false,
    canManageAnyMembers: false,
    canRead: true,
    canWrite: true,
  };
}

export async function ensureOrfChatNamedChannel(input: {
  actor: ChatActor;
  displayName: string;
  header?: string;
  name: string;
  purpose?: string;
  teamId: string;
  type: OrfChatChannelType;
}) {
  const existing = await findActiveNamedChannel(input.teamId, input.name);
  if (existing) {
    await ensureOrfChatChannelMembership({ channelId: existing.id, teamId: input.teamId, userId: input.actor.id });
    return { channelId: existing.id, created: false };
  }

  const memberUserIds = input.type === "private" ? await listActiveTeamMemberIds(input.teamId) : undefined;
  const result = await createChatChannel(
    {
      displayName: input.displayName,
      header: input.header,
      memberUserIds,
      name: input.name,
      purpose: input.purpose,
      type: input.type,
    },
    input.actor,
  );

  if (result.status !== "ok") {
    throw new Error(`ORF chat channel creation failed with status ${result.status}`);
  }
  return { channelId: result.channel.id, created: true };
}

export async function sendOrfChatMessage(input: {
  actor: ChatActor;
  body: string;
  channelId: string;
}) {
  const result = await sendChatMessage({ body: input.body, channelId: input.channelId }, input.actor);
  if (result.status !== "ok") {
    throw new Error(`ORF chat message delivery failed with status ${result.status}`);
  }
  return result.message.id;
}

export async function ensureOrfChatChannelMembership(input: { channelId: string; teamId: string; userId: string }) {
  const now = nowIso();
  await pool.query(
    `
      INSERT INTO chat_channel_members (channel_id, user_id, role, favorite, muted, manually_unread, joined_at)
      SELECT $1, u.id, 'member', false, false, false, $4
      FROM users u
      INNER JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = $2
      WHERE u.id = $3
        AND COALESCE(u.status, 'active') = 'active'
      ON CONFLICT (channel_id, user_id) DO NOTHING
    `,
    [input.channelId, input.teamId, input.userId, now],
  );
}

async function findBotUser(teamId: string, email: string) {
  const { rows } = await pool.query<BotUserRow>(
    `
      SELECT u.id, u.name, u.status, tm.role
      FROM users u
      LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = $2
      WHERE lower(coalesce(u.email, '')) = $1
      ORDER BY (tm.team_id IS NOT NULL) DESC, u.created_at ASC, u.id ASC
      LIMIT 1
    `,
    [email, teamId],
  );
  return rows[0] ?? null;
}

async function createBotUser(input: { email: string; name: string }) {
  const id = randomUUID();
  const createdAt = new Date().toISOString().slice(0, 10);
  const { rows } = await pool.query<BotUserRow>(
    `
      INSERT INTO users (id, name, email, status, created_at)
      VALUES ($1, $2, $3, 'active', $4)
      RETURNING id, name, status, null::text AS role
    `,
    [id, input.name, input.email, createdAt],
  );
  return rows[0]!;
}

async function findActiveNamedChannel(teamId: string, name: string) {
  const { rows } = await pool.query<{ id: string }>(
    `
      SELECT id
      FROM chat_channels
      WHERE team_id = $1
        AND name = $2
        AND type IN ('public', 'private')
        AND archived_at IS NULL
      LIMIT 1
    `,
    [teamId, name],
  );
  return rows[0] ?? null;
}

async function listActiveTeamMemberIds(teamId: string) {
  const { rows } = await pool.query<{ id: string }>(
    `
      SELECT u.id
      FROM team_members tm
      INNER JOIN users u ON u.id = tm.user_id
      WHERE tm.team_id = $1
        AND COALESCE(u.status, 'active') = 'active'
      ORDER BY u.id
    `,
    [teamId],
  );
  return rows.map((row) => row.id);
}
