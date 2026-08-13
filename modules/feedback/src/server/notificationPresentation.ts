import {
  feedbackNotificationPayloadV1Schema,
  feedbackNotificationEventKindValues,
  feedbackNotificationEventKindFromPayload,
  type FeedbackNotificationEventKind,
  type FeedbackNotificationPayloadV1,
} from "../contracts";
import { feedbackCommentPath, feedbackIssuePath } from "../contracts/links";
import { feedbackDailyDigestListHref, feedbackDailyDigestTargetId, formatFeedbackDailyDigestBody } from "./dailyDigest";

export interface FeedbackNotificationPolicyDescriptor {
  readonly kind: string;
  readonly replyTarget: "notification-target" | "metadata-comment-target" | "none";
  readonly stream: "personalNotification";
}

export type FeedbackNotificationAction = {
  readonly href: string;
  readonly label: string;
} | null;

export type FeedbackNotificationPresentationRecipient = {
  readonly attentionLevel: "action_required" | "normal";
  readonly deliveryClass: "direct" | "mandatory" | "ordinary";
  readonly reasons: readonly string[];
  readonly userId: string;
};

export type FeedbackNotificationPresentation = {
  readonly actorName: string;
  readonly actorUserId?: string | null;
  readonly action: FeedbackNotificationAction;
  readonly body: string;
  readonly kind: FeedbackNotificationEventKind;
  readonly metadata: Record<string, string>;
  readonly recipient: FeedbackNotificationPresentationRecipient;
  readonly replyTarget: { readonly targetId: string; readonly targetType: "feedback" } | null;
  readonly stream: "personalNotification";
  readonly target: { readonly href: string; readonly id: string; readonly type: "feedback" };
  readonly title: string;
};

export interface FeedbackNotificationPresentationActionInput {
  readonly body: string;
  readonly kind: string;
  readonly metadata?: Record<string, string> | null;
  readonly targetHref: string;
  readonly targetType: string;
  readonly title: string;
}

export interface FeedbackNotificationPresentationProviderContribution {
  readonly namespace: "feedback";
  readonly kinds: readonly string[];
  readonly payloadSchema: typeof feedbackNotificationPayloadV1Schema;
  policy(kind: string): FeedbackNotificationPolicyDescriptor;
  action(input: FeedbackNotificationPresentationActionInput): FeedbackNotificationAction;
  present(payload: FeedbackNotificationPayloadV1, recipient: FeedbackNotificationPresentationRecipient): FeedbackNotificationPresentation;
}

const feedbackNotificationKindSet = new Set<string>(feedbackNotificationEventKindValues);

export function createFeedbackNotificationPresentationProvider(): FeedbackNotificationPresentationProviderContribution {
  return {
    namespace: "feedback",
    kinds: feedbackNotificationEventKindValues,
    payloadSchema: feedbackNotificationPayloadV1Schema,
    policy(kind) {
      return {
        kind: assertFeedbackNotificationKind(kind),
        replyTarget: kind === "feedback.assignee.digest" ? "none" : "notification-target",
        stream: "personalNotification",
      };
    },
    action(input) {
      return {
        href: input.targetHref,
        label: feedbackNotificationActionLabel(assertFeedbackNotificationKind(input.kind), input.targetHref),
      };
    },
    present(payload, recipient) {
      return presentFeedbackNotification(payload, recipient);
    },
  };
}

function presentFeedbackNotification(
  payload: FeedbackNotificationPayloadV1,
  recipient: FeedbackNotificationPresentationRecipient,
): FeedbackNotificationPresentation {
  const facts = feedbackNotificationPresentationFacts(payload);
  const actionLabel = feedbackNotificationActionLabel(facts.kind, facts.targetHref);
  return {
    actorName: facts.actorName,
    actorUserId: facts.actorUserId,
    action: { href: facts.targetHref, label: actionLabel },
    body: facts.body,
    kind: facts.kind,
    metadata: {
      feedbackNotificationPayloadType: payload.type,
      feedbackNotificationPayloadVersion: String(payload.version),
      notificationActionLabel: actionLabel,
      targetTitle: facts.targetTitle,
    },
    recipient: {
      attentionLevel: recipient.attentionLevel,
      deliveryClass: recipient.deliveryClass,
      reasons: Array.from(new Set(recipient.reasons)).sort(),
      userId: recipient.userId,
    },
    replyTarget: facts.replyTargetId ? { targetId: facts.replyTargetId, targetType: "feedback" } : null,
    stream: "personalNotification",
    target: { href: facts.targetHref, id: facts.targetId, type: "feedback" },
    title: facts.title,
  };
}

