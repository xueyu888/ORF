import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "../db/client";
import {
  mattermostArchiveChannels,
  mattermostArchivePostFiles,
  mattermostArchivePosts,
  mattermostArchiveUsers,
} from "../db/schema";
import { objectStorage, type ObjectStorage, type StoredObject } from "../storage/objectStorage";

export type MattermostArchiveViewerChannel = {
  id: string;
  name: string;
  displayName: string;
  type: string;
  totalMsgCount: number;
  archivedPostCount: number;
  lastPostAt: string | null;
};

export type MattermostArchiveViewerFile = {
  id: string;
  postId: string;
  name: string;
  extension: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  storageStatus: "metadata_only" | "copied" | "skipped_non_image" | "skipped_large" | "copy_failed";
  isImage: boolean;
  contentUrl: string | null;
};

export type MattermostArchiveViewerMessage = {
  id: string;
  channelId: string;
  channelName: string;
  channelDisplayName: string;
  authorId: string | null;
  authorName: string;
  authorUsername: string;
  message: string;
  type: string;
  rootId: string;
  originalId: string;
  replyCount: number;
  createdAt: string | null;
  updatedAt: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  files: MattermostArchiveViewerFile[];
};

export type MattermostArchiveViewerData = {
  channels: MattermostArchiveViewerChannel[];
  messages: MattermostArchiveViewerMessage[];
  query: {
    q: string;
    channelId: string | null;
    includeDeleted: boolean;
    page: number;
    limit: number;
  };
  total: number;
  hasNextPage: boolean;
};

export type MattermostArchiveSearchInput = {
  channelId?: string | null;
  includeDeleted?: boolean;
  limit: number;
  page: number;
  q?: string | null;
};

export type MattermostArchiveFileContentOutcome =
  | ({ status: "ok"; fileName: string } & StoredObject)
  | { status: "notFound" }
  | { status: "notPreviewable" };

const maxSearchTerms = 8;

export function mattermostArchiveSearchTerms(query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  return Array.from(new Set(normalized.split(/\s+/).filter(Boolean))).slice(0, maxSearchTerms);
}

export async function getMattermostArchiveViewerData(input: MattermostArchiveSearchInput): Promise<MattermostArchiveViewerData> {
  const q = input.q?.trim() ?? "";
  const page = Math.max(1, input.page);
  const limit = Math.min(200, Math.max(1, input.limit));
  const includeDeleted = input.includeDeleted ?? true;
  const channelId = input.channelId?.trim() || null;
  const conditions = buildMattermostArchiveMessageConditions({ channelId, includeDeleted, q });
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const offset = (page - 1) * limit;

  const [channels, totalRows] = await Promise.all([
    listMattermostArchiveViewerChannels(),
    countMattermostArchiveMessages(whereClause),
  ]);
  const total = totalRows[0]?.count ?? 0;
  const messageRows = await listMattermostArchiveMessages(whereClause, { limit, offset, q });
  const filesByPostId = await listMattermostArchiveFilesByPostId(messageRows.map((row) => row.id));

  return {
    channels,
    messages: messageRows.map((row) => ({
      id: row.id,
      channelId: row.channelId,
      channelName: row.channelName,
      channelDisplayName: row.channelDisplayName || row.channelName,
      authorId: row.authorId,
      authorName: displayMattermostArchiveAuthor(row),
      authorUsername: row.authorUsername ?? "",
      message: row.deleteAt > 0 ? "" : row.message,
      type: row.type,
      rootId: row.rootId,
      originalId: row.originalId,
      replyCount: row.replyCount,
      createdAt: msToIso(row.createAt),
      updatedAt: msToIso(row.updateAt),
      editedAt: msToIso(row.editAt),
      deletedAt: msToIso(row.deleteAt),
      files: filesByPostId.get(row.id) ?? [],
    })),
    hasNextPage: offset + messageRows.length < total,
    query: {
      q,
      channelId,
      includeDeleted,
      page,
      limit,
    },
    total,
  };
}

