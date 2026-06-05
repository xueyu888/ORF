import "dotenv/config";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { closeDb, pool } from "../server/db/client";
import { env } from "../server/env";
import { runtimeScope } from "../server/repositories/runtimeScope";
import { objectStorage } from "../server/storage/objectStorage";
import { uploadCurrentUserAvatar } from "../server/users/avatar/avatarRepository";

type ChannelType = "direct" | "group" | "private" | "public";
type OrfUser = {
  avatar_object_key: string | null;
  email: string | null;
  id: string;
  name: string;
  role: string;
  status: string | null;
};
type UserMatch = {
  mattermostUser: MattermostUser;
  orfUser: OrfUser;
  reason: string;
};

const sourceSystem = "mattermost";
const permanentAttachmentExpiresAt = "9999-12-31T00:00:00.000Z";

const mattermostUserSchema = z
  .object({
    id: z.string().min(1),
    username: z.string().default(""),
    email: z.string().nullable().optional(),
    nickname: z.string().default(""),
    first_name: z.string().default(""),
    last_name: z.string().default(""),
    delete_at: z.number().default(0),
    is_bot: z.boolean().default(false),
  })
  .passthrough();
type MattermostUser = z.infer<typeof mattermostUserSchema>;

const mattermostChannelSchema = z
  .object({
    id: z.string().min(1),
    team_id: z.string().default(""),
    type: z.string().default("O"),
    name: z.string().default(""),
    display_name: z.string().default(""),
    purpose: z.string().default(""),
    header: z.string().default(""),
    creator_id: z.string().nullable().optional(),
    create_at: z.number().default(0),
    update_at: z.number().default(0),
    delete_at: z.number().default(0),
    last_post_at: z.number().default(0),
    total_msg_count: z.number().default(0),
  })
  .passthrough();
type MattermostChannel = z.infer<typeof mattermostChannelSchema>;

