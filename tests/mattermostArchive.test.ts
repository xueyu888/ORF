import assert from "node:assert/strict";
import test from "node:test";
import {
  readMattermostArchiveConfig,
  runMattermostArchiveSync,
  selectMattermostArchiveChannels,
  shouldCopyMattermostArchiveFile,
  type MattermostArchiveChannelRecord,
  type MattermostArchiveClient,
  type MattermostArchiveCursor,
  type MattermostArchiveFileRecord,
  type MattermostArchiveFileStorageStatus,
  type MattermostArchivePostRecord,
  type MattermostArchiveRepository,
  type MattermostArchiveUserRecord,
} from "../server/integrations/mattermost-archive";
import type { MattermostChannel, MattermostPostList, MattermostUser } from "../server/integrations/mattermost";

const baseEnv = {
  MATTERMOST_URL: "https://mattermost.example.com",
  MATTERMOST_LOGIN_ID: "orf-archive@example.com",
  MATTERMOST_PASSWORD: "password",
  MATTERMOST_ARCHIVE_ENABLED: "true",
} satisfies NodeJS.ProcessEnv;

test("Mattermost archive config accepts pilot aliases", () => {
  const config = readMattermostArchiveConfig({
    ...baseEnv,
    MATTERMOST_ARCHIVE_CHANNEL_NAME_PREFIX: "LLM",
    MATTERMOST_ARCHIVE_CHANNEL_LIMIT: "1",
    MATTERMOST_ARCHIVE_BACKFILL_PAGE_LIMIT: "5",
    MATTERMOST_ARCHIVE_SYNC_INTERVAL_SECONDS: "600",
    MATTERMOST_ARCHIVE_MAX_IMAGE_BYTES: "12345",
  });

  assert.equal(config.channelNamePrefix, "LLM");
  assert.equal(config.channelLimit, 1);
  assert.equal(config.historyPagesPerRun, 5);
  assert.equal(config.intervalSeconds, 600);
  assert.equal(config.imageMaxBytes, 12345);
});

test("Mattermost archive selects visible channels by id or LLM prefix", () => {
  const channels: MattermostChannel[] = [
    { id: "llm", type: "O", name: "llm-application-group", display_name: "LLM Application Group", delete_at: 0 },
    { id: "other", type: "O", name: "backend", display_name: "Backend", delete_at: 0 },
    { id: "dm", type: "D", name: "", display_name: "", delete_at: 0 },
  ];

  assert.deepEqual(
    selectMattermostArchiveChannels(channels, { channelIds: [], channelNamePrefix: "LLM", channelLimit: 1 }).map((channel) => channel.id),
    ["llm"],
  );
  assert.deepEqual(
    selectMattermostArchiveChannels(channels, { channelIds: ["other"], channelNamePrefix: "LLM", channelLimit: 1 }).map((channel) => channel.id),
    ["other"],
  );
});

test("Mattermost archive file policy copies only small image attachments", () => {
  const config = readMattermostArchiveConfig({
    ...baseEnv,
    MATTERMOST_ARCHIVE_MAX_IMAGE_BYTES: "1000",
  });

  assert.deepEqual(shouldCopyMattermostArchiveFile({ mime_type: "image/png", size: 999 }, config), { copy: true, status: "copied" });
  assert.deepEqual(shouldCopyMattermostArchiveFile({ mime_type: "application/zip", size: 10 }, config), {
    copy: false,
    status: "skipped_non_image",
  });
  assert.deepEqual(shouldCopyMattermostArchiveFile({ mime_type: "image/png", size: 1001 }, config), {
    copy: false,
    status: "skipped_large",
  });
});

test("Mattermost archive sync persists text and metadata but copies only eligible images", async () => {
  const config = readMattermostArchiveConfig({
    ...baseEnv,
    MATTERMOST_ARCHIVE_CHANNEL_NAME_PREFIX: "LLM",
    MATTERMOST_ARCHIVE_CHANNEL_LIMIT: "1",
    MATTERMOST_ARCHIVE_POSTS_PER_PAGE: "60",
    MATTERMOST_ARCHIVE_BACKFILL_PAGE_LIMIT: "1",
    MATTERMOST_ARCHIVE_MAX_IMAGE_BYTES: "1000",
  });
  const client = new FakeArchiveClient();
  const repository = new FakeArchiveRepository();
  const storage = new FakeArchiveStorage();

  const result = await runMattermostArchiveSync({
    client,
    repository,
    config,
    storage,
    now: () => new Date("2026-06-03T12:00:00Z"),
  });

  assert.deepEqual(result, {
    channelsDiscovered: 2,
    channelsSelected: 1,
    channelsSynced: 1,
    postsUpserted: 1,
    filesUpserted: 3,
    imagesCopied: 1,
    imageCopyFailures: 0,
  });
  assert.deepEqual(repository.channels.map((channel) => channel.id), ["llm"]);
  assert.deepEqual(repository.posts.map((post) => post.message), ["text table\n\n| a | b |"]);
  assert.deepEqual(repository.files.map((file) => [file.id, file.storageStatus]), [
    ["image-file", "copied"],
    ["zip-file", "skipped_non_image"],
    ["large-image", "skipped_large"],
  ]);
  assert.deepEqual(storage.objects.map((object) => object.key), ["mattermost/llm/post-1/image-file.png"]);
  assert.equal(repository.cursors.get("llm")?.historyExhausted, true);
});

