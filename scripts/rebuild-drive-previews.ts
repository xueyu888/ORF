import "dotenv/config";
import pg from "pg";
import {
  buildDrivePreviewArtifact,
  detectDriveStoredPreviewMetadata,
  DrivePreviewSourceTooLargeError,
} from "../server/drive/drivePreviewService";
import { createPgPoolConfig } from "../server/db/connectionOptions";
import { env } from "../server/env";
import { objectStorage } from "../server/storage/objectStorage";
import { normalizeMimeType, nowIso, safePathSegment } from "../server/repositories/chatRepositoryModel";

type DriveVersionPreviewRow = {
  file_id: string;
  file_name: string;
  mime_type: string;
  object_key: string;
  preview_object_key: string | null;
  team_id: string;
  version_id: string;
  version_number: number;
};

type PreparedPreviewMetadata = {
  height: number | null;
  mimeType: string;
  previewError: string | null;
  previewFileSize: number | null;
  previewGeneratedAt: string | null;
  previewKind: string;
  previewMimeType: string | null;
  previewObjectKey: string | null;
  width: number | null;
};

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL ?? process.env.REMOTE_DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL or REMOTE_DATABASE_URL is required");

const pool = new Pool(createPgPoolConfig(databaseUrl));

async function main() {
  const limit = readLimit();
  const { rows } = await pool.query<DriveVersionPreviewRow>(
    `
      SELECT v.id AS version_id, v.file_id, v.team_id, v.version_number, v.object_key, v.file_name, v.mime_type, v.preview_object_key
      FROM drive_file_versions v
      INNER JOIN drive_files f ON f.id = v.file_id AND f.team_id = v.team_id
      INNER JOIN drive_nodes n ON n.id = f.node_id AND n.team_id = f.team_id
      WHERE n.deleted_at IS NULL
        AND lower(v.file_name) ~ '\\.(txt|log|csv|json|md|markdown|doc|wps)$'
      ORDER BY v.created_at ASC, v.version_number ASC
      LIMIT $1
    `,
    [limit],
  );

  const results: Array<{ fileName: string; previewKind: string; status: "failed" | "ready" | "skipped"; versionId: string }> = [];
  for (const row of rows) {
    const metadata = await preparePreviewMetadata(row);
    await pool.query(
      `
        UPDATE drive_file_versions
        SET mime_type = $3,
            preview_kind = $4,
            preview_object_key = $5,
            preview_mime_type = $6,
            preview_file_size = $7,
            preview_generated_at = $8,
            preview_error = $9,
            width = $10,
            height = $11
        WHERE id = $1 AND team_id = $2
      `,
      [
        row.version_id,
        row.team_id,
        metadata.mimeType,
        metadata.previewKind,
        metadata.previewObjectKey,
        metadata.previewMimeType,
        metadata.previewFileSize,
        metadata.previewGeneratedAt,
        metadata.previewError,
        metadata.width,
        metadata.height,
      ],
    );
    await pool.query(
      `
        UPDATE drive_files f
        SET mime_type = v.mime_type,
            preview_kind = v.preview_kind,
            preview_object_key = v.preview_object_key,
            preview_mime_type = v.preview_mime_type,
            preview_file_size = v.preview_file_size,
            preview_generated_at = v.preview_generated_at,
            preview_error = v.preview_error,
            width = v.width,
            height = v.height
        FROM drive_file_versions v
        WHERE f.id = $1
          AND f.team_id = $2
          AND v.file_id = f.id
          AND v.team_id = f.team_id
          AND v.id = $3
          AND v.version_number = (
            SELECT MAX(latest.version_number)
            FROM drive_file_versions latest
            WHERE latest.file_id = f.id AND latest.team_id = f.team_id
          )
      `,
      [row.file_id, row.team_id, row.version_id],
    );
    if (row.preview_object_key && row.preview_object_key !== metadata.previewObjectKey) {
      await objectStorage.deleteObject(row.preview_object_key).catch(() => undefined);
    }
    results.push({
      fileName: row.file_name,
      previewKind: metadata.previewKind,
      status: metadata.previewError ? "failed" : metadata.previewObjectKey || metadata.previewKind !== "download" ? "ready" : "skipped",
      versionId: row.version_id,
    });
  }
  console.log(JSON.stringify({ processed: results.length, results }, null, 2));
}

