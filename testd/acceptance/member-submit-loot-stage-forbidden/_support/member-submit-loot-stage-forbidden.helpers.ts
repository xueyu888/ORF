import type { Page } from "@playwright/test";
import type {
  LootForbiddenResultFixture,
  LootForbiddenTargetFixture,
} from "../../member-submit-loot/_support/member-submit-loot-forbidden.helpers";
import {
  createLootForbiddenResult,
  deleteTestLoot,
  deleteLootForbiddenResults,
  deleteLootForbiddenTargets,
  expectLootForbiddenTargetPanelsVisible,
  expectSubmitLootActionsAbsent,
  lootForbiddenResultsAbsent,
  lootForbiddenResultsPresent,
  lootForbiddenTargetsAbsent,
  lootForbiddenTargetsMatchFixtures,
  testLootAbsent,
  upsertLootForbiddenTarget,
  workbenchContainsLootForbiddenTargets,
} from "../../member-submit-loot/_support/member-submit-loot-forbidden.helpers";
import type {
  MemberSubmitLootStageForbiddenCaseData,
  StageForbiddenResult,
  StageForbiddenTarget,
} from "./member-submit-loot-stage-forbidden.context";

export {
  createLootForbiddenResult,
  deleteTestLoot,
  deleteLootForbiddenResults,
  deleteLootForbiddenTargets,
  expectLootForbiddenTargetPanelsVisible,
  expectSubmitLootActionsAbsent,
  lootForbiddenResultsAbsent,
  lootForbiddenResultsPresent,
  lootForbiddenTargetsAbsent,
  lootForbiddenTargetsMatchFixtures,
  testLootAbsent,
  upsertLootForbiddenTarget,
  workbenchContainsLootForbiddenTargets,
};

export function stageTargetFixtures(data: MemberSubmitLootStageForbiddenCaseData) {
  return [data.targets.resultClaiming, data.targets.reestimate];
}

export function stageResultFixtures(data: MemberSubmitLootStageForbiddenCaseData) {
  return [data.results.resultClaiming, data.results.reestimate];
}

export function stageTargetChallengers(data: MemberSubmitLootStageForbiddenCaseData) {
  return [data.name];
}

export function stageTargetChallengersByTargetId(data: MemberSubmitLootStageForbiddenCaseData) {
  return new Map(stageTargetFixtures(data).map((fixture) => [fixture.id, stageTargetChallengers(data)]));
}

export async function stageMemberWorkbenchContainsTargets(page: Page, data: MemberSubmitLootStageForbiddenCaseData) {
  return workbenchContainsLootForbiddenTargets(page, {
    fixtures: stageTargetFixtures(data),
    scope: "mine",
  });
}

export function asStageTarget(value: unknown): StageForbiddenTarget {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as StageForbiddenTarget).objective !== "object" ||
    (value as StageForbiddenTarget).objective === null ||
    typeof (value as StageForbiddenTarget).objective.id !== "string" ||
    typeof (value as StageForbiddenTarget).objective.title !== "string" ||
    typeof (value as StageForbiddenTarget).objective.flowStatus !== "string"
  ) {
    throw new Error("参数必须是提交战利品阶段反向用例目标");
  }
  return value as StageForbiddenTarget;
}

export function asStageResult(value: unknown): StageForbiddenResult {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as StageForbiddenResult).id !== "string" ||
    typeof (value as StageForbiddenResult).objectiveId !== "string" ||
    typeof (value as StageForbiddenResult).title !== "string" ||
    typeof (value as StageForbiddenResult).metricName !== "string"
  ) {
    throw new Error("参数必须是提交战利品阶段反向用例前置指标");
  }
  return value as StageForbiddenResult;
}

export function asLootForbiddenTargetFixture(value: unknown): LootForbiddenTargetFixture {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as LootForbiddenTargetFixture).id !== "string" ||
    typeof (value as LootForbiddenTargetFixture).title !== "string" ||
    typeof (value as LootForbiddenTargetFixture).stage !== "string" ||
    typeof (value as LootForbiddenTargetFixture).flowStatus !== "string"
  ) {
    throw new Error("参数必须是提交战利品阶段反向用例目标配置");
  }
  return value as LootForbiddenTargetFixture;
}

export function asLootForbiddenResultFixture(value: unknown): LootForbiddenResultFixture {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as LootForbiddenResultFixture).title !== "string" ||
    typeof (value as LootForbiddenResultFixture).metricName !== "string"
  ) {
    throw new Error("参数必须是提交战利品阶段反向用例指标配置");
  }
  return value as LootForbiddenResultFixture;
}
