import type { Readable } from "node:stream";
import type {
  ChatDriveLink,
  ChatMessage,
  Drive,
  DriveBootstrap,
  DriveContextLink,
  DriveContextType,
  DriveFileVersion,
  DriveNodeDetails,
  DriveNodeEvent,
  DriveNodeEventAction,
  DriveNode,
  DrivePreviewKind,
  DriveSearchContextFilter,
  DriveSearchMeta,
  DriveSearchScope,
  DriveSearchSource,
  DriveSearchStatus,
  DriveSearchType,
  DriveSearchUpdatedRange,
} from "../../src/types/orf";
import { commentAttachmentPreviewKind } from "./commentAttachmentRepository";
import { env } from "../env";
import { pool } from "../db/client";
import { readImageMetadata } from "../storage/images";
import { objectStorage, ObjectStorageUploadEmptyError, ObjectStorageUploadTooLargeError } from "../storage/objectStorage";
import { sendChatMessage, type ChatActor } from "./chatRepository";
import {
  iso,
  makeId,
  normalizeMimeType,
  nowIso,
  ok,
  safePathSegment,
  storageTeamId,
  type Outcome,
} from "./chatRepositoryModel";

type DriveRow = {
  created_at: Date | string;
  created_by: string | null;
  created_by_name: string | null;
  deleted_at?: Date | string | null;
  file_id: string | null;
  file_name: string | null;
  file_size: number | string | null;
  height: number | null;
  id: string;
  latest_version_number?: number | string | null;
  mime_type: string | null;
  name: string;
  node_type: "folder" | "file";
  parent_id: string | null;
  preview_kind: DrivePreviewKind | null;
  updated_at: Date | string;
  version_count?: number | string | null;
  width: number | null;
};

type DriveSearchRow = DriveRow & {
  search_contexts: unknown[] | null;
};

type DriveContentRow = {
  file_name: string;
  file_size: number | string;
  id: string;
  mime_type: string;
  object_key: string;
  preview_kind: DrivePreviewKind;
  team_id: string;
};

type DriveMutableFileRow = DriveContentRow & {
  latest_version_number: number | string | null;
  node_id: string;
  node_name: string;
};

type ChatDriveLinkRow = DriveRow & {
  channel_id: string;
  is_default_upload_target: boolean;
  label: string | null;
  link_created_at: Date | string;
  link_id: string;
  link_updated_at: Date | string;
};

type ChatChannelAccessRow = {
  id: string;
  member_role: "owner" | "admin" | "member";
  type: "public" | "private";
};

type DriveFileVersionRow = {
  created_at: Date | string;
  created_by: string | null;
  created_by_name: string | null;
  file_id: string;
  file_name: string;
  file_size: number | string;
  height: number | null;
  id: string;
  mime_type: string;
  preview_kind: DrivePreviewKind;
  version_number: number | string;
  width: number | null;
};

type DriveFileVersionContentRow = DriveFileVersionRow & {
  object_key: string;
};

type DriveNodeEventRow = {
  action: DriveNodeEventAction;
  actor_name: string | null;
  actor_user_id: string | null;
  created_at: Date | string;
  id: string;
  metadata: Record<string, unknown>;
  node_id: string;
};

type DriveContextLinkRow = {
  context_id: string;
  context_title: string | null;
  context_type: DriveContextType;
  created_at: Date | string;
  created_by: string | null;
  created_by_name: string | null;
  id: string;
  label: string | null;
  node_id: string;
};

export type DriveUploadOutcome = Outcome<{
  announcementMessage?: ChatMessage | null;
  node: DriveNode;
}>;

export type DriveBootstrapOutcome =
  | ({ status: "ok"; drive: DriveBootstrap })
  | { status: "forbidden" }
  | { status: "notFound" };

export type ChatDriveBootstrapOutcome =
  | ({ status: "ok"; drive: DriveBootstrap; links: ChatDriveLink[] })
  | { status: "forbidden" }
  | { status: "notFound" };

function driveContentUrl(id: string, disposition: "attachment" | "inline" = "inline") {
  const params = new URLSearchParams({ disposition });
  return `/api/drive/files/${encodeURIComponent(id)}/content?${params.toString()}`;
}

function driveFileDto(row: DriveRow): Drive | undefined {
  if (!row.file_id || !row.file_name || !row.mime_type || row.file_size === null || !row.preview_kind) return undefined;
  const previewUrl = row.preview_kind === "download" ? undefined : driveContentUrl(row.file_id, "inline");
  return {
    id: row.file_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSize: Number(row.file_size),
    contentUrl: driveContentUrl(row.file_id, "inline"),
    downloadUrl: driveContentUrl(row.file_id, "attachment"),
    previewKind: row.preview_kind,
    previewUrl,
    width: row.width,
    height: row.height,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: iso(row.created_at) ?? nowIso(),
    latestVersionNumber: row.latest_version_number === undefined || row.latest_version_number === null ? undefined : Number(row.latest_version_number),
    versionCount: row.version_count === undefined || row.version_count === null ? undefined : Number(row.version_count),
  };
}

function driveNodeDto(row: DriveRow): DriveNode {
  return {
    id: row.id,
    parentId: row.parent_id,
    type: row.node_type,
    name: row.name,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: iso(row.created_at) ?? nowIso(),
    deletedAt: iso(row.deleted_at ?? null),
    updatedAt: iso(row.updated_at) ?? nowIso(),
    file: driveFileDto(row),
  };
}

function driveSearchNodeDto(row: DriveSearchRow, query?: string): DriveNode {
  const node = driveNodeDto(row);
  const contexts = parseDriveSearchContexts(row.search_contexts);
  const sourceLabels = driveSearchSourceLabels(contexts);
  const searchMeta: DriveSearchMeta = {
    contexts,
    snippet: driveSearchSnippet(node, contexts, query),
    sourceLabels,
    status: node.deletedAt ? "trash" : "active",
    uploadedById: node.createdBy,
    uploadedByName: node.createdByName,
    updatedAt: node.updatedAt,
  };
  return { ...node, searchMeta };
}

function parseDriveSearchContexts(value: unknown): DriveSearchMeta["contexts"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const input = item as Record<string, unknown>;
    if (typeof input.contextId !== "string" || typeof input.contextType !== "string") return [];
    if (!isDriveContextType(input.contextType)) return [];
    const title = typeof input.contextTitle === "string" && input.contextTitle.trim()
      ? input.contextTitle.trim()
      : driveContextTypeLabel(input.contextType);
    return [{
      contextId: input.contextId,
      contextTitle: title,
      contextType: input.contextType,
      label: typeof input.label === "string" ? input.label : null,
    }];
  });
}

function isDriveContextType(value: string): value is DriveContextType {
  return ["project", "objective", "result", "task", "feedback", "workLog", "chatChannel", "chatMessage", "chatThread"].includes(value);
}

function driveContextTypeLabel(type: DriveContextType) {
  if (type === "project") return "项目";
  if (type === "objective") return "目标";
  if (type === "result") return "指标";
  if (type === "task") return "任务";
  if (type === "feedback") return "反馈";
  if (type === "workLog") return "工作日志";
  if (type === "chatMessage") return "聊天消息";
  if (type === "chatThread") return "聊天话题";
  return "群聊";
}

function driveSearchSourceLabels(contexts: DriveSearchMeta["contexts"]) {
  const labels: string[] = [];
  if (contexts.some((item) => item.contextType === "chatChannel" || item.contextType === "chatMessage" || item.contextType === "chatThread")) {
    labels.push("聊天");
  }
  for (const context of contexts) {
    const label = driveContextTypeLabel(context.contextType);
    if (!labels.includes(label)) labels.push(label);
  }
  return labels.length > 0 ? labels.slice(0, 4) : ["手动上传"];
}

function driveSearchSnippet(node: DriveNode, contexts: DriveSearchMeta["contexts"], query?: string) {
  const normalizedQuery = query?.trim().toLowerCase();
  const candidates = [
    node.name,
    node.file?.fileName,
    node.file?.mimeType,
    ...contexts.map((item) => `${driveContextTypeLabel(item.contextType)}：${item.contextTitle}`),
  ].filter((value): value is string => Boolean(value?.trim()));
  if (!normalizedQuery) return candidates[0] ?? null;
  return candidates.find((value) => value.toLowerCase().includes(normalizedQuery)) ?? candidates[0] ?? null;
}

function chatDriveLinkDto(row: ChatDriveLinkRow): ChatDriveLink {
  return {
    id: row.link_id,
    channelId: row.channel_id,
    node: driveNodeDto(row),
    label: row.label,
    isDefaultUploadTarget: row.is_default_upload_target,
    createdAt: iso(row.link_created_at) ?? nowIso(),
    updatedAt: iso(row.link_updated_at) ?? nowIso(),
  };
}

