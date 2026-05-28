import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../_framework/types";
import { requiredString } from "../../_operators/params";
import type {
  RecruitMemberDbSnapshot,
  RecruitMemberForbiddenCaseData,
  RecruitMemberTarget,
  RecruitmentAttemptResult,
  TestContext,
} from "./_support/recruit-member-forbidden.context";
import {
  attemptRecruitmentAsCurrentUser,
  memberWorkbenchMissingObjective,
  readMemberWorkbenchData,
  readObjectiveSnapshot,
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

  "api.recruitment_forbidden": {
    attempt: async ({ ctx, params }) =>
      attemptRecruitmentAsCurrentUser(
        ctx.page,
        requiredRecruitTarget(params, "target"),
        requiredString(params, "memberName"),
      ),

    forbidden: async ({ params }) => {
      expect([401, 403]).toContain(requiredRecruitmentAttemptResult(params, "result").status);
    },
  },

  "db.recruit_target_snapshot": {
    read: async ({ params }) => requiredSnapshot(params, "target"),
  },

  "page.recruit_action": {
    absent: async ({ ctx }) => {
      await expect(ctx.page.getByRole("button", { name: "征召" })).toHaveCount(0);
    },
  },
} satisfies OperatorRegistry<TestContext, RecruitMemberForbiddenCaseData>;

async function requiredSnapshot(params: StepParams, key: string): Promise<RecruitMemberDbSnapshot> {
  const target = requiredRecruitTarget(params, key);
  const snapshot = await readObjectiveSnapshot(target.id);
  if (!snapshot) {
    throw new Error(`征召目标不存在: ${target.id}`);
  }
  return snapshot;
}

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

function requiredRecruitmentAttemptResult(params: StepParams, key: string): RecruitmentAttemptResult {
  const value = params[key];
  if (!isRecruitmentAttemptResult(value)) {
    throw new Error(`参数 ${key} 必须是征召尝试结果`);
  }
  return value;
}

function isRecruitmentAttemptResult(value: unknown): value is RecruitmentAttemptResult {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as RecruitmentAttemptResult).status === "number"
  );
}
