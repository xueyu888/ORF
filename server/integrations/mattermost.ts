import { z } from "zod";

export type MattermostLoginConfig = {
  MATTERMOST_URL?: string;
  MATTERMOST_ACCESS_TOKEN?: string;
  MATTERMOST_LOGIN_ID?: string;
  MATTERMOST_PASSWORD?: string;
};

export type MattermostChannelPostConfig = MattermostLoginConfig & {
  MATTERMOST_CHANNEL_ID?: string;
};

export type MattermostUser = z.infer<typeof mattermostUserSchema>;
export type MattermostChannelMember = z.infer<typeof mattermostChannelMemberSchema>;
export type MattermostChannel = z.infer<typeof mattermostChannelSchema>;
export type MattermostPost = z.infer<typeof mattermostPostSchema>;
export type MattermostFileInfo = z.infer<typeof mattermostFileInfoSchema>;
export type MattermostPostList = z.infer<typeof mattermostPostListSchema>;

const mattermostUserSchema = z.object({
  id: z.string().min(1),
  username: z.string().optional(),
  nickname: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  delete_at: z.number().optional(),
  is_bot: z.boolean().optional(),
});

const mattermostChannelSchema = z.object({
  id: z.string().min(1),
  team_id: z.string().optional(),
  name: z.string().optional(),
  display_name: z.string().optional(),
  type: z.string().optional(),
  header: z.string().optional(),
  purpose: z.string().optional(),
  delete_at: z.number().optional(),
  last_post_at: z.number().optional(),
  total_msg_count: z.number().optional(),
  total_msg_count_root: z.number().optional(),
});

const mattermostChannelMemberSchema = z.object({
  user_id: z.string().min(1),
});

const mattermostFileInfoSchema = z.object({
  id: z.string().min(1),
  post_id: z.string().optional(),
  channel_id: z.string().optional(),
  user_id: z.string().optional(),
  name: z.string().optional(),
  extension: z.string().optional(),
  mime_type: z.string().optional(),
  size: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  has_preview_image: z.boolean().optional(),
  create_at: z.number().optional(),
  update_at: z.number().optional(),
  delete_at: z.number().optional(),
  archived: z.boolean().optional(),
});

const mattermostPostSchema = z.object({
  id: z.string().min(1),
  channel_id: z.string().min(1),
  user_id: z.string().optional(),
  root_id: z.string().optional(),
  parent_id: z.string().optional(),
  original_id: z.string().optional(),
  type: z.string().optional(),
  message: z.string().default(""),
  hashtags: z.string().optional(),
  props: z.record(z.string(), z.unknown()).optional(),
  metadata: z
    .object({
      files: z.array(mattermostFileInfoSchema).optional(),
    })
    .passthrough()
    .optional(),
  file_ids: z.array(z.string()).optional(),
  create_at: z.number().optional(),
  update_at: z.number().optional(),
  edit_at: z.number().optional(),
  delete_at: z.number().optional(),
  reply_count: z.number().optional(),
  last_reply_at: z.number().optional(),
});

const mattermostPostListSchema = z.object({
  order: z.array(z.string()).default([]),
  posts: z.record(z.string(), mattermostPostSchema).default({}),
  next_post_id: z.string().optional(),
  prev_post_id: z.string().optional(),
  first_inaccessible_post_time: z.number().optional(),
});

const mattermostUsersSchema = z.array(mattermostUserSchema);
const mattermostChannelsSchema = z.array(mattermostChannelSchema);
const mattermostChannelMembersSchema = z.array(mattermostChannelMemberSchema);

export class MattermostApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = "MattermostApiError";
  }
}

export function hasMattermostLoginConfig(config: MattermostLoginConfig) {
  return Boolean(config.MATTERMOST_URL && (config.MATTERMOST_ACCESS_TOKEN || (config.MATTERMOST_LOGIN_ID && config.MATTERMOST_PASSWORD)));
}

export function hasMattermostChannelPostConfig(config: MattermostChannelPostConfig) {
  return Boolean(hasMattermostLoginConfig(config) && config.MATTERMOST_CHANNEL_ID);
}

export type MattermostPostOptions = {
  props?: Record<string, unknown>;
};

export async function postMattermostChannelMessage(config: MattermostChannelPostConfig, message: string, options: MattermostPostOptions = {}) {
  if (!config.MATTERMOST_CHANNEL_ID) {
    throw new Error("Mattermost target channel is not configured");
  }

  const client = new MattermostClient(config);
  await client.postMessage(config.MATTERMOST_CHANNEL_ID, message, options);
}

export class MattermostClient {
  private token: string | null = null;
  private currentUser: MattermostUser | null = null;

  constructor(private readonly config: MattermostLoginConfig) {}

  async getCurrentUser() {
    if (!this.currentUser) {
      this.currentUser = await this.requestJson("/api/v4/users/me", {}, mattermostUserSchema);
    }

    return this.currentUser;
  }

