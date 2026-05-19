import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { hasMattermostLoginConfig, MattermostClient, type MattermostChannelMember, type MattermostUser } from "../mattermost";

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
const reminderTimeSchema = z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const mattermostJiraReminderConfigSchema = z
  .object({
    MATTERMOST_URL: z.string().url().optional(),
    MATTERMOST_BOT_TOKEN: optionalNonEmptyString,
    MATTERMOST_LOGIN_ID: z.string().optional(),
    MATTERMOST_PASSWORD: z.string().optional(),
    MATTERMOST_JIRA_REMINDER_ENABLED: booleanEnvSchema,
    MATTERMOST_JIRA_REMINDER_BOT_TOKEN: optionalNonEmptyString,
    MATTERMOST_JIRA_REMINDER_LOGIN_ID: optionalNonEmptyString,
    MATTERMOST_JIRA_REMINDER_PASSWORD: optionalNonEmptyString,
    MATTERMOST_JIRA_REMINDER_SOURCE_CHANNEL_ID: optionalNonEmptyString,
    MATTERMOST_JIRA_REMINDER_TIME: reminderTimeSchema.default("17:00"),
    MATTERMOST_JIRA_REMINDER_TIME_ZONE: z.string().trim().min(1).default("Asia/Shanghai").refine(isValidTimeZone, {
      message: "Invalid IANA time zone",
    }),
    MATTERMOST_JIRA_REMINDER_MESSAGE: z.string().trim().min(1).default("今天 {{time}} 了，请记得填写 Jira。"),
    MATTERMOST_JIRA_REMINDER_CHECK_INTERVAL_SECONDS: z.coerce.number().int().min(5).max(60).default(30),
    MATTERMOST_JIRA_REMINDER_REQUIRE_BOT: defaultTrueBooleanEnvSchema,
    MATTERMOST_JIRA_REMINDER_SKIP_BOTS: defaultTrueBooleanEnvSchema,
    MATTERMOST_JIRA_REMINDER_STATE_FILE: z.string().trim().min(1).default(".artifacts/mattermost-jira-reminder-state.json"),
  })
  .transform((value) => ({
    MATTERMOST_URL: value.MATTERMOST_URL,
    MATTERMOST_ACCESS_TOKEN: value.MATTERMOST_JIRA_REMINDER_BOT_TOKEN ?? value.MATTERMOST_BOT_TOKEN,
    MATTERMOST_LOGIN_ID: value.MATTERMOST_JIRA_REMINDER_LOGIN_ID ?? value.MATTERMOST_LOGIN_ID,
    MATTERMOST_PASSWORD: value.MATTERMOST_JIRA_REMINDER_PASSWORD ?? value.MATTERMOST_PASSWORD,
    enabled: value.MATTERMOST_JIRA_REMINDER_ENABLED,
    sourceChannelId: value.MATTERMOST_JIRA_REMINDER_SOURCE_CHANNEL_ID,
    time: value.MATTERMOST_JIRA_REMINDER_TIME,
    timeZone: value.MATTERMOST_JIRA_REMINDER_TIME_ZONE,
    message: value.MATTERMOST_JIRA_REMINDER_MESSAGE,
    checkIntervalSeconds: value.MATTERMOST_JIRA_REMINDER_CHECK_INTERVAL_SECONDS,
    requireBot: value.MATTERMOST_JIRA_REMINDER_REQUIRE_BOT,
    skipBots: value.MATTERMOST_JIRA_REMINDER_SKIP_BOTS,
    stateFile: value.MATTERMOST_JIRA_REMINDER_STATE_FILE,
  }));

const mattermostJiraReminderStateSchema = z.object({
  sentByDate: z.record(z.string(), z.array(z.string())).default({}),
  completedDates: z.array(z.string()).default([]),
});

export type MattermostJiraReminderConfig = z.infer<typeof mattermostJiraReminderConfigSchema>;
export type MattermostJiraReminderState = z.infer<typeof mattermostJiraReminderStateSchema>;
export type MattermostJiraReminderClient = {
  getCurrentUser(): Promise<MattermostUser>;
  getChannelMembers(channelId: string): Promise<MattermostChannelMember[]>;
  getUsersByIds(userIds: string[]): Promise<MattermostUser[]>;
  createDirectChannel(userIds: [string, string]): Promise<{ id: string }>;
  postMessage(channelId: string, message: string): Promise<void>;
};

export type ReminderLocalSnapshot = {
  dateKey: string;
  time: string;
  hour: number;
  minute: number;
};

export function readMattermostJiraReminderConfig(env: NodeJS.ProcessEnv = process.env) {
  return mattermostJiraReminderConfigSchema.parse(env);
}

export function mattermostJiraReminderConfigured(config: MattermostJiraReminderConfig) {
  return Boolean(config.enabled && hasMattermostLoginConfig(config) && config.sourceChannelId);
}

export function emptyMattermostJiraReminderState(): MattermostJiraReminderState {
  return {
    sentByDate: {},
    completedDates: [],
  };
}

export async function readMattermostJiraReminderState(stateFile: string) {
  const raw = await readFile(stateFile, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  });

  if (!raw) {
    return emptyMattermostJiraReminderState();
  }

  return mattermostJiraReminderStateSchema.parse(JSON.parse(raw));
}

export async function writeMattermostJiraReminderState(stateFile: string, state: MattermostJiraReminderState) {
  await mkdir(dirname(stateFile), { recursive: true });
  await writeFile(stateFile, `${JSON.stringify(pruneMattermostJiraReminderState(state), null, 2)}\n`);
}

