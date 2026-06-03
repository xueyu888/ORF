import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../_framework/types";
import { requiredNumber, requiredString } from "../../_operators/params";
import type { FinalScoreLedger, FinalScoreTarget, TestContext, ViewFinalScoreCaseData } from "./_support/view-final-score.context";
import {
  createFinalScoreLedger,
  deleteFinalScoreLedger,
  finalScoreLedgerPresent,
  finalScoreTargetFromObjective,
  finalScoreTargetSettledForMember,
  prepareFinalScoreTarget,
  testFinalScoreLedgerAbsent,
} from "./_support/view-final-score.helpers";

export const viewFinalScoreOperators = {
  "db.final_score_target": {
    from_objective: async ({ params }) => finalScoreTargetFromObjective(requiredString(params, "objectiveId")),

    prepare: async ({ params }) => {
      const target = await readFinalScoreTargetParam(params);
      await prepareFinalScoreTarget(target, requiredStringArray(params, "memberNames"), requiredNumber(params, "points"));
      return target;
    },

    settled_for_member: async ({ params }) => {
      await expect
        .poll(() => finalScoreTargetSettledForMember(requiredFinalScoreTarget(params, "target"), requiredString(params, "memberName")))
        .toBe(true);
    },
  },

  "db.final_score_ledger": {
    absent: async ({ params }) => {
      await expect.poll(() => testFinalScoreLedgerAbsent(requiredString(params, "reason"))).toBe(true);
    },

    create: async ({ params }) => {
      return createFinalScoreLedger(requiredFinalScoreTarget(params, "target"), {
        id: requiredString(params, "id"),
        userId: requiredString(params, "userId"),
        memberName: requiredString(params, "memberName"),
        points: requiredNumber(params, "points"),
        reason: requiredString(params, "reason"),
      });
    },

    present: async ({ params }) => {
      await expect
        .poll(() => finalScoreLedgerPresent(requiredFinalScoreTarget(params, "target"), requiredString(params, "memberName"), requiredNumber(params, "points")))
        .toBe(true);
    },

    delete: async ({ params }) => {
      await deleteFinalScoreLedger(requiredString(params, "reason"), optionalFinalScoreLedger(params, "ledger"));
    },
  },

  "page.final_score": {
    visible: async ({ ctx, params }) => {
      const memberName = requiredString(params, "memberName");
      const pointsText = requiredNumber(params, "points").toFixed(1);
      const leaderboard = ctx.page.locator(".reports-leaderboard-card").filter({
        has: ctx.page.getByRole("heading", { name: "成员积分排行榜" }),
      });
      await expect(leaderboard).toBeVisible();
      const row = leaderboard.getByRole("row").filter({ hasText: memberName }).filter({ hasText: pointsText });
      await expect(row).toBeVisible();
    },
  },
} satisfies OperatorRegistry<TestContext, ViewFinalScoreCaseData>;

function requiredFinalScoreTarget(params: StepParams, key: string): FinalScoreTarget {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as FinalScoreTarget).objective !== "object" ||
    (value as FinalScoreTarget).objective === null ||
    typeof (value as FinalScoreTarget).objective.id !== "string" ||
    typeof (value as FinalScoreTarget).objective.teamId !== "string" ||
    typeof (value as FinalScoreTarget).objective.title !== "string" ||
    typeof (value as FinalScoreTarget).objective.flowStatus !== "string"
  ) {
    throw new Error(`参数 ${key} 必须是最终分数目标`);
  }

  return value as FinalScoreTarget;
}

async function readFinalScoreTargetParam(params: StepParams) {
  if (params.target !== undefined) {
    return requiredFinalScoreTarget(params, "target");
  }

  return finalScoreTargetFromObjective(requiredString(params, "objectiveId"));
}

function optionalFinalScoreLedger(params: StepParams, key: string): FinalScoreLedger | null {
  const value = params[key];
  if (value === undefined || value === null) {
    return null;
  }

  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as FinalScoreLedger).id !== "string" ||
    typeof (value as FinalScoreLedger).objectiveId !== "string" ||
    typeof (value as FinalScoreLedger).memberName !== "string" ||
    typeof (value as FinalScoreLedger).points !== "number" ||
    typeof (value as FinalScoreLedger).reason !== "string"
  ) {
    throw new Error(`参数 ${key} 必须是最终分数积分流水`);
  }

  return value as FinalScoreLedger;
}

function requiredStringArray(params: StepParams, key: string) {
  const value = params[key];
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value;
  }

  throw new Error(`参数 ${key} 必须是字符串数组`);
}
