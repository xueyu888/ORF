import type { FastifyInstance } from "fastify";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client";
import {
  mattermostArchiveChannels,
  mattermostArchivePostFiles,
  mattermostArchivePosts,
  mattermostArchiveSyncCursors,
  mattermostArchiveUsers,
} from "../../db/schema";
import { objectStorage, type ObjectStorage } from "../../storage/objectStorage";
import {
  hasMattermostLoginConfig,
  MattermostClient,
  type MattermostChannel,
  type MattermostFileInfo,
  type MattermostPost,
  type MattermostPostList,
  type MattermostUser,
} from "../mattermost";

const optionalNonEmptyString = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed || undefined;
  })
  .pipe(z.string().min(1).optional());
const booleanEnvSchema = z.enum(["true", "false"]).default("false").transform((value) => value === "true");
const defaultTrueBooleanEnvSchema = z.enum(["true", "false"]).default("true").transform((value) => value === "true");

const archiveConfigSchema = z
  .object({
    MATTERMOST_URL: z.string().url().optional(),
    MATTERMOST_ACCESS_TOKEN: optionalNonEmptyString,
    MATTERMOST_LOGIN_ID: optionalNonEmptyString,
    MATTERMOST_PASSWORD: optionalNonEmptyString,
    MATTERMOST_ARCHIVE_ENABLED: booleanEnvSchema,
    MATTERMOST_ARCHIVE_ACCESS_TOKEN: optionalNonEmptyString,
    MATTERMOST_ARCHIVE_LOGIN_ID: optionalNonEmptyString,
    MATTERMOST_ARCHIVE_PASSWORD: optionalNonEmptyString,
    MATTERMOST_ARCHIVE_CHANNEL_IDS: optionalNonEmptyString,
    MATTERMOST_ARCHIVE_CHANNEL_NAME_PREFIX: optionalNonEmptyString,
    MATTERMOST_ARCHIVE_CHANNEL_LIMIT: z.coerce.number().int().nonnegative().default(0),
    MATTERMOST_ARCHIVE_POSTS_PER_PAGE: z.coerce.number().int().min(1).max(200).default(60),
    MATTERMOST_ARCHIVE_HISTORY_PAGES_PER_RUN: z.coerce.number().int().min(0).max(100).optional(),
    MATTERMOST_ARCHIVE_BACKFILL_PAGE_LIMIT: z.coerce.number().int().min(0).max(100).optional(),
    MATTERMOST_ARCHIVE_INTERVAL_SECONDS: z.coerce.number().int().min(30).optional(),
    MATTERMOST_ARCHIVE_SYNC_INTERVAL_SECONDS: z.coerce.number().int().min(30).optional(),
    MATTERMOST_ARCHIVE_INCLUDE_DELETED: defaultTrueBooleanEnvSchema,
    MATTERMOST_ARCHIVE_SYNC_FILES: defaultTrueBooleanEnvSchema,
    MATTERMOST_ARCHIVE_COPY_IMAGES: defaultTrueBooleanEnvSchema,
    MATTERMOST_ARCHIVE_IMAGE_MAX_BYTES: z.coerce.number().int().positive().optional(),
    MATTERMOST_ARCHIVE_MAX_IMAGE_BYTES: z.coerce.number().int().positive().optional(),
    OBJECT_STORAGE_UPLOAD_MAX_BYTES: z.coerce.number().int().positive().optional(),
  })
  .transform((value) => ({
    MATTERMOST_URL: value.MATTERMOST_URL,
    MATTERMOST_ACCESS_TOKEN: value.MATTERMOST_ARCHIVE_ACCESS_TOKEN ?? value.MATTERMOST_ACCESS_TOKEN,
    MATTERMOST_LOGIN_ID: value.MATTERMOST_ARCHIVE_LOGIN_ID ?? value.MATTERMOST_LOGIN_ID,
    MATTERMOST_PASSWORD: value.MATTERMOST_ARCHIVE_PASSWORD ?? value.MATTERMOST_PASSWORD,
    enabled: value.MATTERMOST_ARCHIVE_ENABLED,
    channelIds: parseCsv(value.MATTERMOST_ARCHIVE_CHANNEL_IDS),
    channelNamePrefix: value.MATTERMOST_ARCHIVE_CHANNEL_NAME_PREFIX,
    channelLimit: value.MATTERMOST_ARCHIVE_CHANNEL_LIMIT,
    postsPerPage: value.MATTERMOST_ARCHIVE_POSTS_PER_PAGE,
    historyPagesPerRun: value.MATTERMOST_ARCHIVE_HISTORY_PAGES_PER_RUN ?? value.MATTERMOST_ARCHIVE_BACKFILL_PAGE_LIMIT ?? 1,
    intervalSeconds: value.MATTERMOST_ARCHIVE_INTERVAL_SECONDS ?? value.MATTERMOST_ARCHIVE_SYNC_INTERVAL_SECONDS ?? 300,
    includeDeleted: value.MATTERMOST_ARCHIVE_INCLUDE_DELETED,
    syncFileMetadata: value.MATTERMOST_ARCHIVE_SYNC_FILES,
    copyImages: value.MATTERMOST_ARCHIVE_COPY_IMAGES,
    imageMaxBytes: value.MATTERMOST_ARCHIVE_IMAGE_MAX_BYTES ?? value.MATTERMOST_ARCHIVE_MAX_IMAGE_BYTES ?? value.OBJECT_STORAGE_UPLOAD_MAX_BYTES ?? 10 * 1024 * 1024,
  }));

