import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { FeedbackNotificationEventPlan } from "../contracts";
import {
  feedbackEventDispatches,
  feedbackEventDispatchRecipients,
} from "../infrastructure/database/schema";
import { feedbackNowIso, makeFeedbackDispatchId } from "./ids";

export type FeedbackNotificationRecipientReason =
  | "action_required"
  | "administrator"
  | "assignee"
  | "creator"
  | "follower"
  | "participant"
  | "previous_assignee";

export type FeedbackNotificationDeliveryClass = "direct" | "mandatory" | "ordinary";
export type FeedbackNotificationAttentionLevel = "action_required" | "normal";

export type FeedbackNotificationDispatchRecipient = {
  readonly attentionLevel: FeedbackNotificationAttentionLevel;
  readonly deliveryClass: FeedbackNotificationDeliveryClass;
  readonly muted?: boolean;
  readonly reasons: readonly FeedbackNotificationRecipientReason[];
  readonly userId: string;
};

export type FeedbackNotificationDispatchDraft = {
  readonly plan: FeedbackNotificationEventPlan;
  readonly recipients: readonly FeedbackNotificationDispatchRecipient[];
};

export type FeedbackNotificationPortResult = {
  readonly notificationEventId?: string | null;
};

export type FeedbackNotificationPort = (
  plan: FeedbackNotificationEventPlan,
  context: {
    readonly dispatchId: string;
    readonly idempotencyKey: string;
  },
) => Promise<FeedbackNotificationPortResult>;

export type FeedbackNotificationDispatchDatabase = Pick<NodePgDatabase<any>, "insert" | "select" | "update">;

type DispatchRow = {
  readonly attempts: number;
  readonly id: string;
  readonly idempotencyKey: string;
  readonly payload: Record<string, unknown>;
  readonly status: "failed" | "pending" | "published";
};

const deliveryClassRank: Record<FeedbackNotificationDeliveryClass, number> = {
  ordinary: 0,
  mandatory: 1,
  direct: 2,
};

function normalizeReasons(reasons: readonly FeedbackNotificationRecipientReason[]) {
  return Array.from(new Set(reasons)).sort();
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
  const idempotencyKey = `feedback:${input.activityEventId}:${input.dispatch.plan.kind}`;
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
  if (
    typeof payload.actorName !== "string" ||
    typeof payload.body !== "string" ||
    typeof payload.kind !== "string" ||
    typeof payload.targetHref !== "string" ||
    typeof payload.targetId !== "string" ||
    payload.targetType !== "feedback" ||
    typeof payload.teamId !== "string" ||
    typeof payload.title !== "string"
  ) {
    return null;
  }

  return {
    actorName: payload.actorName,
    actorUserId: typeof payload.actorUserId === "string" ? payload.actorUserId : null,
    body: payload.body,
    kind: payload.kind as FeedbackNotificationEventPlan["kind"],
    metadata: isStringRecord(payload.metadata) ? payload.metadata : {},
    recipientUserIds: Array.isArray(payload.recipientUserIds)
      ? payload.recipientUserIds.filter((value): value is string => typeof value === "string")
      : [],
    targetHref: payload.targetHref,
    targetId: payload.targetId,
    targetType: "feedback",
    teamId: payload.teamId,
    title: payload.title,
  };
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every((entry) => typeof entry === "string");
}

function dispatchErrorText(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 500);
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
    .where(eq(feedbackEventDispatches.id, dispatch.id));
}

async function markDispatchFailed(
  database: FeedbackNotificationDispatchDatabase,
  dispatchId: string,
  error: unknown,
) {
  await database
    .update(feedbackEventDispatches)
    .set({
      status: "failed",
      lastError: dispatchErrorText(error),
      updatedAt: feedbackNowIso(),
    })
    .where(eq(feedbackEventDispatches.id, dispatchId));
}

async function claimDispatchForPublish(
  database: FeedbackNotificationDispatchDatabase,
  dispatch: DispatchRow,
) {
  if (dispatch.status !== "pending") {
    return false;
  }
  const [claimed] = await database
    .update(feedbackEventDispatches)
    .set({
      attempts: sql`${feedbackEventDispatches.attempts} + 1`,
      updatedAt: feedbackNowIso(),
    })
    .where(and(
      eq(feedbackEventDispatches.id, dispatch.id),
      eq(feedbackEventDispatches.status, "pending"),
      eq(feedbackEventDispatches.attempts, dispatch.attempts),
    ))
    .returning({ id: feedbackEventDispatches.id });
  return Boolean(claimed);
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
      attempts: feedbackEventDispatches.attempts,
      id: feedbackEventDispatches.id,
      idempotencyKey: feedbackEventDispatches.idempotencyKey,
      payload: feedbackEventDispatches.payload,
      status: feedbackEventDispatches.status,
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
  if (!(await claimDispatchForPublish(database, dispatch))) {
    return { status: "claimed" as const };
  }

  const plan = feedbackNotificationPlanFromPayload(dispatch.payload);
  if (!plan) {
    await markDispatchFailed(database, dispatch.id, new Error("Invalid feedback notification dispatch payload."));
    return { status: "failed" as const };
  }

  const recipientRows = await database
    .select({
      muted: feedbackEventDispatchRecipients.muted,
      recipientUserId: feedbackEventDispatchRecipients.recipientUserId,
    })
    .from(feedbackEventDispatchRecipients)
    .where(eq(feedbackEventDispatchRecipients.dispatchId, dispatch.id));
  const recipientUserIds = Array.from(new Set(
    recipientRows
      .filter((recipient) => !recipient.muted)
      .map((recipient) => recipient.recipientUserId),
  ));

  if (recipientUserIds.length === 0) {
    await markDispatchPublished(database, dispatch, null);
    return { status: "published" as const, notificationEventId: null };
  }

  try {
    const result = await publishNotification({
      ...plan,
      recipientUserIds,
    }, {
      dispatchId: dispatch.id,
      idempotencyKey: dispatch.idempotencyKey,
    });
    await markDispatchPublished(database, dispatch, result.notificationEventId ?? null);
    return { status: "published" as const, notificationEventId: result.notificationEventId ?? null };
  } catch (error) {
    await markDispatchFailed(database, dispatch.id, error);
    return { status: "failed" as const };
  }
}

export async function publishPendingFeedbackNotificationDispatches(
  database: FeedbackNotificationDispatchDatabase,
  publishNotification: FeedbackNotificationPort,
  input: { readonly limit?: number } = {},
) {
  const limit = Math.max(1, Math.min(100, input.limit ?? 25));
  const rows = await database
    .select({ id: feedbackEventDispatches.id })
    .from(feedbackEventDispatches)
    .where(inArray(feedbackEventDispatches.status, ["pending"]))
    .orderBy(asc(feedbackEventDispatches.updatedAt), asc(feedbackEventDispatches.id))
    .limit(limit);

  for (const row of rows) {
    await publishFeedbackNotificationDispatch(database, row.id, publishNotification);
  }
  return { processed: rows.length };
}

export function startFeedbackNotificationDispatchWorker(input: {
  readonly database: FeedbackNotificationDispatchDatabase;
  readonly pollIntervalMs?: number;
  readonly publishNotification: FeedbackNotificationPort;
}) {
  let stopped = false;
  let running = false;
  const pollIntervalMs = Math.max(5_000, input.pollIntervalMs ?? 30_000);

  const sweep = async () => {
    if (stopped || running) return;
    running = true;
    try {
      await publishPendingFeedbackNotificationDispatches(input.database, input.publishNotification);
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
