import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../_framework/types";
import { requiredNumber, requiredString } from "../../_operators/params";
import type { MemberScoreStatisticsCaseData, ScoreStatisticsTarget, TestContext } from "./_support/member-score-statistics.context";
import {
  createScoreLedgers,
  deleteScoreLedgers,
  prepareScoreStatisticsTarget,
  scoreLedgerPresent,
  scoreLedgerTotalForMember,
  scoreStatisticsTargetFromObjective,
  scoreStatisticsTargetSettled,
  testScoreLedgersAbsent,
} from "./_support/member-score-statistics.helpers";

export const memberScoreStatisticsOperators = {
  "db.score_statistics_target": {
    from_objective: async ({ params }) => scoreStatisticsTargetFromObjective(requiredString(params, "objectiveId")),

    prepare: async ({ params }) => {
      const firstPoints = requiredNumber(params, "firstPoints");
      const secondPoints = requiredNumber(params, "secondPoints");
      await prepareScoreStatisticsTarget(
        requiredScoreStatisticsTarget(params, "target"),
        [requiredString(params, "firstMemberName"), requiredString(params, "secondMemberName")],
        firstPoints + secondPoints,
      );
    },

    settled: async ({ params }) => {
      await expect.poll(() => scoreStatisticsTargetSettled(requiredScoreStatisticsTarget(params, "target"))).toBe(true);
    },
  },

  "db.score_ledger": {
    absent: async ({ params }) => {
      await expect.poll(() => testScoreLedgersAbsent(requiredString(params, "reason"))).toBe(true);
    },

    create: async ({ params }) => {
      await createScoreLedgers(
        requiredScoreStatisticsTarget(params, "target"),
        [
          { userId: requiredString(params, "firstUserId"), memberName: requiredString(params, "firstMemberName"), points: requiredNumber(params, "firstPoints") },
          { userId: requiredString(params, "secondUserId"), memberName: requiredString(params, "secondMemberName"), points: requiredNumber(params, "secondPoints") },
        ],
        requiredString(params, "reason"),
      );
    },

    present: async ({ params }) => {
      await expect
        .poll(() => scoreLedgerPresent(requiredScoreStatisticsTarget(params, "target"), requiredString(params, "memberName"), requiredNumber(params, "points")))
        .toBe(true);
    },

    delete: async ({ params }) => {
      await deleteScoreLedgers(requiredString(params, "reason"));
    },
  },

  "page.score_statistics": {
    visible: async ({ ctx, params }) => {
      const memberName = requiredString(params, "memberName");
      const pointsText = (await scoreLedgerTotalForMember(requiredScoreStatisticsTarget(params, "target"), memberName)).toFixed(1);
      const table = ctx.page.getByRole("table", { name: "成员积分排行榜" });
      await expect(table).toBeVisible();
      const row = table.getByRole("row").filter({ hasText: memberName }).filter({ hasText: pointsText });
      await expect(row).toBeVisible();
    },
  },
} satisfies OperatorRegistry<TestContext, MemberScoreStatisticsCaseData>;

function requiredScoreStatisticsTarget(params: StepParams, key: string): ScoreStatisticsTarget {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as ScoreStatisticsTarget).objective !== "object" ||
    (value as ScoreStatisticsTarget).objective === null ||
    typeof (value as ScoreStatisticsTarget).objective.id !== "string" ||
    typeof (value as ScoreStatisticsTarget).objective.teamId !== "string" ||
    typeof (value as ScoreStatisticsTarget).objective.title !== "string" ||
    typeof (value as ScoreStatisticsTarget).objective.flowStatus !== "string"
  ) {
    throw new Error(`参数 ${key} 必须是成员分数统计目标`);
  }

  return value as ScoreStatisticsTarget;
}