function driveFileVersionDto(row: DriveFileVersionRow): DriveFileVersion {
  return {
    id: row.id,
    fileId: row.file_id,
    versionNumber: Number(row.version_number),
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSize: Number(row.file_size),
    previewKind: row.preview_kind,
    width: row.width,
    height: row.height,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: iso(row.created_at) ?? nowIso(),
  };
}

function driveNodeEventDto(row: DriveNodeEventRow): DriveNodeEvent {
  return {
    id: row.id,
    nodeId: row.node_id,
    actorUserId: row.actor_user_id,
    actorName: row.actor_name,
    action: row.action,
    metadata: row.metadata ?? {},
    createdAt: iso(row.created_at) ?? nowIso(),
  };
}

function driveContextLinkDto(row: DriveContextLinkRow): DriveContextLink {
  return {
    id: row.id,
    nodeId: row.node_id,
    contextType: row.context_type,
    contextId: row.context_id,
    contextTitle: row.context_title ?? row.label ?? row.context_id,
    label: row.label,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: iso(row.created_at) ?? nowIso(),
  };
}

function sanitizeDriveName(value: string) {
  const leafName = value.split(/[\\/]/).pop()?.trim() ?? "";
  return leafName.replace(/[^\w.\-()\u4e00-\u9fff ]+/g, "_").slice(0, 160).trim();
}

function sanitizeFolderName(value: string) {
  return sanitizeDriveName(value).replace(/\.+$/g, "").trim();
}

function extensionFromFileName(fileName: string) {
  const match = /\.([A-Za-z0-9]{1,16})$/.exec(fileName);
  return match?.[1]?.toLowerCase() ?? "";
}

function isPdf(buffer: Buffer) {
  return buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}

function storedDriveMetadata(input: { fileName: string; mimeType: string; peeked: Buffer }) {
  const imageMetadata = readImageMetadata(input.peeked);
  if (imageMetadata) {
    return {
      height: imageMetadata.height,
      mimeType: imageMetadata.mimeType,
      previewKind: "image" as DrivePreviewKind,
      width: imageMetadata.width,
    };
  }

  const normalizedMimeType = normalizeMimeType(input.mimeType);
  const verifiedPdf = isPdf(input.peeked);
  let mimeType = normalizedMimeType || "application/octet-stream";
  if (verifiedPdf) {
    mimeType = "application/pdf";
  } else if (input.fileName.toLowerCase().endsWith(".md") || input.fileName.toLowerCase().endsWith(".markdown")) {
    mimeType = "text/markdown; charset=utf-8";
  } else if (["csv", "json", "log", "txt"].includes(extensionFromFileName(input.fileName))) {
    mimeType = "text/plain; charset=utf-8";
  }
  if (!verifiedPdf && (normalizedMimeType.startsWith("image/") || normalizedMimeType === "application/pdf")) {
    mimeType = "application/octet-stream";
  }

  return {
    height: null,
    mimeType,
    previewKind: commentAttachmentPreviewKind({ fileName: input.fileName, mimeType }),
    width: null,
  };
}

function escapeMarkdownLinkText(value: string) {
  return value.replace(/[[\]\\]/g, "\\$&").replace(/\r?\n/g, " ");
}

type QueryExecutor = {
  query: (text: string, params?: unknown[]) => Promise<unknown>;
};

async function recordDriveEvent(
  executor: QueryExecutor,
  input: {
    action: DriveNodeEventAction;
    actorUserId?: string | null;
    metadata?: Record<string, unknown>;
    nodeId: string;
    teamId: string;
    timestamp?: string;
  },
) {
  await executor.query(
    `
      INSERT INTO drive_node_events (id, team_id, node_id, actor_user_id, action, metadata, created_at)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
    `,
    [
      makeId("drive-event"),
      input.teamId,
      input.nodeId,
      input.actorUserId ?? null,
      input.action,
      JSON.stringify(input.metadata ?? {}),
      input.timestamp ?? nowIso(),
    ],
  );
}

async function findRootNode(teamId: string) {
  const { rows } = await pool.query<DriveRow>(
    `
      SELECT n.id, n.parent_id, n.node_type, n.name, n.created_by, creator.name AS created_by_name,
             n.created_at, n.updated_at, null AS file_id, null AS file_name, null AS mime_type, null AS file_size,
             null AS preview_kind, null AS width, null AS height
      FROM drive_nodes n
      LEFT JOIN users creator ON creator.id = n.created_by
      WHERE n.team_id = $1
        AND n.parent_id IS NULL
        AND n.deleted_at IS NULL
      LIMIT 1
    `,
    [teamId],
  );
  return rows[0] ? driveNodeDto(rows[0]) : null;
}

async function ensureTeamDriveRoot(actor: ChatActor) {
  const teamId = storageTeamId(actor);
  const existingRoot = await findRootNode(teamId);
  if (existingRoot) return existingRoot;

  const now = nowIso();
  try {
    await pool.query(
      `
        INSERT INTO drive_nodes (id, team_id, parent_id, node_type, name, created_by, updated_by, created_at, updated_at)
        VALUES ($1, $2, null, 'folder', '团队云盘', $3, $3, $4, $4)
      `,
      [makeId("drive-node"), teamId, actor.id, now],
    );
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "23505")) throw error;
  }

  const createdRoot = await findRootNode(teamId);
  if (!createdRoot) throw new Error("team drive root was not created");
  return createdRoot;
}

async function listChildren(parentNodeId: string, teamId: string) {
  const { rows } = await pool.query<DriveRow>(
    `
      SELECT n.id, n.parent_id, n.node_type, n.name, n.created_by, creator.name AS created_by_name,
             n.created_at, n.updated_at,
             f.id AS file_id, f.file_name, f.mime_type, f.file_size, f.preview_kind, f.width, f.height
      FROM drive_nodes n
      LEFT JOIN drive_files f ON f.node_id = n.id
      LEFT JOIN users creator ON creator.id = n.created_by
      WHERE n.team_id = $1
        AND n.parent_id = $2
        AND n.deleted_at IS NULL
      ORDER BY (n.node_type = 'folder') DESC, lower(n.name), n.created_at ASC
    `,
    [teamId, parentNodeId],
  );
  return rows.map(driveNodeDto);
}

async function getDriveNodeById(nodeId: string, teamId: string, options: { includeDeleted?: boolean } = {}) {
  const { rows } = await pool.query<DriveRow>(
    `
      SELECT n.id, n.parent_id, n.node_type, n.name, n.created_by, creator.name AS created_by_name,
             n.created_at, n.updated_at, n.deleted_at,
             f.id AS file_id, f.file_name, f.mime_type, f.file_size, f.preview_kind, f.width, f.height,
             version_stats.version_count, version_stats.latest_version_number
      FROM drive_nodes n
      LEFT JOIN drive_files f ON f.node_id = n.id
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS version_count, MAX(version_number)::int AS latest_version_number
        FROM drive_file_versions
        WHERE file_id = f.id
      ) version_stats ON true
      LEFT JOIN users creator ON creator.id = n.created_by
      WHERE n.team_id = $1
        AND n.id = $2
        AND ($3::boolean OR n.deleted_at IS NULL)
      LIMIT 1
    `,
    [teamId, nodeId, Boolean(options.includeDeleted)],
  );
  return rows[0] ? driveNodeDto(rows[0]) : null;
}

async function listRecentNodes(teamId: string, limit = 12) {
  const { rows } = await pool.query<DriveRow>(
    `
      SELECT n.id, n.parent_id, n.node_type, n.name, n.created_by, creator.name AS created_by_name,
             n.created_at, n.updated_at, n.deleted_at,
             f.id AS file_id, f.file_name, f.mime_type, f.file_size, f.preview_kind, f.width, f.height,
             version_stats.version_count, version_stats.latest_version_number
      FROM drive_nodes n
      LEFT JOIN drive_files f ON f.node_id = n.id
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS version_count, MAX(version_number)::int AS latest_version_number
        FROM drive_file_versions
        WHERE file_id = f.id
      ) version_stats ON true
      LEFT JOIN users creator ON creator.id = n.created_by
      WHERE n.team_id = $1
        AND n.parent_id IS NOT NULL
        AND n.deleted_at IS NULL
      ORDER BY n.updated_at DESC, n.created_at DESC
      LIMIT $2
    `,
    [teamId, limit],
  );
  return rows.map(driveNodeDto);
}