export async function getMattermostArchiveFileContent(
  fileId: string,
  storage: Pick<ObjectStorage, "getObject"> = objectStorage,
): Promise<MattermostArchiveFileContentOutcome> {
  const [file] = await db
    .select({
      name: mattermostArchivePostFiles.name,
      mimeType: mattermostArchivePostFiles.mimeType,
      objectKey: mattermostArchivePostFiles.objectKey,
      storageStatus: mattermostArchivePostFiles.storageStatus,
    })
    .from(mattermostArchivePostFiles)
    .where(eq(mattermostArchivePostFiles.id, fileId))
    .limit(1);

  if (!file) {
    return { status: "notFound" };
  }

  if (file.storageStatus !== "copied" || !file.objectKey || !isImageMimeType(file.mimeType)) {
    return { status: "notPreviewable" };
  }

  const stored = await storage.getObject(file.objectKey);
  if (!stored) {
    return { status: "notFound" };
  }

  return {
    status: "ok",
    body: stored.body,
    contentLength: stored.contentLength,
    contentType: stored.contentType ?? file.mimeType,
    fileName: file.name,
  };
}

async function listMattermostArchiveViewerChannels(): Promise<MattermostArchiveViewerChannel[]> {
  const rows = await db
    .select({
      id: mattermostArchiveChannels.id,
      name: mattermostArchiveChannels.name,
      displayName: mattermostArchiveChannels.displayName,
      type: mattermostArchiveChannels.type,
      totalMsgCount: mattermostArchiveChannels.totalMsgCount,
      archivedPostCount: sql<number>`count(${mattermostArchivePosts.id})::int`,
      lastPostAt: mattermostArchiveChannels.lastPostAt,
    })
    .from(mattermostArchiveChannels)
    .leftJoin(mattermostArchivePosts, eq(mattermostArchivePosts.channelId, mattermostArchiveChannels.id))
    .groupBy(mattermostArchiveChannels.id)
    .orderBy(asc(mattermostArchiveChannels.displayName), asc(mattermostArchiveChannels.name));

  return rows.map((row) => ({
    ...row,
    displayName: row.displayName || row.name,
    lastPostAt: msToIso(row.lastPostAt),
  }));
}

function countMattermostArchiveMessages(whereClause: SQL | undefined) {
  const query = db
    .select({ count: sql<number>`count(*)::int` })
    .from(mattermostArchivePosts)
    .innerJoin(mattermostArchiveChannels, eq(mattermostArchivePosts.channelId, mattermostArchiveChannels.id))
    .leftJoin(mattermostArchiveUsers, eq(mattermostArchivePosts.userId, mattermostArchiveUsers.id));

  return whereClause ? query.where(whereClause) : query;
}

function listMattermostArchiveMessages(whereClause: SQL | undefined, input: { limit: number; offset: number; q: string }) {
  const query = db
    .select({
      id: mattermostArchivePosts.id,
      channelId: mattermostArchivePosts.channelId,
      channelName: mattermostArchiveChannels.name,
      channelDisplayName: mattermostArchiveChannels.displayName,
      authorId: mattermostArchivePosts.userId,
      authorUsername: mattermostArchiveUsers.username,
      authorNickname: mattermostArchiveUsers.nickname,
      authorFirstName: mattermostArchiveUsers.firstName,
      authorLastName: mattermostArchiveUsers.lastName,
      message: mattermostArchivePosts.message,
      type: mattermostArchivePosts.type,
      rootId: mattermostArchivePosts.rootId,
      originalId: mattermostArchivePosts.originalId,
      replyCount: mattermostArchivePosts.replyCount,
      createAt: mattermostArchivePosts.createAt,
      updateAt: mattermostArchivePosts.updateAt,
      editAt: mattermostArchivePosts.editAt,
      deleteAt: mattermostArchivePosts.deleteAt,
    })
    .from(mattermostArchivePosts)
    .innerJoin(mattermostArchiveChannels, eq(mattermostArchivePosts.channelId, mattermostArchiveChannels.id))
    .leftJoin(mattermostArchiveUsers, eq(mattermostArchivePosts.userId, mattermostArchiveUsers.id));

  const filtered = whereClause ? query.where(whereClause) : query;
  const q = input.q.trim();
  if (q) {
    return filtered
      .orderBy(desc(searchRank(q)), desc(mattermostArchivePosts.createAt), desc(mattermostArchivePosts.id))
      .limit(input.limit)
      .offset(input.offset);
  }

  return filtered
    .orderBy(desc(mattermostArchivePosts.createAt), desc(mattermostArchivePosts.id))
    .limit(input.limit)
    .offset(input.offset);
}

