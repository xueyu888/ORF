import { and, eq, lt, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { feedback, feedbackDailyDigestRuns } from "../infrastructure/database/schema";
import type { FeedbackNotificationPayloadV1 } from "../contracts";
import {
  feedbackDailyDigestListHref,
  feedbackDailyDigestTargetId,
  formatFeedbackDailyDigestBody,
  shouldRunFeedbackDailyDigest,
  sortFeedbackDailyDigestItems,
  type FeedbackDailyDigestItem,
} from "./dailyDigest";

export type FeedbackDailyDigestDatabase = Pick<NodePgDatabase<any>, "insert" | "select" | "update">;

export type FeedbackDailyDigestRecipient = {
  readonly name: string;
  readonly teamId: string;
  readonly userId: string;
};

export type FeedbackDailyDigestConfig = {
  readonly enabled: boolean;
  readonly hour: number;
  readonly minute: number;
  readonly pollIntervalMs: number;
  readonly timeZone: string;
};

export type FeedbackDailyDigestLogger = {
  info(data: Record<string, unknown>, message: string): void;
  warn(data: Record<string, unknown>, message: string): void;
};

export type FeedbackDailyDigestNotificationInput = {
  readonly actorName: string;
  readonly actorUserId: string | null;
  readonly body: string;
  readonly kind: "feedback.assignee.digest";
  readonly metadata: Record<string, string>;
  readonly payload: Extract<FeedbackNotificationPayloadV1, { type: "assignee_digest" }>;
  readonly recipientUserIds: string[];
  readonly targetHref: string;
  readonly targetId: string;
  readonly targetType: "feedback";
  readonly teamId: string;
  readonly title: string;
};

export type FeedbackDailyDigestRuntime = {
  readonly config: FeedbackDailyDigestConfig;
  readonly database: FeedbackDailyDigestDatabase;
  readonly listActiveRecipients: () => Promise<readonly FeedbackDailyDigestRecipient[]>;
  readonly log: FeedbackDailyDigestLogger;
  readonly publishNotification: (input: FeedbackDailyDigestNotificationInput) => Promise<readonly { id: string }[]>;
};

type FeedbackDailyDigestItemRow = FeedbackDailyDigestItem & {
  assigneeUserId: string | null;
  teamId: string;
};
type FeedbackDailyDigestClaimStatus = "claimed" | "skipped";

const feedbackDailyDigestPendingRetryMs = 15 * 60 * 1000;
let schedulerStarted = false;

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function listOpenFeedbackDigestItems(database: FeedbackDailyDigestDatabase) {
  return database
    .select({
      id: feedback.id,
      impact: feedback.impact,
      assigneeUserId: feedback.assigneeUserId,
      title: feedback.title,
      teamId: feedback.teamId,
      updatedAt: feedback.updatedAt,
    })
    .from(feedback)
    .where(or(eq(feedback.stage, "open"), eq(feedback.stage, "in_progress")));
}

function groupDigestItemsByRecipient(items: readonly FeedbackDailyDigestItemRow[]) {
  const grouped = new Map<string, FeedbackDailyDigestItem[]>();
  for (const item of items) {
    if (!item.assigneeUserId) continue;
    const key = `${item.teamId}:${item.assigneeUserId}`;
    grouped.set(key, [...(grouped.get(key) ?? []), {
      id: item.id,
      impact: item.impact,
      title: item.title,
      updatedAt: item.updatedAt,
    }]);
  }
  return grouped;
}

async function claimPendingDigestRun(input: {
  database: FeedbackDailyDigestDatabase;
  feedbackCount: number;
  localDate: string;
  now: string;
  recipient: FeedbackDailyDigestRecipient;
}): Promise<FeedbackDailyDigestClaimStatus> {
  const inserted = await input.database
    .insert(feedbackDailyDigestRuns)
    .values({
      attempts: 0,
      assigneeUserId: input.recipient.userId,
      createdAt: input.now,
      feedbackCount: input.feedbackCount,
      lastError: null,
      localDate: input.localDate,
      notificationEventId: null,
      status: "pending",
      teamId: input.recipient.teamId,
      updatedAt: input.now,
    })
    .onConflictDoNothing({
      target: [feedbackDailyDigestRuns.teamId, feedbackDailyDigestRuns.assigneeUserId, feedbackDailyDigestRuns.localDate],
    })
    .returning({ localDate: feedbackDailyDigestRuns.localDate });
  if (inserted.length > 0) return "claimed";

  const stalePendingBefore = new Date(new Date(input.now).getTime() - feedbackDailyDigestPendingRetryMs).toISOString();
  const claimed = await input.database
    .update(feedbackDailyDigestRuns)
    .set({
      feedbackCount: input.feedbackCount,
      lastError: null,
      status: "pending",
      updatedAt: input.now,
    })
    .where(and(
      eq(feedbackDailyDigestRuns.teamId, input.recipient.teamId),
      eq(feedbackDailyDigestRuns.assigneeUserId, input.recipient.userId),
      eq(feedbackDailyDigestRuns.localDate, input.localDate),
      or(
        eq(feedbackDailyDigestRuns.status, "failed"),
        and(eq(feedbackDailyDigestRuns.status, "pending"), lt(feedbackDailyDigestRuns.updatedAt, stalePendingBefore)),
      ),
    ))
    .returning({ localDate: feedbackDailyDigestRuns.localDate });
  return claimed.length > 0 ? "claimed" : "skipped";
}

async function markDigestRunSent(input: {
  database: FeedbackDailyDigestDatabase;
  eventId: string | null;
  feedbackCount: number;
  localDate: string;
  now: string;
  recipient: FeedbackDailyDigestRecipient;
}) {
  await input.database
    .update(feedbackDailyDigestRuns)
    .set({
      attempts: sql`${feedbackDailyDigestRuns.attempts} + 1`,
      feedbackCount: input.feedbackCount,
      lastError: null,
      notificationEventId: input.eventId,
      status: "sent",
      updatedAt: input.now,
    })
    .where(and(
      eq(feedbackDailyDigestRuns.teamId, input.recipient.teamId),
      eq(feedbackDailyDigestRuns.assigneeUserId, input.recipient.userId),
      eq(feedbackDailyDigestRuns.localDate, input.localDate),
    ));
}

async function markDigestRunFailed(input: {
  database: FeedbackDailyDigestDatabase;
  error: unknown;
  feedbackCount: number;
  localDate: string;
  now: string;
  recipient: FeedbackDailyDigestRecipient;
}) {
  await input.database
    .update(feedbackDailyDigestRuns)
    .set({
      attempts: sql`${feedbackDailyDigestRuns.attempts} + 1`,
      feedbackCount: input.feedbackCount,
      lastError: errorText(input.error).slice(0, 2_000),
      status: "failed",
      updatedAt: input.now,
    })
    .where(and(
      eq(feedbackDailyDigestRuns.teamId, input.recipient.teamId),
      eq(feedbackDailyDigestRuns.assigneeUserId, input.recipient.userId),
      eq(feedbackDailyDigestRuns.localDate, input.localDate),
    ));
}

async function publishDigestForRecipient(input: {
  items: readonly FeedbackDailyDigestItem[];
  localDate: string;
  now: string;
  recipient: FeedbackDailyDigestRecipient;
  runtime: FeedbackDailyDigestRuntime;
}) {
  const items = sortFeedbackDailyDigestItems(input.items);
  const claim = await claimPendingDigestRun({
    database: input.runtime.database,
    feedbackCount: items.length,
    localDate: input.localDate,
    now: input.now,
    recipient: input.recipient,
  });
  if (claim !== "claimed") return { status: "skipped" as const };

  if (items.length === 0) {
    await markDigestRunSent({
      database: input.runtime.database,
      eventId: null,
      feedbackCount: 0,
      localDate: input.localDate,
      now: input.now,
      recipient: input.recipient,
    });
    return { status: "empty" as const };
  }

  try {
    const events = await input.runtime.publishNotification({
      actorName: "ORF",
      actorUserId: null,
      body: formatFeedbackDailyDigestBody({
        items,
      }),
      kind: "feedback.assignee.digest",
      metadata: {
        assigneeUserId: input.recipient.userId,
        feedbackCount: String(items.length),
        localDate: input.localDate,
        targetTitle: "今日待处理反馈汇总",
      },
      payload: {
        version: 1,
        type: "assignee_digest",
        assigneeUserId: input.recipient.userId,
        items,
        localDate: input.localDate,
        pendingCount: items.length,
      },
      recipientUserIds: [input.recipient.userId],
      targetHref: feedbackDailyDigestListHref(input.recipient.userId),
      targetId: feedbackDailyDigestTargetId(input.recipient.teamId, input.recipient.userId, input.localDate),
      targetType: "feedback",
      teamId: input.recipient.teamId,
      title: "今日待处理反馈汇总",
    });
    await markDigestRunSent({
      database: input.runtime.database,
      eventId: events[0]?.id ?? null,
      feedbackCount: items.length,
      localDate: input.localDate,
      now: input.now,
      recipient: input.recipient,
    });
    return { status: "sent" as const };
  } catch (error) {
    await markDigestRunFailed({
      database: input.runtime.database,
      error,
      feedbackCount: items.length,
      localDate: input.localDate,
      now: input.now,
      recipient: input.recipient,
    });
    throw error;
  }
}

export async function runFeedbackDailyDigestSweep(runtime: FeedbackDailyDigestRuntime, now = new Date()) {
  if (!runtime.config.enabled) return;

  const schedule = shouldRunFeedbackDailyDigest({
    hour: runtime.config.hour,
    minute: runtime.config.minute,
    now,
    timeZone: runtime.config.timeZone,
  });
  if (!schedule.due) return;

  const [recipients, feedbackItems] = await Promise.all([
    runtime.listActiveRecipients(),
    listOpenFeedbackDigestItems(runtime.database),
  ]);
  const itemsByRecipient = groupDigestItemsByRecipient(feedbackItems);
  const nowValue = now.toISOString();
  let sentCount = 0;
  let emptyCount = 0;
  let failedCount = 0;

  for (const recipient of recipients) {
    const key = `${recipient.teamId}:${recipient.userId}`;
    try {
      const result = await publishDigestForRecipient({
        items: itemsByRecipient.get(key) ?? [],
        localDate: schedule.localDate,
        now: nowValue,
        recipient,
        runtime,
      });
      if (result.status === "sent") sentCount += 1;
      if (result.status === "empty") emptyCount += 1;
    } catch (error) {
      failedCount += 1;
      runtime.log.warn({ error, localDate: schedule.localDate, teamId: recipient.teamId, userId: recipient.userId }, "ORF feedback daily digest failed");
    }
  }

  if (sentCount > 0 || emptyCount > 0 || failedCount > 0) {
    runtime.log.info({ emptyCount, failedCount, localDate: schedule.localDate, sentCount }, "Completed ORF feedback daily digest sweep");
  }
}

export function startFeedbackDailyDigestScheduler(runtime: FeedbackDailyDigestRuntime) {
  if (schedulerStarted || !runtime.config.enabled) {
    return () => undefined;
  }

  schedulerStarted = true;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runFeedbackDailyDigestSweep(runtime);
    } catch (error) {
      runtime.log.warn({ error }, "ORF feedback daily digest scheduler failed");
    } finally {
      running = false;
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), runtime.config.pollIntervalMs);
  return () => {
    clearInterval(timer);
    schedulerStarted = false;
  };
}
