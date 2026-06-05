import type { Objective } from "../../types/orf";
import {
  canAcceptObjectiveChallengeByFlow,
  canApplyForObjectiveChallenge,
  isObjectiveChallengeEntryClosedByFlow,
} from "../orfLifecycle";
import {
  isObjectiveAssignedChallenger,
  isObjectiveChallenger,
} from "../orfObjectiveParticipants";

export type ObjectiveChallengeEntryTarget = Pick<
  Objective,
  "acceptedResult" | "flowStatus" | "lootSubmittedAt" | "objectiveSettlementPoints"
>;

export function objectiveChallengeEntryClosed(objective: ObjectiveChallengeEntryTarget) {
  return (
    isObjectiveChallengeEntryClosedByFlow(objective) ||
    Boolean(objective.lootSubmittedAt || objective.acceptedResult || objective.objectiveSettlementPoints != null)
  );
}

export type ObjectiveChallengeApplicationTarget = ObjectiveChallengeEntryTarget & Pick<
  Objective,
  "assignedChallengerUserIds" | "challengeApplications" | "challengerUserIds"
>;

export function canApplyToObjectiveChallengeEntry(
  objective: ObjectiveChallengeApplicationTarget,
  applicantUserId: string | null | undefined,
) {
  const actorUserId = applicantUserId?.trim();
  return Boolean(
    actorUserId &&
      canApplyForObjectiveChallenge(objective) &&
      !objectiveChallengeEntryClosed(objective) &&
      !isObjectiveChallenger(objective, actorUserId) &&
      !isObjectiveAssignedChallenger(objective, actorUserId) &&
      !(objective.challengeApplications ?? []).some((application) => application.applicantUserId === actorUserId && application.status === "pending"),
  );
}

export function canAcceptObjectiveChallengeEntryForActor(
  objective: ObjectiveChallengeApplicationTarget,
  actorUserId: string | null | undefined,
) {
  const challengerUserId = actorUserId?.trim();
  if (!challengerUserId) return false;
  const hasApprovedApplication = (objective.challengeApplications ?? []).some(
    (application) => application.applicantUserId === challengerUserId && application.status === "approved",
  );
  return (
    canAcceptObjectiveChallengeByFlow(objective) &&
    !objectiveChallengeEntryClosed(objective) &&
    !isObjectiveChallenger(objective, challengerUserId) &&
    (isObjectiveAssignedChallenger(objective, challengerUserId) || hasApprovedApplication)
  );
}
