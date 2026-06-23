import type { Objective, OrfUser } from "../../types/orf";

export type ObjectiveParticipantFields = Pick<
  Objective,
  "assignedChallengerUserIds" | "assignedChallengers" | "challengerUserIds" | "challengers"
>;

export type ObjectiveParticipantUser = Pick<OrfUser, "id" | "name">;

export type ContributionMemberTarget = {
  member: string;
  memberUserId: string;
};

export type ObjectiveParticipantSnapshotInput = {
  assignedChallengerUserIds?: Array<string | null | undefined>;
  challengerUserIds?: Array<string | null | undefined>;
  userNameById?: Map<string, string>;
};

export type ObjectiveParticipantSnapshot = {
  assignedChallengerUserIds: string[];
  assignedChallengers: string[];
  challengerUserIds: string[];
  challengers: string[];
};

export function isRealParticipantName(value: string | undefined | null) {
  const name = value?.trim() ?? "";
  return name !== "" && name !== "User" && name !== "未分配";
}

export function uniqueParticipantNames(values: Array<string | undefined | null>) {
  return Array.from(new Set(values.filter(isRealParticipantName).map((value) => value!.trim())));
}

export function uniqueParticipantUserIds(values: Array<string | undefined | null>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

export function userNameByIdMap(users: readonly ObjectiveParticipantUser[]) {
  return new Map(users.map((user) => [user.id, user.name]));
}

export function participantDisplayNamesForUserIds(
  userNameById: Map<string, string>,
  userIds: Array<string | undefined | null>,
) {
  const names = uniqueParticipantUserIds(userIds)
    .map((userId) => userNameById.get(userId) ?? userId)
    .filter(isRealParticipantName)
    .map((name) => name!.trim());
  return uniqueParticipantNames(names);
}

export function objectiveParticipantSnapshot(input: ObjectiveParticipantSnapshotInput): ObjectiveParticipantSnapshot {
  const userNameById = input.userNameById ?? new Map<string, string>();

  const effectiveChallengerUserIds = uniqueParticipantUserIds(input.challengerUserIds ?? []);
  const assignedChallengerUserIds = uniqueParticipantUserIds(input.assignedChallengerUserIds ?? []);
  const effectiveAssignedChallengerUserIds = assignedChallengerUserIds
    .filter((userId) => !effectiveChallengerUserIds.includes(userId));

  return {
    challengerUserIds: effectiveChallengerUserIds,
    challengers: participantDisplayNamesForUserIds(userNameById, effectiveChallengerUserIds),
    assignedChallengerUserIds: effectiveAssignedChallengerUserIds,
    assignedChallengers: participantDisplayNamesForUserIds(userNameById, effectiveAssignedChallengerUserIds),
  };
}

export function objectiveChallengerUserIds(objective: Pick<Objective, "challengerUserIds"> | null | undefined) {
  return uniqueParticipantUserIds(objective?.challengerUserIds ?? []);
}

export function objectiveAssignedChallengerUserIds(objective: Pick<Objective, "assignedChallengerUserIds" | "challengerUserIds"> | null | undefined) {
  const challengerUserIds = objectiveChallengerUserIds(objective);
  return uniqueParticipantUserIds(objective?.assignedChallengerUserIds ?? []).filter((userId) => !challengerUserIds.includes(userId));
}

export function isObjectiveChallenger(objective: Pick<Objective, "challengerUserIds"> | null | undefined, userId: string | null | undefined) {
  const actorUserId = userId?.trim();
  return Boolean(actorUserId && objectiveChallengerUserIds(objective).includes(actorUserId));
}

export function isObjectiveAssignedChallenger(
  objective: Pick<Objective, "assignedChallengerUserIds" | "challengerUserIds"> | null | undefined,
  userId: string | null | undefined,
) {
  const actorUserId = userId?.trim();
  return Boolean(actorUserId && objectiveAssignedChallengerUserIds(objective).includes(actorUserId));
}

export function objectiveHasChallengers(objective: Pick<Objective, "challengerUserIds"> | null | undefined) {
  return objectiveChallengerUserIds(objective).length > 0;
}

export function objectiveChallengerCount(objective: Pick<Objective, "challengerUserIds"> | null | undefined) {
  return objectiveChallengerUserIds(objective).length;
}

export function objectiveChallengerTargets(
  objective: Pick<Objective, "challengerUserIds">,
  userNameById: Map<string, string> = new Map(),
): ContributionMemberTarget[] {
  const challengerUserIds = objectiveChallengerUserIds(objective);
  const names = participantDisplayNamesForUserIds(userNameById, challengerUserIds);
  return challengerUserIds.map((userId, index) => ({
    member: names[index] ?? userId,
    memberUserId: userId,
  }));
}
