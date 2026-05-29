import type { AppNotification } from "../../types/orf";
import { challengePathForTarget, type ChallengeUrlTargetType } from "../challenge/model/challengeLinks";

const commentTargetTypeToChallengeTargetType: Record<string, ChallengeUrlTargetType> = {
  objective: "objective",
  result: "bounty",
  subtask: "subAction",
  task: "action",
};

export function notificationTargetHref(notification: AppNotification) {
  if (notification.kind === "challenge.application.created" || notification.kind === "objective.challenge.accepted") {
    return challengePathForTarget({ id: notification.targetId, type: "objective" });
  }

  if (notification.kind === "challenge.application.approved" || notification.kind === "objective.recruitment.created") {
    return challengePathForTarget({ id: notification.targetId, type: "objective" }, "/bounties");
  }

  if (notification.kind === "comment.mention.created") {
    const commentTargetType = notification.metadata.targetType;
    const commentTargetId = notification.metadata.targetId;
    const challengeTargetType = commentTargetType ? commentTargetTypeToChallengeTargetType[commentTargetType] : null;
    if (challengeTargetType && commentTargetId) {
      return challengePathForTarget({ id: commentTargetId, type: challengeTargetType });
    }
  }

  return notification.targetHref || "/notifications";
}