class FakeArchiveClient implements MattermostArchiveClient {
  async getMyChannels() {
    return [
      { id: "llm", type: "O", name: "llm-application-group", display_name: "LLM Application Group", delete_at: 0 },
      { id: "other", type: "O", name: "other", display_name: "Other", delete_at: 0 },
    ];
  }

  async getPostsForChannel(channelId: string): Promise<MattermostPostList> {
    assert.equal(channelId, "llm");
    return {
      order: ["post-1"],
      posts: {
        "post-1": {
          id: "post-1",
          channel_id: "llm",
          user_id: "user-1",
          message: "text table\n\n| a | b |",
          create_at: 100,
          update_at: 110,
          metadata: {
            files: [
              {
                id: "image-file",
                post_id: "post-1",
                channel_id: "llm",
                user_id: "user-1",
                name: "image.png",
                extension: "png",
                mime_type: "image/png",
                size: 10,
              },
              {
                id: "zip-file",
                post_id: "post-1",
                channel_id: "llm",
                user_id: "user-1",
                name: "installer.zip",
                extension: "zip",
                mime_type: "application/zip",
                size: 10,
              },
              {
                id: "large-image",
                post_id: "post-1",
                channel_id: "llm",
                user_id: "user-1",
                name: "large.png",
                extension: "png",
                mime_type: "image/png",
                size: 1001,
              },
            ],
          },
        },
      },
    };
  }

  async getUsersByIds(userIds: string[]): Promise<MattermostUser[]> {
    return userIds.map((id) => ({ id, username: id, delete_at: 0, is_bot: false }));
  }

  async getFile(fileId: string) {
    assert.equal(fileId, "image-file");
    return {
      body: Buffer.from("image-bytes"),
      contentLength: 11,
      contentType: "image/png",
    };
  }
}

class FakeArchiveRepository implements MattermostArchiveRepository {
  channels: MattermostArchiveChannelRecord[] = [];
  users: MattermostArchiveUserRecord[] = [];
  posts: MattermostArchivePostRecord[] = [];
  files: MattermostArchiveFileRecord[] = [];
  cursors = new Map<string, MattermostArchiveCursor>();
  storage = new Map<string, { storageStatus: MattermostArchiveFileStorageStatus; objectKey: string | null }>();

  async upsertChannels(channels: MattermostArchiveChannelRecord[]) {
    this.channels.push(...channels);
  }

  async upsertUsers(users: MattermostArchiveUserRecord[]) {
    this.users.push(...users);
  }

  async upsertPosts(posts: MattermostArchivePostRecord[]) {
    this.posts.push(...posts);
  }

  async upsertFiles(files: MattermostArchiveFileRecord[]) {
    this.files.push(...files);
    for (const file of files) {
      this.storage.set(file.id, { storageStatus: file.storageStatus, objectKey: file.objectKey });
    }
  }

  async getCursor(channelId: string) {
    return this.cursors.get(channelId) ?? null;
  }

  async getFileStorage(fileId: string) {
    return this.storage.get(fileId) ?? null;
  }

  async markChannelSyncStarted(channelId: string, startedAt: string) {
    this.cursors.set(channelId, {
      channelId,
      historyBeforePostId: null,
      historyExhausted: false,
      lastSyncedUpdateAt: 0,
      syncedPostCount: 0,
    });
    assert.equal(startedAt, "2026-06-03T12:00:00.000Z");
  }

  async completeChannelSync(input: {
    channelId: string;
    historyBeforePostId: string | null;
    historyExhausted: boolean;
    lastSyncedUpdateAt: number;
    syncedPostCountDelta: number;
  }) {
    this.cursors.set(input.channelId, {
      channelId: input.channelId,
      historyBeforePostId: input.historyBeforePostId,
      historyExhausted: input.historyExhausted,
      lastSyncedUpdateAt: input.lastSyncedUpdateAt,
      syncedPostCount: input.syncedPostCountDelta,
    });
  }

  async failChannelSync() {
    throw new Error("unexpected archive failure");
  }
}

class FakeArchiveStorage {
  objects: Array<{ key: string; body: Buffer; contentLength: number; contentType: string }> = [];

  async putObject(input: { key: string; body: Buffer; contentLength: number; contentType: string }) {
    this.objects.push(input);
  }
}