export function getReminderLocalSnapshot(now: Date, timeZone: string): ReminderLocalSnapshot {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const hour = Number(values.hour);
  const minute = Number(values.minute);

  return {
    dateKey: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
    hour,
    minute,
  };
}

export function parseReminderTime(time: string) {
  const [hourText, minuteText] = time.split(":");
  return {
    hour: Number(hourText),
    minute: Number(minuteText),
  };
}

export function shouldRunMattermostJiraReminder(config: MattermostJiraReminderConfig, state: MattermostJiraReminderState, now: Date) {
  const snapshot = getReminderLocalSnapshot(now, config.timeZone);
  const reminderTime = parseReminderTime(config.time);

  return (
    snapshot.hour === reminderTime.hour &&
    snapshot.minute === reminderTime.minute &&
    !state.completedDates.includes(snapshot.dateKey)
  );
}

export function formatMattermostJiraReminderMessage(config: MattermostJiraReminderConfig, snapshot: ReminderLocalSnapshot) {
  return config.message.replaceAll("{{date}}", snapshot.dateKey).replaceAll("{{time}}", config.time);
}

export async function getMattermostJiraReminderRecipients(
  client: MattermostJiraReminderClient,
  sourceChannelId: string,
  options: { skipBots: boolean; botUserId?: string },
) {
  const botUserId = options.botUserId ?? (await client.getCurrentUser()).id;
  const members = await client.getChannelMembers(sourceChannelId);
  const memberIds = [...new Set(members.map((member) => member.user_id))];
  const users = await client.getUsersByIds(memberIds);

  return users
    .filter((user) => user.id !== botUserId)
    .filter((user) => !user.delete_at)
    .filter((user) => !options.skipBots || !user.is_bot)
    .sort((left, right) => (left.username ?? left.id).localeCompare(right.username ?? right.id));
}

export async function sendMattermostJiraReminder(input: {
  client: MattermostJiraReminderClient;
  config: MattermostJiraReminderConfig;
  state: MattermostJiraReminderState;
  now: Date;
  saveState?: (state: MattermostJiraReminderState) => Promise<void>;
}) {
  if (!input.config.sourceChannelId) {
    throw new Error("Mattermost Jira reminder source channel is not configured");
  }

  const snapshot = getReminderLocalSnapshot(input.now, input.config.timeZone);
  const botUser = await input.client.getCurrentUser();
  if (input.config.requireBot && !botUser.is_bot) {
    throw new Error("Mattermost Jira reminder sender must be a bot user");
  }

  const recipients = await getMattermostJiraReminderRecipients(input.client, input.config.sourceChannelId, {
    skipBots: input.config.skipBots,
    botUserId: botUser.id,
  });
  const sentIds = new Set(input.state.sentByDate[snapshot.dateKey] ?? []);
  const message = formatMattermostJiraReminderMessage(input.config, snapshot);
  let sentCount = 0;
  let skippedCount = 0;

  for (const recipient of recipients) {
    if (sentIds.has(recipient.id)) {
      skippedCount += 1;
      continue;
    }

    const directChannel = await input.client.createDirectChannel([botUser.id, recipient.id]);
    await input.client.postMessage(directChannel.id, message);
    sentIds.add(recipient.id);
    sentCount += 1;
    input.state.sentByDate[snapshot.dateKey] = [...sentIds].sort();
    await input.saveState?.(input.state);
  }

  if (recipients.every((recipient) => sentIds.has(recipient.id)) && !input.state.completedDates.includes(snapshot.dateKey)) {
    input.state.completedDates.push(snapshot.dateKey);
    input.state.completedDates.sort();
    await input.saveState?.(input.state);
  }

  return {
    dateKey: snapshot.dateKey,
    recipientCount: recipients.length,
    sentCount,
    skippedCount,
  };
}

export function registerMattermostJiraReminder(app: FastifyInstance) {
  const config = readMattermostJiraReminderConfig();

  if (!mattermostJiraReminderConfigured(config)) {
    const logPayload = {
      enabled: config.enabled,
      mattermostConfigured: hasMattermostLoginConfig(config),
      sourceChannelConfigured: Boolean(config.sourceChannelId),
      time: config.time,
      timeZone: config.timeZone,
    };

    if (config.enabled) {
      app.log.warn(logPayload, "Mattermost Jira reminder is enabled but not fully configured");
    } else {
      app.log.info(logPayload, "Mattermost Jira reminder disabled");
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
      const now = new Date();
      const state = await readMattermostJiraReminderState(config.stateFile);
      if (!shouldRunMattermostJiraReminder(config, state, now)) {
        return;
      }

      const result = await sendMattermostJiraReminder({
        client: new MattermostClient(config),
        config,
        state,
        now,
        saveState: (nextState) => writeMattermostJiraReminderState(config.stateFile, nextState),
      });
      app.log.info(result, "Sent Mattermost Jira reminder DMs");
    } catch (error) {
      app.log.error(error, "Mattermost Jira reminder failed");
    } finally {
      running = false;
    }
  };

  void run();
  const interval = setInterval(run, config.checkIntervalSeconds * 1000);
  app.addHook("onClose", async () => {
    clearInterval(interval);
  });
}

function pruneMattermostJiraReminderState(state: MattermostJiraReminderState) {
  const dateKeys = Object.keys(state.sentByDate).sort();
  const keptDateKeys = new Set(dateKeys.slice(-45));
  const sentByDate = Object.fromEntries(Object.entries(state.sentByDate).filter(([dateKey]) => keptDateKeys.has(dateKey)));
  const completedDates = state.completedDates.filter((dateKey) => keptDateKeys.has(dateKey)).sort();

  return {
    sentByDate,
    completedDates,
  };
}

function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}
