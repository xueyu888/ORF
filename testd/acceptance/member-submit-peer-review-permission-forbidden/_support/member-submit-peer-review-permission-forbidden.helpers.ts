import type { Page } from "@playwright/test";
import type {
  PeerReviewForbiddenLootFixture,
  PeerReviewForbiddenTargetFixture,
} from "../../member-submit-peer-review/_support/member-submit-peer-review-forbidden.helpers";
import {
  createPeerReviewForbiddenLoot,
  deletePeerReviewForbiddenLoots,
  deletePeerReviewForbiddenReviews,
  deletePeerReviewForbiddenTargets,
  expectPeerReviewForbiddenTargetPanelsAbsent,
  expectPeerReviewForbiddenTargetPanelsVisible,
  expectSubmitPeerReviewActionsAbsent,
  peerReviewForbiddenLootPresent,
  peerReviewForbiddenLootsAbsent,
  peerReviewForbiddenReviewsAbsent,
  peerReviewForbiddenTargetMatchesFixture,
  peerReviewForbiddenTargetsAbsent,
  upsertPeerReviewForbiddenTarget,
  workbenchExcludesPeerReviewForbiddenTargets,
} from "../../member-submit-peer-review/_support/member-submit-peer-review-forbidden.helpers";
import type {
  MemberSubmitPeerReviewPermissionForbiddenCaseData,
  PermissionForbiddenLoot,
  PermissionForbiddenTarget,
} from "./member-submit-peer-review-permission-forbidden.context";

export {
  createPeerReviewForbiddenLoot,
  deletePeerReviewForbiddenLoots,
  deletePeerReviewForbiddenReviews,
  deletePeerReviewForbiddenTargets,
  expectPeerReviewForbiddenTargetPanelsAbsent,
  expectPeerReviewForbiddenTargetPanelsVisible,
  expectSubmitPeerReviewActionsAbsent,
  peerReviewForbiddenLootPresent,
  peerReviewForbiddenLootsAbsent,
  peerReviewForbiddenReviewsAbsent,
  peerReviewForbiddenTargetMatchesFixture,
  peerReviewForbiddenTargetsAbsent,
  upsertPeerReviewForbiddenTarget,
  workbenchExcludesPeerReviewForbiddenTargets,
};

export function permissionTargetFixtures(data: MemberSubmitPeerReviewPermissionForbiddenCaseData) {
  return [data.target];
}

export function permissionLootFixtures(data: MemberSubmitPeerReviewPermissionForbiddenCaseData) {
  return [data.loot];
}

export function permissionTargetChallengers(data: MemberSubmitPeerReviewPermissionForbiddenCaseData) {
  return [data.challengerName, data.collaboratorName];
}

export function permissionForbiddenReviewers(data: MemberSubmitPeerReviewPermissionForbiddenCaseData) {
  return [data.adminName, data.memberName];
}

export async function permissionMemberWorkbenchExcludesTarget(
  page: Page,
  data: MemberSubmitPeerReviewPermissionForbiddenCaseData,
) {
  return workbenchExcludesPeerReviewForbiddenTargets(page, {
    fixtures: permissionTargetFixtures(data),
    scope: "mine",
  });
}

export function asPermissionTarget(value: unknown): PermissionForbiddenTarget {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as PermissionForbiddenTarget).objective !== "object" ||
    (value as PermissionForbiddenTarget).objective === null ||
    typeof (value as PermissionForbiddenTarget).objective.id !== "string" ||
    typeof (value as PermissionForbiddenTarget).objective.title !== "string" ||
    typeof (value as PermissionForbiddenTarget).objective.flowStatus !== "string"
  ) {
    throw new Error("参数必须是提交匿名互评权限反向用例目标");
  }
  return value as PermissionForbiddenTarget;
}

export function asPermissionLoot(value: unknown): PermissionForbiddenLoot {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as PermissionForbiddenLoot).id !== "string" ||
    typeof (value as PermissionForbiddenLoot).objectiveId !== "string" ||
    typeof (value as PermissionForbiddenLoot).body !== "string"
  ) {
    throw new Error("参数必须是提交匿名互评权限反向用例前置战利品");
  }
  return value as PermissionForbiddenLoot;
}

export function asPeerReviewForbiddenTargetFixture(value: unknown): PeerReviewForbiddenTargetFixture {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as PeerReviewForbiddenTargetFixture).id !== "string" ||
    typeof (value as PeerReviewForbiddenTargetFixture).title !== "string" ||
    typeof (value as PeerReviewForbiddenTargetFixture).stage !== "string" ||
    typeof (value as PeerReviewForbiddenTargetFixture).flowStatus !== "string"
  ) {
    throw new Error("参数必须是提交匿名互评权限反向用例目标配置");
  }
  return value as PeerReviewForbiddenTargetFixture;
}
