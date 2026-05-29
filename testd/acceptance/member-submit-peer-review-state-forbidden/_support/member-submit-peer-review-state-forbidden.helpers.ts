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
  expectPeerReviewForbiddenTargetPanelsVisible,
  expectSubmitPeerReviewActionsAbsent,
  peerReviewForbiddenLootsAbsent,
  peerReviewForbiddenLootsPresent,
  peerReviewForbiddenReviewsAbsent,
  peerReviewForbiddenTargetsAbsent,
  peerReviewForbiddenTargetsMatchFixtures,
  upsertPeerReviewForbiddenTarget,
  workbenchContainsPeerReviewForbiddenTargets,
} from "../../member-submit-peer-review/_support/member-submit-peer-review-forbidden.helpers";
import type {
  MemberSubmitPeerReviewStateForbiddenCaseData,
  StateForbiddenLoot,
  StateForbiddenTarget,
} from "./member-submit-peer-review-state-forbidden.context";

export {
  createPeerReviewForbiddenLoot,
  deletePeerReviewForbiddenLoots,
  deletePeerReviewForbiddenReviews,
  deletePeerReviewForbiddenTargets,
  expectPeerReviewForbiddenTargetPanelsVisible,
  expectSubmitPeerReviewActionsAbsent,
  peerReviewForbiddenLootsAbsent,
  peerReviewForbiddenLootsPresent,
  peerReviewForbiddenReviewsAbsent,
  peerReviewForbiddenTargetsAbsent,
  peerReviewForbiddenTargetsMatchFixtures,
  upsertPeerReviewForbiddenTarget,
  workbenchContainsPeerReviewForbiddenTargets,
};

export function stateTargetFixtures(data: MemberSubmitPeerReviewStateForbiddenCaseData) {
  return [
    data.targets.resultClaiming,
    data.targets.reestimate,
    data.targets.frozen,
    data.targets.settled,
  ];
}

export function stateLootFixtures(data: MemberSubmitPeerReviewStateForbiddenCaseData) {
  return [data.loot.settled];
}

export function stateTargetChallengers(data: MemberSubmitPeerReviewStateForbiddenCaseData) {
  return [data.name, data.collaboratorName];
}

export function stateTargetChallengersByTargetId(data: MemberSubmitPeerReviewStateForbiddenCaseData) {
  return new Map(stateTargetFixtures(data).map((fixture) => [fixture.id, stateTargetChallengers(data)]));
}

export function stateForbiddenReviewers(data: MemberSubmitPeerReviewStateForbiddenCaseData) {
  return [data.name];
}

export async function stateMemberWorkbenchContainsTargets(page: Page, data: MemberSubmitPeerReviewStateForbiddenCaseData) {
  return workbenchContainsPeerReviewForbiddenTargets(page, {
    fixtures: stateTargetFixtures(data),
    scope: "mine",
  });
}

export function asStateTarget(value: unknown): StateForbiddenTarget {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as StateForbiddenTarget).objective !== "object" ||
    (value as StateForbiddenTarget).objective === null ||
    typeof (value as StateForbiddenTarget).objective.id !== "string" ||
    typeof (value as StateForbiddenTarget).objective.title !== "string" ||
    typeof (value as StateForbiddenTarget).objective.flowStatus !== "string"
  ) {
    throw new Error("参数必须是提交匿名互评状态反向用例目标");
  }
  return value as StateForbiddenTarget;
}

export function asStateLoot(value: unknown): StateForbiddenLoot {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as StateForbiddenLoot).id !== "string" ||
    typeof (value as StateForbiddenLoot).objectiveId !== "string" ||
    typeof (value as StateForbiddenLoot).body !== "string"
  ) {
    throw new Error("参数必须是提交匿名互评状态反向用例前置战利品");
  }
  return value as StateForbiddenLoot;
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
    throw new Error("参数必须是提交匿名互评状态反向用例目标配置");
  }
  return value as PeerReviewForbiddenTargetFixture;
}

export function asPeerReviewForbiddenLootFixture(value: unknown): PeerReviewForbiddenLootFixture {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as PeerReviewForbiddenLootFixture).body !== "string" ||
    typeof (value as PeerReviewForbiddenLootFixture).submittedBy !== "string"
  ) {
    throw new Error("参数必须是提交匿名互评状态反向用例战利品配置");
  }
  return value as PeerReviewForbiddenLootFixture;
}
