import type { Objective, ObjectiveAlignmentRequest, ObjectiveAlignmentRequestKind, OrfUser } from "../../types/orf";

export const objectiveAlignmentRequestKinds = ["reestimateCompletion", "acceptance"] as const satisfies readonly ObjectiveAlignmentRequestKind[];
export const openObjectiveAlignmentRequestStatuses = ["requested", "scheduled"] as const;

export function objectiveAlignmentRequestKindLabel(kind: ObjectiveAlignmentRequestKind) {
  return kind === "reestimateCompletion" ? "重估对齐" : "验收对齐";
}

export function objectiveAlignmentRequestActionLabel(kind: ObjectiveAlignmentRequestKind) {
  return kind === "reestimateCompletion" ? "申请完成重估" : "申请验收对齐";
}

export function objectiveAlignmentRequestStatusLabel(status: ObjectiveAlignmentRequest["status"]) {
  if (status === "scheduled") return "已约时间";
  if (status === "completed") return "已完成";
  if (status === "needsWork") return "需补充";
  if (status === "cancelled") return "已取消";
  return "待对齐";
}

export function isOpenObjectiveAlignmentRequest(request: Pick<ObjectiveAlignmentRequest, "status">) {
  return openObjectiveAlignmentRequestStatuses.includes(request.status as (typeof openObjectiveAlignmentRequestStatuses)[number]);
}

export function latestObjectiveAlignmentRequest(
  objectiveId: string,
  kind: ObjectiveAlignmentRequestKind,
  requests: readonly ObjectiveAlignmentRequest[],
): ObjectiveAlignmentRequest | null {
  return requests
    .filter((request) => request.objectiveId === objectiveId && request.kind === kind)
    .sort((left, right) => right.proposedAt.localeCompare(left.proposedAt))[0] ?? null;
}

export function latestOpenObjectiveAlignmentRequest(
  objectiveId: string,
  kind: ObjectiveAlignmentRequestKind,
  requests: readonly ObjectiveAlignmentRequest[],
): ObjectiveAlignmentRequest | null {
  return latestObjectiveAlignmentRequest(objectiveId, kind, requests.filter(isOpenObjectiveAlignmentRequest));
}

export function canRequestObjectiveAlignment(
  objective: Objective | null | undefined,
  currentUser: OrfUser | null | undefined,
  kind: ObjectiveAlignmentRequestKind,
  existingRequest: ObjectiveAlignmentRequest | null | undefined,
): boolean {
  return Boolean(
    objective &&
      currentUser?.role === "member" &&
      objective.challengers.includes(currentUser.name) &&
      !existingRequest &&
      ((kind === "reestimateCompletion" && objective.flowStatus === "reestimating") ||
        (kind === "acceptance" && objective.flowStatus === "submitted")),
  );
}