async function countTrashNodes(teamId: string) {
  const { rows } = await pool.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM drive_nodes WHERE team_id = $1 AND deleted_at IS NOT NULL",
    [teamId],
  );
  return Number(rows[0]?.count ?? 0);
}

async function findFolderNode(nodeId: string, teamId: string) {
  const { rows } = await pool.query<{ id: string }>(
    `
      SELECT id
      FROM drive_nodes
      WHERE id = $1
        AND team_id = $2
        AND node_type = 'folder'
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [nodeId, teamId],
  );
  return rows[0] ?? null;
}

async function findNode(nodeId: string, teamId: string) {
  const { rows } = await pool.query<{ id: string; node_type: "folder" | "file"; parent_id: string | null }>(
    `
      SELECT id, node_type, parent_id
      FROM drive_nodes
      WHERE id = $1
        AND team_id = $2
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [nodeId, teamId],
  );
  return rows[0] ?? null;
}

async function findDriveFileForVersion(fileId: string, teamId: string) {
  const { rows } = await pool.query<DriveMutableFileRow>(
    `
      SELECT f.id, f.team_id, f.node_id, n.name AS node_name, f.object_key, f.file_name, f.mime_type,
             f.file_size, f.preview_kind, COALESCE(version_stats.latest_version_number, 0) AS latest_version_number
      FROM drive_files f
      INNER JOIN drive_nodes n ON n.id = f.node_id
      LEFT JOIN LATERAL (
        SELECT MAX(version_number)::int AS latest_version_number
        FROM drive_file_versions
        WHERE file_id = f.id
      ) version_stats ON true
      WHERE f.id = $1
        AND f.team_id = $2
        AND n.deleted_at IS NULL
      LIMIT 1
    `,
    [fileId, teamId],
  );
  return rows[0] ?? null;
}

async function driveBootstrap(actor: ChatActor): Promise<DriveBootstrap> {
  const teamId = storageTeamId(actor);
  const root = await ensureTeamDriveRoot(actor);
  return {
    children: await listChildren(root.id, teamId),
    recentNodes: await listRecentNodes(teamId),
    root,
    trashCount: await countTrashNodes(teamId),
    uploadMaxBytes: env.ORF_INFRA_UPLOAD_MAX_BYTES,
  };
}

async function getChatChannelAccess(channelId: string, actor: ChatActor) {
  if (!actor.canRead) return { status: "forbidden" as const };
  const { rows } = await pool.query<ChatChannelAccessRow>(
    `
      SELECT c.id, c.type, cm.role AS member_role
      FROM chat_channels c
      INNER JOIN chat_channel_members cm ON cm.channel_id = c.id AND cm.user_id = $2
      WHERE c.team_id = $1
        AND c.id = $3
        AND c.archived_at IS NULL
        AND c.type IN ('public', 'private')
      LIMIT 1
    `,
    [storageTeamId(actor), actor.id, channelId],
  );
  const channel = rows[0];
  if (!channel) return { status: "notFound" as const };
  return { status: "ok" as const, channel };
}

function canManageChatDriveLinks(actor: ChatActor, channel: ChatChannelAccessRow) {
  return actor.canManageAnyChannel || channel.member_role === "owner" || channel.member_role === "admin";
}

async function listChatDriveLinks(channelId: string, teamId: string) {
  const { rows } = await pool.query<ChatDriveLinkRow>(
    `
      SELECT l.id AS link_id, l.channel_id, l.label, l.is_default_upload_target,
             l.created_at AS link_created_at, l.updated_at AS link_updated_at,
             n.id, n.parent_id, n.node_type, n.name, n.created_by, creator.name AS created_by_name,
             n.created_at, n.updated_at,
             f.id AS file_id, f.file_name, f.mime_type, f.file_size, f.preview_kind, f.width, f.height
      FROM chat_channel_drive_links l
      INNER JOIN drive_nodes n ON n.id = l.node_id AND n.team_id = l.team_id AND n.deleted_at IS NULL
      LEFT JOIN drive_files f ON f.node_id = n.id
      LEFT JOIN users creator ON creator.id = n.created_by
      WHERE l.team_id = $1
        AND l.channel_id = $2
      ORDER BY l.is_default_upload_target DESC, lower(COALESCE(l.label, n.name)), l.created_at ASC
    `,
    [teamId, channelId],
  );
  return rows.map(chatDriveLinkDto);
}

export async function getDriveBootstrap(actor: ChatActor): Promise<DriveBootstrapOutcome> {
  if (!actor.canRead) return { status: "forbidden" };
  return { status: "ok", drive: await driveBootstrap(actor) };
}

export async function getChatDriveBootstrap(channelId: string, actor: ChatActor): Promise<ChatDriveBootstrapOutcome> {
  const channel = await getChatChannelAccess(channelId, actor);
  if (channel.status !== "ok") return channel;
  const teamId = storageTeamId(actor);
  return {
    status: "ok",
    drive: await driveBootstrap(actor),
    links: await listChatDriveLinks(channel.channel.id, teamId),
  };
}

export async function listDriveChildren(
  input: { parentNodeId: string },
  actor: ChatActor,
): Promise<Outcome<{ children: DriveNode[]; parentNodeId: string }>> {
  if (!actor.canRead) return { status: "forbidden" };
  const teamId = storageTeamId(actor);
  const parent = await findFolderNode(input.parentNodeId, teamId);
  if (!parent) return { status: "notFound" };
  return ok({
    children: await listChildren(parent.id, teamId),
    parentNodeId: parent.id,
  });
}

async function listDriveFileVersions(fileId: string, teamId: string) {
  const { rows } = await pool.query<DriveFileVersionRow>(
    `
      SELECT v.id, v.file_id, v.version_number, v.file_name, v.mime_type, v.file_size,
             v.preview_kind, v.width, v.height, v.created_by, creator.name AS created_by_name, v.created_at
      FROM drive_file_versions v
      LEFT JOIN users creator ON creator.id = v.created_by
      WHERE v.team_id = $1
        AND v.file_id = $2
      ORDER BY v.version_number DESC
    `,
    [teamId, fileId],
  );
  return rows.map(driveFileVersionDto);
}

async function listDriveNodeEvents(nodeId: string, teamId: string, limit = 20) {
  const { rows } = await pool.query<DriveNodeEventRow>(
    `
      SELECT e.id, e.node_id, e.actor_user_id, actor.name AS actor_name, e.action, e.metadata, e.created_at
      FROM drive_node_events e
      LEFT JOIN users actor ON actor.id = e.actor_user_id
      WHERE e.team_id = $1
        AND e.node_id = $2
      ORDER BY e.created_at DESC
      LIMIT $3
    `,
    [teamId, nodeId, limit],
  );
  return rows.map(driveNodeEventDto);
}

async function listDriveContextLinks(nodeId: string, teamId: string) {
  const { rows } = await pool.query<DriveContextLinkRow>(
    `
      SELECT l.id, l.node_id, l.context_type, l.context_id, l.label, l.created_by, creator.name AS created_by_name,
             l.created_at,
             CASE
               WHEN l.context_type = 'project' THEN p.name
               WHEN l.context_type = 'objective' THEN o.title
               WHEN l.context_type = 'result' THEN r.title
               WHEN l.context_type = 'task' THEN t.title
               WHEN l.context_type = 'feedback' THEN f.phenomenon
               WHEN l.context_type = 'workLog' THEN wl.work_date || ' · ' || wl.author_name_snapshot
               WHEN l.context_type = 'chatChannel' THEN COALESCE(c.display_name, c.name)
               WHEN l.context_type = 'chatMessage' THEN COALESCE(NULLIF(left(regexp_replace(cm.body, '\\s+', ' ', 'g'), 80), ''), '聊天消息')
               WHEN l.context_type = 'chatThread' THEN COALESCE(NULLIF(left(regexp_replace(ct.body, '\\s+', ' ', 'g'), 80), ''), '聊天话题')
               ELSE NULL
             END AS context_title
      FROM drive_node_context_links l
      LEFT JOIN users creator ON creator.id = l.created_by
      LEFT JOIN projects p ON p.id = l.context_id AND p.team_id = l.team_id AND l.context_type = 'project'
      LEFT JOIN objectives o ON o.id = l.context_id AND o.team_id = l.team_id AND l.context_type = 'objective'
      LEFT JOIN results r ON r.id = l.context_id AND r.team_id = l.team_id AND l.context_type = 'result'
      LEFT JOIN tasks t ON t.id = l.context_id AND t.team_id = l.team_id AND l.context_type = 'task'
      LEFT JOIN feedback f ON f.id = l.context_id AND f.team_id = l.team_id AND l.context_type = 'feedback'
      LEFT JOIN work_log_entries wl ON wl.id = l.context_id AND wl.team_id = l.team_id AND l.context_type = 'workLog'
      LEFT JOIN chat_channels c ON c.id = l.context_id AND c.team_id = l.team_id AND l.context_type = 'chatChannel'
      LEFT JOIN chat_messages cm ON cm.id = l.context_id AND cm.team_id = l.team_id AND cm.deleted_at IS NULL AND l.context_type = 'chatMessage'
      LEFT JOIN chat_messages ct ON ct.id = l.context_id AND ct.team_id = l.team_id AND ct.deleted_at IS NULL AND ct.root_message_id IS NULL AND l.context_type = 'chatThread'
      WHERE l.team_id = $1
        AND l.node_id = $2
      ORDER BY l.created_at DESC
    `,
    [teamId, nodeId],
  );
  return rows.map(driveContextLinkDto);
}

