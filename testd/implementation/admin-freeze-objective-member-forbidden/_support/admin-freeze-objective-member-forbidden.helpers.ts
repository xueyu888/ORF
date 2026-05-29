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
  freezeForbiddenTargetsHaveChallenger,
  freezeForbiddenTargetsMatchFixtures,
  freezeTargetFixtureValues,
  upsertFreezeForbiddenTarget,
  workbenchContainsFreezeForbiddenTargets,
  type FreezeForbiddenTargetFixture,
} from "../../admin-freeze-objective/_support/admin-freeze-objective-restrictions.helpers";
import type {
  AdminFreezeObjectiveMemberForbiddenCaseData,
  FreezePrerequisiteResult,
  MemberFreezeForbiddenTarget,
} from "./admin-freeze-objective-member-forbidden.context";

export {
  createFreezePrerequisiteResult,
  deleteFreezeForbiddenTargets,
  deleteFreezePrerequisiteResult,
  expectFreezeForbiddenButtonsAbsent,
  expectFreezeForbiddenTargetPanelsVisible,
  freezeForbiddenTargetMatchesFixture,
  freezeForbiddenTargetsAbsent,
  freezeForbiddenTargetsHaveChallenger,
  freezeForbiddenTargetsMatchFixtures,
  freezeTargetFixtureValues,
  targetResultPresent,
  testResultAbsent,
  upsertFreezeForbiddenTarget,
  workbenchContainsFreezeForbiddenTargets,
};

export function memberFreezeFixtures(data: AdminFreezeObjectiveMemberForbiddenCaseData) {
  return freezeTargetFixtureValues(data.targets);
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
    throw new Error("参数必须是普通成员冻结反向用例目标配置");
  }
  return value as FreezeForbiddenTargetFixture;
}

export function asMemberFreezeForbiddenTarget(value: unknown): MemberFreezeForbiddenTarget {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as MemberFreezeForbiddenTarget).objective !== "object" ||
    (value as MemberFreezeForbiddenTarget).objective === null ||
    typeof (value as MemberFreezeForbiddenTarget).objective.id !== "string" ||
    typeof (value as MemberFreezeForbiddenTarget).objective.title !== "string" ||
    typeof (value as MemberFreezeForbiddenTarget).objective.flowStatus !== "string"
  ) {
    throw new Error("参数必须是普通成员冻结反向用例目标");
  }
  return value as MemberFreezeForbiddenTarget;
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

export async function memberWorkbenchContainsAllTargets(
  page: Page,
  data: AdminFreezeObjectiveMemberForbiddenCaseData,
) {
  return workbenchContainsFreezeForbiddenTargets(page, {
    fixtures: memberFreezeFixtures(data),
    scope: "mine",
  });
}
