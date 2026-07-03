import type { Readable } from "node:stream";
import type {
  ChatMessage,
  OrfProject,
  ProjectFile,
  ProjectFileNode,
  ProjectFilePreviewKind,
  ProjectFileTreeBootstrap,
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

type ProjectFileRow = {
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
  preview_kind: ProjectFilePreviewKind | null;
  updated_at: Date | string;
  width: number | null;
};

type ProjectFileContentRow = {
  file_name: string;
  file_size: number | string;
  id: string;
  mime_type: string;
  object_key: string;
  preview_kind: ProjectFilePreviewKind;
  project_id: string;
  team_id: string;
};

type ProjectFileTreeRow = {
  id: string;
  project_id: string;
  team_id: string;
};

type ProjectFileRootRow = ProjectFileRow & {
  tree_id: string;
};

export type ProjectFileBinding = Pick<OrfProject, "id" | "name">;

export type ProjectFileUploadOutcome = Outcome<{
  announcementMessage?: ChatMessage | null;
  node: ProjectFileNode;
}>;

export type ProjectFileBootstrapOutcome =
  | ({ status: "ok"; binding: ProjectFileBinding | null; tree: ProjectFileTreeBootstrap | null })
  | { status: "forbidden" }
  | { status: "notFound" };

function projectFileContentUrl(id: string, disposition: "attachment" | "inline" = "inline") {
  const params = new URLSearchParams({ disposition });
  return `/api/project-files/${encodeURIComponent(id)}/content?${params.toString()}`;
}

function projectFileDto(row: ProjectFileRow): ProjectFile | undefined {
  if (!row.file_id || !row.file_name || !row.mime_type || row.file_size === null || !row.preview_kind) return undefined;
  const previewUrl = row.preview_kind === "download" ? undefined : projectFileContentUrl(row.file_id, "inline");
  return {
    id: row.file_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSize: Number(row.file_size),
    contentUrl: projectFileContentUrl(row.file_id, "inline"),
    downloadUrl: projectFileContentUrl(row.file_id, "attachment"),
    previewKind: row.preview_kind,
    previewUrl,
    width: row.width,
    height: row.height,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: iso(row.created_at) ?? nowIso(),
  };
}

function projectFileNodeDto(row: ProjectFileRow): ProjectFileNode {
  return {
    id: row.id,
    parentId: row.parent_id,
    type: row.node_type,
    name: row.name,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: iso(row.created_at) ?? nowIso(),
    updatedAt: iso(row.updated_at) ?? nowIso(),
    file: projectFileDto(row),
  };
}

function projectDto(row: { created_at?: Date | string; id: string; name: string; updated_at?: Date | string }): OrfProject {
  return {
    id: row.id,
    name: row.name,
    createdAt: iso(row.created_at) ?? "",
    updatedAt: iso(row.updated_at) ?? "",
  };
}

function sanitizeProjectFileName(value: string) {
  const leafName = value.split(/[\\/]/).pop()?.trim() ?? "";
  return leafName.replace(/[^\w.\-()\u4e00-\u9fff ]+/g, "_").slice(0, 160).trim();
}

function sanitizeFolderName(value: string) {
  return sanitizeProjectFileName(value).replace(/\.+$/g, "").trim();
}

function extensionFromFileName(fileName: string) {
  const match = /\.([A-Za-z0-9]{1,16})$/.exec(fileName);
  return match?.[1]?.toLowerCase() ?? "";
}

function isPdf(buffer: Buffer) {
  return buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}

function storedProjectFileMetadata(input: { fileName: string; mimeType: string; peeked: Buffer }) {
  const imageMetadata = readImageMetadata(input.peeked);
  if (imageMetadata) {
    return {
      height: imageMetadata.height,
      mimeType: imageMetadata.mimeType,
      previewKind: "image" as ProjectFilePreviewKind,
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

async function getChannelProjectBinding(channelId: string, actor: ChatActor) {
  if (!actor.canRead) return { status: "forbidden" as const };
  const { rows } = await pool.query<{
    channel_id: string;
    project_created_at: Date | string | null;
    project_id: string | null;
    project_name: string | null;
    project_updated_at: Date | string | null;
  }>(
    `
      SELECT c.id AS channel_id,
             p.id AS project_id,
             p.name AS project_name,
             p.created_at AS project_created_at,
             p.updated_at AS project_updated_at
      FROM chat_channels c
      INNER JOIN chat_channel_members cm ON cm.channel_id = c.id AND cm.user_id = $2
      LEFT JOIN projects p ON p.id = c.project_id AND p.team_id = c.team_id
      WHERE c.team_id = $1
        AND c.id = $3
        AND c.archived_at IS NULL
        AND c.type IN ('public', 'private')
      LIMIT 1
    `,
    [storageTeamId(actor), actor.id, channelId],
  );
  const row = rows[0];
  if (!row) return { status: "notFound" as const };
  if (!row.project_id || !row.project_name) return { status: "ok" as const, project: null };
  return {
    status: "ok" as const,
    project: projectDto({
      id: row.project_id,
      name: row.project_name,
      created_at: row.project_created_at ?? undefined,
      updated_at: row.project_updated_at ?? undefined,
    }),
  };
}

async function actorCanReadProjectFiles(actor: ChatActor, projectId: string) {
  if (!actor.canRead) return false;
  const { rows } = await pool.query<{ id: string }>(
    `
      SELECT c.id
      FROM chat_channels c
      INNER JOIN chat_channel_members cm ON cm.channel_id = c.id AND cm.user_id = $3
      WHERE c.team_id = $1
        AND c.project_id = $2
        AND c.archived_at IS NULL
        AND c.type IN ('public', 'private')
      LIMIT 1
    `,
    [storageTeamId(actor), projectId, actor.id],
  );
  return rows.length > 0;
}

async function ensureProjectFileTree(project: OrfProject, actor: ChatActor) {
  const teamId = storageTeamId(actor);
  const now = nowIso();
  await pool.query(
    `
      INSERT INTO project_file_trees (id, team_id, project_id, created_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $5)
      ON CONFLICT (team_id, project_id) DO NOTHING
    `,
    [makeId("project-file-tree"), teamId, project.id, actor.id, now],
  );

  const treeResult = await pool.query<ProjectFileTreeRow>(
    `
      SELECT id, team_id, project_id
      FROM project_file_trees
      WHERE team_id = $1 AND project_id = $2
      LIMIT 1
    `,
    [teamId, project.id],
  );
  const tree = treeResult.rows[0];
  if (!tree) throw new Error("project file tree was not created");

  const root = await findRootNode(tree.id);
  if (root) return { tree, root };

  try {
    await pool.query(
      `
        INSERT INTO project_file_nodes (id, tree_id, team_id, project_id, parent_id, node_type, name, created_by, updated_by, created_at, updated_at)
        VALUES ($1, $2, $3, $4, null, 'folder', $5, $6, $6, $7, $7)
      `,
      [makeId("project-file-node"), tree.id, teamId, project.id, "项目文件", actor.id, nowIso()],
    );
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "23505")) throw error;
  }

  const createdRoot = await findRootNode(tree.id);
  if (!createdRoot) throw new Error("project file root was not created");
  return { tree, root: createdRoot };
}

async function findRootNode(treeId: string) {
  const { rows } = await pool.query<ProjectFileRootRow>(
    `
      SELECT n.id, n.tree_id, n.parent_id, n.node_type, n.name, n.created_by, creator.name AS created_by_name,
             n.created_at, n.updated_at, null AS file_id, null AS file_name, null AS mime_type, null AS file_size,
             null AS preview_kind, null AS width, null AS height
      FROM project_file_nodes n
      LEFT JOIN users creator ON creator.id = n.created_by
      WHERE n.tree_id = $1
        AND n.parent_id IS NULL
        AND n.deleted_at IS NULL
      LIMIT 1
    `,
    [treeId],
  );
  return rows[0] ? projectFileNodeDto(rows[0]) : null;
}

async function listChildren(parentNodeId: string, treeId: string) {
  const { rows } = await pool.query<ProjectFileRow>(
    `
      SELECT n.id, n.parent_id, n.node_type, n.name, n.created_by, creator.name AS created_by_name,
             n.created_at, n.updated_at,
             f.id AS file_id, f.file_name, f.mime_type, f.file_size, f.preview_kind, f.width, f.height
      FROM project_file_nodes n
      LEFT JOIN project_files f ON f.node_id = n.id
      LEFT JOIN users creator ON creator.id = n.created_by
      WHERE n.tree_id = $1
        AND n.parent_id = $2
        AND n.deleted_at IS NULL
      ORDER BY (n.node_type = 'folder') DESC, lower(n.name), n.created_at ASC
    `,
    [treeId, parentNodeId],
  );
  return rows.map(projectFileNodeDto);
}

async function findFolderNode(nodeId: string, input: { projectId: string; treeId: string }) {
  const { rows } = await pool.query<{ id: string }>(
    `
      SELECT id
      FROM project_file_nodes
      WHERE id = $1
        AND tree_id = $2
        AND project_id = $3
        AND node_type = 'folder'
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [nodeId, input.treeId, input.projectId],
  );
  return rows[0] ?? null;
}

async function findNode(nodeId: string, input: { projectId: string; treeId: string }) {
  const { rows } = await pool.query<{ id: string; parent_id: string | null }>(
    `
      SELECT id, parent_id
      FROM project_file_nodes
      WHERE id = $1
        AND tree_id = $2
        AND project_id = $3
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [nodeId, input.treeId, input.projectId],
  );
  return rows[0] ?? null;
}

export async function getProjectFileBootstrap(channelId: string, actor: ChatActor): Promise<ProjectFileBootstrapOutcome> {
  const binding = await getChannelProjectBinding(channelId, actor);
  if (binding.status !== "ok") return binding;
  if (!binding.project) return { status: "ok", binding: null, tree: null };

  const { tree, root } = await ensureProjectFileTree(binding.project, actor);
  return {
    status: "ok",
    binding: { id: binding.project.id, name: binding.project.name },
    tree: {
      children: await listChildren(root.id, tree.id),
      project: binding.project,
      root,
      uploadMaxBytes: env.ORF_INFRA_UPLOAD_MAX_BYTES,
    },
  };
}

export async function listProjectFileChildren(
  input: { channelId: string; parentNodeId: string },
  actor: ChatActor,
): Promise<Outcome<{ children: ProjectFileNode[]; parentNodeId: string }>> {
  const binding = await getChannelProjectBinding(input.channelId, actor);
  if (binding.status !== "ok") return binding;
  if (!binding.project) return { status: "notFound" };
  const { tree } = await ensureProjectFileTree(binding.project, actor);
  const parent = await findFolderNode(input.parentNodeId, { projectId: binding.project.id, treeId: tree.id });
  if (!parent) return { status: "notFound" };
  return ok({
    children: await listChildren(parent.id, tree.id),
    parentNodeId: parent.id,
  });
}

export async function createProjectFolder(
  input: { channelId: string; name: string; parentNodeId: string },
  actor: ChatActor,
): Promise<Outcome<{ node: ProjectFileNode }>> {
  if (!actor.canRead || !actor.canWrite) return { status: "forbidden" };
  const folderName = sanitizeFolderName(input.name);
  if (!folderName) return { status: "invalid" };
  const binding = await getChannelProjectBinding(input.channelId, actor);
  if (binding.status !== "ok") return binding;
  if (!binding.project) return { status: "notFound" };
  const { tree } = await ensureProjectFileTree(binding.project, actor);
  const parent = await findFolderNode(input.parentNodeId, { projectId: binding.project.id, treeId: tree.id });
  if (!parent) return { status: "notFound" };

  const nodeId = makeId("project-file-node");
  const now = nowIso();
  try {
    const { rows } = await pool.query<ProjectFileRow>(
      `
        WITH inserted AS (
          INSERT INTO project_file_nodes (id, tree_id, team_id, project_id, parent_id, node_type, name, created_by, updated_by, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, 'folder', $6, $7, $7, $8, $8)
          RETURNING id, parent_id, node_type, name, created_by, created_at, updated_at
        )
        SELECT inserted.id, inserted.parent_id, inserted.node_type, inserted.name, inserted.created_by, creator.name AS created_by_name,
               inserted.created_at, inserted.updated_at, null AS file_id, null AS file_name, null AS mime_type, null AS file_size,
               null AS preview_kind, null AS width, null AS height
        FROM inserted
        LEFT JOIN users creator ON creator.id = inserted.created_by
      `,
      [nodeId, tree.id, storageTeamId(actor), binding.project.id, parent.id, folderName, actor.id, now],
    );
    const node = rows[0];
    if (!node) return { status: "invalid" };
    return ok({ node: projectFileNodeDto(node) });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "23505") return { status: "conflict" };
    throw error;
  }
}

export async function uploadProjectFile(
  input: { body: Readable; channelId: string; fileName: string; mimeType: string; parentNodeId: string },
  actor: ChatActor,
): Promise<ProjectFileUploadOutcome> {
  if (!actor.canRead || !actor.canWrite) return { status: "forbidden" };
  const fileName = sanitizeProjectFileName(input.fileName);
  if (!fileName) return { status: "invalid" };
  const binding = await getChannelProjectBinding(input.channelId, actor);
  if (binding.status !== "ok") return binding;
  if (!binding.project) return { status: "notFound" };
  const { tree } = await ensureProjectFileTree(binding.project, actor);
  const parent = await findFolderNode(input.parentNodeId, { projectId: binding.project.id, treeId: tree.id });
  if (!parent) return { status: "notFound" };

  const fileId = makeId("project-file");
  const nodeId = makeId("project-file-node");
  const objectKey = `project-files/${safePathSegment(storageTeamId(actor))}/${safePathSegment(binding.project.id)}/${fileId}/${safePathSegment(fileName)}`;
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

  const metadata = storedProjectFileMetadata({ fileName, mimeType: declaredMimeType, peeked: stored.peeked });
  const now = nowIso();
  let persisted = false;
  try {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const { rows } = await client.query<ProjectFileRow>(
        `
          WITH inserted_node AS (
            INSERT INTO project_file_nodes (id, tree_id, team_id, project_id, parent_id, node_type, name, created_by, updated_by, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, 'file', $6, $7, $7, $8, $8)
            RETURNING id, parent_id, node_type, name, created_by, created_at, updated_at
          ),
          inserted_file AS (
            INSERT INTO project_files (id, node_id, tree_id, team_id, project_id, object_key, file_name, mime_type, file_size, preview_kind, width, height, created_by, created_at)
            SELECT $9, inserted_node.id, $2, $3, $4, $10, $11, $12, $13, $14, $15, $16, $7, $8
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
          tree.id,
          storageTeamId(actor),
          binding.project.id,
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
      if (!nodeRow) {
        return { status: "invalid" };
      }
      const node = projectFileNodeDto(nodeRow);
      const announcementMessage = await announceProjectFileUpload(input.channelId, node, actor).catch(() => null);
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

async function announceProjectFileUpload(channelId: string, node: ProjectFileNode, actor: ChatActor) {
  if (!node.file) return null;
  const linkText = escapeMarkdownLinkText(node.file.fileName);
  const outcome = await sendChatMessage({
    attachmentIds: [],
    body: `上传了项目文件：[${linkText}](${node.file.previewUrl ?? node.file.downloadUrl})`,
    channelId,
    parentMessageId: null,
    rootMessageId: null,
  }, actor);
  return outcome.status === "ok" ? outcome.message : null;
}

export async function deleteProjectFileNode(
  input: { channelId: string; nodeId: string },
  actor: ChatActor,
): Promise<Outcome<{ deletedNodeIds: string[] }>> {
  if (!actor.canRead || !actor.canWrite) return { status: "forbidden" };
  const binding = await getChannelProjectBinding(input.channelId, actor);
  if (binding.status !== "ok") return binding;
  if (!binding.project) return { status: "notFound" };
  const { tree } = await ensureProjectFileTree(binding.project, actor);
  const node = await findNode(input.nodeId, { projectId: binding.project.id, treeId: tree.id });
  if (!node || node.parent_id === null) return { status: "notFound" };

  const now = nowIso();
  const { rows } = await pool.query<{ id: string }>(
    `
      WITH RECURSIVE target_nodes AS (
        SELECT id
        FROM project_file_nodes
        WHERE id = $1
          AND tree_id = $2
          AND project_id = $3
          AND deleted_at IS NULL
        UNION ALL
        SELECT child.id
        FROM project_file_nodes child
        INNER JOIN target_nodes parent ON parent.id = child.parent_id
        WHERE child.deleted_at IS NULL
      ),
      updated AS (
        UPDATE project_file_nodes
        SET deleted_at = $4,
            deleted_by = $5,
            updated_at = $4,
            updated_by = $5
        WHERE id IN (SELECT id FROM target_nodes)
        RETURNING id
      )
      SELECT id FROM updated
    `,
    [input.nodeId, tree.id, binding.project.id, now, actor.id],
  );
  return ok({ deletedNodeIds: rows.map((row) => row.id) });
}

export async function getProjectFileContent(
  fileId: string,
  actor: ChatActor,
  options: { disposition?: "attachment" | "inline" } = {},
): Promise<
  | { status: "ok"; body: Readable; contentDisposition: "attachment" | "inline"; contentLength?: number; contentType: string; fileName: string }
  | { status: "forbidden" }
  | { status: "notFound" }
> {
  const { rows } = await pool.query<ProjectFileContentRow>(
    `
      SELECT f.id, f.team_id, f.project_id, f.object_key, f.file_name, f.mime_type, f.file_size, f.preview_kind
      FROM project_files f
      INNER JOIN project_file_nodes n ON n.id = f.node_id
      WHERE f.id = $1
        AND f.team_id = $2
        AND n.deleted_at IS NULL
      LIMIT 1
    `,
    [fileId, storageTeamId(actor)],
  );
  const row = rows[0];
  if (!row) return { status: "notFound" };
  if (!(await actorCanReadProjectFiles(actor, row.project_id))) return { status: "forbidden" };

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
