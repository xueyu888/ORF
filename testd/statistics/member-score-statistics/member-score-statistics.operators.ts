import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../_framework/types";
import { requiredNumber, requiredString } from "../../_operators/params";
import type { MemberScoreStatisticsCaseData, ScoreStatisticsTarget, TestContext } from "./_support/member-score-statistics.context";
import {
  adminAccountActive,
  createScoreLedgers,
  deleteScoreLedgers,
  memberAccountActive,
  prepareScoreStatisticsTarget,
  restoreScoreStatisticsTarget,
  scoreLedgerPresent,
  scoreLedgerTotalForMember,
  scoreStatisticsTargetAvailable,
  scoreStatisticsTargetSettled,
  selectScoreStatisticsTarget,
  testScoreLedgersAbsent,
} from "./_support/member-score-statistics.helpers";

export const memberScoreStatisticsOperators = {
  "db.admin": {
    active: async ({ params }) => {
      await expect.poll(() => adminAccountActive(requiredString(params, "email"))).toBe(true);
    },
  },

  "db.member": {
    active: async ({ params }) => {
      await expect.poll(() => memberAccountActive(requiredString(params, "memberName"))).toBe(true);
    },
  },

  "db.score_statistics_target": {
    available: async ({ data }) => {
      await expect.poll(() => scoreStatisticsTargetAvailable(data)).toBe(true);
    },

    select: async ({ data }) => {
      const target = await selectScoreStatisticsTarget(data);
      if (!target) {
        throw new Error("没有可构造成员分数统计起点的目标");
      }
      return target;
    },

    original_state_recorded: async ({ params }) => {
      expect(requiredScoreStatisticsTarget(params, "target").previous).toBeTruthy();
    },

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

    restore: async ({ params }) => {
      await restoreScoreStatisticsTarget(optionalScoreStatisticsTarget(params, "target"));
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
          { memberName: requiredString(params, "firstMemberName"), points: requiredNumber(params, "firstPoints") },
          { memberName: requiredString(params, "secondMemberName"), points: requiredNumber(params, "secondPoints") },
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
    typeof (value as ScoreStatisticsTarget).objective.title !== "string" ||
    typeof (value as ScoreStatisticsTarget).previous !== "object" ||
    (value as ScoreStatisticsTarget).previous === null
  ) {
    throw new Error(`参数 ${key} 必须是成员分数统计目标`);
  }

  return value as ScoreStatisticsTarget;
}

function optionalScoreStatisticsTarget(params: StepParams, key: string): ScoreStatisticsTarget | null {
  const value = params[key];
  if (value === undefined || value === null) {
    return null;
  }

  return requiredScoreStatisticsTarget(params, key);
}
