import type { AppNotification } from "../../types/orf";
import { challengePathForTarget, type ChallengeUrlTargetType } from "../challenge/model/challengeLinks";

const commentTargetTypeToChallengeTargetType: Record<string, ChallengeUrlTargetType> = {
  objective: "objective",
  result: "bounty",
  subtask: "subAction",
  task: "action",
};

export function notificationTargetHref(notification: AppNotification) {
  if (notification.kind === "worklog.reminder" || notification.targetType === "workLog") {
    return notification.targetHref || "/work-logs";
  }

  if (notification.targetType === "feedback" || notification.kind.startsWith("feedback.")) {
    return notification.targetId
      ? `/feedback/${encodeURIComponent(notification.targetId)}`
      : notification.targetHref || "/feedback";
  }

  if (notification.kind === "challenge.application.created" || notification.kind === "objective.challenge.accepted") {
    return challengePathForTarget({ id: notification.targetId, type: "objective" });
  }

  if (notification.kind === "objective.published" || notification.kind === "challenge.application.approved" || notification.kind === "objective.recruitment.created") {
    return challengePathForTarget({ id: notification.targetId, type: "objective" }, "/bounties");
  }

  if (notification.kind === "comment.mention.created") {
    const commentTargetType = notification.metadata.targetType;
    const commentTargetId = notification.metadata.targetId;
    if (commentTargetType === "feedback" && commentTargetId) {
      return `/feedback/${encodeURIComponent(commentTargetId)}`;
    }
    const challengeTargetType = commentTargetType ? commentTargetTypeToChallengeTargetType[commentTargetType] : null;
    if (challengeTargetType && commentTargetId) {
      return challengePathForTarget({ id: commentTargetId, type: challengeTargetType });
    }
  }

  return notification.targetHref || "/notifications";
}
