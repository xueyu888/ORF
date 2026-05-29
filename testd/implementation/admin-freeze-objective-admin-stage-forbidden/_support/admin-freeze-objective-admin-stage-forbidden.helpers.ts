import type { Page } from "@playwright/test";
import {
  createFreezePrerequisiteResult,
  deleteFreezePrerequisiteResult,
  targetResultPresent,
  testResultAbsent,
} from "../../admin-freeze-objective/_support/admin-freeze-objective.helpers";
import {
  deleteFreezeForbiddenTargets,
  expectFreezeForbiddenButtonsAbsent,
  expectFreezeForbiddenTargetPanelsVisible,
  freezeForbiddenTargetMatchesFixture,
  freezeForbiddenTargetsAbsent,
  freezeForbiddenTargetsMatchFixtures,
  freezeTargetFixtureValues,
  upsertFreezeForbiddenTarget,
  workbenchContainsFreezeForbiddenTargets,
  type FreezeForbiddenTargetFixture,
} from "../../admin-freeze-objective/_support/admin-freeze-objective-restrictions.helpers";
import type {
  AdminFreezeObjectiveAdminStageForbiddenCaseData,
  AdminStageForbiddenTarget,
  FreezePrerequisiteResult,
  FreezePrerequisiteResultInput,
} from "./admin-freeze-objective-admin-stage-forbidden.context";

export {
  createFreezePrerequisiteResult,
  deleteFreezeForbiddenTargets,
  deleteFreezePrerequisiteResult,
  expectFreezeForbiddenButtonsAbsent,
  expectFreezeForbiddenTargetPanelsVisible,
  freezeForbiddenTargetMatchesFixture,
  freezeForbiddenTargetsAbsent,
  freezeForbiddenTargetsMatchFixtures,
  freezeTargetFixtureValues,
  targetResultPresent,
  testResultAbsent,
  upsertFreezeForbiddenTarget,
  workbenchContainsFreezeForbiddenTargets,
};

export function adminStageForbiddenFixtures(data: AdminFreezeObjectiveAdminStageForbiddenCaseData) {
  return freezeTargetFixtureValues(data.targets);
}

export function adminStageForbiddenResults(data: AdminFreezeObjectiveAdminStageForbiddenCaseData) {
  return Object.values(data.results);
}

export function asFreezeForbiddenFixture(value: unknown): FreezeForbiddenTargetFixture {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as FreezeForbiddenTargetFixture).id !== "string" ||
    typeof (value as FreezeForbiddenTargetFixture).title !== "string" ||
    typeof (value as FreezeForbiddenTargetFixture).stage !== "string" ||
    typeof (value as FreezeForbiddenTargetFixture).flowStatus !== "string" ||
    ((value as FreezeForbiddenTargetFixture).confirmedAt !== "present" &&
      (value as FreezeForbiddenTargetFixture).confirmedAt !== "absent")
  ) {
    throw new Error("参数必须是管理员阶段冻结反向用例目标配置");
  }
  return value as FreezeForbiddenTargetFixture;
}

export function asAdminStageForbiddenTarget(value: unknown): AdminStageForbiddenTarget {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as AdminStageForbiddenTarget).objective !== "object" ||
    (value as AdminStageForbiddenTarget).objective === null ||
    typeof (value as AdminStageForbiddenTarget).objective.id !== "string" ||
    typeof (value as AdminStageForbiddenTarget).objective.title !== "string" ||
    typeof (value as AdminStageForbiddenTarget).objective.flowStatus !== "string"
  ) {
    throw new Error("参数必须是管理员阶段冻结反向用例目标");
  }
  return value as AdminStageForbiddenTarget;
}

export function asFreezePrerequisiteResultInput(value: unknown): FreezePrerequisiteResultInput {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as FreezePrerequisiteResultInput).title !== "string" ||
    typeof (value as FreezePrerequisiteResultInput).metricName !== "string"
  ) {
    throw new Error("参数必须是冻结前置指标配置");
  }
  return value as FreezePrerequisiteResultInput;
}

export function asFreezePrerequisiteResult(value: unknown): FreezePrerequisiteResult {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as FreezePrerequisiteResult).id !== "string" ||
    typeof (value as FreezePrerequisiteResult).objectiveId !== "string" ||
    typeof (value as FreezePrerequisiteResult).title !== "string" ||
    typeof (value as FreezePrerequisiteResult).metricName !== "string"
  ) {
    throw new Error("参数必须是冻结前置指标");
  }
  return value as FreezePrerequisiteResult;
}

export async function adminWorkbenchContainsAllTargets(
  page: Page,
  data: AdminFreezeObjectiveAdminStageForbiddenCaseData,
) {
  return workbenchContainsFreezeForbiddenTargets(page, {
    fixtures: adminStageForbiddenFixtures(data),
    scope: "all",
  });
}
