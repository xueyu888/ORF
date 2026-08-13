import { and, asc, eq, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  feedbackNotificationEventKindFromPayload,
  feedbackNotificationEventPlanSchema,
  type FeedbackNotificationEventPlan,
} from "../contracts";
import type {
  FeedbackNotificationAttentionLevel,
  FeedbackNotificationDeliveryClass,
  FeedbackNotificationDispatchDraft,
  FeedbackNotificationDispatchRecipient,
  FeedbackNotificationPort,
  FeedbackNotificationRecipientReason,
} from "./notificationProtocol";
import {
  feedbackEventDispatches,
  feedbackEventDispatchRecipients,
} from "../infrastructure/database/schema";
import { feedbackNowIso, makeFeedbackDispatchId } from "./ids";
import { feedbackServerPollIntervalMs } from "./polling";

const feedbackNotificationRecipientReasonValues = [
  "action_required",
  "administrator",
  "assignee",
  "creator",
  "follower",
  "participant",
  "previous_assignee",
] satisfies FeedbackNotificationRecipientReason[];

const feedbackNotificationRecipientReasonSet = new Set<string>(feedbackNotificationRecipientReasonValues);

export type FeedbackNotificationDispatchDatabase = Pick<NodePgDatabase<any>, "insert" | "select" | "update">;

type FeedbackNotificationDispatchLog = {
  warn(input: unknown, message?: string): void;
};

type DispatchRow = {
  readonly activityEventId: string;
  readonly attempts: number;
  readonly id: string;
  readonly idempotencyKey: string;
  readonly payload: Record<string, unknown>;
  readonly status: "failed" | "pending" | "published";
  readonly updatedAt: string;
};

const feedbackNotificationRetryInitialMs = 30_000;
const feedbackNotificationRetryMaximumMs = 30 * 60 * 1000;
const feedbackNotificationClaimLeaseMs = 5 * 60 * 1000;
const feedbackNotificationRetryMaximumExponent = Math.ceil(
  Math.log2(feedbackNotificationRetryMaximumMs / feedbackNotificationRetryInitialMs),
);

const deliveryClassRank: Record<FeedbackNotificationDeliveryClass, number> = {
  ordinary: 0,
  mandatory: 1,
  direct: 2,
};

function normalizeReasons(reasons: readonly FeedbackNotificationRecipientReason[]) {
  return Array.from(new Set(reasons)).sort();
}

function normalizeStoredReasons(reasons: readonly string[]) {
  return reasons.filter((reason): reason is FeedbackNotificationRecipientReason => feedbackNotificationRecipientReasonSet.has(reason));
}

function normalizedUserId(value: string | null | undefined) {
  return value?.trim() || "";
}

function notificationRecipientUserIds(recipients: readonly FeedbackNotificationDispatchRecipient[]) {
  return recipients
    .filter((recipient) => !recipient.muted)
    .map((recipient) => recipient.userId);
}

export function mergeFeedbackNotificationDispatchRecipients(
  recipients: readonly FeedbackNotificationDispatchRecipient[],
): FeedbackNotificationDispatchRecipient[] {
  const merged = new Map<string, FeedbackNotificationDispatchRecipient>();

  for (const recipient of recipients) {
    const userId = normalizedUserId(recipient.userId);
    const reasons = normalizeReasons(recipient.reasons);
    if (!userId || reasons.length === 0) {
      continue;
    }

    const muted = recipient.deliveryClass === "ordinary" && Boolean(recipient.muted);
    const existing = merged.get(userId);
    if (!existing) {
      merged.set(userId, {
        attentionLevel: recipient.attentionLevel,
        deliveryClass: recipient.deliveryClass,
        muted,
        reasons,
        userId,
      });
      continue;
    }

    const deliveryClass = deliveryClassRank[recipient.deliveryClass] > deliveryClassRank[existing.deliveryClass]
      ? recipient.deliveryClass
      : existing.deliveryClass;
    const attentionLevel = existing.attentionLevel === "action_required" || recipient.attentionLevel === "action_required"
      ? "action_required"
      : "normal";
    const nextMuted = deliveryClass === "ordinary" && existing.muted === true && muted;
    merged.set(userId, {
      attentionLevel,
      deliveryClass,
      muted: nextMuted,
      reasons: normalizeReasons([...existing.reasons, ...reasons]),
      userId,
    });
  }

  return [...merged.values()].sort((left, right) => left.userId.localeCompare(right.userId));
}

