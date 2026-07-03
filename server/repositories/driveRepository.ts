import type { Readable } from "node:stream";
import type {
  ChatDriveLink,
  ChatMessage,
  Drive,
  DriveBootstrap,
  DriveNode,
  DrivePreviewKind,
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
  file_id: string | null;
  file_name: string | null;
  file_size: number | string | null;
  height: number | null;
  id: string;
  mime_type: string | null;
  name: string;
  node_type: "folder" | "file";
  parent_id: string | null;
  preview_kind: DrivePreviewKind | null;
  updated_at: Date | string;
  width: number | null;
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
    updatedAt: iso(row.updated_at) ?? nowIso(),
    file: driveFileDto(row),
  };
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

async function driveBootstrap(actor: ChatActor): Promise<DriveBootstrap> {
  const teamId = storageTeamId(actor);
  const root = await ensureTeamDriveRoot(actor);
  return {
    children: await listChildren(root.id, teamId),
    root,
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
  try {
    const { rows } = await pool.query<DriveRow>(
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
    if (!node) return { status: "invalid" };
    return ok({ node: driveNodeDto(node) });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "23505") return { status: "conflict" };
    throw error;
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
          )
          SELECT inserted_node.id, inserted_node.parent_id, inserted_node.node_type, inserted_node.name,
                 inserted_node.created_by, creator.name AS created_by_name, inserted_node.created_at, inserted_node.updated_at,
                 inserted_file.id AS file_id, inserted_file.file_name, inserted_file.mime_type, inserted_file.file_size,
                 inserted_file.preview_kind, inserted_file.width, inserted_file.height
          FROM inserted_node
          INNER JOIN inserted_file ON inserted_file.node_id = inserted_node.id
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
        ],
      );
      await client.query("commit");
      persisted = true;
      const nodeRow = rows[0];
      if (!nodeRow) return { status: "invalid" };
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
  return ok({ deletedNodeIds: rows.map((row) => row.id) });
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
  const result = await pool.query(
    "DELETE FROM chat_channel_drive_links WHERE id = $1 AND team_id = $2 AND channel_id = $3",
    [input.linkId, storageTeamId(actor), input.channelId],
  );
  if (result.rowCount === 0) return { status: "notFound" };
  return getChatDriveBootstrap(input.channelId, actor);
}
