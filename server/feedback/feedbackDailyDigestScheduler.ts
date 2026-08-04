import type { FastifyBaseLogger } from "fastify";
import { and, asc, eq, lt, or, sql } from "drizzle-orm";
import type { Impact } from "../../src/types/orf";
import { db } from "../db/client";
import { feedback, feedbackDailyDigestRuns, teamMembers, users } from "../db/schema";
import { env } from "../env";
import { publishNotificationEvent } from "../notifications/publisher";
import {
  feedbackDailyDigestTargetId,
  formatFeedbackDailyDigestBody,
  shouldRunFeedbackDailyDigest,
  sortFeedbackDailyDigestItems,
  type FeedbackDailyDigestItem,
} from "./feedbackDailyDigestModel";

type FeedbackDailyDigestRecipient = {
  name: string;
  teamId: string;
  userId: string;
};

type FeedbackDailyDigestItemRow = FeedbackDailyDigestItem & {
  ownerUserId: string;
  teamId: string;
};
type FeedbackDailyDigestClaimStatus = "claimed" | "skipped";

const feedbackDailyDigestPendingRetryMs = 15 * 60 * 1000;
let schedulerStarted = false;

function feedbackDailyDigestListHref(assigneeUserId: string) {
  const query = new URLSearchParams({
    assignee: assigneeUserId,
    sort: "updated-asc",
    state: "open",
  });
  return `/feedback?${query.toString()}`;
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function listActiveFeedbackDigestRecipients() {
  return db
    .select({
      name: users.name,
      teamId: teamMembers.teamId,
      userId: users.id,
    })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .where(eq(users.status, "active"))
    .orderBy(asc(teamMembers.teamId), asc(users.name), asc(users.id));
}

async function listOpenFeedbackDigestItems() {
  return db
    .select({
      id: feedback.id,
      impact: feedback.impact,
      ownerUserId: feedback.ownerUserId,
      phenomenon: feedback.phenomenon,
      teamId: feedback.teamId,
      updatedAt: feedback.updatedAt,
    })
    .from(feedback)
    .innerJoin(teamMembers, and(eq(teamMembers.teamId, feedback.teamId), eq(teamMembers.userId, feedback.ownerUserId)))
    .innerJoin(users, eq(users.id, feedback.ownerUserId))
    .where(and(eq(feedback.status, "Open"), eq(users.status, "active")));
}

function groupDigestItemsByRecipient(items: readonly FeedbackDailyDigestItemRow[]) {
  const grouped = new Map<string, FeedbackDailyDigestItem[]>();
  for (const item of items) {
    const key = `${item.teamId}:${item.ownerUserId}`;
    grouped.set(key, [...(grouped.get(key) ?? []), {
      id: item.id,
      impact: item.impact as Impact,
      phenomenon: item.phenomenon,
      updatedAt: item.updatedAt,
    }]);
  }
  return grouped;
}

async function claimPendingDigestRun(input: {
  feedbackCount: number;
  localDate: string;
  now: string;
  recipient: FeedbackDailyDigestRecipient;
}): Promise<FeedbackDailyDigestClaimStatus> {
  const inserted = await db
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
  const claimed = await db
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
  eventId: string | null;
  feedbackCount: number;
  localDate: string;
  now: string;
  recipient: FeedbackDailyDigestRecipient;
}) {
  await db
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
  error: unknown;
  feedbackCount: number;
  localDate: string;
  now: string;
  recipient: FeedbackDailyDigestRecipient;
}) {
  await db
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
}) {
  const items = sortFeedbackDailyDigestItems(input.items);
  const claim = await claimPendingDigestRun({
    feedbackCount: items.length,
    localDate: input.localDate,
    now: input.now,
    recipient: input.recipient,
  });
  if (claim !== "claimed") return { status: "skipped" as const };

  if (items.length === 0) {
    await markDigestRunSent({
      eventId: null,
      feedbackCount: 0,
      localDate: input.localDate,
      now: input.now,
      recipient: input.recipient,
    });
    return { status: "empty" as const };
  }

  try {
    const events = await publishNotificationEvent({
      actorName: "ORF",
      actorUserId: null,
      body: formatFeedbackDailyDigestBody({
        items,
        listHref: feedbackDailyDigestListHref(input.recipient.userId),
      }),
      kind: "feedback.assignee.daily_digest",
      metadata: {
        assigneeUserId: input.recipient.userId,
        feedbackCount: String(items.length),
        localDate: input.localDate,
        targetTitle: "今日待处理反馈汇总",
      },
      recipientUserIds: [input.recipient.userId],
      targetHref: feedbackDailyDigestListHref(input.recipient.userId),
      targetId: feedbackDailyDigestTargetId(input.recipient.teamId, input.recipient.userId, input.localDate),
      targetType: "feedback",
      teamId: input.recipient.teamId,
      title: "今日待处理反馈汇总",
    });
    await markDigestRunSent({
      eventId: events[0]?.id ?? null,
      feedbackCount: items.length,
      localDate: input.localDate,
      now: input.now,
      recipient: input.recipient,
    });
    return { status: "sent" as const };
  } catch (error) {
    await markDigestRunFailed({
      error,
      feedbackCount: items.length,
      localDate: input.localDate,
      now: input.now,
      recipient: input.recipient,
    });
    throw error;
  }
}

export async function runFeedbackDailyDigestSweep(log: FastifyBaseLogger, now = new Date()) {
  if (!env.ORF_FEEDBACK_DAILY_DIGEST_ENABLED) return;

  const schedule = shouldRunFeedbackDailyDigest({
    hour: env.ORF_FEEDBACK_DAILY_DIGEST_HOUR,
    minute: env.ORF_FEEDBACK_DAILY_DIGEST_MINUTE,
    now,
    timeZone: env.ORF_FEEDBACK_DAILY_DIGEST_TIME_ZONE,
  });
  if (!schedule.due) return;

  const [recipients, feedbackItems] = await Promise.all([
    listActiveFeedbackDigestRecipients(),
    listOpenFeedbackDigestItems(),
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
      });
      if (result.status === "sent") sentCount += 1;
      if (result.status === "empty") emptyCount += 1;
    } catch (error) {
      failedCount += 1;
      log.warn({ error, localDate: schedule.localDate, teamId: recipient.teamId, userId: recipient.userId }, "ORF feedback daily digest failed");
    }
  }

  if (sentCount > 0 || emptyCount > 0 || failedCount > 0) {
    log.info({ emptyCount, failedCount, localDate: schedule.localDate, sentCount }, "Completed ORF feedback daily digest sweep");
  }
}

export function startFeedbackDailyDigestScheduler(log: FastifyBaseLogger) {
  if (schedulerStarted || !env.ORF_FEEDBACK_DAILY_DIGEST_ENABLED) {
    return () => undefined;
  }

  schedulerStarted = true;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runFeedbackDailyDigestSweep(log);
    } catch (error) {
      log.warn({ error }, "ORF feedback daily digest scheduler failed");
    } finally {
      running = false;
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), env.ORF_FEEDBACK_DAILY_DIGEST_POLL_INTERVAL_MS);
  return () => {
    clearInterval(timer);
    schedulerStarted = false;
  };
}
