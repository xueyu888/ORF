import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../_framework/types";
import type {
  RecruitMemberForbiddenCaseData,
  RecruitMemberTarget,
  TestContext,
} from "./_support/recruit-member-forbidden.context";
import {
  memberWorkbenchMissingObjective,
  readMemberWorkbenchData,
} from "./_support/recruit-member-forbidden.helpers";

export const recruitMemberForbiddenOperators = {
  "api.member_workbench": {
    read: async ({ ctx }) => readMemberWorkbenchData(ctx.page),

    objective_absent: async ({ ctx, params }) => {
      await expect
        .poll(() => memberWorkbenchMissingObjective(ctx.page, requiredRecruitTarget(params, "target")))
        .toBe(true);
    },
  },
} satisfies OperatorRegistry<TestContext, RecruitMemberForbiddenCaseData>;

function requiredRecruitTarget(params: StepParams, key: string): RecruitMemberTarget {
  const value = params[key];
  if (!isRecruitTarget(value)) {
    throw new Error(`参数 ${key} 必须是征召目标`);
  }
  return value;
}

function isRecruitTarget(value: unknown): value is RecruitMemberTarget {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as RecruitMemberTarget).id === "string" &&
    typeof (value as RecruitMemberTarget).title === "string" &&
    typeof (value as RecruitMemberTarget).flowStatus === "string" &&
    typeof (value as RecruitMemberTarget).stage === "string" &&
    typeof (value as RecruitMemberTarget).status === "string" &&
    Array.isArray((value as RecruitMemberTarget).challengers) &&
    Array.isArray((value as RecruitMemberTarget).assignedChallengers) &&
    Array.isArray((value as RecruitMemberTarget).challengeApplications)
  );
}