async function listDriveNodePath(nodeId: string, teamId: string) {
  const { rows } = await pool.query<DriveRow & { depth: number }>(
    `
      WITH RECURSIVE ancestors AS (
        SELECT n.*, 0 AS depth
        FROM drive_nodes n
        WHERE n.team_id = $1 AND n.id = $2
        UNION ALL
        SELECT parent.*, ancestors.depth + 1
        FROM drive_nodes parent
        INNER JOIN ancestors ON ancestors.parent_id = parent.id
        WHERE parent.team_id = $1
      )
      SELECT a.id, a.parent_id, a.node_type, a.name, a.created_by, creator.name AS created_by_name,
             a.created_at, a.updated_at, a.deleted_at,
             f.id AS file_id, f.file_name, f.mime_type, f.file_size, f.preview_kind, f.width, f.height,
             null AS version_count, null AS latest_version_number,
             a.depth
      FROM ancestors a
      LEFT JOIN drive_files f ON f.node_id = a.id
      LEFT JOIN users creator ON creator.id = a.created_by
      ORDER BY a.depth DESC
    `,
    [teamId, nodeId],
  );
  return rows.map(driveNodeDto);
}

export async function getDriveNodeDetails(
  input: { nodeId: string },
  actor: ChatActor,
): Promise<Outcome<{ details: DriveNodeDetails }>> {
  if (!actor.canRead) return { status: "forbidden" };
  const teamId = storageTeamId(actor);
  const node = await getDriveNodeById(input.nodeId, teamId, { includeDeleted: true });
  if (!node) return { status: "notFound" };
  const [activity, contextLinks, path, versions] = await Promise.all([
    listDriveNodeEvents(node.id, teamId),
    listDriveContextLinks(node.id, teamId),
    listDriveNodePath(node.id, teamId),
    node.file ? listDriveFileVersions(node.file.id, teamId) : Promise.resolve([]),
  ]);
  return ok({
    details: {
      activity,
      contextLinks,
      node,
      path,
      versions,
    },
  });
}

export async function searchDriveNodes(
  input: {
    contextType?: DriveSearchContextFilter;
    limit?: number;
    previewKind?: DrivePreviewKind | "all";
    query?: string;
    scope?: DriveSearchScope;
    source?: DriveSearchSource;
    status?: DriveSearchStatus;
    type?: DriveSearchType;
    updated?: DriveSearchUpdatedRange;
    uploaderId?: string;
  },
  actor: ChatActor,
): Promise<Outcome<{ nodes: DriveNode[] }>> {
  if (!actor.canRead) return { status: "forbidden" };
  const teamId = storageTeamId(actor);
  const params: unknown[] = [teamId];
  const conditions = ["n.team_id = $1", "n.parent_id IS NOT NULL"];
  const status = input.status ?? (input.scope === "trash" ? "trash" : "active");
  if (status === "trash") {
    conditions.push("n.deleted_at IS NOT NULL");
  } else if (status === "active") {
    conditions.push("n.deleted_at IS NULL");
  }
  if (input.type && input.type !== "all") {
    params.push(input.type);
    conditions.push(`n.node_type = $${params.length}`);
  }
  if (input.previewKind && input.previewKind !== "all") {
    params.push(input.previewKind);
    conditions.push(`f.preview_kind = $${params.length}`);
  }
  if (input.uploaderId) {
    params.push(input.uploaderId);
    conditions.push(`n.created_by = $${params.length}`);
  }
  if (input.updated === "7d") {
    conditions.push("n.updated_at >= now() - interval '7 days'");
  } else if (input.updated === "30d") {
    conditions.push("n.updated_at >= now() - interval '30 days'");
  }
  if (input.source === "manual") {
    conditions.push("jsonb_array_length(search_meta.search_contexts) = 0");
  } else if (input.source === "chat") {
    conditions.push(`EXISTS (
      SELECT 1 FROM jsonb_array_elements(search_meta.search_contexts) AS context(value)
      WHERE context.value->>'contextType' IN ('chatChannel', 'chatMessage', 'chatThread')
    )`);
  } else if (input.source && input.source !== "all") {
    params.push(input.source);
    conditions.push(`EXISTS (
      SELECT 1 FROM jsonb_array_elements(search_meta.search_contexts) AS context(value)
      WHERE context.value->>'contextType' = $${params.length}
    )`);
  }
  if (input.contextType && input.contextType !== "all") {
    params.push(input.contextType);
    conditions.push(`EXISTS (
      SELECT 1 FROM jsonb_array_elements(search_meta.search_contexts) AS context(value)
      WHERE context.value->>'contextType' = $${params.length}
    )`);
  }
  const query = input.query?.trim().toLowerCase();
  if (query) {
    params.push(`%${query}%`);
    conditions.push(`(
      lower(n.name) LIKE $${params.length}
      OR lower(COALESCE(f.file_name, '')) LIKE $${params.length}
      OR lower(COALESCE(f.mime_type, '')) LIKE $${params.length}
      OR lower(COALESCE(search_meta.search_text, '')) LIKE $${params.length}
    )`);
  }
  const limit = Math.max(1, Math.min(input.limit ?? 50, 100));
  params.push(limit);
  const { rows } = await pool.query<DriveSearchRow>(
    `
      SELECT n.id, n.parent_id, n.node_type, n.name, n.created_by, creator.name AS created_by_name,
             n.created_at, n.updated_at, n.deleted_at,
             f.id AS file_id, f.file_name, f.mime_type, f.file_size, f.preview_kind, f.width, f.height,
             version_stats.version_count, version_stats.latest_version_number,
             search_meta.search_contexts
      FROM drive_nodes n
      LEFT JOIN drive_files f ON f.node_id = n.id
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS version_count, MAX(version_number)::int AS latest_version_number
        FROM drive_file_versions
        WHERE file_id = f.id
      ) version_stats ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'contextType', context_items.context_type,
              'contextId', context_items.context_id,
              'contextTitle', context_items.context_title,
              'label', context_items.label
            )
            ORDER BY context_items.sort_rank, context_items.context_title
          ),
          '[]'::jsonb
        ) AS search_contexts,
        string_agg(context_items.context_title || ' ' || COALESCE(context_items.label, ''), ' ') AS search_text
        FROM (
          SELECT DISTINCT ON (raw_contexts.context_type, raw_contexts.context_id)
                 raw_contexts.context_type, raw_contexts.context_id, raw_contexts.context_title, raw_contexts.label, raw_contexts.sort_rank
          FROM (
            SELECT l.context_type::text AS context_type,
                   l.context_id,
                   COALESCE(
                     l.label,
                     CASE
                       WHEN l.context_type = 'project' THEN p.name
                       WHEN l.context_type = 'objective' THEN o.title
                       WHEN l.context_type = 'result' THEN r.title
                       WHEN l.context_type = 'task' THEN t.title
                       WHEN l.context_type = 'feedback' THEN fb.phenomenon
                       WHEN l.context_type = 'workLog' THEN wl.work_date || ' · ' || wl.author_name_snapshot
                       WHEN l.context_type = 'chatChannel' THEN COALESCE(c.display_name, c.name)
                       WHEN l.context_type = 'chatMessage' THEN COALESCE(NULLIF(left(regexp_replace(cm.body, '\\s+', ' ', 'g'), 80), ''), '聊天消息')
                       WHEN l.context_type = 'chatThread' THEN COALESCE(NULLIF(left(regexp_replace(ct.body, '\\s+', ' ', 'g'), 80), ''), '聊天话题')
                       ELSE NULL
                     END,
                     l.context_type::text
                   ) AS context_title,
                   l.label,
                   1 AS sort_rank
            FROM drive_node_context_links l
            LEFT JOIN projects p ON p.id = l.context_id AND p.team_id = l.team_id AND l.context_type = 'project'
            LEFT JOIN objectives o ON o.id = l.context_id AND o.team_id = l.team_id AND l.context_type = 'objective'
            LEFT JOIN results r ON r.id = l.context_id AND r.team_id = l.team_id AND l.context_type = 'result'
            LEFT JOIN tasks t ON t.id = l.context_id AND t.team_id = l.team_id AND l.context_type = 'task'
            LEFT JOIN feedback fb ON fb.id = l.context_id AND fb.team_id = l.team_id AND l.context_type = 'feedback'
            LEFT JOIN work_log_entries wl ON wl.id = l.context_id AND wl.team_id = l.team_id AND l.context_type = 'workLog'
            LEFT JOIN chat_channels c ON c.id = l.context_id AND c.team_id = l.team_id AND l.context_type = 'chatChannel'
            LEFT JOIN chat_messages cm ON cm.id = l.context_id AND cm.team_id = l.team_id AND cm.deleted_at IS NULL AND l.context_type = 'chatMessage'
            LEFT JOIN chat_messages ct ON ct.id = l.context_id AND ct.team_id = l.team_id AND ct.deleted_at IS NULL AND ct.root_message_id IS NULL AND l.context_type = 'chatThread'
            WHERE l.team_id = n.team_id
              AND l.node_id = n.id
            UNION ALL
            SELECT 'chatChannel' AS context_type,
                   channel.id AS context_id,
                   COALESCE(link.label, channel.display_name, channel.name, '群聊') AS context_title,
                   link.label,
                   0 AS sort_rank
            FROM chat_channel_drive_links link
            INNER JOIN chat_channels channel ON channel.id = link.channel_id AND channel.team_id = link.team_id
            WHERE link.team_id = n.team_id
              AND (link.node_id = n.id OR link.node_id = n.parent_id)
          ) raw_contexts
          ORDER BY raw_contexts.context_type, raw_contexts.context_id, raw_contexts.sort_rank
        ) context_items
      ) search_meta ON true
      LEFT JOIN users creator ON creator.id = n.created_by
      WHERE ${conditions.join(" AND ")}
      ORDER BY n.updated_at DESC, lower(n.name)
      LIMIT $${params.length}
    `,
    params,
  );
  return ok({ nodes: rows.map((row) => driveSearchNodeDto(row, query)) });
}