function feedbackNotificationPresentationFacts(payload: FeedbackNotificationPayloadV1): {
  readonly actorName: string;
  readonly actorUserId?: string | null;
  readonly body: string;
  readonly kind: FeedbackNotificationEventKind;
  readonly replyTargetId: string | null;
  readonly targetHref: string;
  readonly targetId: string;
  readonly targetTitle: string;
  readonly title: string;
} {
  const kind = feedbackNotificationEventKindFromPayload(payload);
  if (payload.type === "assignee_digest") {
    const targetHref = feedbackDailyDigestListHref(payload.assigneeUserId);
    return {
      actorName: "ORF",
      actorUserId: null,
      body: formatFeedbackDailyDigestBody({ items: payload.items }),
      kind,
      replyTargetId: null,
      targetHref,
      targetId: feedbackDailyDigestTargetId(payload.assigneeUserId, payload.localDate),
      targetTitle: "今日待处理反馈汇总",
      title: "今日待处理反馈汇总",
    };
  }

  const feedback = payload.feedback;
  const commentMessageId = payload.type === "comment_created"
    ? payload.commentMessageId
    : payload.type === "follow_up"
      ? payload.comment?.messageId ?? null
      : null;
  const targetHref = commentMessageId
    ? feedbackCommentPath({ commentMessageId, feedbackId: feedback.id })
    : feedbackIssuePath(feedback.id);
  if (payload.type === "created") {
    return {
      actorName: payload.actor.name,
      actorUserId: payload.actor.id,
      body: `${payload.actor.name} 创建了反馈「${feedback.title}」${payload.assignee ? `，处理人：${payload.assignee.name}` : ""}。`,
      kind,
      replyTargetId: feedback.id,
      targetHref,
      targetId: feedback.id,
      targetTitle: feedback.title,
      title: "新的反馈 issue",
    };
  }
  if (payload.type === "assignee_changed") {
    return {
      actorName: payload.actor.name,
      actorUserId: payload.actor.id,
      body: `${payload.actor.name} 将反馈「${feedback.title}」的处理人从 ${payload.previousAssignee?.name ?? "未指派"} 调整为 ${payload.nextAssignee?.name ?? "未指派"}。`,
      kind,
      replyTargetId: feedback.id,
      targetHref,
      targetId: feedback.id,
      targetTitle: feedback.title,
      title: "反馈处理人已更新",
    };
  }
  if (payload.type === "lifecycle_changed") {
    return {
      actorName: payload.actor.name,
      actorUserId: payload.actor.id,
      body: `${payload.actor.name} 更新了反馈「${feedback.title}」的生命周期。`,
      kind,
      replyTargetId: feedback.id,
      targetHref,
      targetId: feedback.id,
      targetTitle: feedback.title,
      title: "反馈生命周期已更新",
    };
  }
  if (payload.type === "follow_up") {
    const changedLabels = [payload.lifecycle ? "生命周期" : "", payload.assignee ? "处理人" : ""].filter(Boolean);
    return {
      actorName: payload.actor.name,
      actorUserId: payload.actor.id,
      body: payload.comment?.excerpt ?? `${payload.actor.name} 跟进了反馈「${feedback.title}」，更新了${changedLabels.join("和")}。`,
      kind,
      replyTargetId: feedback.id,
      targetHref,
      targetId: feedback.id,
      targetTitle: feedback.title,
      title: "反馈有新跟进",
    };
  }
  return {
    actorName: payload.actor.name,
    actorUserId: payload.actor.id,
    body: payload.commentExcerpt,
    kind,
    replyTargetId: feedback.id,
    targetHref,
    targetId: feedback.id,
    targetTitle: feedback.title,
    title: "反馈有新跟进",
  };
}

function assertFeedbackNotificationKind(kind: string): FeedbackNotificationEventKind {
  if (!feedbackNotificationKindSet.has(kind)) {
    throw new Error(`Unsupported feedback notification kind ${kind}.`);
  }
  return kind as FeedbackNotificationEventKind;
}

function feedbackNotificationActionLabel(kind: FeedbackNotificationEventKind, targetHref = "") {
  if (kind === "feedback.comment.created" || (kind === "feedback.follow_up.created" && targetHref.includes("?comment="))) return "打开评论";
  if (kind === "feedback.assignee.digest") return "打开反馈列表";
  return "打开反馈";
}