async function preparePreviewMetadata(row: DriveVersionPreviewRow): Promise<PreparedPreviewMetadata> {
  let source: Buffer;
  try {
    source = await readObjectBufferForPreview(row.object_key);
  } catch (error) {
    return failedPreviewMetadata(row, drivePreviewBuildErrorMessage(error));
  }
  const metadata = detectDriveStoredPreviewMetadata({
    fileName: row.file_name,
    mimeType: normalizeMimeType(row.mime_type),
    peeked: source.subarray(0, 4096),
  });
  const prepared: PreparedPreviewMetadata = {
    height: metadata.height,
    mimeType: metadata.mimeType,
    previewError: null,
    previewFileSize: null,
    previewGeneratedAt: null,
    previewKind: metadata.previewKind,
    previewMimeType: null,
    previewObjectKey: null,
    width: metadata.width,
  };
  if (!metadata.previewBuildIntent) return prepared;
  const built = await buildDrivePreviewArtifact({ body: source, fileName: row.file_name, metadata });
  if (built.status !== "ok") {
    return {
      ...prepared,
      previewError: built.status === "failed" ? built.error : "未生成预览",
      previewKind: "download",
    };
  }
  const previewObjectKey = `drive-previews/${safePathSegment(row.team_id)}/${safePathSegment(row.file_id)}/${safePathSegment(row.version_id)}/preview.${safePathSegment(built.artifact.extension)}`;
  await objectStorage.putObject({
    body: built.artifact.body,
    contentLength: built.artifact.body.byteLength,
    contentType: built.artifact.mimeType,
    key: previewObjectKey,
  });
  return {
    ...prepared,
    previewFileSize: built.artifact.body.byteLength,
    previewGeneratedAt: nowIso(),
    previewKind: built.artifact.previewKind,
    previewMimeType: built.artifact.mimeType,
    previewObjectKey,
  };
}

function failedPreviewMetadata(row: DriveVersionPreviewRow, previewError: string): PreparedPreviewMetadata {
  return {
    height: null,
    mimeType: normalizeMimeType(row.mime_type),
    previewError,
    previewFileSize: null,
    previewGeneratedAt: null,
    previewKind: "download",
    previewMimeType: null,
    previewObjectKey: null,
    width: null,
  };
}

function drivePreviewBuildErrorMessage(error: unknown) {
  if (error instanceof DrivePreviewSourceTooLargeError) {
    return `文件超过 ${Math.round(error.maxBytes / 1024 / 1024)} MB，未生成预览`;
  }
  return error instanceof Error ? error.message : String(error);
}

async function readObjectBufferForPreview(objectKey: string) {
  const stored = await objectStorage.getObject(objectKey);
  if (!stored) throw new Error(`Drive object not found: ${objectKey}`);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const rawChunk of stored.body) {
    const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk as Uint8Array);
    size += chunk.byteLength;
    if (size > env.ORF_DRIVE_PREVIEW_MAX_BYTES) {
      stored.body.destroy(new DrivePreviewSourceTooLargeError(env.ORF_DRIVE_PREVIEW_MAX_BYTES));
      throw new DrivePreviewSourceTooLargeError(env.ORF_DRIVE_PREVIEW_MAX_BYTES);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

function readLimit() {
  const raw = process.argv.find((arg) => arg.startsWith("--limit="))?.slice("--limit=".length);
  const parsed = raw ? Number(raw) : 500;
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 5000) : 500;
}

main()
  .finally(() => pool.end())
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