export type MattermostArchiveConfig = z.infer<typeof archiveConfigSchema>;
export type MattermostArchiveFileStorageStatus =
  | "metadata_only"
  | "copied"
  | "skipped_non_image"
  | "skipped_large"
  | "copy_failed";

export type MattermostArchiveCursor = {
  channelId: string;
  historyBeforePostId: string | null;
  historyExhausted: boolean;
  lastSyncedUpdateAt: number;
  syncedPostCount: number;
};

export type MattermostArchiveChannelRecord = {
  id: string;
  mattermostTeamId: string | null;
  name: string;
  displayName: string;
  type: string;
  header: string;
  purpose: string;
  deleteAt: number;
  lastPostAt: number;
  totalMsgCount: number;
  totalMsgCountRoot: number;
  raw: Record<string, unknown>;
  discoveredAt: string;
  syncedAt: string;
};

export type MattermostArchiveUserRecord = {
  id: string;
  username: string;
  nickname: string;
  firstName: string;
  lastName: string;
  deleteAt: number;
  isBot: boolean;
  raw: Record<string, unknown>;
  syncedAt: string;
};

export type MattermostArchivePostRecord = {
  id: string;
  channelId: string;
  userId: string | null;
  rootId: string;
  originalId: string;
  type: string;
  message: string;
  hashtags: string;
  props: Record<string, unknown>;
  metadata: Record<string, unknown>;
  fileIds: string[];
  createAt: number;
  updateAt: number;
  editAt: number;
  deleteAt: number;
  replyCount: number;
  lastReplyAt: number;
  archivedAt: string;
};

export type MattermostArchiveFileRecord = {
  id: string;
  postId: string;
  channelId: string;
  userId: string | null;
  name: string;
  extension: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  hasPreviewImage: boolean;
  createAt: number;
  updateAt: number;
  deleteAt: number;
  storageStatus: MattermostArchiveFileStorageStatus;
  objectKey: string | null;
  copiedAt: string | null;
  raw: Record<string, unknown>;
  syncedAt: string;
};