export async function listDriveTrash(actor: ChatActor): Promise<Outcome<{ nodes: DriveNode[] }>> {
  if (!actor.canRead) return { status: "forbidden" };
  const teamId = storageTeamId(actor);
  const { rows } = await pool.query<DriveRow>(
    `
      SELECT n.id, n.parent_id, n.node_type, n.name, n.created_by, creator.name AS created_by_name,
             n.created_at, n.updated_at, n.deleted_at,
             f.id AS file_id, f.file_name, f.mime_type, f.file_size, f.preview_kind, f.width, f.height,
             version_stats.version_count, version_stats.latest_version_number
      FROM drive_nodes n
      LEFT JOIN drive_nodes parent ON parent.id = n.parent_id
      LEFT JOIN drive_files f ON f.node_id = n.id
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS version_count, MAX(version_number)::int AS latest_version_number
        FROM drive_file_versions
        WHERE file_id = f.id
      ) version_stats ON true
      LEFT JOIN users creator ON creator.id = n.created_by
      WHERE n.team_id = $1
        AND n.deleted_at IS NOT NULL
        AND (n.parent_id IS NULL OR parent.deleted_at IS NULL)
      ORDER BY n.deleted_at DESC, lower(n.name)
      LIMIT 100
    `,
    [teamId],
  );
  return ok({ nodes: rows.map(driveNodeDto) });
}

export async function createDriveFolder(
  input: { name: string; parentNodeId: string },
  actor: ChatActor,
): Promise<Outcome<{ node: DriveNode }>> {
  if (!actor.canRead || !actor.canWrite) return { status: "forbidden" };
  const folderName = sanitizeFolderName(input.name);
  if (!folderName) return { status: "invalid" };
  const teamId = storageTeamId(actor);
  const parent = await findFolderNode(input.parentNodeId, teamId);
  if (!parent) return { status: "notFound" };

  const nodeId = makeId("drive-node");
  const now = nowIso();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows } = await client.query<DriveRow>(
      `
        WITH inserted AS (
          INSERT INTO drive_nodes (id, team_id, parent_id, node_type, name, created_by, updated_by, created_at, updated_at)
          VALUES ($1, $2, $3, 'folder', $4, $5, $5, $6, $6)
          RETURNING id, parent_id, node_type, name, created_by, created_at, updated_at
        )
        SELECT inserted.id, inserted.parent_id, inserted.node_type, inserted.name, inserted.created_by, creator.name AS created_by_name,
               inserted.created_at, inserted.updated_at, null AS file_id, null AS file_name, null AS mime_type, null AS file_size,
               null AS preview_kind, null AS width, null AS height
        FROM inserted
        LEFT JOIN users creator ON creator.id = inserted.created_by
      `,
      [nodeId, teamId, parent.id, folderName, actor.id, now],
    );
    const node = rows[0];
    if (!node) {
      await client.query("rollback").catch(() => undefined);
      return { status: "invalid" };
    }
    await recordDriveEvent(client, {
      action: "folder_created",
      actorUserId: actor.id,
      metadata: { name: folderName, parentNodeId: parent.id },
      nodeId: node.id,
      teamId,
      timestamp: now,
    });
    await client.query("commit");
    return ok({ node: driveNodeDto(node) });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    if (error instanceof Error && "code" in error && error.code === "23505") return { status: "conflict" };
    throw error;
  } finally {
    client.release();
  }
}

export async function uploadDriveFile(
  input: { body: Readable; channelId?: string | null; fileName: string; mimeType: string; parentNodeId: string },
  actor: ChatActor,
): Promise<DriveUploadOutcome> {
  if (!actor.canRead || !actor.canWrite) return { status: "forbidden" };
  const fileName = sanitizeDriveName(input.fileName);
  if (!fileName) return { status: "invalid" };
  const teamId = storageTeamId(actor);
  const parent = await findFolderNode(input.parentNodeId, teamId);
  if (!parent) return { status: "notFound" };

  const fileId = makeId("drive-file");
  const nodeId = makeId("drive-node");
  const objectKey = `drive-files/${safePathSegment(teamId)}/${fileId}/${safePathSegment(fileName)}`;
  const declaredMimeType = normalizeMimeType(input.mimeType);
  let stored: { contentLength: number; peeked: Buffer };
  try {
    stored = await objectStorage.putObjectStream({
      body: input.body,
      contentType: declaredMimeType || "application/octet-stream",
      key: objectKey,
      maxBytes: env.ORF_INFRA_UPLOAD_MAX_BYTES,
      peekBytes: 4096,
    });
  } catch (error) {
    if (error instanceof ObjectStorageUploadTooLargeError) return { status: "tooLarge" };
    if (error instanceof ObjectStorageUploadEmptyError) return { status: "invalid" };
    throw error;
  }

  const metadata = storedDriveMetadata({ fileName, mimeType: declaredMimeType, peeked: stored.peeked });
  const now = nowIso();
  let persisted = false;
  try {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const { rows } = await client.query<DriveRow>(
        `
          WITH inserted_node AS (
            INSERT INTO drive_nodes (id, team_id, parent_id, node_type, name, created_by, updated_by, created_at, updated_at)
            VALUES ($1, $2, $3, 'file', $4, $5, $5, $6, $6)
            RETURNING id, parent_id, node_type, name, created_by, created_at, updated_at
          ),
          inserted_file AS (
            INSERT INTO drive_files (id, node_id, team_id, object_key, file_name, mime_type, file_size, preview_kind, width, height, created_by, created_at)
            SELECT $7, inserted_node.id, $2, $8, $9, $10, $11, $12, $13, $14, $5, $6
            FROM inserted_node
            RETURNING id, node_id, file_name, mime_type, file_size, preview_kind, width, height
          ),
          inserted_version AS (
            INSERT INTO drive_file_versions (id, team_id, file_id, node_id, version_number, object_key, file_name, mime_type, file_size, preview_kind, width, height, created_by, created_at)
            SELECT $15, $2, inserted_file.id, inserted_node.id, 1, $8, $9, $10, $11, $12, $13, $14, $5, $6
            FROM inserted_node
            INNER JOIN inserted_file ON inserted_file.node_id = inserted_node.id
            RETURNING file_id, version_number
          )
          SELECT inserted_node.id, inserted_node.parent_id, inserted_node.node_type, inserted_node.name,
                 inserted_node.created_by, creator.name AS created_by_name, inserted_node.created_at, inserted_node.updated_at,
                 inserted_file.id AS file_id, inserted_file.file_name, inserted_file.mime_type, inserted_file.file_size,
                 inserted_file.preview_kind, inserted_file.width, inserted_file.height,
                 1 AS version_count, inserted_version.version_number AS latest_version_number
          FROM inserted_node
          INNER JOIN inserted_file ON inserted_file.node_id = inserted_node.id
          INNER JOIN inserted_version ON inserted_version.file_id = inserted_file.id
          LEFT JOIN users creator ON creator.id = inserted_node.created_by
        `,
        [
          nodeId,
          teamId,
          parent.id,
          fileName,
          actor.id,
          now,
          fileId,
          objectKey,
          fileName,
          metadata.mimeType,
          stored.contentLength,
          metadata.previewKind,
          metadata.width,
          metadata.height,
          makeId("drive-version"),
        ],
      );
      const nodeRow = rows[0];
      if (!nodeRow) {
        await client.query("rollback").catch(() => undefined);
        return { status: "invalid" };
      }
      await recordDriveEvent(client, {
        action: "file_uploaded",
        actorUserId: actor.id,
        metadata: {
          fileId,
          fileName,
          fileSize: stored.contentLength,
          parentNodeId: parent.id,
          previewKind: metadata.previewKind,
          versionNumber: 1,
        },
        nodeId,
        teamId,
        timestamp: now,
      });
      await client.query("commit");
      persisted = true;
      const node = driveNodeDto(nodeRow);
      const announcementMessage = input.channelId
        ? await announceDriveFileUpload(input.channelId, node, actor).catch(() => null)
        : null;
      return ok({ announcementMessage, node });
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      if (error instanceof Error && "code" in error && error.code === "23505") {
        await objectStorage.deleteObject(objectKey).catch(() => undefined);
        return { status: "conflict" };
      }
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    if (!persisted) {
      await objectStorage.deleteObject(objectKey).catch(() => undefined);
    }
    throw error;
  }
}