export function feedbackNotificationRecipient(input: {
  readonly attentionLevel?: FeedbackNotificationAttentionLevel;
  readonly deliveryClass?: FeedbackNotificationDeliveryClass;
  readonly muted?: boolean;
  readonly reasons: readonly FeedbackNotificationRecipientReason[];
  readonly userId: string | null | undefined;
}): FeedbackNotificationDispatchRecipient | null {
  const userId = normalizedUserId(input.userId);
  if (!userId) return null;
  return {
    attentionLevel: input.attentionLevel ?? "normal",
    deliveryClass: input.deliveryClass ?? "ordinary",
    muted: input.muted,
    reasons: input.reasons,
    userId,
  };
}

export function buildFeedbackNotificationDispatchDraft(
  plan: FeedbackNotificationEventPlan,
  recipients: readonly FeedbackNotificationDispatchRecipient[],
): FeedbackNotificationDispatchDraft | null {
  const mergedRecipients = mergeFeedbackNotificationDispatchRecipients(recipients);
  const recipientUserIds = notificationRecipientUserIds(mergedRecipients);
  if (recipientUserIds.length === 0) {
    return null;
  }
  return {
    plan: {
      ...plan,
      recipientUserIds,
    },
    recipients: mergedRecipients,
  };
}

export async function insertFeedbackNotificationDispatch(
  database: FeedbackNotificationDispatchDatabase,
  input: {
    readonly activityEventId: string;
    readonly dispatch: FeedbackNotificationDispatchDraft | null | undefined;
  },
) {
  if (!input.dispatch) {
    return null;
  }

  const recipients = mergeFeedbackNotificationDispatchRecipients(input.dispatch.recipients);
  const recipientUserIds = notificationRecipientUserIds(recipients);
  if (recipientUserIds.length === 0) {
    return null;
  }

  const now = feedbackNowIso();
  const idempotencyKey = `feedback:${input.activityEventId}:${feedbackNotificationEventKindFromPayload(input.dispatch.plan.payload)}`;
  const [inserted] = await database
    .insert(feedbackEventDispatches)
    .values({
      id: makeFeedbackDispatchId(),
      teamId: input.dispatch.plan.teamId,
      activityEventId: input.activityEventId,
      idempotencyKey,
      payload: {
        ...input.dispatch.plan,
        recipientUserIds,
      },
      status: "pending",
      attempts: 0,
      notificationEventId: null,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: feedbackEventDispatches.idempotencyKey })
    .returning({ id: feedbackEventDispatches.id });

  if (!inserted) {
    const [existing] = await database
      .select({ id: feedbackEventDispatches.id })
      .from(feedbackEventDispatches)
      .where(eq(feedbackEventDispatches.idempotencyKey, idempotencyKey))
      .limit(1);
    return existing?.id ?? null;
  }

  await database.insert(feedbackEventDispatchRecipients).values(
    recipients.map((recipient) => ({
      dispatchId: inserted.id,
      recipientUserId: recipient.userId,
      reasons: [...recipient.reasons],
      deliveryClass: recipient.deliveryClass,
      attentionLevel: recipient.attentionLevel,
      muted: Boolean(recipient.muted),
    })),
  ).onConflictDoNothing();

  return inserted.id;
}

function feedbackNotificationPlanFromPayload(payload: Record<string, unknown>): FeedbackNotificationEventPlan | null {
  const parsed = feedbackNotificationEventPlanSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

function dispatchErrorText(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 500);
}

export function feedbackNotificationRetryDelayMs(attempts: number) {
  const completedAttempts = Math.max(1, Math.floor(attempts));
  const exponent = Math.min(feedbackNotificationRetryMaximumExponent, completedAttempts - 1);
  return Math.min(
    feedbackNotificationRetryMaximumMs,
    feedbackNotificationRetryInitialMs * (2 ** exponent),
  );
}

