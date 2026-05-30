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
  expectLootForbiddenTargetPanelsAbsent,
  expectLootForbiddenTargetPanelsVisible,
  expectSubmitLootActionsAbsent,
  lootForbiddenResultPresent,
  lootForbiddenResultsAbsent,
  lootForbiddenTargetMatchesFixture,
  lootForbiddenTargetsAbsent,
  testLootAbsent,
  upsertLootForbiddenTarget,
  workbenchExcludesLootForbiddenTargets,
} from "../../member-submit-loot/_support/member-submit-loot-forbidden.helpers";
import type {
  MemberSubmitLootPermissionForbiddenCaseData,
  PermissionForbiddenResult,
  PermissionForbiddenTarget,
} from "./member-submit-loot-permission-forbidden.context";

export {
  createLootForbiddenResult,
  deleteTestLoot,
  deleteLootForbiddenResults,
  deleteLootForbiddenTargets,
  expectLootForbiddenTargetPanelsAbsent,
  expectLootForbiddenTargetPanelsVisible,
  expectSubmitLootActionsAbsent,
  lootForbiddenResultPresent,
  lootForbiddenResultsAbsent,
  lootForbiddenTargetMatchesFixture,
  lootForbiddenTargetsAbsent,
  testLootAbsent,
  upsertLootForbiddenTarget,
  workbenchExcludesLootForbiddenTargets,
};

export function permissionTargetFixtures(data: MemberSubmitLootPermissionForbiddenCaseData) {
  return [data.target];
}

export function permissionResultFixtures(data: MemberSubmitLootPermissionForbiddenCaseData) {
  return [data.result];
}

export function permissionTargetChallengers(data: MemberSubmitLootPermissionForbiddenCaseData) {
  return [data.challengerName];
}

export async function permissionMemberWorkbenchExcludesTarget(page: Page, data: MemberSubmitLootPermissionForbiddenCaseData) {
  return workbenchExcludesLootForbiddenTargets(page, {
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
    throw new Error("参数必须是提交战利品权限反向用例目标");
  }
  return value as PermissionForbiddenTarget;
}

export function asPermissionResult(value: unknown): PermissionForbiddenResult {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as PermissionForbiddenResult).id !== "string" ||
    typeof (value as PermissionForbiddenResult).objectiveId !== "string" ||
    typeof (value as PermissionForbiddenResult).title !== "string" ||
    typeof (value as PermissionForbiddenResult).metricName !== "string"
  ) {
    throw new Error("参数必须是提交战利品权限反向用例前置指标");
  }
  return value as PermissionForbiddenResult;
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
    throw new Error("参数必须是提交战利品权限反向用例目标配置");
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
    throw new Error("参数必须是提交战利品权限反向用例指标配置");
  }
  return value as LootForbiddenResultFixture;
}