async function announceDriveFileUpload(channelId: string, node: DriveNode, actor: ChatActor) {
  if (!node.file) return null;
  const linkText = escapeMarkdownLinkText(node.file.fileName);
  const outcome = await sendChatMessage({
    attachmentIds: [],
    body: `上传了云盘文件：[${linkText}](${node.file.previewUrl ?? node.file.downloadUrl})`,
    channelId,
    parentMessageId: null,
    rootMessageId: null,
  }, actor);
  return outcome.status === "ok" ? outcome.message : null;
}

export async function deleteDriveNode(
  input: { nodeId: string },
  actor: ChatActor,
): Promise<Outcome<{ deletedNodeIds: string[] }>> {
  if (!actor.canRead || !actor.canWrite) return { status: "forbidden" };
  const teamId = storageTeamId(actor);
  const node = await findNode(input.nodeId, teamId);
  if (!node || node.parent_id === null) return { status: "notFound" };

  const now = nowIso();
  const { rows } = await pool.query<{ id: string }>(
    `
      WITH RECURSIVE target_nodes AS (
        SELECT id
        FROM drive_nodes
        WHERE id = $1
          AND team_id = $2
          AND deleted_at IS NULL
        UNION ALL
        SELECT child.id
        FROM drive_nodes child
        INNER JOIN target_nodes parent ON parent.id = child.parent_id
        WHERE child.deleted_at IS NULL
      ),
      updated AS (
        UPDATE drive_nodes
        SET deleted_at = $3,
            deleted_by = $4,
            updated_at = $3,
            updated_by = $4
        WHERE id IN (SELECT id FROM target_nodes)
        RETURNING id
      )
      SELECT id FROM updated
    `,
    [input.nodeId, teamId, now, actor.id],
  );
  if (rows.length > 0) {
    await recordDriveEvent(pool, {
      action: "node_deleted",
      actorUserId: actor.id,
      metadata: { deletedNodeIds: rows.map((row) => row.id) },
      nodeId: input.nodeId,
      teamId,
      timestamp: now,
    });
  }
  return ok({ deletedNodeIds: rows.map((row) => row.id) });
}

export async function restoreDriveNode(
  input: { nodeId: string },
  actor: ChatActor,
): Promise<Outcome<{ node: DriveNode; restoredNodeIds: string[] }>> {
  if (!actor.canRead || !actor.canWrite) return { status: "forbidden" };
  const teamId = storageTeamId(actor);
  const existing = await getDriveNodeById(input.nodeId, teamId, { includeDeleted: true });
  if (!existing || !existing.deletedAt || existing.parentId === null) return { status: "notFound" };

  const now = nowIso();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows } = await client.query<{ id: string }>(
      `
        WITH RECURSIVE target_nodes AS (
          SELECT id
          FROM drive_nodes
          WHERE id = $1
            AND team_id = $2
            AND deleted_at IS NOT NULL
          UNION ALL
          SELECT child.id
          FROM drive_nodes child
          INNER JOIN target_nodes parent ON parent.id = child.parent_id
        ),
        updated AS (
          UPDATE drive_nodes
          SET deleted_at = NULL,
              deleted_by = NULL,
              updated_at = $3,
              updated_by = $4
          WHERE id IN (SELECT id FROM target_nodes)
          RETURNING id
        )
        SELECT id FROM updated
      `,
      [input.nodeId, teamId, now, actor.id],
    );
    if (rows.length === 0) {
      await client.query("rollback").catch(() => undefined);
      return { status: "notFound" };
    }
    await recordDriveEvent(client, {
      action: "node_restored",
      actorUserId: actor.id,
      metadata: { restoredNodeIds: rows.map((row) => row.id) },
      nodeId: input.nodeId,
      teamId,
      timestamp: now,
    });
    await client.query("commit");
    const node = await getDriveNodeById(input.nodeId, teamId);
    if (!node) return { status: "notFound" };
    return ok({ node, restoredNodeIds: rows.map((row) => row.id) });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    if (error instanceof Error && "code" in error && error.code === "23505") return { status: "conflict" };
    throw error;
  } finally {
    client.release();
  }
}

export async function getDriveFileVersions(
  input: { fileId: string },
  actor: ChatActor,
): Promise<Outcome<{ versions: DriveFileVersion[] }>> {
  if (!actor.canRead) return { status: "forbidden" };
  const teamId = storageTeamId(actor);
  const file = await findDriveFileForVersion(input.fileId, teamId);
  if (!file) return { status: "notFound" };
  return ok({ versions: await listDriveFileVersions(input.fileId, teamId) });
}

export async function uploadDriveFileVersion(
  input: { body: Readable; fileId: string; fileName: string; mimeType: string },
  actor: ChatActor,
): Promise<Outcome<{ node: DriveNode; versions: DriveFileVersion[] }>> {
  if (!actor.canRead || !actor.canWrite) return { status: "forbidden" };
  const uploadedFileName = sanitizeDriveName(input.fileName);
  if (!uploadedFileName) return { status: "invalid" };
  const teamId = storageTeamId(actor);
  const file = await findDriveFileForVersion(input.fileId, teamId);
  if (!file) return { status: "notFound" };

  const versionId = makeId("drive-version");
  const nextVersion = Number(file.latest_version_number ?? 0) + 1;
  const objectKey = `drive-files/${safePathSegment(teamId)}/${file.id}/versions/${versionId}/${safePathSegment(uploadedFileName)}`;
  const declaredMimeType = normalizeMimeType(input.mimeType);
  let stored: { contentLength: number; peeked: Buffer };
  try {
    stored = await objectStorage.putObjectStream({
      body: input.body,
      contentType: declaredMimeType || "application/octet-stream",
      key: objectKey,
      maxBytes: env.ORF_INFRA_UPLOAD_MAX_BYTES,
      peekBytes: 4096,
    });
  } catch (error) {
    if (error instanceof ObjectStorageUploadTooLargeError) return { status: "tooLarge" };
    if (error instanceof ObjectStorageUploadEmptyError) return { status: "invalid" };
    throw error;
  }

  const metadata = storedDriveMetadata({ fileName: uploadedFileName, mimeType: declaredMimeType, peeked: stored.peeked });
  const now = nowIso();
  let persisted = false;
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `
        INSERT INTO drive_file_versions (id, team_id, file_id, node_id, version_number, object_key, file_name, mime_type, file_size, preview_kind, width, height, created_by, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `,
      [
        versionId,
        teamId,
        file.id,
        file.node_id,
        nextVersion,
        objectKey,
        uploadedFileName,
        metadata.mimeType,
        stored.contentLength,
        metadata.previewKind,
        metadata.width,
        metadata.height,
        actor.id,
        now,
      ],
    );
    await client.query(
      `
        UPDATE drive_files
        SET object_key = $3,
            file_name = $4,
            mime_type = $5,
            file_size = $6,
            preview_kind = $7,
            width = $8,
            height = $9
        WHERE id = $1 AND team_id = $2
      `,
      [file.id, teamId, objectKey, uploadedFileName, metadata.mimeType, stored.contentLength, metadata.previewKind, metadata.width, metadata.height],
    );
    await client.query(
      "UPDATE drive_nodes SET updated_at = $3, updated_by = $4 WHERE id = $1 AND team_id = $2",
      [file.node_id, teamId, now, actor.id],
    );
    await recordDriveEvent(client, {
      action: "file_version_uploaded",
      actorUserId: actor.id,
      metadata: {
        fileId: file.id,
        fileName: uploadedFileName,
        fileSize: stored.contentLength,
        previewKind: metadata.previewKind,
        versionNumber: nextVersion,
      },
      nodeId: file.node_id,
      teamId,
      timestamp: now,
    });
    await client.query("commit");
    persisted = true;
    const [node, versions] = await Promise.all([
      getDriveNodeById(file.node_id, teamId),
      listDriveFileVersions(file.id, teamId),
    ]);
    if (!node) return { status: "notFound" };
    return ok({ node, versions });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    if (!persisted) await objectStorage.deleteObject(objectKey).catch(() => undefined);
    if (error instanceof Error && "code" in error && error.code === "23505") return { status: "conflict" };
    throw error;
  } finally {
    client.release();
  }
}

