import { publishRealtimeReadModelInvalidation } from "./realtimeEventBus";

export type OrfReadModelName = "taskManagement" | "bountyHall";
export type OrfDataInvalidationReason =
  | "objective.created"
  | "objective.changed"
  | "objective.lifecycle.changed"
  | "objective.challenge.application.changed"
  | "objective.challenge.recruitment.changed"
  | "objective.alignment.changed"
  | "objective.loot.changed"
  | "objective.trialReview.changed"
  | "result.changed"
  | "task.changed"
  | "feedback.changed"
  | "comment.changed"
  | "project.changed";
export type OrfInvalidationTarget = {
  id: string;
  type: "objective" | "result" | "task" | "subtask" | "feedback" | "comment" | "project";
};

export function publishOrfDataInvalidation(input: {
  actorUserId?: string | null;
  models?: OrfReadModelName[];
  reason: OrfDataInvalidationReason;
  target?: OrfInvalidationTarget;
  teamId: string;
}) {
  publishRealtimeReadModelInvalidation(input.teamId, {
    actorUserId: input.actorUserId,
    models: input.models ?? ["taskManagement"],
    reason: input.reason,
    target: input.target,
  });
}

export function publishObjectiveInvalidation(input: {
  actorUserId?: string | null;
  reason: Extract<
    OrfDataInvalidationReason,
    | "objective.created"
    | "objective.changed"
    | "objective.lifecycle.changed"
    | "objective.challenge.application.changed"
    | "objective.challenge.recruitment.changed"
    | "objective.alignment.changed"
    | "objective.loot.changed"
    | "objective.trialReview.changed"
  >;
  objectiveId: string;
  teamId: string;
}) {
  publishOrfDataInvalidation({
    actorUserId: input.actorUserId,
    models: ["taskManagement", "bountyHall"],
    reason: input.reason,
    target: { id: input.objectiveId, type: "objective" },
    teamId: input.teamId,
  });
}