const mattermostChannelMemberSchema = z
  .object({
    user_id: z.string().min(1),
    channel_id: z.string().optional(),
    roles: z.string().default(""),
    last_viewed_at: z.number().default(0),
    last_update_at: z.number().default(0),
    notify_props: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();
type MattermostChannelMember = z.infer<typeof mattermostChannelMemberSchema>;

const mattermostFileInfoSchema = z
  .object({
    id: z.string().min(1),
    post_id: z.string().optional(),
    channel_id: z.string().optional(),
    user_id: z.string().optional(),
    name: z.string().default("file"),
    mime_type: z.string().default("application/octet-stream"),
    size: z.number().default(0),
    width: z.number().nullable().optional(),
    height: z.number().nullable().optional(),
    create_at: z.number().default(0),
    update_at: z.number().default(0),
    delete_at: z.number().default(0),
  })
  .passthrough();
type MattermostFileInfo = z.infer<typeof mattermostFileInfoSchema>;

const mattermostPostSchema = z
  .object({
    id: z.string().min(1),
    channel_id: z.string().min(1),
    user_id: z.string().default(""),
    root_id: z.string().default(""),
    parent_id: z.string().default(""),
    original_id: z.string().default(""),
    type: z.string().default(""),
    message: z.string().default(""),
    props: z.record(z.string(), z.unknown()).default({}),
    metadata: z
      .object({
        files: z.array(mattermostFileInfoSchema).optional(),
      })
      .passthrough()
      .optional(),
    file_ids: z.array(z.string()).default([]),
    create_at: z.number().default(0),
    update_at: z.number().default(0),
    edit_at: z.number().default(0),
    delete_at: z.number().default(0),
    is_pinned: z.boolean().default(false),
  })
  .passthrough();
type MattermostPost = z.infer<typeof mattermostPostSchema>;

const mattermostPostListSchema = z.object({
  order: z.array(z.string()).default([]),
  posts: z.record(z.string(), mattermostPostSchema).default({}),
});

const mattermostReactionSchema = z
  .object({
    user_id: z.string().min(1),
    post_id: z.string().min(1),
    emoji_name: z.string().min(1),
    create_at: z.number().default(0),
  })
  .passthrough();
type MattermostReaction = z.infer<typeof mattermostReactionSchema>;

function argValue(name: string) {
  const prefix = `${name}=`;
  const found = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

function hasFlag(name: string) {
  return process.argv.includes(name);
}

function usage() {
  return [
    "Usage:",
    "  npm run chat:import:mattermost -- --dry-run",
    "  npm run chat:import:mattermost -- --apply",
    "",
    "Options:",
    "  --dry-run             Read source data and print mapping/import summary. This is the default.",
    "  --apply               Write imported data into ORF chat tables.",
    "  --team-id=<id>        Target ORF team. Defaults to the first team.",
    "  --keep-existing       Do not clear existing ORF chat data before apply.",
    "  --skip-avatars        Do not import Mattermost user avatars.",
    "  --overwrite-avatars   Replace existing ORF avatars when importing avatars.",
    "  --skip-reactions      Do not import Mattermost reactions.",
    "  --reupload-files      Upload files again even if an imported attachment row already exists.",
  ].join("\n");
}

function requireMattermostConfig() {
  const url = process.env.MATTERMOST_URL?.trim();
  const accessToken = process.env.MATTERMOST_ACCESS_TOKEN?.trim();
  const loginId = process.env.MATTERMOST_LOGIN_ID?.trim();
  const password = process.env.MATTERMOST_PASSWORD?.trim();
  if (!url || (!accessToken && (!loginId || !password))) {
    throw new Error("MATTERMOST_URL plus MATTERMOST_ACCESS_TOKEN or MATTERMOST_LOGIN_ID/MATTERMOST_PASSWORD must be set in .env");
  }
  return { url, accessToken, loginId, password };
}

function msToIso(value: number | null | undefined) {
  if (!value) return null;
  return new Date(value).toISOString();
}

function nowIso() {
  return new Date().toISOString();
}

function safePathSegment(value: string) {
  return value.trim().replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "") || "item";
}

function normalizeChannelName(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/['"`]/g, "")
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || `mattermost-${randomUUID().slice(0, 8)}`
  );
}

function normalizeEmail(value: string | null | undefined) {
  const trimmed = value?.trim().toLowerCase();
  return trimmed || null;
}

function normalizeName(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

function mattermostDisplayName(user: MattermostUser) {
  return (
    user.nickname.trim() ||
    [user.first_name, user.last_name].map((part) => part.trim()).filter(Boolean).join(" ") ||
    user.username.trim() ||
    user.email?.trim() ||
    user.id
  );
}

function targetChannelId(sourceId: string) {
  return `chat-mm-channel-${safePathSegment(sourceId)}`;
}

function targetMessageId(sourceId: string) {
  return `chat-mm-post-${safePathSegment(sourceId)}`;
}

function targetAttachmentId(sourceId: string) {
  return `chat-mm-file-${safePathSegment(sourceId)}`;
}

function mattermostTypeToOrf(type: string): ChannelType {
  if (type === "P") return "private";
  if (type === "D") return "direct";
  if (type === "G") return "group";
  return "public";
}

function normalizeMimeType(value: string | null | undefined) {
  return value?.split(";")[0]?.trim().toLowerCase() || "application/octet-stream";
}

function channelTimestamp(channel: MattermostChannel) {
  return msToIso(channel.create_at) ?? msToIso(channel.update_at) ?? nowIso();
}

function postTimestamp(post: MattermostPost) {
  return msToIso(post.create_at) ?? nowIso();
}

function bodyForPost(post: MattermostPost, usersByMention: Map<string, OrfUser>) {
  if (post.delete_at > 0) return "";
  if (post.type && !post.message.trim()) {
    return `[Mattermost ${post.type}]`;
  }
  return post.message.replace(/(^|[^\w])@([A-Za-z0-9._-]+)/g, (match, prefix: string, username: string) => {
    const user = usersByMention.get(username.toLowerCase());
    if (!user) return match;
    return `${prefix}@[${user.name}](orf-user:${user.id})`;
  });
}

class MattermostSourceClient {
  private token: string | null = null;

  constructor(private readonly config: ReturnType<typeof requireMattermostConfig>) {}

  async getUsers() {
    return this.getPaged("/api/v4/users", z.array(mattermostUserSchema), { include_deleted: "true" });
  }

  async getChannels() {
    return this.getPaged("/api/v4/channels", z.array(mattermostChannelSchema), { include_deleted: "true" });
  }

  async getUserChannels(userId: string) {
    const path = `/api/v4/users/${encodeURIComponent(userId)}/channels?include_deleted=true`;
    return this.requestJson(path, {}, z.array(mattermostChannelSchema));
  }

  async getChannelMembers(channelId: string) {
    return this.getPaged(`/api/v4/channels/${encodeURIComponent(channelId)}/members`, z.array(mattermostChannelMemberSchema));
  }

  async getPosts(channelId: string) {
    const posts: MattermostPost[] = [];
    const perPage = 200;
    for (let page = 0; ; page += 1) {
      const list = await this.requestJson(
        `/api/v4/channels/${encodeURIComponent(channelId)}/posts?page=${page}&per_page=${perPage}&include_deleted=true`,
        {},
        mattermostPostListSchema,
      );
      const pagePosts = list.order.map((id) => list.posts[id]).filter((post): post is MattermostPost => Boolean(post));
      posts.push(...pagePosts);
      if (pagePosts.length < perPage) break;
    }
    return posts.sort((a, b) => a.create_at - b.create_at || a.id.localeCompare(b.id));
  }

  async getFileInfosForPost(postId: string) {
    return this.requestJson(`/api/v4/posts/${encodeURIComponent(postId)}/files/info`, {}, z.array(mattermostFileInfoSchema));
  }

  async getFile(fileId: string) {
    const response = await this.request(`/api/v4/files/${encodeURIComponent(fileId)}`, {});
    const body = Buffer.from(await response.arrayBuffer());
    return {
      body,
      contentLength: Number(response.headers.get("content-length") ?? body.byteLength),
      contentType: response.headers.get("content-type") ?? "application/octet-stream",
    };
  }

  async getUserAvatar(userId: string) {
    const response = await this.request(`/api/v4/users/${encodeURIComponent(userId)}/image`, {});
    const body = Buffer.from(await response.arrayBuffer());
    return {
      body,
      contentType: response.headers.get("content-type") ?? "application/octet-stream",
    };
  }

  async getPostReactions(postId: string) {
    return this.requestJson(`/api/v4/posts/${encodeURIComponent(postId)}/reactions`, {}, z.array(mattermostReactionSchema));
  }

  private async getPaged<T>(path: string, schema: z.ZodType<T[]>, extraParams: Record<string, string> = {}) {
    const items: T[] = [];
    const perPage = 200;
    for (let page = 0; ; page += 1) {
      const params = new URLSearchParams({ page: String(page), per_page: String(perPage), ...extraParams });
      const pageItems = await this.requestJson(`${path}?${params}`, {}, schema);
      items.push(...pageItems);
      if (pageItems.length < perPage) break;
    }
    return items;
  }

  private async requestJson<T>(path: string, init: RequestInit, schema: z.ZodType<T>) {
    const response = await this.request(path, init);
    return schema.parse(await response.json());
  }

  private async request(path: string, init: RequestInit) {
    const token = await this.getToken();
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl()}${path}`, {
        ...init,
        headers,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      throw new Error(`Mattermost source API is unreachable at ${this.baseUrl()}${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Mattermost API ${path} failed with HTTP ${response.status}: ${text.slice(0, 300)}`);
    }
    return response;
  }

  private async getToken() {
    if (this.config.accessToken) return this.config.accessToken;
    if (this.token) return this.token;
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl()}/api/v4/users/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ login_id: this.config.loginId, password: this.config.password }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      throw new Error(`Mattermost source login endpoint is unreachable at ${this.baseUrl()}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!response.ok) {
      throw new Error(`Mattermost login failed with HTTP ${response.status}`);
    }
    const token = response.headers.get("token");
    if (!token) throw new Error("Mattermost login did not return a token");
    this.token = token;
    return token;
  }

  private baseUrl() {
    return this.config.url.replace(/\/+$/, "");
  }
}

async function getTargetTeamId() {
  const requested = argValue("--team-id");
  if (requested) return requested;
  const { rows } = await pool.query<{ id: string }>("SELECT id FROM teams ORDER BY id LIMIT 1");
  const teamId = rows[0]?.id;
  if (!teamId) throw new Error("No ORF team exists in target database");
  return teamId;
}

async function getOrfUsers(teamId: string) {
  const { rows } = await pool.query<OrfUser>(
    `
      SELECT u.id, u.name, u.email, u.status, u.avatar_object_key, tm.role
      FROM team_members tm
      INNER JOIN users u ON u.id = tm.user_id
      WHERE tm.team_id = $1
        AND COALESCE(u.status, 'active') = 'active'
      ORDER BY lower(u.name), u.name
    `,
    [teamId],
  );
  return rows;
}

function uniqueBy<T>(items: T[], key: (item: T) => string | null) {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const value = key(item);
    if (!value) continue;
    grouped.set(value, [...(grouped.get(value) ?? []), item]);
  }
  return new Map(Array.from(grouped.entries()).filter(([, values]) => values.length === 1).map(([value, [item]]) => [value, item]));
}

function buildUserMatches(mattermostUsers: MattermostUser[], orfUsers: OrfUser[], fallbackUser: OrfUser) {
  const orfByEmail = uniqueBy(orfUsers, (user) => normalizeEmail(user.email));
  const orfByName = uniqueBy(orfUsers, (user) => normalizeName(user.name));
  const orfByEmailLocal = uniqueBy(orfUsers, (user) => normalizeEmail(user.email)?.split("@")[0] ?? null);
  const sourceAdminLogin = normalizeEmail(process.env.MATTERMOST_LOGIN_ID);
  const sourceAdminLoginLocal = sourceAdminLogin?.split("@")[0] ?? null;
  const matches = new Map<string, UserMatch>();
  const unmatchedHumans: MattermostUser[] = [];

  for (const sourceUser of mattermostUsers) {
    let orfUser: OrfUser | undefined;
    let reason = "";
    const email = normalizeEmail(sourceUser.email);
    if (
      sourceAdminLogin &&
      (email === sourceAdminLogin || (sourceAdminLoginLocal && sourceUser.username.toLowerCase() === sourceAdminLoginLocal))
    ) {
      orfUser = fallbackUser;
      reason = "configured-admin-login";
    } else if (email && orfByEmail.has(email)) {
      orfUser = orfByEmail.get(email);
      reason = "email";
    } else if (sourceUser.username && orfByEmailLocal.has(sourceUser.username.toLowerCase())) {
      orfUser = orfByEmailLocal.get(sourceUser.username.toLowerCase());
      reason = "username=email-local";
    } else {
      const displayName = normalizeName(mattermostDisplayName(sourceUser));
      if (displayName && orfByName.has(displayName)) {
        orfUser = orfByName.get(displayName);
        reason = "display-name";
      }
    }

    if (orfUser) {
      matches.set(sourceUser.id, { mattermostUser: sourceUser, orfUser, reason });
    } else if (!sourceUser.is_bot && sourceUser.delete_at === 0) {
      unmatchedHumans.push(sourceUser);
    }
  }

  return { matches, unmatchedHumans };
}

function adminFallbackUser(orfUsers: OrfUser[]) {
  const configuredEmail = normalizeEmail(process.env.MATTERMOST_CHAT_IMPORT_ADMIN_EMAIL) ?? "xueyu@qq.com";
  return (
    orfUsers.find((user) => normalizeEmail(user.email) === configuredEmail) ??
    orfUsers.find((user) => user.name.trim() === "薛雨") ??
    orfUsers.find((user) => user.role === "admin") ??
    orfUsers[0]
  );
}

async function discoverChannels(source: MattermostSourceClient, mattermostUsers: MattermostUser[], matches: Map<string, UserMatch>) {
  const channelsById = new Map<string, MattermostChannel>();
  for (const channel of await source.getChannels()) {
    channelsById.set(channel.id, channel);
  }

  const matchedMattermostUsers = mattermostUsers.filter((user) => matches.has(user.id));
  for (const user of matchedMattermostUsers) {
    try {
      for (const channel of await source.getUserChannels(user.id)) {
        channelsById.set(channel.id, channel);
      }
    } catch (error) {
      console.warn(`WARN: could not list channels for Mattermost user ${user.username || user.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return Array.from(channelsById.values()).sort((a, b) => (a.create_at || 0) - (b.create_at || 0) || a.id.localeCompare(b.id));
}

async function resetChatData(teamId: string) {
  const { rows } = await pool.query<{ object_key: string }>("SELECT object_key FROM chat_attachments WHERE team_id = $1", [teamId]);
  await pool.query("DELETE FROM chat_import_mappings WHERE team_id = $1", [teamId]);
  await pool.query("DELETE FROM chat_channels WHERE team_id = $1", [teamId]);
  for (const row of rows) {
    await objectStorage.deleteObject(row.object_key).catch(() => undefined);
  }
}

async function upsertMapping(
  client: PoolClient,
  input: {
    metadata?: Record<string, unknown>;
    sourceId: string;
    sourceKind: string;
    targetId: string;
    targetSecondaryId?: string | null;
    targetTable: string;
    teamId: string;
  },
) {
  const now = nowIso();
  await client.query(
    `
      INSERT INTO chat_import_mappings
        (team_id, source_system, source_kind, source_id, target_table, target_id, target_secondary_id, metadata, imported_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $9)
      ON CONFLICT (team_id, source_system, source_kind, source_id)
      DO UPDATE SET
        target_table = EXCLUDED.target_table,
        target_id = EXCLUDED.target_id,
        target_secondary_id = EXCLUDED.target_secondary_id,
        metadata = EXCLUDED.metadata,
        updated_at = EXCLUDED.updated_at
    `,
    [
      input.teamId,
      sourceSystem,
      input.sourceKind,
      input.sourceId,
      input.targetTable,
      input.targetId,
      input.targetSecondaryId ?? null,
      JSON.stringify(input.metadata ?? {}),
      now,
    ],
  );
}

async function importUserMappings(client: PoolClient, teamId: string, matches: Map<string, UserMatch>) {
  for (const match of matches.values()) {
    await upsertMapping(client, {
      teamId,
      sourceKind: "user",
      sourceId: match.mattermostUser.id,
      targetTable: "users",
      targetId: match.orfUser.id,
      metadata: {
        email: match.mattermostUser.email ?? null,
        username: match.mattermostUser.username,
        reason: match.reason,
      },
    });
  }
}

async function importAvatars(input: {
  matches: Map<string, UserMatch>;
  overwrite: boolean;
  source: MattermostSourceClient;
  teamId: string;
}) {
  let imported = 0;
  let skipped = 0;
  for (const match of input.matches.values()) {
    if (match.orfUser.avatar_object_key && !input.overwrite) {
      skipped += 1;
      continue;
    }
    try {
      const avatar = await input.source.getUserAvatar(match.mattermostUser.id);
      const outcome = await uploadCurrentUserAvatar(runtimeScope(input.teamId), match.orfUser.id, {
        body: avatar.body,
        mimeType: avatar.contentType,
      });
      if (outcome.status === "ok") imported += 1;
      else skipped += 1;
    } catch {
      skipped += 1;
    }
  }
  return { imported, skipped };
}

function channelDisplayName(channel: MattermostChannel, members: MattermostChannelMember[], matches: Map<string, UserMatch>) {
  if (channel.display_name.trim()) return channel.display_name.trim();
  const names = members.map((member) => matches.get(member.user_id)?.orfUser.name).filter((name): name is string => Boolean(name));
  if (names.length > 0) return names.join(", ");
  return channel.name.trim() || `Mattermost ${channel.id.slice(0, 8)}`;
}

function channelName(channel: MattermostChannel) {
  const type = mattermostTypeToOrf(channel.type);
  if (type === "direct" || type === "group") return `mm-${type}-${safePathSegment(channel.id)}`;
  return normalizeChannelName(channel.name || channel.display_name || `mm-${channel.id}`);
}

function memberRowsForChannel(input: {
  channel: MattermostChannel;
  fallbackUser: OrfUser;
  matches: Map<string, UserMatch>;
  members: MattermostChannelMember[];
  orfUsers: OrfUser[];
}) {
  const type = mattermostTypeToOrf(input.channel.type);
  const memberIds =
    type === "public"
      ? input.orfUsers.map((user) => user.id)
      : input.members.map((member) => input.matches.get(member.user_id)?.orfUser.id).filter((id): id is string => Boolean(id));
  return Array.from(new Set(memberIds)).map((userId) => ({
    userId,
    role: userId === input.fallbackUser.id ? "owner" : "member",
  }));
}

async function insertChannel(input: {
  channel: MattermostChannel;
  client: PoolClient;
  displayName: string;
  fallbackUser: OrfUser;
  memberRows: { role: string; userId: string }[];
  teamId: string;
}) {
  const channelId = targetChannelId(input.channel.id);
  const createdAt = channelTimestamp(input.channel);
  const updatedAt = msToIso(input.channel.update_at) ?? msToIso(input.channel.last_post_at) ?? createdAt;
  const archivedAt = msToIso(input.channel.delete_at);
  await input.client.query(
    `
      INSERT INTO chat_channels
        (id, team_id, type, name, display_name, purpose, header, created_by, archived_by, created_at, updated_at, archived_at)
      VALUES ($1, $2, $3::chat_channel_type, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id)
      DO UPDATE SET
        type = EXCLUDED.type,
        name = EXCLUDED.name,
        display_name = EXCLUDED.display_name,
        purpose = EXCLUDED.purpose,
        header = EXCLUDED.header,
        archived_by = EXCLUDED.archived_by,
        updated_at = EXCLUDED.updated_at,
        archived_at = EXCLUDED.archived_at
    `,
    [
      channelId,
      input.teamId,
      mattermostTypeToOrf(input.channel.type),
      channelName(input.channel),
      input.displayName.slice(0, 120),
      input.channel.purpose.trim(),
      input.channel.header.trim(),
      input.fallbackUser.id,
      archivedAt ? input.fallbackUser.id : null,
      createdAt,
      updatedAt,
      archivedAt,
    ],
  );

  for (const member of input.memberRows) {
    await input.client.query(
      `
        INSERT INTO chat_channel_members
          (channel_id, user_id, role, favorite, muted, manually_unread, last_viewed_at, last_read_at, last_read_message_id, joined_at)
        VALUES ($1, $2, $3::chat_member_role, false, false, false, null, null, null, $4)
        ON CONFLICT (channel_id, user_id)
        DO UPDATE SET role = EXCLUDED.role
      `,
      [channelId, member.userId, member.role, createdAt],
    );
    await upsertMapping(input.client, {
      teamId: input.teamId,
      sourceKind: "channel_member",
      sourceId: `${input.channel.id}:${member.userId}`,
      targetTable: "chat_channel_members",
      targetId: channelId,
      targetSecondaryId: member.userId,
    });
  }

  await upsertMapping(input.client, {
    teamId: input.teamId,
    sourceKind: "channel",
    sourceId: input.channel.id,
    targetTable: "chat_channels",
    targetId: channelId,
    metadata: {
      sourceType: input.channel.type,
      sourceName: input.channel.name,
      sourceTeamId: input.channel.team_id,
    },
  });
}

function fileInfosForPost(post: MattermostPost) {
  const filesById = new Map<string, MattermostFileInfo>();
  for (const file of post.metadata?.files ?? []) {
    filesById.set(file.id, file);
  }
  for (const fileId of post.file_ids) {
    if (!filesById.has(fileId)) {
      filesById.set(fileId, {
        id: fileId,
        name: "file",
        mime_type: "application/octet-stream",
        size: 0,
        create_at: post.create_at,
        update_at: post.update_at,
        delete_at: 0,
      });
    }
  }
  return Array.from(filesById.values());
}

async function insertMessages(input: {
  channel: MattermostChannel;
  client: PoolClient;
  fallbackUser: OrfUser;
  matches: Map<string, UserMatch>;
  posts: MattermostPost[];
  source: MattermostSourceClient;
  teamId: string;
  usersByMention: Map<string, OrfUser>;
}) {
  let importedMessages = 0;
  let importedAttachments = 0;
  let importedReactions = 0;
  const channelId = targetChannelId(input.channel.id);
  const reuploadFiles = hasFlag("--reupload-files");
  const includeReactions = !hasFlag("--skip-reactions");

  for (const post of input.posts) {
    const author = input.matches.get(post.user_id)?.orfUser ?? input.fallbackUser;
    const rootMessageId = post.root_id ? targetMessageId(post.root_id) : null;
    const parentMessageId = post.root_id ? targetMessageId(post.parent_id || post.root_id) : null;
    const createdAt = postTimestamp(post);
    const updatedAt = msToIso(post.update_at) ?? createdAt;
    const deletedAt = msToIso(post.delete_at);
    const messageId = targetMessageId(post.id);

    await input.client.query(
      `
        INSERT INTO chat_messages
          (id, team_id, channel_id, author_user_id, body, root_message_id, parent_message_id, created_at, updated_at, edited_at, deleted_at, deleted_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (id)
        DO UPDATE SET
          author_user_id = EXCLUDED.author_user_id,
          body = EXCLUDED.body,
          root_message_id = EXCLUDED.root_message_id,
          parent_message_id = EXCLUDED.parent_message_id,
          updated_at = EXCLUDED.updated_at,
          edited_at = EXCLUDED.edited_at,
          deleted_at = EXCLUDED.deleted_at,
          deleted_by = EXCLUDED.deleted_by
      `,
      [
        messageId,
        input.teamId,
        channelId,
        author.id,
        bodyForPost(post, input.usersByMention),
        rootMessageId,
        parentMessageId,
        createdAt,
        updatedAt,
        msToIso(post.edit_at),
        deletedAt,
        deletedAt ? author.id : null,
      ],
    );
    importedMessages += 1;

    await upsertMapping(input.client, {
      teamId: input.teamId,
      sourceKind: "message",
      sourceId: post.id,
      targetTable: "chat_messages",
      targetId: messageId,
      metadata: {
        sourceChannelId: post.channel_id,
        sourceRootId: post.root_id || null,
        sourceType: post.type || null,
      },
    });

    for (const fileInfo of fileInfosForPost(post)) {
      const attachmentId = targetAttachmentId(fileInfo.id);
      const existing = await input.client.query<{ id: string }>("SELECT id FROM chat_attachments WHERE id = $1 LIMIT 1", [attachmentId]);
      const fileName = (fileInfo.name || "file").trim().slice(0, 240);
      const mimeType = normalizeMimeType(fileInfo.mime_type);
      const objectKey = `chat/${safePathSegment(input.teamId)}/${safePathSegment(channelId)}/${attachmentId}/${safePathSegment(fileName)}`;
      if (existing.rowCount === 0 || reuploadFiles) {
        const file = await input.source.getFile(fileInfo.id);
        if (file.body.byteLength > env.CHAT_FILE_UPLOAD_MAX_BYTES) {
          throw new Error(`Mattermost file ${fileInfo.id} exceeds CHAT_FILE_UPLOAD_MAX_BYTES`);
        }
        await objectStorage.putObject({
          body: file.body,
          contentLength: file.body.byteLength,
          contentType: normalizeMimeType(file.contentType || mimeType),
          key: objectKey,
        });
      }
      await input.client.query(
        `
          INSERT INTO chat_attachments
            (id, team_id, channel_id, message_id, object_key, file_name, mime_type, file_size, width, height, created_by, created_at, attached_at, expires_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12, $13)
          ON CONFLICT (id)
          DO UPDATE SET
            message_id = EXCLUDED.message_id,
            object_key = EXCLUDED.object_key,
            file_name = EXCLUDED.file_name,
            mime_type = EXCLUDED.mime_type,
            file_size = EXCLUDED.file_size,
            width = EXCLUDED.width,
            height = EXCLUDED.height,
            attached_at = EXCLUDED.attached_at
        `,
        [
          attachmentId,
          input.teamId,
          channelId,
          messageId,
          objectKey,
          fileName,
          mimeType,
          fileInfo.size || 0,
          fileInfo.width ?? null,
          fileInfo.height ?? null,
          author.id,
          msToIso(fileInfo.create_at) ?? createdAt,
          permanentAttachmentExpiresAt,
        ],
      );
      await upsertMapping(input.client, {
        teamId: input.teamId,
        sourceKind: "attachment",
        sourceId: fileInfo.id,
        targetTable: "chat_attachments",
        targetId: attachmentId,
        metadata: { sourcePostId: post.id, sourceChannelId: post.channel_id },
      });
      importedAttachments += 1;
    }

    if (includeReactions && !deletedAt) {
      let reactions: MattermostReaction[] = [];
      try {
        reactions = await input.source.getPostReactions(post.id);
      } catch {
        reactions = [];
      }
      for (const reaction of reactions) {
        const user = input.matches.get(reaction.user_id)?.orfUser;
        if (!user) continue;
        await input.client.query(
          `
            INSERT INTO chat_message_reactions (message_id, user_id, emoji_name, created_at)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (message_id, user_id, emoji_name) DO NOTHING
          `,
          [messageId, user.id, reaction.emoji_name, msToIso(reaction.create_at) ?? createdAt],
        );
        await upsertMapping(input.client, {
          teamId: input.teamId,
          sourceKind: "reaction",
          sourceId: `${post.id}:${reaction.user_id}:${reaction.emoji_name}`,
          targetTable: "chat_message_reactions",
          targetId: messageId,
          targetSecondaryId: `${user.id}:${reaction.emoji_name}`,
        });
        importedReactions += 1;
      }
    }

    await input.client.query(
      `
        INSERT INTO chat_thread_follows (root_message_id, user_id, following, last_viewed_at, updated_at)
        VALUES ($1, $2, true, null, $3)
        ON CONFLICT (root_message_id, user_id) DO NOTHING
      `,
      [rootMessageId ?? messageId, author.id, updatedAt],
    );

    if (post.is_pinned && !deletedAt) {
      await input.client.query(
        `
          INSERT INTO chat_message_pins (message_id, channel_id, pinned_by, pinned_at)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (message_id) DO NOTHING
        `,
        [messageId, channelId, input.fallbackUser.id, updatedAt],
      );
    }
  }

  return { importedMessages, importedAttachments, importedReactions };
}

async function main() {
  if (hasFlag("--help")) {
    console.log(usage());
    return;
  }

  const apply = hasFlag("--apply");
  const source = new MattermostSourceClient(requireMattermostConfig());
  const teamId = await getTargetTeamId();
  const orfUsers = await getOrfUsers(teamId);
  const fallbackUser = adminFallbackUser(orfUsers);
  if (!fallbackUser) throw new Error("No active ORF user exists for Mattermost import fallback");

  console.log(`Mode: ${apply ? "apply" : "dry-run"}`);
  console.log(`Target team: ${teamId}`);
  console.log(`Active ORF chat users: ${orfUsers.length}`);

  const mattermostUsers = await source.getUsers();
  const { matches, unmatchedHumans } = buildUserMatches(mattermostUsers, orfUsers, fallbackUser);
  console.log(`Mattermost users: ${mattermostUsers.length}`);
  console.log(`Matched users: ${matches.size}`);
  if (unmatchedHumans.length > 0) {
    console.log("Unmatched active Mattermost users:");
    for (const user of unmatchedHumans) {
      console.log(`  - ${mattermostDisplayName(user)} (${user.username || user.id})`);
    }
    if (apply) {
      throw new Error("Refusing to apply while active human Mattermost users are unmatched");
    }
  }

  const channels = await discoverChannels(source, mattermostUsers, matches);
  console.log(`Mattermost channels discovered: ${channels.length}`);
  const usersByMention = new Map<string, OrfUser>();
  for (const match of matches.values()) {
    if (match.mattermostUser.username) usersByMention.set(match.mattermostUser.username.toLowerCase(), match.orfUser);
  }

  if (!apply) {
    for (const match of matches.values()) {
      console.log(`MATCH user ${mattermostDisplayName(match.mattermostUser)} -> ${match.orfUser.name} (${match.reason})`);
    }
    for (const channel of channels) {
      console.log(
        `CHANNEL ${channel.type} ${channel.display_name || channel.name || channel.id} messages=${channel.total_msg_count} deleted=${channel.delete_at > 0 ? "yes" : "no"}`,
      );
    }
    console.log("Dry run finished. Re-run with --apply after reviewing the mapping.");
    return;
  }

  if (!hasFlag("--keep-existing")) {
    await resetChatData(teamId);
  }

  const client = await pool.connect();
  let importedChannels = 0;
  let importedMessages = 0;
  let importedAttachments = 0;
  let importedReactions = 0;
  try {
    await client.query("BEGIN");
    await importUserMappings(client, teamId, matches);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  if (!hasFlag("--skip-avatars")) {
    const avatars = await importAvatars({
      source,
      matches,
      teamId,
      overwrite: hasFlag("--overwrite-avatars"),
    });
    console.log(`Avatars imported=${avatars.imported} skipped=${avatars.skipped}`);
  }

  for (const channel of channels) {
    const members = await source.getChannelMembers(channel.id).catch(() => []);
    const memberRows = memberRowsForChannel({ channel, fallbackUser, matches, members, orfUsers });
    if (memberRows.length === 0) {
      console.warn(`WARN: skipping channel without mapped members: ${channel.display_name || channel.name || channel.id}`);
      continue;
    }
    const posts = await source.getPosts(channel.id);
    const channelClient = await pool.connect();
    try {
      await channelClient.query("BEGIN");
      await insertChannel({
        client: channelClient,
        teamId,
        channel,
        fallbackUser,
        displayName: channelDisplayName(channel, members, matches),
        memberRows,
      });
      const result = await insertMessages({
        client: channelClient,
        teamId,
        channel,
        fallbackUser,
        matches,
        posts,
        source,
        usersByMention,
      });
      await channelClient.query("COMMIT");
      importedChannels += 1;
      importedMessages += result.importedMessages;
      importedAttachments += result.importedAttachments;
      importedReactions += result.importedReactions;
      console.log(
        `Imported channel ${channel.display_name || channel.name || channel.id}: messages=${result.importedMessages} attachments=${result.importedAttachments} reactions=${result.importedReactions}`,
      );
    } catch (error) {
      await channelClient.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      channelClient.release();
    }
  }

  console.log(
    `Import complete: channels=${importedChannels} messages=${importedMessages} attachments=${importedAttachments} reactions=${importedReactions}`,
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