export async function restoreDriveFileVersion(
  input: { fileId: string; versionId: string },
  actor: ChatActor,
): Promise<Outcome<{ node: DriveNode; versions: DriveFileVersion[] }>> {
  if (!actor.canRead || !actor.canWrite) return { status: "forbidden" };
  const teamId = storageTeamId(actor);
  const file = await findDriveFileForVersion(input.fileId, teamId);
  if (!file) return { status: "notFound" };
  const { rows } = await pool.query<DriveFileVersionContentRow>(
    `
      SELECT v.id, v.file_id, v.version_number, v.object_key, v.file_name, v.mime_type, v.file_size,
             v.preview_kind, v.width, v.height, v.created_by, creator.name AS created_by_name, v.created_at
      FROM drive_file_versions v
      LEFT JOIN users creator ON creator.id = v.created_by
      WHERE v.team_id = $1
        AND v.file_id = $2
        AND v.id = $3
      LIMIT 1
    `,
    [teamId, input.fileId, input.versionId],
  );
  const version = rows[0];
  if (!version) return { status: "notFound" };
  const nextVersion = Number(file.latest_version_number ?? 0) + 1;
  const now = nowIso();
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `
        INSERT INTO drive_file_versions (id, team_id, file_id, node_id, version_number, object_key, file_name, mime_type, file_size, preview_kind, width, height, created_by, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `,
      [
        makeId("drive-version"),
        teamId,
        file.id,
        file.node_id,
        nextVersion,
        version.object_key,
        version.file_name,
        version.mime_type,
        Number(version.file_size),
        version.preview_kind,
        version.width,
        version.height,
        actor.id,
        now,
      ],
    );
    await client.query(
      `
        UPDATE drive_files
        SET object_key = $3,
            file_name = $4,
            mime_type = $5,
            file_size = $6,
            preview_kind = $7,
            width = $8,
            height = $9
        WHERE id = $1 AND team_id = $2
      `,
      [file.id, teamId, version.object_key, version.file_name, version.mime_type, Number(version.file_size), version.preview_kind, version.width, version.height],
    );
    await client.query(
      "UPDATE drive_nodes SET updated_at = $3, updated_by = $4 WHERE id = $1 AND team_id = $2",
      [file.node_id, teamId, now, actor.id],
    );
    await recordDriveEvent(client, {
      action: "file_version_restored",
      actorUserId: actor.id,
      metadata: {
        fileId: file.id,
        restoredFromVersionId: version.id,
        restoredFromVersionNumber: Number(version.version_number),
        versionNumber: nextVersion,
      },
      nodeId: file.node_id,
      teamId,
      timestamp: now,
    });
    await client.query("commit");
    const [node, versions] = await Promise.all([
      getDriveNodeById(file.node_id, teamId),
      listDriveFileVersions(file.id, teamId),
    ]);
    if (!node) return { status: "notFound" };
    return ok({ node, versions });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    if (error instanceof Error && "code" in error && error.code === "23505") return { status: "conflict" };
    throw error;
  } finally {
    client.release();
  }
}

async function resolveDriveContext(teamId: string, contextType: DriveContextType, contextId: string) {
  if (contextType === "project") {
    const { rows } = await pool.query<{ title: string }>(
      "SELECT name AS title FROM projects WHERE team_id = $1 AND id = $2 LIMIT 1",
      [teamId, contextId],
    );
    return rows[0]?.title ?? null;
  }
  if (contextType === "objective") {
    const { rows } = await pool.query<{ title: string }>(
      "SELECT title FROM objectives WHERE team_id = $1 AND id = $2 LIMIT 1",
      [teamId, contextId],
    );
    return rows[0]?.title ?? null;
  }
  if (contextType === "result") {
    const { rows } = await pool.query<{ title: string }>(
      "SELECT title FROM results WHERE team_id = $1 AND id = $2 LIMIT 1",
      [teamId, contextId],
    );
    return rows[0]?.title ?? null;
  }
  if (contextType === "task") {
    const { rows } = await pool.query<{ title: string }>(
      "SELECT title FROM tasks WHERE team_id = $1 AND id = $2 LIMIT 1",
      [teamId, contextId],
    );
    return rows[0]?.title ?? null;
  }
  if (contextType === "feedback") {
    const { rows } = await pool.query<{ title: string }>(
      "SELECT phenomenon AS title FROM feedback WHERE team_id = $1 AND id = $2 LIMIT 1",
      [teamId, contextId],
    );
    return rows[0]?.title ?? null;
  }
  if (contextType === "workLog") {
    const { rows } = await pool.query<{ title: string }>(
      `
        SELECT work_date || ' · ' || author_name_snapshot AS title
        FROM work_log_entries
        WHERE team_id = $1 AND id = $2
        LIMIT 1
      `,
      [teamId, contextId],
    );
    return rows[0]?.title ?? null;
  }
  if (contextType === "chatMessage" || contextType === "chatThread") {
    const { rows } = await pool.query<{ title: string }>(
      `
        SELECT
          COALESCE(
            NULLIF(left(regexp_replace(m.body, '\\s+', ' ', 'g'), 80), ''),
            CASE WHEN $3 = 'chatThread' THEN '聊天话题' ELSE '聊天消息' END
          ) AS title
        FROM chat_messages m
        WHERE m.team_id = $1
          AND m.id = $2
          AND m.deleted_at IS NULL
          AND ($3 <> 'chatThread' OR m.root_message_id IS NULL)
        LIMIT 1
      `,
      [teamId, contextId, contextType],
    );
    return rows[0]?.title ?? null;
  }
  const { rows } = await pool.query<{ title: string }>(
    "SELECT COALESCE(display_name, name) AS title FROM chat_channels WHERE team_id = $1 AND id = $2 AND archived_at IS NULL LIMIT 1",
    [teamId, contextId],
  );
  return rows[0]?.title ?? null;
}

export async function addDriveContextLink(
  input: { contextId: string; contextType: DriveContextType; label?: string | null; nodeId: string },
  actor: ChatActor,
): Promise<Outcome<{ details: DriveNodeDetails }>> {
  if (!actor.canRead || !actor.canWrite) return { status: "forbidden" };
  const teamId = storageTeamId(actor);
  const node = await findNode(input.nodeId, teamId);
  if (!node) return { status: "notFound" };
  const contextTitle = await resolveDriveContext(teamId, input.contextType, input.contextId);
  if (!contextTitle) return { status: "notFound" };
  const now = nowIso();
  const label = input.label?.trim() || null;
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `
        INSERT INTO drive_node_context_links (id, team_id, node_id, context_type, context_id, label, created_by, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (team_id, node_id, context_type, context_id)
        DO UPDATE SET label = EXCLUDED.label
      `,
      [makeId("drive-context-link"), teamId, input.nodeId, input.contextType, input.contextId, label, actor.id, now],
    );
    await recordDriveEvent(client, {
      action: "context_linked",
      actorUserId: actor.id,
      metadata: {
        contextId: input.contextId,
        contextTitle,
        contextType: input.contextType,
        label,
      },
      nodeId: input.nodeId,
      teamId,
      timestamp: now,
    });
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  return getDriveNodeDetails({ nodeId: input.nodeId }, actor);
}

