import { objectiveParticipantSnapshot, userNameByIdMap } from "../domain/orfObjectiveParticipants";
import { createDefaultOrfReadModelRules } from "../domain/orfReadModel";
import { objectiveStageForFlowStatus } from "../domain/orfLifecycle";
import { uncertaintyScoreFor } from "../domain/orfSettlement";
import { userDisplayProfilesFromUsers } from "../domain/userDisplayProfile";
import type { ChallengeApplication, Objective, OrfProject, OrfState, Result, Task } from "../types/orf";
import { addCalendarDays, localDateString } from "../utils/date";

const currentDate = () => localDateString(new Date());
const latestDate = (values: Array<string | undefined | null>) => values.filter(Boolean).sort().at(-1) ?? "";

export function loadEmptyOrfStateSnapshot(): OrfState {
  return {
    users: [],
    userProfiles: [],
    currentUserId: "",
    permissionRules: [],
    projects: [],
    objectives: [],
    results: [],
    tasks: [],
    evidence: [],
    decisions: [],
    evalRuns: [],
    scenarios: [],
    failureSamples: [],
    comments: [],
    objectiveLoot: [],
    objectiveTrialReviews: [],
    objectiveAcceptanceReviews: [],
    objectiveAlignmentRequests: [],
    objectiveSettlementEvents: [],
    pointLedger: [],
    rules: createDefaultOrfReadModelRules(),
  };
}

function inferFlowStatus(
  objective: Objective,
  challengerUserIds: string[],
  assignedChallengerUserIds: string[],
  challengeApplications: ChallengeApplication[],
): Objective["flowStatus"] {
  if (objective.flowStatus) return objective.flowStatus;
  if (objective.objectiveSettlementPoints != null) return "settled";
  if (objective.acceptedResult) return "accepted";
  if (objective.lootSubmittedAt) return "submitted";
  if (objective.confirmedAt) return "frozen";
  if (challengerUserIds.length) return "reestimating";
  if (assignedChallengerUserIds.length > 0) return "recruiting";
  if (challengeApplications.some((application) => application.status === "pending")) return "applying";
  return "candidate";
}

function normalizeProject(project: OrfProject): OrfProject | null {
  const id = project.id?.trim();
  const name = project.name?.trim();
  if (!id || !name) return null;
  return {
    ...project,
    id,
    name,
    createdAt: project.createdAt ?? currentDate(),
    updatedAt: project.updatedAt ?? project.createdAt ?? currentDate(),
  };
}

function normalizeResult(result: Result): Result {
  const updatedAt = result.updatedAt ?? result.createdAt ?? currentDate();
  return {
    ...result,
    source: result.source ?? "managerDefined",
    definer: result.definer ?? "",
    definerUserId: result.definerUserId,
    uncertaintyScore: typeof result.uncertaintyScore === "number" ? result.uncertaintyScore : uncertaintyScoreFor(result.uncertaintyLevel),
    executionCompleted: result.executionCompleted ?? false,
    acceptedResult: result.acceptedResult ?? "unreviewed",
    createdAt: result.createdAt ?? updatedAt,
    updatedAt,
  };
}

function normalizeObjective(objective: Objective, tasks: Task[], userNameById: Map<string, string>): Objective {
  const participants = objectiveParticipantSnapshot({
    challengerUserIds: objective.challengerUserIds,
    challengers: objective.challengers,
    assignedChallengerUserIds: objective.assignedChallengerUserIds,
    assignedChallengers: objective.assignedChallengers,
    userNameById,
  });
  const challengeApplications = (objective.challengeApplications ?? [])
    .map((application) => ({ ...application, applicantUserId: application.applicantUserId }))
    .filter((application) => application.applicantUserId);
  const flowStatus = inferFlowStatus(objective, participants.challengerUserIds, participants.assignedChallengerUserIds, challengeApplications);

  return {
    ...objective,
    projectId: objective.projectId?.trim() || null,
    flowStatus,
    finalDueAt:
      objective.finalDueAt
      || latestDate(tasks.filter((task) => task.linkedObjectiveId === objective.id).map((task) => task.dueDate))
      || addCalendarDays(objective.updatedAt, 14),
    challengers: participants.challengers,
    challengerUserIds: participants.challengerUserIds,
    assignedChallengers: participants.assignedChallengers,
    assignedChallengerUserIds: participants.assignedChallengerUserIds,
    challengeApplications,
    acceptedAt: objective.acceptedAt ?? null,
    confirmationDueAt: objective.confirmationDueAt ?? null,
    confirmedAt: objective.confirmedAt ?? null,
    lootSubmittedAt: objective.lootSubmittedAt ?? null,
    acceptedResult: objective.acceptedResult ?? null,
    completionMultiplier: objective.completionMultiplier ?? null,
    objectiveBasePoints: objective.objectiveBasePoints ?? 0,
    objectiveSettlementPoints: objective.objectiveSettlementPoints ?? null,
    stage: objectiveStageForFlowStatus(flowStatus),
  };
}

export function normalizeState(state: OrfState): OrfState {
  const normalizedUsers = (state.users ?? []).map((user) => ({ ...user, status: user.status ?? "active" }));
  const userNameById = userNameByIdMap(normalizedUsers);
  const tasks = (state.tasks ?? []).map((task) => ({
    ...task,
    assigneeUserId: task.assigneeUserId ?? "",
    checklist: (task.checklist ?? []).map((item) => ({ ...item, updatedAt: item.updatedAt ?? task.updatedAt })),
  }));
  const results = (state.results ?? []).map(normalizeResult);

  return {
    ...loadEmptyOrfStateSnapshot(),
    ...state,
    users: normalizedUsers,
    userProfiles: state.userProfiles ?? userDisplayProfilesFromUsers(normalizedUsers),
    currentUserId: state.currentUserId ?? "",
    permissionRules: state.permissionRules ?? [],
    projects: (state.projects ?? []).map(normalizeProject).filter((project): project is OrfProject => Boolean(project)),
    comments: (state.comments ?? []).map((thread) => ({
      ...thread,
      messages: (thread.messages ?? []).map((message) => ({ ...message, attachments: message.attachments ?? [] })),
    })),
    objectives: (state.objectives ?? []).map((objective) => normalizeObjective(objective, tasks, userNameById)),
    results,
    tasks,
    objectiveLoot: state.objectiveLoot ?? [],
    objectiveTrialReviews: state.objectiveTrialReviews ?? [],
    objectiveAcceptanceReviews: state.objectiveAcceptanceReviews ?? [],
    objectiveAlignmentRequests: state.objectiveAlignmentRequests ?? [],
    objectiveSettlementEvents: state.objectiveSettlementEvents ?? [],
    pointLedger: state.pointLedger ?? [],
    rules: { ...createDefaultOrfReadModelRules(), ...(state.rules ?? {}) },
  };
}
