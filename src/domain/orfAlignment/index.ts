import type { Objective, ObjectiveAlignmentRequest, ObjectiveAlignmentRequestKind, OrfUser } from "../../types/orf";
import { isObjectiveChallenger } from "../orfObjectiveParticipants";

export const objectiveAlignmentRequestKinds = ["reestimateCompletion", "acceptance", "frozenReestimate"] as const satisfies readonly ObjectiveAlignmentRequestKind[];
export const openObjectiveAlignmentRequestStatuses = ["requested", "scheduled"] as const;

export function objectiveAlignmentRequestKindLabel(kind: ObjectiveAlignmentRequestKind) {
  if (kind === "reestimateCompletion") return "重估对齐";
  if (kind === "frozenReestimate") return "重新重估";
  return "验收对齐";
}

export function objectiveAlignmentRequestActionLabel(kind: ObjectiveAlignmentRequestKind) {
  if (kind === "reestimateCompletion") return "申请完成重估";
  if (kind === "frozenReestimate") return "申请重新重估";
  return "申请验收对齐";
}

export function objectiveAlignmentRequestStatusLabel(status: ObjectiveAlignmentRequest["status"]) {
  if (status === "scheduled") return "已约时间";
  if (status === "completed") return "已完成";
  if (status === "needsWork") return "需补充";
  if (status === "cancelled") return "已取消";
  return "待对齐";
}

export function objectiveAlignmentNeedsWorkActionLabel(kind: ObjectiveAlignmentRequestKind) {
  return kind === "reestimateCompletion" ? "打回重估" : "需补充";
}

export function objectiveAlignmentNeedsWorkFeedback(kind: ObjectiveAlignmentRequestKind) {
  if (kind === "reestimateCompletion") return "请继续重估指标口径后再申请对齐。";
  if (kind === "frozenReestimate") return "重新重估申请未通过，请补充需要修改的指标、难度或原因。";
  return "请补充验收材料后再申请对齐。";
}

export function objectiveAlignmentReviewStatusText(
  kind: ObjectiveAlignmentRequestKind,
  status: ObjectiveAlignmentRequest["status"],
) {
  if (status === "scheduled") return "已约定";
  if (status === "completed") return "已完成";
  if (status === "needsWork") {
    return kind === "reestimateCompletion" ? "已打回重估" : "需要补充";
  }
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
      isObjectiveChallenger(objective, currentUser.id) &&
      !existingRequest &&
      ((kind === "reestimateCompletion" && objective.flowStatus === "reestimating") ||
        (kind === "frozenReestimate" && objective.flowStatus === "frozen") ||
        (kind === "acceptance" && objective.flowStatus === "submitted")),
  );
}