export async function deleteDriveContextLink(
  input: { linkId: string; nodeId: string },
  actor: ChatActor,
): Promise<Outcome<{ details: DriveNodeDetails }>> {
  if (!actor.canRead || !actor.canWrite) return { status: "forbidden" };
  const teamId = storageTeamId(actor);
  const { rows } = await pool.query<{ context_id: string; context_type: DriveContextType; label: string | null; node_id: string }>(
    `
      SELECT node_id, context_type, context_id, label
      FROM drive_node_context_links
      WHERE id = $1 AND team_id = $2 AND node_id = $3
      LIMIT 1
    `,
    [input.linkId, teamId, input.nodeId],
  );
  const link = rows[0];
  if (!link) return { status: "notFound" };
  const now = nowIso();
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("DELETE FROM drive_node_context_links WHERE id = $1 AND team_id = $2", [input.linkId, teamId]);
    await recordDriveEvent(client, {
      action: "context_unlinked",
      actorUserId: actor.id,
      metadata: {
        contextId: link.context_id,
        contextType: link.context_type,
        label: link.label,
      },
      nodeId: link.node_id,
      teamId,
      timestamp: now,
    });
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  return getDriveNodeDetails({ nodeId: input.nodeId }, actor);
}

export async function getDriveFileContent(
  fileId: string,
  actor: ChatActor,
  options: { disposition?: "attachment" | "inline" } = {},
): Promise<
  | { status: "ok"; body: Readable; contentDisposition: "attachment" | "inline"; contentLength?: number; contentType: string; fileName: string }
  | { status: "forbidden" }
  | { status: "notFound" }
> {
  if (!actor.canRead) return { status: "forbidden" };
  const { rows } = await pool.query<DriveContentRow>(
    `
      SELECT f.id, f.team_id, f.object_key, f.file_name, f.mime_type, f.file_size, f.preview_kind
      FROM drive_files f
      INNER JOIN drive_nodes n ON n.id = f.node_id
      WHERE f.id = $1
        AND f.team_id = $2
        AND n.deleted_at IS NULL
      LIMIT 1
    `,
    [fileId, storageTeamId(actor)],
  );
  const row = rows[0];
  if (!row) return { status: "notFound" };

  const stored = await objectStorage.getObject(row.object_key);
  if (!stored) return { status: "notFound" };
  const canPreview = row.preview_kind !== "download";
  const contentDisposition = options.disposition === "attachment" ? "attachment" : canPreview ? "inline" : "attachment";
  return {
    status: "ok",
    body: stored.body,
    contentDisposition,
    contentLength: stored.contentLength,
    contentType: contentDisposition === "inline"
      ? row.preview_kind === "markdown" || row.preview_kind === "text"
        ? "text/plain; charset=utf-8"
        : row.mime_type
      : canPreview
        ? (stored.contentType ?? row.mime_type)
        : "application/octet-stream",
    fileName: row.file_name,
  };
}

export async function addChatDriveLink(
  input: { channelId: string; isDefaultUploadTarget?: boolean; label?: string | null; nodeId: string },
  actor: ChatActor,
): Promise<ChatDriveBootstrapOutcome | Outcome<unknown>> {
  const channel = await getChatChannelAccess(input.channelId, actor);
  if (channel.status !== "ok") return channel;
  if (!canManageChatDriveLinks(actor, channel.channel)) return { status: "forbidden" };
  const teamId = storageTeamId(actor);
  const node = await findNode(input.nodeId, teamId);
  if (!node) return { status: "notFound" };
  if (input.isDefaultUploadTarget && node.node_type !== "folder") return { status: "invalid" };

  const linkId = makeId("chat-drive-link");
  const now = nowIso();
  const label = input.label?.trim() || null;
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (input.isDefaultUploadTarget) {
      await client.query(
        "UPDATE chat_channel_drive_links SET is_default_upload_target = false, updated_at = $3 WHERE team_id = $1 AND channel_id = $2",
        [teamId, input.channelId, now],
      );
    }
    await client.query(
      `
        INSERT INTO chat_channel_drive_links (id, team_id, channel_id, node_id, label, is_default_upload_target, created_by, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
        ON CONFLICT (channel_id, node_id)
        DO UPDATE SET label = EXCLUDED.label,
                      is_default_upload_target = EXCLUDED.is_default_upload_target,
                      updated_at = EXCLUDED.updated_at
      `,
      [linkId, teamId, input.channelId, input.nodeId, label, Boolean(input.isDefaultUploadTarget), actor.id, now],
    );
    await recordDriveEvent(client, {
      action: "chat_linked",
      actorUserId: actor.id,
      metadata: {
        channelId: input.channelId,
        isDefaultUploadTarget: Boolean(input.isDefaultUploadTarget),
        label,
      },
      nodeId: input.nodeId,
      teamId,
      timestamp: now,
    });
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    if (error instanceof Error && "code" in error && error.code === "23505") return { status: "conflict" };
    throw error;
  } finally {
    client.release();
  }
  return getChatDriveBootstrap(input.channelId, actor);
}

export async function updateChatDriveLink(
  input: { channelId: string; isDefaultUploadTarget?: boolean; label?: string | null; linkId: string },
  actor: ChatActor,
): Promise<ChatDriveBootstrapOutcome | Outcome<unknown>> {
  const channel = await getChatChannelAccess(input.channelId, actor);
  if (channel.status !== "ok") return channel;
  if (!canManageChatDriveLinks(actor, channel.channel)) return { status: "forbidden" };
  const teamId = storageTeamId(actor);
  const { rows } = await pool.query<{ node_id: string; node_type: "folder" | "file" }>(
    `
      SELECT l.node_id, n.node_type
      FROM chat_channel_drive_links l
      INNER JOIN drive_nodes n ON n.id = l.node_id AND n.team_id = l.team_id AND n.deleted_at IS NULL
      WHERE l.id = $1 AND l.team_id = $2 AND l.channel_id = $3
      LIMIT 1
    `,
    [input.linkId, teamId, input.channelId],
  );
  const link = rows[0];
  if (!link) return { status: "notFound" };
  if (input.isDefaultUploadTarget && link.node_type !== "folder") return { status: "invalid" };
  const now = nowIso();
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (input.isDefaultUploadTarget) {
      await client.query(
        "UPDATE chat_channel_drive_links SET is_default_upload_target = false, updated_at = $3 WHERE team_id = $1 AND channel_id = $2",
        [teamId, input.channelId, now],
      );
    }
    await client.query(
      `
        UPDATE chat_channel_drive_links
        SET label = COALESCE($4, label),
            is_default_upload_target = CASE WHEN $5::boolean IS NULL THEN is_default_upload_target ELSE $5::boolean END,
            updated_at = $6
        WHERE id = $1 AND team_id = $2 AND channel_id = $3
      `,
      [
        input.linkId,
        teamId,
        input.channelId,
        input.label === undefined ? null : input.label?.trim() || null,
        input.isDefaultUploadTarget ?? null,
        now,
      ],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  return getChatDriveBootstrap(input.channelId, actor);
}

export async function deleteChatDriveLink(
  input: { channelId: string; linkId: string },
  actor: ChatActor,
): Promise<ChatDriveBootstrapOutcome | Outcome<unknown>> {
  const channel = await getChatChannelAccess(input.channelId, actor);
  if (channel.status !== "ok") return channel;
  if (!canManageChatDriveLinks(actor, channel.channel)) return { status: "forbidden" };
  const teamId = storageTeamId(actor);
  const { rows } = await pool.query<{ node_id: string; label: string | null; is_default_upload_target: boolean }>(
    `
      SELECT node_id, label, is_default_upload_target
      FROM chat_channel_drive_links
      WHERE id = $1 AND team_id = $2 AND channel_id = $3
      LIMIT 1
    `,
    [input.linkId, teamId, input.channelId],
  );
  const link = rows[0];
  if (!link) return { status: "notFound" };
  const now = nowIso();
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      "DELETE FROM chat_channel_drive_links WHERE id = $1 AND team_id = $2 AND channel_id = $3",
      [input.linkId, teamId, input.channelId],
    );
    await recordDriveEvent(client, {
      action: "chat_unlinked",
      actorUserId: actor.id,
      metadata: {
        channelId: input.channelId,
        isDefaultUploadTarget: link.is_default_upload_target,
        label: link.label,
      },
      nodeId: link.node_id,
      teamId,
      timestamp: now,
    });
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  return getChatDriveBootstrap(input.channelId, actor);
}