async function listMattermostArchiveFilesByPostId(postIds: string[]) {
  const filesByPostId = new Map<string, MattermostArchiveViewerFile[]>();
  if (postIds.length === 0) {
    return filesByPostId;
  }

  const rows = await db
    .select({
      id: mattermostArchivePostFiles.id,
      postId: mattermostArchivePostFiles.postId,
      name: mattermostArchivePostFiles.name,
      extension: mattermostArchivePostFiles.extension,
      mimeType: mattermostArchivePostFiles.mimeType,
      size: mattermostArchivePostFiles.size,
      width: mattermostArchivePostFiles.width,
      height: mattermostArchivePostFiles.height,
      storageStatus: mattermostArchivePostFiles.storageStatus,
      objectKey: mattermostArchivePostFiles.objectKey,
    })
    .from(mattermostArchivePostFiles)
    .where(inArray(mattermostArchivePostFiles.postId, postIds))
    .orderBy(asc(mattermostArchivePostFiles.postId), asc(mattermostArchivePostFiles.createAt), asc(mattermostArchivePostFiles.name));

  for (const row of rows) {
    const isImage = isImageMimeType(row.mimeType);
    const contentUrl = isImage && row.storageStatus === "copied" && row.objectKey
      ? `/api/mattermost-archive/files/${encodeURIComponent(row.id)}/content`
      : null;
    const file: MattermostArchiveViewerFile = {
      id: row.id,
      postId: row.postId,
      name: row.name,
      extension: row.extension,
      mimeType: row.mimeType,
      size: row.size,
      width: row.width,
      height: row.height,
      storageStatus: row.storageStatus,
      isImage,
      contentUrl,
    };
    filesByPostId.set(row.postId, [...(filesByPostId.get(row.postId) ?? []), file]);
  }

  return filesByPostId;
}

function buildMattermostArchiveMessageConditions(input: { channelId: string | null; includeDeleted: boolean; q: string }) {
  const conditions: SQL[] = [];
  if (input.channelId) {
    conditions.push(eq(mattermostArchivePosts.channelId, input.channelId));
  }
  if (!input.includeDeleted) {
    conditions.push(eq(mattermostArchivePosts.deleteAt, 0));
  }

  const termConditions = mattermostArchiveSearchTerms(input.q).map((term) => searchCondition(term));
  if (termConditions.length > 0) {
    conditions.push(and(...termConditions) as SQL);
  }

  return conditions;
}

function searchCondition(term: string) {
  const pattern = `%${escapeLike(term)}%`;
  const searchableText = sql<string>`lower(concat_ws(' ', ${mattermostArchivePosts.message}, ${mattermostArchivePosts.hashtags}, ${mattermostArchiveChannels.displayName}, ${mattermostArchiveChannels.name}, ${mattermostArchiveUsers.username}, ${mattermostArchiveUsers.nickname}, ${mattermostArchiveUsers.firstName}, ${mattermostArchiveUsers.lastName}))`;
  return sql`
    (
      ${searchableText} like ${pattern} escape '\\'
      or exists (
        select 1
        from mattermost_archive_post_files search_files
        where search_files.post_id = ${mattermostArchivePosts.id}
          and lower(search_files.name) like ${pattern} escape '\\'
      )
    )
  `;
}

function searchRank(query: string) {
  const pattern = `%${escapeLike(query.trim().toLowerCase())}%`;
  return sql<number>`
    case
      when lower(${mattermostArchivePosts.message}) like ${pattern} escape '\\' then 4
      when lower(${mattermostArchiveChannels.displayName}) like ${pattern} escape '\\' then 3
      when lower(coalesce(${mattermostArchiveUsers.nickname}, '')) like ${pattern} escape '\\' then 2
      when lower(coalesce(${mattermostArchiveUsers.username}, '')) like ${pattern} escape '\\' then 2
      else 1
    end
  `;
}

function displayMattermostArchiveAuthor(input: {
  authorFirstName: string | null;
  authorId: string | null;
  authorLastName: string | null;
  authorNickname: string | null;
  authorUsername: string | null;
}) {
  const fullName = [input.authorFirstName, input.authorLastName].filter(Boolean).join(" ").trim();
  return input.authorNickname || fullName || input.authorUsername || input.authorId || "未知用户";
}

function msToIso(value: number) {
  return value > 0 ? new Date(value).toISOString() : null;
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function isImageMimeType(mimeType: string) {
  return mimeType.toLowerCase().startsWith("image/");
}