function isFeedbackNotificationRetryDue(dispatch: DispatchRow, nowMs = Date.now()) {
  const updatedAtMs = Date.parse(dispatch.updatedAt);
  if (dispatch.status === "pending") {
    return dispatch.attempts === 0
      || !Number.isFinite(updatedAtMs)
      || updatedAtMs + feedbackNotificationClaimLeaseMs <= nowMs;
  }
  if (dispatch.status !== "failed") return false;
  return !Number.isFinite(updatedAtMs)
    || updatedAtMs + feedbackNotificationRetryDelayMs(dispatch.attempts) <= nowMs;
}

function feedbackNotificationRetryableDispatchCondition(nowIso: string) {
  const retryDelay = sql`
    ${feedbackNotificationRetryInitialMs}
    * power(
      2,
      least(
        greatest(${feedbackEventDispatches.attempts} - 1, 0),
        ${feedbackNotificationRetryMaximumExponent}
      )
    )
  `;
  return or(
    and(
      eq(feedbackEventDispatches.status, "pending"),
      or(
        eq(feedbackEventDispatches.attempts, 0),
        sql`${feedbackEventDispatches.updatedAt} + (${feedbackNotificationClaimLeaseMs} * interval '1 millisecond') <= ${nowIso}::timestamptz`,
      ),
    ),
    and(
      eq(feedbackEventDispatches.status, "failed"),
      sql`${feedbackEventDispatches.updatedAt} + (${retryDelay} * interval '1 millisecond') <= ${nowIso}::timestamptz`,
    ),
  );
}

async function markDispatchPublished(
  database: FeedbackNotificationDispatchDatabase,
  dispatch: DispatchRow,
  notificationEventId: string | null | undefined,
) {
  await database
    .update(feedbackEventDispatches)
    .set({
      status: "published",
      notificationEventId: notificationEventId ?? null,
      lastError: null,
      updatedAt: feedbackNowIso(),
    })
    .where(and(
      eq(feedbackEventDispatches.id, dispatch.id),
      eq(feedbackEventDispatches.status, "pending"),
      eq(feedbackEventDispatches.attempts, dispatch.attempts),
    ));
}

async function markDispatchFailed(
  database: FeedbackNotificationDispatchDatabase,
  dispatch: DispatchRow,
  error: unknown,
) {
  await database
    .update(feedbackEventDispatches)
    .set({
      status: "failed",
      lastError: dispatchErrorText(error),
      updatedAt: feedbackNowIso(),
    })
    .where(and(
      eq(feedbackEventDispatches.id, dispatch.id),
      eq(feedbackEventDispatches.status, "pending"),
      eq(feedbackEventDispatches.attempts, dispatch.attempts),
    ));
}

async function claimDispatchForPublish(
  database: FeedbackNotificationDispatchDatabase,
  dispatch: DispatchRow,
) {
  if (!isFeedbackNotificationRetryDue(dispatch)) {
    return false;
  }
  const [claimed] = await database
    .update(feedbackEventDispatches)
    .set({
      attempts: sql`${feedbackEventDispatches.attempts} + 1`,
      status: "pending",
      updatedAt: feedbackNowIso(),
    })
    .where(and(
      eq(feedbackEventDispatches.id, dispatch.id),
      eq(feedbackEventDispatches.status, dispatch.status),
      eq(feedbackEventDispatches.attempts, dispatch.attempts),
    ))
    .returning({
      attempts: feedbackEventDispatches.attempts,
      status: feedbackEventDispatches.status,
      updatedAt: feedbackEventDispatches.updatedAt,
    });
  return claimed ? {
    ...dispatch,
    attempts: claimed.attempts,
    status: claimed.status,
    updatedAt: claimed.updatedAt,
  } : null;
}

