import assert from "node:assert/strict";
import test from "node:test";
import {
  emptyMattermostJiraReminderState,
  readMattermostJiraReminderConfig,
  sendMattermostJiraReminder,
  shouldRunMattermostJiraReminder,
  type MattermostJiraReminderClient,
} from "../server/integrations/mattermost-jira-reminder";

const baseEnv = {
  MATTERMOST_URL: "https://mattermost.example.com",
  MATTERMOST_LOGIN_ID: "orf-bot@example.com",
  MATTERMOST_PASSWORD: "password",
  MATTERMOST_JIRA_REMINDER_ENABLED: "true",
  MATTERMOST_JIRA_REMINDER_SOURCE_CHANNEL_ID: "source-channel",
} satisfies NodeJS.ProcessEnv;

test("Mattermost Jira reminder config has safe defaults for time and message", () => {
  const config = readMattermostJiraReminderConfig(baseEnv);

  assert.equal(config.enabled, true);
  assert.equal(config.sourceChannelId, "source-channel");
  assert.equal(config.time, "17:00");
  assert.equal(config.timeZone, "Asia/Shanghai");
  assert.equal(config.message, "今天 {{time}} 了，请记得填写 Jira。");
  assert.equal(config.checkIntervalSeconds, 30);
  assert.equal(config.requireBot, true);
  assert.equal(config.skipBots, true);
});

test("Mattermost Jira reminder prefers a dedicated bot token over the shared login", () => {
  const config = readMattermostJiraReminderConfig({
    ...baseEnv,
    MATTERMOST_BOT_TOKEN: "shared-token",
    MATTERMOST_JIRA_REMINDER_BOT_TOKEN: "reminder-token",
  });

  assert.equal(config.MATTERMOST_ACCESS_TOKEN, "reminder-token");
});

test("Mattermost Jira reminder is due only at the configured local minute", () => {
  const config = readMattermostJiraReminderConfig(baseEnv);
  const state = emptyMattermostJiraReminderState();

  assert.equal(shouldRunMattermostJiraReminder(config, state, new Date("2026-05-19T08:59:59Z")), false);
  assert.equal(shouldRunMattermostJiraReminder(config, state, new Date("2026-05-19T09:00:10Z")), true);

  state.completedDates.push("2026-05-19");
  assert.equal(shouldRunMattermostJiraReminder(config, state, new Date("2026-05-19T09:00:30Z")), false);
});

test("Mattermost Jira reminder sends one DM per active non-bot channel member", async () => {
  const config = readMattermostJiraReminderConfig(baseEnv);
  const state = emptyMattermostJiraReminderState();
  const client = new FakeMattermostClient();
  let saveCount = 0;

  const result = await sendMattermostJiraReminder({
    client,
    config,
    state,
    now: new Date("2026-05-19T09:00:10Z"),
    saveState: async () => {
      saveCount += 1;
    },
  });

  assert.deepEqual(result, {
    dateKey: "2026-05-19",
    recipientCount: 1,
    sentCount: 1,
    skippedCount: 0,
  });
  assert.deepEqual(client.directChannels, [["bot-user", "member-user"]]);
  assert.deepEqual(client.posts, [{ channelId: "dm-member-user", message: "今天 17:00 了，请记得填写 Jira。" }]);
  assert.deepEqual(state.sentByDate["2026-05-19"], ["member-user"]);
  assert.deepEqual(state.completedDates, ["2026-05-19"]);
  assert.equal(saveCount, 2);
});

test("Mattermost Jira reminder skips members already sent for the same day", async () => {
  const config = readMattermostJiraReminderConfig(baseEnv);
  const state = {
    sentByDate: {
      "2026-05-19": ["member-user"],
    },
    completedDates: [],
  };
  const client = new FakeMattermostClient();

  const result = await sendMattermostJiraReminder({
    client,
    config,
    state,
    now: new Date("2026-05-19T09:00:10Z"),
  });

  assert.equal(result.sentCount, 0);
  assert.equal(result.skippedCount, 1);
  assert.deepEqual(client.directChannels, []);
  assert.deepEqual(client.posts, []);
  assert.deepEqual(state.completedDates, ["2026-05-19"]);
});

test("Mattermost Jira reminder refuses to send from a non-bot account by default", async () => {
  const config = readMattermostJiraReminderConfig(baseEnv);
  const state = emptyMattermostJiraReminderState();

  await assert.rejects(
    sendMattermostJiraReminder({
      client: new FakeMattermostClient({ senderIsBot: false }),
      config,
      state,
      now: new Date("2026-05-19T09:00:10Z"),
    }),
    /sender must be a bot user/,
  );
});

class FakeMattermostClient implements MattermostJiraReminderClient {
  readonly directChannels: [string, string][] = [];
  readonly posts: Array<{ channelId: string; message: string }> = [];

  constructor(private readonly options: { senderIsBot?: boolean } = {}) {}

  async getCurrentUser() {
    return { id: "bot-user", username: "orf-bot", delete_at: 0, is_bot: this.options.senderIsBot ?? true };
  }

  async getChannelMembers(channelId: string) {
    assert.equal(channelId, "source-channel");
    return [
      { user_id: "bot-user" },
      { user_id: "member-user" },
      { user_id: "deleted-user" },
      { user_id: "other-bot" },
    ];
  }

  async getUsersByIds(userIds: string[]) {
    const users = [
      { id: "bot-user", username: "orf-bot", delete_at: 0, is_bot: true },
      { id: "member-user", username: "alice", delete_at: 0, is_bot: false },
      { id: "deleted-user", username: "deleted", delete_at: 1, is_bot: false },
      { id: "other-bot", username: "helper-bot", delete_at: 0, is_bot: true },
    ];

    return users.filter((user) => userIds.includes(user.id));
  }

  async createDirectChannel(userIds: [string, string]) {
    this.directChannels.push(userIds);
    return { id: `dm-${userIds[1]}` };
  }

  async postMessage(channelId: string, message: string) {
    this.posts.push({ channelId, message });
  }
}