  async getChannelMembers(channelId: string) {
    const members: MattermostChannelMember[] = [];
    const perPage = 200;

    for (let page = 0; ; page += 1) {
      const pageMembers = await this.requestJson(
        `/api/v4/channels/${encodeURIComponent(channelId)}/members?page=${page}&per_page=${perPage}`,
        {},
        mattermostChannelMembersSchema,
      );
      members.push(...pageMembers);

      if (pageMembers.length < perPage) {
        return members;
      }
    }
  }

  async getMyChannels() {
    return this.requestJson("/api/v4/users/me/channels", {}, mattermostChannelsSchema);
  }

  async getVisibleChannels() {
    return this.getMyChannels();
  }

  async getUsersByIds(userIds: string[]) {
    if (userIds.length === 0) {
      return [];
    }

    const users: MattermostUser[] = [];
    const chunkSize = 200;
    for (let index = 0; index < userIds.length; index += chunkSize) {
      const chunk = userIds.slice(index, index + chunkSize);
      const chunkUsers = await this.requestJson(
        "/api/v4/users/ids",
        {
          method: "POST",
          body: JSON.stringify(chunk),
        },
        mattermostUsersSchema,
      );
      users.push(...chunkUsers);
    }

    return users;
  }

  async getPostsForChannel(
    channelId: string,
    options: { page?: number; perPage?: number; since?: number; before?: string; after?: string; includeDeleted?: boolean } = {},
  ) {
    const params = new URLSearchParams();
    if (options.page !== undefined) params.set("page", String(options.page));
    if (options.perPage !== undefined) params.set("per_page", String(options.perPage));
    if (options.since !== undefined) params.set("since", String(options.since));
    if (options.before) params.set("before", options.before);
    if (options.after) params.set("after", options.after);
    if (options.includeDeleted) params.set("include_deleted", "true");

    const query = params.toString();
    const path = `/api/v4/channels/${encodeURIComponent(channelId)}/posts${query ? `?${query}` : ""}`;
    return this.requestJson(path, {}, mattermostPostListSchema);
  }

  async getFileInfosForPost(postId: string) {
    return this.requestJson(`/api/v4/posts/${encodeURIComponent(postId)}/files/info`, {}, z.array(mattermostFileInfoSchema));
  }

  async getFile(fileId: string) {
    const response = await this.request(`/api/v4/files/${encodeURIComponent(fileId)}`, {});
    const contentLengthText = response.headers.get("content-length");

    return {
      body: Buffer.from(await response.arrayBuffer()),
      contentLength: contentLengthText ? Number(contentLengthText) : undefined,
      contentType: response.headers.get("content-type") ?? undefined,
    };
  }

  async createDirectChannel(userIds: [string, string]) {
    return this.requestJson(
      "/api/v4/channels/direct",
      {
        method: "POST",
        body: JSON.stringify(userIds),
      },
      mattermostChannelSchema,
    );
  }

  async postMessage(channelId: string, message: string, options: MattermostPostOptions = {}) {
    await this.createPost(channelId, message, options);
  }

  async createPost(channelId: string, message: string, options: MattermostPostOptions = {}) {
    return this.requestJson(
      "/api/v4/posts",
      {
        method: "POST",
        body: JSON.stringify({
          channel_id: channelId,
          message,
          ...(options.props ? { props: options.props } : {}),
        }),
      },
      z.unknown(),
    );
  }

  private async requestJson<T>(path: string, init: RequestInit, schema: z.ZodType<T>) {
    const response = await this.request(path, init);

    return schema.parse(await response.json());
  }

  private async request(path: string, init: RequestInit) {
    const token = await this.getToken();
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    const response = await fetch(`${this.baseUrl()}${path}`, {
      ...init,
      headers,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new MattermostApiError(`Mattermost API failed with HTTP ${response.status}`, response.status, text.slice(0, 500));
    }

    return response;
  }

  private async getToken() {
    if (this.config.MATTERMOST_ACCESS_TOKEN) {
      return this.config.MATTERMOST_ACCESS_TOKEN;
    }

    if (this.token) {
      return this.token;
    }

    if (!hasMattermostLoginConfig(this.config)) {
      throw new Error("Mattermost login is not configured");
    }

    const response = await fetch(`${this.baseUrl()}/api/v4/users/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ login_id: this.config.MATTERMOST_LOGIN_ID, password: this.config.MATTERMOST_PASSWORD }),
    });

    if (!response.ok) {
      throw new Error(`Mattermost login failed with HTTP ${response.status}`);
    }

    const token = response.headers.get("token");
    if (!token) {
      throw new Error("Mattermost login did not return a token");
    }

    this.token = token;
    return token;
  }

  private baseUrl() {
    if (!this.config.MATTERMOST_URL) {
      throw new Error("Mattermost URL is not configured");
    }

    return this.config.MATTERMOST_URL.replace(/\/+$/, "");
  }
}