export async function publishFeedbackNotificationDispatch(
  database: FeedbackNotificationDispatchDatabase,
  dispatchId: string | null | undefined,
  publishNotification: FeedbackNotificationPort,
) {
  const normalizedDispatchId = dispatchId?.trim();
  if (!normalizedDispatchId) {
    return { status: "notFound" as const };
  }

  const [dispatch] = await database
    .select({
      activityEventId: feedbackEventDispatches.activityEventId,
      attempts: feedbackEventDispatches.attempts,
      id: feedbackEventDispatches.id,
      idempotencyKey: feedbackEventDispatches.idempotencyKey,
      payload: feedbackEventDispatches.payload,
      status: feedbackEventDispatches.status,
      updatedAt: feedbackEventDispatches.updatedAt,
    })
    .from(feedbackEventDispatches)
    .where(eq(feedbackEventDispatches.id, normalizedDispatchId))
    .limit(1);
  if (!dispatch) {
    return { status: "notFound" as const };
  }
  if (dispatch.status === "published") {
    return { status: "published" as const, notificationEventId: null };
  }
  if (!isFeedbackNotificationRetryDue(dispatch)) {
    return { status: "deferred" as const };
  }
  const claimedDispatch = await claimDispatchForPublish(database, dispatch);
  if (!claimedDispatch) {
    return { status: "claimed" as const };
  }

  const plan = feedbackNotificationPlanFromPayload(dispatch.payload);
  if (!plan) {
    await markDispatchFailed(database, claimedDispatch, new Error("Invalid feedback notification dispatch payload."));
    return { status: "failed" as const };
  }

  const recipientRows = await database
    .select({
      attentionLevel: feedbackEventDispatchRecipients.attentionLevel,
      deliveryClass: feedbackEventDispatchRecipients.deliveryClass,
      muted: feedbackEventDispatchRecipients.muted,
      reasons: feedbackEventDispatchRecipients.reasons,
      recipientUserId: feedbackEventDispatchRecipients.recipientUserId,
    })
    .from(feedbackEventDispatchRecipients)
    .where(eq(feedbackEventDispatchRecipients.dispatchId, dispatch.id));
  const recipients = mergeFeedbackNotificationDispatchRecipients(recipientRows.map((recipient) => ({
    attentionLevel: recipient.attentionLevel,
    deliveryClass: recipient.deliveryClass,
    muted: recipient.muted,
    reasons: normalizeStoredReasons(recipient.reasons),
    userId: recipient.recipientUserId,
  })));
  const activeRecipients = recipients.filter((recipient) => !recipient.muted);
  const recipientUserIds = activeRecipients.map((recipient) => recipient.userId);

  if (recipientUserIds.length === 0) {
    await markDispatchPublished(database, claimedDispatch, null);
    return { status: "published" as const, notificationEventId: null };
  }

  try {
    const result = await publishNotification({
      ...plan,
      recipientUserIds,
    }, {
      activityEventId: dispatch.activityEventId,
      dispatchId: dispatch.id,
      idempotencyKey: dispatch.idempotencyKey,
      recipients: activeRecipients,
    });
    await markDispatchPublished(database, claimedDispatch, result.notificationEventId ?? null);
    return { status: "published" as const, notificationEventId: result.notificationEventId ?? null };
  } catch (error) {
    await markDispatchFailed(database, claimedDispatch, error);
    return { status: "failed" as const };
  }
}

export async function publishPendingFeedbackNotificationDispatches(
  database: FeedbackNotificationDispatchDatabase,
  publishNotification: FeedbackNotificationPort,
  input: { readonly limit?: number } = {},
) {
  const limit = Math.max(1, Math.min(100, input.limit ?? 25));
  const now = feedbackNowIso();
  const rows = await database
    .select({ id: feedbackEventDispatches.id })
    .from(feedbackEventDispatches)
    .where(feedbackNotificationRetryableDispatchCondition(now))
    .orderBy(
      asc(feedbackEventDispatches.updatedAt),
      asc(feedbackEventDispatches.id),
    )
    .limit(limit);

  for (const row of rows) {
    await publishFeedbackNotificationDispatch(database, row.id, publishNotification);
  }
  return { processed: rows.length };
}

export function startFeedbackNotificationDispatchWorker(input: {
  readonly database: FeedbackNotificationDispatchDatabase;
  readonly log?: FeedbackNotificationDispatchLog;
  readonly pollIntervalMs?: number;
  readonly publishNotification: FeedbackNotificationPort;
}) {
  let stopped = false;
  let running = false;
  const pollIntervalMs = feedbackServerPollIntervalMs({
    configuredPollIntervalMs: input.pollIntervalMs,
    defaultPollIntervalMs: 30_000,
  });

  const sweep = async () => {
    if (stopped || running) return;
    running = true;
    try {
      await publishPendingFeedbackNotificationDispatches(input.database, input.publishNotification);
    } catch (error) {
      input.log?.warn({ error }, "ORF feedback notification dispatch worker failed");
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => {
    void sweep();
  }, pollIntervalMs);
  void sweep();

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