export type MattermostArchiveClient = {
  getMyChannels(): Promise<MattermostChannel[]>;
  getPostsForChannel(
    channelId: string,
    options?: { page?: number; perPage?: number; since?: number; before?: string; after?: string; includeDeleted?: boolean },
  ): Promise<MattermostPostList>;
  getUsersByIds(userIds: string[]): Promise<MattermostUser[]>;
  getFile(fileId: string): Promise<{ body: Buffer; contentLength?: number; contentType?: string }>;
};

export type MattermostArchiveRepository = {
  upsertChannels(channels: MattermostArchiveChannelRecord[]): Promise<void>;
  upsertUsers(users: MattermostArchiveUserRecord[]): Promise<void>;
  upsertPosts(posts: MattermostArchivePostRecord[]): Promise<void>;
  upsertFiles(files: MattermostArchiveFileRecord[]): Promise<void>;
  getCursor(channelId: string): Promise<MattermostArchiveCursor | null>;
  getFileStorage(fileId: string): Promise<{ storageStatus: MattermostArchiveFileStorageStatus; objectKey: string | null } | null>;
  markChannelSyncStarted(channelId: string, startedAt: string): Promise<void>;
  completeChannelSync(input: {
    channelId: string;
    historyBeforePostId: string | null;
    historyExhausted: boolean;
    lastSyncedUpdateAt: number;
    syncedPostCountDelta: number;
    completedAt: string;
  }): Promise<void>;
  failChannelSync(channelId: string, error: string): Promise<void>;
};

export type MattermostArchiveRunResult = {
  channelsDiscovered: number;
  channelsSelected: number;
  channelsSynced: number;
  postsUpserted: number;
  filesUpserted: number;
  imagesCopied: number;
  imageCopyFailures: number;
};

export function readMattermostArchiveConfig(env: NodeJS.ProcessEnv = process.env) {
  return archiveConfigSchema.parse(env);
}

export function mattermostArchiveConfigured(config: MattermostArchiveConfig) {
  return Boolean(config.enabled && hasMattermostLoginConfig(config));
}

export function selectMattermostArchiveChannels(
  channels: MattermostChannel[],
  config: Pick<MattermostArchiveConfig, "channelIds" | "channelNamePrefix" | "channelLimit">,
) {
  const channelIds = new Set(config.channelIds);
  const prefix = config.channelNamePrefix?.toLocaleLowerCase();
  const selected = channels
    .filter((channel) => channel.type === "O" || channel.type === "P")
    .filter((channel) => (channel.delete_at ?? 0) === 0)
    .filter((channel) => {
      if (channelIds.size > 0) {
        return channelIds.has(channel.id);
      }
      if (!prefix) {
        return true;
      }
      const displayName = (channel.display_name ?? "").toLocaleLowerCase();
      const name = (channel.name ?? "").toLocaleLowerCase();
      return displayName.startsWith(prefix) || name.startsWith(prefix);
    })
    .sort((left, right) => channelSortName(left).localeCompare(channelSortName(right)));

  return config.channelLimit > 0 ? selected.slice(0, config.channelLimit) : selected;
}

export function shouldCopyMattermostArchiveFile(file: Pick<MattermostFileInfo, "mime_type" | "size">, config: Pick<MattermostArchiveConfig, "copyImages" | "imageMaxBytes">) {
  if (!config.copyImages) {
    return { copy: false, status: "metadata_only" as const };
  }

  if (!isImageMime(file.mime_type)) {
    return { copy: false, status: "skipped_non_image" as const };
  }

  if ((file.size ?? 0) > config.imageMaxBytes) {
    return { copy: false, status: "skipped_large" as const };
  }

  return { copy: true, status: "copied" as const };
}

