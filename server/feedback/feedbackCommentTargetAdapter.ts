import { feedbackCommentPath, feedbackIssuePath } from "@orf/feedback-module/contracts";
import {
  buildFeedbackCommentCreatedNotificationDispatch,
  getFeedbackCommentNotificationFacts,
  getFeedbackOrdinaryNotificationDispatchRecipients,
  insertFeedbackNotificationDispatch,
  lockFeedbackCommentTarget,
  publishFeedbackNotificationDispatch,
  recordFeedbackCommentCreatedActivity,
  resolveFeedbackCommentTarget,
} from "@orf/feedback-module/server";
import { buildCommentNotificationContent } from "../notifications/notificationEventModel";
import { db } from "../db/client";
import { runtimeScopeStorageId } from "../repositories/runtimeScope";
import {
  registerCommentTargetAdapter,
  type CommentTargetCommitResult,
  type CommentMessageCommittedEvent,
  type CommentTargetActor,
} from "../comments/commentTargetAdapters";
import { feedbackNotificationPort } from "./feedbackNotificationPort";
import { feedbackNotificationRecipientDirectory } from "./feedbackNotificationRecipientDirectory";
import { resolveFeedbackProjectById } from "./feedbackProjectOptions";

function actorCanUseScopedFeedbackTarget(actor: CommentTargetActor, storageScopeId: string) {
  const actorStorageScopeId = actor.scope ? runtimeScopeStorageId(actor.scope) : "";
  return Boolean(storageScopeId) && (!actorStorageScopeId || actorStorageScopeId === storageScopeId);
}

function uniqueNotificationUserIds(userIds: Array<string | null | undefined>) {
  const normalized = userIds.map((userId) => userId?.trim()).filter((userId): userId is string => Boolean(userId));
  return Array.from(new Set(normalized));
}

async function feedbackCommentNotificationContext(event: CommentMessageCommittedEvent) {
  const target = await getFeedbackCommentNotificationFacts(db, event.target.targetId);
  if (!target || target.teamId !== event.target.storageScopeId) {
    return null;
  }

  const project = target.projectId
    ? await resolveFeedbackProjectById(event.target.storageScopeId, target.projectId)
    : null;
  const excludedUserIds = new Set(uniqueNotificationUserIds([
    event.actor.id,
    ...event.mentionedUserIds,
    event.replyRecipientUserId,
  ]));
  const recipients = await getFeedbackOrdinaryNotificationDispatchRecipients(db, feedbackNotificationRecipientDirectory, {
    assigneeUserId: target.assigneeUserId,
    createdBy: target.createdBy,
    feedbackId: event.target.targetId,
    includeCommentParticipants: true,
    teamId: event.target.storageScopeId,
  });
  return {
    project,
    recipients: recipients.filter((recipient) => !excludedUserIds.has(recipient.userId)),
  };
}

async function notifyFeedbackParticipantsOfComment(
  event: CommentMessageCommittedEvent,
  result?: CommentTargetCommitResult,
) {
  const activityEventId = result?.feedbackActivityEventId?.trim();
  if (!activityEventId) {
    return;
  }
  const context = await feedbackCommentNotificationContext(event);
  if (!context || context.recipients.length === 0) {
    return;
  }

  const content = buildCommentNotificationContent({
    attachments: [...event.attachments],
    commentBody: event.body,
    summary: `${event.actor.name} 回复了反馈「${event.target.title}」：`,
  });

  const dispatch = buildFeedbackCommentCreatedNotificationDispatch({
    actorName: event.actor.name,
    actorUserId: event.actor.id,
    body: content.body,
    commentMessageId: event.commentMessageId,
    commentMetadata: content.metadata,
    commentThreadId: event.commentThreadId,
    feedbackId: event.target.targetId,
    project: context.project,
    recipients: context.recipients,
    targetTitle: event.target.title,
    teamId: event.target.storageScopeId,
  });
  const dispatchId = await insertFeedbackNotificationDispatch(db, {
    activityEventId,
    dispatch,
  });
  await publishFeedbackNotificationDispatch(db, dispatchId, feedbackNotificationPort);
}

export function registerFeedbackCommentTargetAdapter() {
  registerCommentTargetAdapter({
    protocolVersion: 1,
    type: "feedback",
    invalidationModel: "feedback",
    async resolve(targetId) {
      const target = await resolveFeedbackCommentTarget(db, targetId);
      return target
        ? {
            storageScopeId: target.storageScopeId,
            targetId: target.feedbackId,
            targetType: "feedback",
            title: target.title,
          }
        : null;
    },
    async canComment(actor, target) {
      return actorCanUseScopedFeedbackTarget(actor, target.storageScopeId) ? "allowed" : "notFound";
    },
    async canRead(actor, target) {
      return actorCanUseScopedFeedbackTarget(actor, target.storageScopeId) ? "allowed" : "notFound";
    },
    href(targetId, commentId) {
      const feedbackId = targetId.trim();
      return commentId?.trim()
        ? feedbackCommentPath({ commentMessageId: commentId.trim(), feedbackId })
        : feedbackIssuePath(feedbackId);
    },
    async lockForComment(database, target) {
      return lockFeedbackCommentTarget(database, target.targetId);
    },
    async onMessageCommitted(event, database) {
      const result = await recordFeedbackCommentCreatedActivity(database, {
        actorUserId: event.actor.id,
        commentMessageId: event.commentMessageId,
        feedbackId: event.target.targetId,
        teamId: event.target.storageScopeId,
      });
      return { feedbackActivityEventId: result.activityEventId };
    },
    afterMessageCommitted: notifyFeedbackParticipantsOfComment,
  });
}
