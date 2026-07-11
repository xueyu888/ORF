import type { NotificationKind } from "../../../src/types/orf";
import type { NotificationPolicyDescriptor } from "../contracts";

export const notificationPolicyRegistry: Record<NotificationKind, NotificationPolicyDescriptor> = {
  "challenge.application.approved": {
    kind: "challenge.application.approved",
    replyTarget: "notification-target",
    stream: "personalNotification",
  },
  "challenge.application.created": {
    kind: "challenge.application.created",
    replyTarget: "notification-target",
    stream: "personalNotification",
  },
  "challenge.application.rejected": {
    kind: "challenge.application.rejected",
    replyTarget: "notification-target",
    stream: "personalNotification",
  },
  "comment.mention.created": {
    kind: "comment.mention.created",
    replyTarget: "metadata-comment-target",
    stream: "personalNotification",
  },
  "comment.reply.created": {
    kind: "comment.reply.created",
    replyTarget: "metadata-comment-target",
    stream: "personalNotification",
  },
  "comment.thread.status.changed": {
    kind: "comment.thread.status.changed",
    replyTarget: "metadata-comment-target",
    stream: "personalNotification",
  },
  "data.sync.conflict": {
    kind: "data.sync.conflict",
    replyTarget: "none",
    stream: "personalNotification",
  },
  "feedback.commented": {
    kind: "feedback.commented",
    replyTarget: "notification-target",
    stream: "personalNotification",
  },
  "feedback.created": {
    kind: "feedback.created",
    replyTarget: "notification-target",
    stream: "personalNotification",
  },
  "feedback.status.changed": {
    kind: "feedback.status.changed",
    replyTarget: "notification-target",
    stream: "personalNotification",
  },
  "feedback.assigned": {
    kind: "feedback.assigned",
    replyTarget: "notification-target",
    stream: "personalNotification",
  },
  "objective.alignment.requested": {
    kind: "objective.alignment.requested",
    replyTarget: "notification-target",
    stream: "personalNotification",
  },
  "objective.alignment.reviewed": {
    kind: "objective.alignment.reviewed",
    replyTarget: "notification-target",
    stream: "personalNotification",
  },
  "objective.challenge.accepted": {
    kind: "objective.challenge.accepted",
    replyTarget: "notification-target",
    stream: "personalNotification",
  },
  "objective.loot.submitted": {
    kind: "objective.loot.submitted",
    replyTarget: "metadata-comment-target",
    stream: "personalNotification",
  },
  "objective.peerReview.requested": {
    kind: "objective.peerReview.requested",
    replyTarget: "notification-target",
    stream: "personalNotification",
  },
  "objective.published": {
    kind: "objective.published",
    replyTarget: "notification-target",
    stream: "teamAnnouncement",
  },
  "objective.revision.required": {
    kind: "objective.revision.required",
    replyTarget: "notification-target",
    stream: "personalNotification",
  },
  "objective.settlement.updated": {
    kind: "objective.settlement.updated",
    replyTarget: "none",
    stream: "personalNotification",
  },
  "objective.settled": {
    kind: "objective.settled",
    replyTarget: "none",
    stream: "personalNotification",
  },
  "objective.recruitment.created": {
    kind: "objective.recruitment.created",
    replyTarget: "notification-target",
    stream: "personalNotification",
  },
  "objective.reinforcement.added": {
    kind: "objective.reinforcement.added",
    replyTarget: "notification-target",
    stream: "personalNotification",
  },
  "worklog.reminder": {
    kind: "worklog.reminder",
    replyTarget: "none",
    stream: "personalNotification",
  },
};

export function notificationPolicy(kind: NotificationKind) {
  return notificationPolicyRegistry[kind];
}