export async function runMattermostArchiveSync(input: {
  client: MattermostArchiveClient;
  repository: MattermostArchiveRepository;
  config: MattermostArchiveConfig;
  storage?: Pick<ObjectStorage, "putObject">;
  now?: () => Date;
}): Promise<MattermostArchiveRunResult> {
  const now = input.now ?? (() => new Date());
  const result: MattermostArchiveRunResult = {
    channelsDiscovered: 0,
    channelsSelected: 0,
    channelsSynced: 0,
    postsUpserted: 0,
    filesUpserted: 0,
    imagesCopied: 0,
    imageCopyFailures: 0,
  };
  const channels = await input.client.getMyChannels();
  const selectedChannels = selectMattermostArchiveChannels(channels, input.config);
  const discoveredAt = now().toISOString();

  result.channelsDiscovered = channels.length;
  result.channelsSelected = selectedChannels.length;
  await input.repository.upsertChannels(selectedChannels.map((channel) => toChannelRecord(channel, discoveredAt)));

  for (const channel of selectedChannels) {
    const channelId = channel.id;
    const startedAt = now().toISOString();
    await input.repository.markChannelSyncStarted(channelId, startedAt);

    try {
      const channelResult = await syncMattermostArchiveChannel({
        channel,
        client: input.client,
        repository: input.repository,
        config: input.config,
        storage: input.storage,
        now,
      });
      result.channelsSynced += 1;
      result.postsUpserted += channelResult.postsUpserted;
      result.filesUpserted += channelResult.filesUpserted;
      result.imagesCopied += channelResult.imagesCopied;
      result.imageCopyFailures += channelResult.imageCopyFailures;
    } catch (error) {
      await input.repository.failChannelSync(channelId, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  return result;
}

export class DrizzleMattermostArchiveRepository implements MattermostArchiveRepository {
  async upsertChannels(channels: MattermostArchiveChannelRecord[]) {
    if (channels.length === 0) return;

    await db
      .insert(mattermostArchiveChannels)
      .values(channels)
      .onConflictDoUpdate({
        target: mattermostArchiveChannels.id,
        set: {
          mattermostTeamId: sql`excluded.mattermost_team_id`,
          name: sql`excluded.name`,
          displayName: sql`excluded.display_name`,
          type: sql`excluded.type`,
          header: sql`excluded.header`,
          purpose: sql`excluded.purpose`,
          deleteAt: sql`excluded.delete_at`,
          lastPostAt: sql`excluded.last_post_at`,
          totalMsgCount: sql`excluded.total_msg_count`,
          totalMsgCountRoot: sql`excluded.total_msg_count_root`,
          raw: sql`excluded.raw`,
          syncedAt: sql`excluded.synced_at`,
        },
      });
  }

  async upsertUsers(users: MattermostArchiveUserRecord[]) {
    if (users.length === 0) return;

    await db
      .insert(mattermostArchiveUsers)
      .values(users)
      .onConflictDoUpdate({
        target: mattermostArchiveUsers.id,
        set: {
          username: sql`excluded.username`,
          nickname: sql`excluded.nickname`,
          firstName: sql`excluded.first_name`,
          lastName: sql`excluded.last_name`,
          deleteAt: sql`excluded.delete_at`,
          isBot: sql`excluded.is_bot`,
          raw: sql`excluded.raw`,
          syncedAt: sql`excluded.synced_at`,
        },
      });
  }

  async upsertPosts(posts: MattermostArchivePostRecord[]) {
    if (posts.length === 0) return;

    await db
      .insert(mattermostArchivePosts)
      .values(posts)
      .onConflictDoUpdate({
        target: mattermostArchivePosts.id,
        set: {
          channelId: sql`excluded.channel_id`,
          userId: sql`excluded.user_id`,
          rootId: sql`excluded.root_id`,
          originalId: sql`excluded.original_id`,
          type: sql`excluded.type`,
          message: sql`excluded.message`,
          hashtags: sql`excluded.hashtags`,
          props: sql`excluded.props`,
          metadata: sql`excluded.metadata`,
          fileIds: sql`excluded.file_ids`,
          createAt: sql`excluded.create_at`,
          updateAt: sql`excluded.update_at`,
          editAt: sql`excluded.edit_at`,
          deleteAt: sql`excluded.delete_at`,
          replyCount: sql`excluded.reply_count`,
          lastReplyAt: sql`excluded.last_reply_at`,
          archivedAt: sql`excluded.archived_at`,
        },
      });
  }

  async upsertFiles(files: MattermostArchiveFileRecord[]) {
    if (files.length === 0) return;

    await db
      .insert(mattermostArchivePostFiles)
      .values(files)
      .onConflictDoUpdate({
        target: mattermostArchivePostFiles.id,
        set: {
          postId: sql`excluded.post_id`,
          channelId: sql`excluded.channel_id`,
          userId: sql`excluded.user_id`,
          name: sql`excluded.name`,
          extension: sql`excluded.extension`,
          mimeType: sql`excluded.mime_type`,
          size: sql`excluded.size`,
          width: sql`excluded.width`,
          height: sql`excluded.height`,
          hasPreviewImage: sql`excluded.has_preview_image`,
          createAt: sql`excluded.create_at`,
          updateAt: sql`excluded.update_at`,
          deleteAt: sql`excluded.delete_at`,
          storageStatus: sql`excluded.storage_status`,
          objectKey: sql`coalesce(excluded.object_key, ${mattermostArchivePostFiles.objectKey})`,
          copiedAt: sql`coalesce(excluded.copied_at, ${mattermostArchivePostFiles.copiedAt})`,
          raw: sql`excluded.raw`,
          syncedAt: sql`excluded.synced_at`,
        },
      });
  }

  async getCursor(channelId: string) {
    const [row] = await db.select().from(mattermostArchiveSyncCursors).where(eq(mattermostArchiveSyncCursors.channelId, channelId)).limit(1);
    return row ?? null;
  }

  async getFileStorage(fileId: string) {
    const [row] = await db
      .select({
        storageStatus: mattermostArchivePostFiles.storageStatus,
        objectKey: mattermostArchivePostFiles.objectKey,
      })
      .from(mattermostArchivePostFiles)
      .where(eq(mattermostArchivePostFiles.id, fileId))
      .limit(1);

    return row ?? null;
  }

  async markChannelSyncStarted(channelId: string, startedAt: string) {
    await db
      .insert(mattermostArchiveSyncCursors)
      .values({ channelId, lastStartedAt: startedAt, lastError: null })
      .onConflictDoUpdate({
        target: mattermostArchiveSyncCursors.channelId,
        set: {
          lastStartedAt: sql`excluded.last_started_at`,
          lastError: null,
        },
      });
  }

  async completeChannelSync(input: {
    channelId: string;
    historyBeforePostId: string | null;
    historyExhausted: boolean;
    lastSyncedUpdateAt: number;
    syncedPostCountDelta: number;
    completedAt: string;
  }) {
    await db
      .insert(mattermostArchiveSyncCursors)
      .values({
        channelId: input.channelId,
        historyBeforePostId: input.historyBeforePostId,
        historyExhausted: input.historyExhausted,
        lastSyncedUpdateAt: input.lastSyncedUpdateAt,
        syncedPostCount: input.syncedPostCountDelta,
        lastCompletedAt: input.completedAt,
        lastError: null,
      })
      .onConflictDoUpdate({
        target: mattermostArchiveSyncCursors.channelId,
        set: {
          historyBeforePostId: input.historyBeforePostId,
          historyExhausted: input.historyExhausted,
          lastSyncedUpdateAt: sql`greatest(${mattermostArchiveSyncCursors.lastSyncedUpdateAt}, excluded.last_synced_update_at)`,
          syncedPostCount: sql`${mattermostArchiveSyncCursors.syncedPostCount} + ${input.syncedPostCountDelta}`,
          lastCompletedAt: input.completedAt,
          lastError: null,
        },
      });
  }

  async failChannelSync(channelId: string, error: string) {
    await db
      .update(mattermostArchiveSyncCursors)
      .set({ lastError: error.slice(0, 1000) })
      .where(eq(mattermostArchiveSyncCursors.channelId, channelId));
  }
}

export function registerMattermostArchive(app: FastifyInstance) {
  const config = readMattermostArchiveConfig();

  if (!mattermostArchiveConfigured(config)) {
    const logPayload = {
      enabled: config.enabled,
      mattermostConfigured: hasMattermostLoginConfig(config),
      channelNamePrefix: config.channelNamePrefix,
      channelLimit: config.channelLimit,
    };

    if (config.enabled) {
      app.log.warn(logPayload, "Mattermost archive is enabled but not fully configured");
    } else {
      app.log.info(logPayload, "Mattermost archive disabled");
    }
    return;
  }

  let running = false;
  const run = async () => {
    if (running) {
      return;
    }

    running = true;
    try {
      const result = await runMattermostArchiveSync({
        client: new MattermostClient(config),
        repository: new DrizzleMattermostArchiveRepository(),
        config,
        storage: config.copyImages ? objectStorage : undefined,
      });
      app.log.info(result, "Mattermost archive sync completed");
    } catch (error) {
      app.log.error(error, "Mattermost archive sync failed");
    } finally {
      running = false;
    }
  };

  void run();
  const interval = setInterval(run, config.intervalSeconds * 1000);
  app.addHook("onClose", async () => {
    clearInterval(interval);
  });
}

async function syncMattermostArchiveChannel(input: {
  channel: MattermostChannel;
  client: MattermostArchiveClient;
  repository: MattermostArchiveRepository;
  config: MattermostArchiveConfig;
  storage?: Pick<ObjectStorage, "putObject">;
  now: () => Date;
}) {
  const cursor = await input.repository.getCursor(input.channel.id);
  const result = { postsUpserted: 0, filesUpserted: 0, imagesCopied: 0, imageCopyFailures: 0 };
  let nextHistoryBeforePostId = cursor?.historyBeforePostId ?? null;
  let historyExhausted = cursor?.historyExhausted ?? false;
  let lastSyncedUpdateAt = cursor?.lastSyncedUpdateAt ?? 0;

  if (lastSyncedUpdateAt > 0) {
      const recentPosts = await input.client.getPostsForChannel(input.channel.id, {
        since: Math.max(1, lastSyncedUpdateAt - 1),
        includeDeleted: input.config.includeDeleted,
      });
    const recentResult = await persistMattermostPostList({ ...input, postList: recentPosts });
    result.postsUpserted += recentResult.postsUpserted;
    result.filesUpserted += recentResult.filesUpserted;
    result.imagesCopied += recentResult.imagesCopied;
    result.imageCopyFailures += recentResult.imageCopyFailures;
    lastSyncedUpdateAt = Math.max(lastSyncedUpdateAt, recentResult.maxUpdateAt);
  }

  for (let page = 0; page < input.config.historyPagesPerRun && !historyExhausted; page += 1) {
    const postList = await input.client.getPostsForChannel(input.channel.id, {
      perPage: input.config.postsPerPage,
      before: nextHistoryBeforePostId ?? undefined,
      includeDeleted: input.config.includeDeleted,
    });
    const pageResult = await persistMattermostPostList({ ...input, postList });
    result.postsUpserted += pageResult.postsUpserted;
    result.filesUpserted += pageResult.filesUpserted;
    result.imagesCopied += pageResult.imagesCopied;
    result.imageCopyFailures += pageResult.imageCopyFailures;
    lastSyncedUpdateAt = Math.max(lastSyncedUpdateAt, pageResult.maxUpdateAt);

    if (postList.order.length === 0 || postList.order.length < input.config.postsPerPage) {
      historyExhausted = true;
    }

    nextHistoryBeforePostId = postList.order.at(-1) ?? nextHistoryBeforePostId;
  }

  await input.repository.completeChannelSync({
    channelId: input.channel.id,
    historyBeforePostId: nextHistoryBeforePostId,
    historyExhausted,
    lastSyncedUpdateAt,
    syncedPostCountDelta: result.postsUpserted,
    completedAt: input.now().toISOString(),
  });

  return result;
}

async function persistMattermostPostList(input: {
  channel: MattermostChannel;
  client: MattermostArchiveClient;
  repository: MattermostArchiveRepository;
  config: MattermostArchiveConfig;
  storage?: Pick<ObjectStorage, "putObject">;
  now: () => Date;
  postList: MattermostPostList;
}) {
  const posts = input.postList.order.flatMap((postId) => {
    const post = input.postList.posts[postId];
    return post ? [post] : [];
  });
  const files = input.config.syncFileMetadata ? posts.flatMap((post) => post.metadata?.files ?? []) : [];
  const userIds = uniqueNonEmpty([
    ...posts.map((post) => post.user_id),
    ...files.map((file) => file.user_id),
  ]);
  const nowIso = input.now().toISOString();
  const users = userIds.length > 0 ? await input.client.getUsersByIds(userIds) : [];
  const returnedUserIds = new Set(users.map((user) => user.id));
  const userRecords = [
    ...users.map((user) => toUserRecord(user, nowIso)),
    ...userIds.filter((userId) => !returnedUserIds.has(userId)).map((userId) => toUserRecord({ id: userId }, nowIso)),
  ];
  await input.repository.upsertUsers(userRecords);
  await input.repository.upsertPosts(posts.map((post) => toPostRecord(post, nowIso)));

  const fileRecords: MattermostArchiveFileRecord[] = [];
  let imagesCopied = 0;
  let imageCopyFailures = 0;
  for (const post of posts) {
    for (const file of input.config.syncFileMetadata ? post.metadata?.files ?? [] : []) {
      const existing = await input.repository.getFileStorage(file.id);
      const copyDecision = shouldCopyMattermostArchiveFile(file, input.config);
      let storageStatus: MattermostArchiveFileStorageStatus = copyDecision.status;
      let objectKey = existing?.objectKey ?? null;
      let copiedAt: string | null = null;

      if (existing?.storageStatus === "copied" && existing.objectKey) {
        storageStatus = "copied";
        objectKey = existing.objectKey;
      } else if (copyDecision.copy && input.storage) {
        objectKey = mattermostArchiveObjectKey(input.channel.id, post.id, file);
        try {
          const downloaded = await input.client.getFile(file.id);
          await input.storage.putObject({
            key: objectKey,
            body: downloaded.body,
            contentLength: downloaded.contentLength ?? downloaded.body.byteLength,
            contentType: downloaded.contentType ?? file.mime_type ?? "application/octet-stream",
          });
          storageStatus = "copied";
          copiedAt = input.now().toISOString();
          imagesCopied += 1;
        } catch {
          storageStatus = "copy_failed";
          objectKey = null;
          imageCopyFailures += 1;
        }
      } else if (copyDecision.copy) {
        storageStatus = "copy_failed";
        objectKey = null;
        imageCopyFailures += 1;
      }

      fileRecords.push(toFileRecord({ file, post, storageStatus, objectKey, copiedAt, syncedAt: input.now().toISOString() }));
    }
  }

  await input.repository.upsertFiles(fileRecords);

  return {
    postsUpserted: posts.length,
    filesUpserted: fileRecords.length,
    imagesCopied,
    imageCopyFailures,
    maxUpdateAt: Math.max(0, ...posts.map((post) => post.update_at ?? post.create_at ?? 0)),
  };
}

function toChannelRecord(channel: MattermostChannel, nowIso: string): MattermostArchiveChannelRecord {
  return {
    id: channel.id,
    mattermostTeamId: channel.team_id ?? null,
    name: channel.name ?? "",
    displayName: channel.display_name ?? channel.name ?? "",
    type: channel.type ?? "",
    header: channel.header ?? "",
    purpose: channel.purpose ?? "",
    deleteAt: channel.delete_at ?? 0,
    lastPostAt: channel.last_post_at ?? 0,
    totalMsgCount: channel.total_msg_count ?? 0,
    totalMsgCountRoot: channel.total_msg_count_root ?? 0,
    raw: channel as unknown as Record<string, unknown>,
    discoveredAt: nowIso,
    syncedAt: nowIso,
  };
}

function toUserRecord(user: MattermostUser, nowIso: string): MattermostArchiveUserRecord {
  return {
    id: user.id,
    username: user.username ?? "",
    nickname: user.nickname ?? "",
    firstName: user.first_name ?? "",
    lastName: user.last_name ?? "",
    deleteAt: user.delete_at ?? 0,
    isBot: user.is_bot ?? false,
    raw: user as unknown as Record<string, unknown>,
    syncedAt: nowIso,
  };
}

function toPostRecord(post: MattermostPost, nowIso: string): MattermostArchivePostRecord {
  return {
    id: post.id,
    channelId: post.channel_id,
    userId: post.user_id || null,
    rootId: post.root_id ?? "",
    originalId: post.original_id ?? "",
    type: post.type ?? "",
    message: (post.delete_at ?? 0) > 0 ? "" : post.message ?? "",
    hashtags: post.hashtags ?? "",
    props: post.props ?? {},
    metadata: post.metadata ?? {},
    fileIds: post.file_ids ?? [],
    createAt: post.create_at ?? 0,
    updateAt: post.update_at ?? post.create_at ?? 0,
    editAt: post.edit_at ?? 0,
    deleteAt: post.delete_at ?? 0,
    replyCount: post.reply_count ?? 0,
    lastReplyAt: post.last_reply_at ?? 0,
    archivedAt: nowIso,
  };
}

function toFileRecord(input: {
  file: MattermostFileInfo;
  post: MattermostPost;
  storageStatus: MattermostArchiveFileStorageStatus;
  objectKey: string | null;
  copiedAt: string | null;
  syncedAt: string;
}): MattermostArchiveFileRecord {
  return {
    id: input.file.id,
    postId: input.post.id,
    channelId: input.post.channel_id,
    userId: input.file.user_id || input.post.user_id || null,
    name: input.file.name ?? "",
    extension: input.file.extension ?? "",
    mimeType: input.file.mime_type ?? "",
    size: input.file.size ?? 0,
    width: input.file.width ?? null,
    height: input.file.height ?? null,
    hasPreviewImage: input.file.has_preview_image ?? false,
    createAt: input.file.create_at ?? 0,
    updateAt: input.file.update_at ?? input.file.create_at ?? 0,
    deleteAt: input.file.delete_at ?? 0,
    storageStatus: input.storageStatus,
    objectKey: input.objectKey,
    copiedAt: input.copiedAt,
    raw: input.file as unknown as Record<string, unknown>,
    syncedAt: input.syncedAt,
  };
}

function mattermostArchiveObjectKey(channelId: string, postId: string, file: MattermostFileInfo) {
  const extension = safeExtension(file.extension || file.name?.split(".").pop() || "img");
  return `mattermost/${safeObjectPathSegment(channelId)}/${safeObjectPathSegment(postId)}/${safeObjectPathSegment(file.id)}.${extension}`;
}

function safeObjectPathSegment(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, "_");
}

function safeExtension(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalized || "img";
}

function isImageMime(value: string | undefined) {
  return value?.toLowerCase().startsWith("image/") ?? false;
}

function channelSortName(channel: MattermostChannel) {
  return channel.display_name || channel.name || channel.id;
}

function uniqueNonEmpty(values: Array<string | undefined | null>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function parseCsv(value: string | undefined) {
  return value
    ? value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}
