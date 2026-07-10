import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../../../_framework/types";
import { requiredNumber, requiredString } from "../../../../_operators/params";
import type {
  AcceptedObjectiveTargetData,
  AdminSettleLootCaseData,
  FinalLootData,
  MetricData,
  ObjectiveTargetStateData,
  SettlementData,
  SettledObjectiveTargetData,
  TestContext,
  TestUserAccountRecord,
} from "./_support/admin-settle-loot.context";
import {
  acceptanceReviewExists,
  allChallengesContainsFinalSettlementEvent,
  allChallengesContainsObjective,
  allChallengesContainsPointLedger,
  allChallengesObjectiveAcceptedResult,
  allChallengesObjectiveBasePoints,
  allChallengesObjectiveHasStageAndFlowStatus,
  allChallengesObjectiveSettlementPoints,
  deleteFinalSettlementEventsByTarget,
  deleteObjectivesByTitlePrefix,
  deletePointLedgerByTarget,
  finalSettlementEventCount,
  finalSettlementEventExists,
  latestFinalSettlementEvent,
  loginAsAdmin,
  metricAbsentByTitle,
  metricAcceptedResultEquals,
  metricExistsAccepted,
  objectiveAcceptedAtExists,
  objectiveAcceptedResultEquals,
  objectiveBasePointsEquals,
  objectiveChallengerContains,
  objectiveCompletionMultiplierEquals,
  objectiveHasStageAndFlowStatus,
  objectiveLootExists,
  objectiveOnlyChallenger,
  objectivePanel,
  objectivePrefixAbsent,
  objectiveSettlementPointsEmpty,
  objectiveSettlementPointsEquals,
  openMyChallenges,
  openSettlementPage,
  pointLedgerCount,
  pointLedgerExistsForFinalSettlement,
  prepareAcceptedMetric,
  prepareAcceptedObjective,
  prepareCompletedAcceptanceReview,
  prepareFinalObjectiveLoot,
  readSessionUserName,
  singleContributionRatioVisible,
  submitSettlement,
  toastMessageAppeared,
  waitSettlementPageLoaded,
} from "./_support/admin-settle-loot.helpers";

export const adminSettleLootOperators: OperatorRegistry<TestContext, AdminSettleLootCaseData> = {
  "auth.session.user_name": {
    equals: async ({ ctx, params }) => {
      await expect.poll(() => readSessionUserName(ctx.page)).toBe(requiredString(params, "name"));
    },
  },

  "page.auth": {
    login: async ({ ctx, params }) => {
      await loginAsAdmin(ctx.page, {
        email: requiredString(params, "email"),
        password: requiredString(params, "password"),
      });
    },
  },

  "page.challenge": {
    open_my_challenges: async ({ ctx }) => {
      await openMyChallenges(ctx.page);
    },
  },

  "page.reports": {
    url: async ({ ctx }) => {
      await expect(ctx.page).toHaveURL(/\/reports(?:[?#].*)?$/);
    },
  },

  "page.challenge_toast": {
    settled: async ({ ctx }) => {
      await expect.poll(() => toastMessageAppeared(ctx.page, "目标已结算")).toBe(true);
    },
  },

  "page.challenge_objectives": {
    visible_title: async ({ ctx, params }) => {
      await expect(objectivePanel(ctx.page, requiredString(params, "title"))).toBeVisible();
    },
  },

  "page.challenge_objective": {
    action_enabled: async ({ ctx, params }) => {
      const panel = objectivePanel(ctx.page, requiredString(params, "title"));
      await expect(panel.getByRole("link", { name: requiredString(params, "actionLabel"), exact: true })).toBeEnabled();
    },

    action_visible: async ({ ctx, params }) => {
      const panel = objectivePanel(ctx.page, requiredString(params, "title"));
      await expect(panel.getByRole("link", { name: requiredString(params, "actionLabel"), exact: true })).toBeVisible();
    },

    status_visible: async ({ ctx, params }) => {
      await expect(objectivePanel(ctx.page, requiredString(params, "title"))).toContainText(requiredString(params, "statusLabel"));
    },
  },

  "page.settlement": {
    loaded: async ({ ctx, params }) => {
      await waitSettlementPageLoaded(ctx.page, requiredString(params, "targetTitle"));
    },

    open_from_objective: async ({ ctx, params }) => {
      await openSettlementPage(ctx.page, requiredString(params, "targetTitle"));
    },

    single_ratio_visible: async ({ ctx, params }) => {
      await singleContributionRatioVisible(ctx.page, {
        memberName: requiredString(params, "memberName"),
        percent: requiredString(params, "percent"),
      });
    },

    submit: async ({ ctx, params }) => {
      await submitSettlement(ctx.page, {
        settledTarget: requiredSettledTarget(params, "settledTarget"),
        settlement: requiredSettlement(params, "settlement"),
      });
    },

    submit_enabled: async ({ ctx, params }) => {
      await expect(ctx.page.getByRole("button", { name: requiredString(params, "label"), exact: true })).toBeEnabled();
    },

    target_visible: async ({ ctx, params }) => {
      await expect(ctx.page.getByText(requiredString(params, "targetTitle"), { exact: true })).toBeVisible();
    },

    text_visible: async ({ ctx, params }) => {
      await expect(ctx.page.getByText(requiredString(params, "text"), { exact: true })).toBeVisible();
    },
  },

  "api.settlement": {
    submit_result_success: async ({ params }) => {
      const event = await latestFinalSettlementEvent({
        adminUser: requiredUser(params, "adminUser"),
        settlement: requiredSettlement(params, "settlement"),
        target: requiredSettledTarget(params, "target"),
      });
      if (!event) {
        throw new Error("目标结算结果未生成最终结算事件");
      }
      return event;
    },
  },

  "api.all_challenges": {
    accepted_result: async ({ ctx, params }) => {
      await expect
        .poll(() =>
          allChallengesObjectiveAcceptedResult({
            acceptanceResult: requiredAcceptanceResult(params, "acceptanceResult"),
            page: ctx.page,
            title: requiredString(params, "title"),
          }),
        )
        .toBe(true);
    },

    contains_final_settlement_event: async ({ ctx, params }) => {
      await expect
        .poll(() =>
          allChallengesContainsFinalSettlementEvent({
            adminUser: requiredUser(params, "adminUser"),
            page: ctx.page,
            settlement: requiredSettlement(params, "settlement"),
            target: requiredTarget(params, "target"),
          }),
        )
        .toBe(true);
    },

    contains_objective: async ({ ctx, params }) => {
      await expect.poll(() => allChallengesContainsObjective(ctx.page, requiredString(params, "title"))).toBe(true);
    },

    contains_point_ledger: async ({ ctx, params }) => {
      await expect
        .poll(() =>
          allChallengesContainsPointLedger({
            memberUser: requiredUser(params, "memberUser"),
            page: ctx.page,
            settlement: requiredSettlement(params, "settlement"),
            target: requiredTarget(params, "target"),
          }),
        )
        .toBe(true);
    },

    objective_base_points: async ({ ctx, params }) => {
      await expect
        .poll(() =>
          allChallengesObjectiveBasePoints({
            page: ctx.page,
            points: requiredNumber(params, "points"),
            title: requiredString(params, "title"),
          }),
        )
        .toBe(true);
    },

    objective_settlement_points: async ({ ctx, params }) => {
      await expect
        .poll(() =>
          allChallengesObjectiveSettlementPoints({
            page: ctx.page,
            points: requiredNumber(params, "points"),
            title: requiredString(params, "title"),
          }),
        )
        .toBe(true);
    },

    objective_stage_flow: async ({ ctx, params }) => {
      await expect
        .poll(() => allChallengesObjectiveHasStageAndFlowStatus(ctx.page, requiredTarget(params, "target")), { timeout: 20_000 })
        .toBe(true);
    },
  },

  "db.objectives_by_prefix": {
    absent: async ({ params }) => {
      await expect.poll(() => objectivePrefixAbsent(requiredString(params, "prefix"))).toBe(true);
    },

    delete: async ({ params }) => {
      await deleteObjectivesByTitlePrefix(requiredString(params, "prefix"));
    },
  },

  "db.accepted_objective_fixture": {
    accepted_at_exists: async ({ params }) => {
      await expect.poll(() => objectiveAcceptedAtExists(requiredAcceptedTarget(params, "target"))).toBe(true);
    },

    accepted_result: async ({ params }) => {
      await expect
        .poll(() =>
          objectiveAcceptedResultEquals({
            acceptanceResult: requiredAcceptanceResult(params, "acceptanceResult"),
            target: requiredAcceptedTarget(params, "target"),
          }),
        )
        .toBe(true);
    },

    base_points: async ({ params }) => {
      await expect
        .poll(() =>
          objectiveBasePointsEquals({
            points: requiredNumber(params, "points"),
            target: requiredAcceptedTarget(params, "target"),
          }),
        )
        .toBe(true);
    },

    exists: async ({ params }) => {
      await expect.poll(() => objectiveHasStageAndFlowStatus(requiredAcceptedTarget(params, "target"))).toBe(true);
    },

    only_challenger: async ({ params }) => {
      await expect
        .poll(() =>
          objectiveOnlyChallenger({
            memberUser: requiredUser(params, "memberUser"),
            target: requiredAcceptedTarget(params, "target"),
          }),
        )
        .toBe(true);
    },

    prepare: async ({ params }) =>
      prepareAcceptedObjective({
        adminUser: requiredUser(params, "adminUser"),
        memberUser: requiredUser(params, "memberUser"),
        settlement: requiredSettlement(params, "settlement"),
        target: requiredAcceptedTarget(params, "target"),
      }),

    settlement_points_empty: async ({ params }) => {
      await expect.poll(() => objectiveSettlementPointsEmpty(requiredAcceptedTarget(params, "target"))).toBe(true);
    },
  },

  "db.settled_objective_fixture": {
    accepted_result: async ({ params }) => {
      await expect
        .poll(() =>
          objectiveAcceptedResultEquals({
            acceptanceResult: requiredAcceptanceResult(params, "acceptanceResult"),
            target: requiredSettledTarget(params, "target"),
          }),
        )
        .toBe(true);
    },

    base_points: async ({ params }) => {
      await expect
        .poll(() =>
          objectiveBasePointsEquals({
            points: requiredNumber(params, "points"),
            target: requiredSettledTarget(params, "target"),
          }),
        )
        .toBe(true);
    },

    challenger_contains: async ({ params }) => {
      await expect
        .poll(() =>
          objectiveChallengerContains({
            memberUser: requiredUser(params, "memberUser"),
            target: requiredSettledTarget(params, "target"),
          }),
        )
        .toBe(true);
    },

    completion_multiplier: async ({ params }) => {
      await expect
        .poll(() =>
          objectiveCompletionMultiplierEquals({
            multiplier: requiredNumber(params, "multiplier"),
            target: requiredSettledTarget(params, "target"),
          }),
        )
        .toBe(true);
    },

    exists: async ({ params }) => {
      await expect.poll(() => objectiveHasStageAndFlowStatus(requiredSettledTarget(params, "target")), { timeout: 20_000 }).toBe(true);
    },

    settlement_points: async ({ params }) => {
      await expect
        .poll(() =>
          objectiveSettlementPointsEquals({
            points: requiredNumber(params, "points"),
            target: requiredSettledTarget(params, "target"),
          }),
        )
        .toBe(true);
    },
  },

  "db.metric": {
    absent: async ({ params }) => {
      await expect.poll(() => metricAbsentByTitle(requiredString(params, "title"))).toBe(true);
    },

    accepted_result: async ({ params }) => {
      await expect
        .poll(() =>
          metricAcceptedResultEquals({
            acceptedResult: requiredResultAcceptedResult(params, "acceptedResult"),
            title: requiredString(params, "title"),
          }),
        )
        .toBe(true);
    },

    exists_accepted: async ({ params }) => {
      await expect
        .poll(() =>
          metricExistsAccepted({
            acceptedResult: requiredResultAcceptedResult(params, "acceptedResult"),
            difficulty: requiredDifficulty(params, "difficulty"),
            score: requiredNumber(params, "score"),
            target: requiredTarget(params, "target"),
            title: requiredString(params, "title"),
          }),
        )
        .toBe(true);
    },

    prepare_accepted: async ({ params }) =>
      prepareAcceptedMetric({
        memberUser: requiredUser(params, "memberUser"),
        metric: requiredMetric(params, "metric"),
        target: requiredAcceptedTarget(params, "target"),
      }),
  },

  "db.objective_loot": {
    exists: async ({ params }) => {
      await expect
        .poll(() =>
          objectiveLootExists({
            finalLoot: requiredFinalLoot(params, "finalLoot"),
            memberUser: requiredUser(params, "memberUser"),
            target: requiredTarget(params, "target"),
          }),
        )
        .toBe(true);
    },

    prepare_final: async ({ params }) =>
      prepareFinalObjectiveLoot({
        finalLoot: requiredFinalLoot(params, "finalLoot"),
        memberUser: requiredUser(params, "memberUser"),
        metric: requiredMetric(params, "metric"),
        target: requiredAcceptedTarget(params, "target"),
      }),
  },

  "db.objective_acceptance_review": {
    exists: async ({ params }) => {
      await expect
        .poll(() =>
          acceptanceReviewExists({
            acceptanceResult: requiredAcceptanceResult(params, "acceptanceResult"),
            adminUser: requiredUser(params, "adminUser"),
            metric: requiredMetric(params, "metric"),
            target: requiredTarget(params, "target"),
          }),
        )
        .toBe(true);
    },

    prepare_completed: async ({ params }) =>
      prepareCompletedAcceptanceReview({
        acceptanceResult: requiredAcceptanceResult(params, "acceptanceResult"),
        adminUser: requiredUser(params, "adminUser"),
        metric: requiredMetric(params, "metric"),
        reason: requiredString(params, "reason"),
        target: requiredAcceptedTarget(params, "target"),
      }),
  },

  "db.objective_settlement_events": {
    delete_final_completion: async ({ params }) => {
      await deleteFinalSettlementEventsByTarget(requiredAcceptedTarget(params, "target"));
    },

    exists_final_completion: async ({ params }) => {
      await expect
        .poll(() =>
          finalSettlementEventExists({
            adminUser: requiredUser(params, "adminUser"),
            settlement: requiredSettlement(params, "settlement"),
            target: requiredTarget(params, "target"),
          }),
        )
        .toBe(true);
    },

    final_completion_count: async ({ params }) => {
      await expect.poll(() => finalSettlementEventCount(requiredTarget(params, "target"))).toBe(requiredNumber(params, "count"));
    },
  },

  "db.point_ledger": {
    count: async ({ params }) => {
      await expect.poll(() => pointLedgerCount(requiredTarget(params, "target"))).toBe(requiredNumber(params, "count"));
    },

    delete_by_target: async ({ params }) => {
      await deletePointLedgerByTarget(requiredAcceptedTarget(params, "target"));
    },

    exists_for_final_settlement: async ({ params }) => {
      await expect
        .poll(() =>
          pointLedgerExistsForFinalSettlement({
            memberUser: requiredUser(params, "memberUser"),
            settlement: requiredSettlement(params, "settlement"),
            target: requiredTarget(params, "target"),
          }),
        )
        .toBe(true);
    },
  },
};

function requiredTarget(params: StepParams, key: string): ObjectiveTargetStateData {
  const value = params[key];
  if (typeof value !== "object" || value === null) {
    throw new Error(`参数 ${key} 必须是 ObjectiveTargetStateData`);
  }
  const target = value as Partial<ObjectiveTargetStateData>;
  if (
    typeof target.title !== "string" ||
    target.stage !== "goalFrozen" ||
    (target.flowStatus !== "accepted" && target.flowStatus !== "settled") ||
    target.finalDueOffsetDays !== 8
  ) {
    throw new Error(`参数 ${key} 缺少 title/stage/flowStatus/finalDueOffsetDays`);
  }
  return target as ObjectiveTargetStateData;
}

function requiredAcceptedTarget(params: StepParams, key: string): AcceptedObjectiveTargetData {
  const target = requiredTarget(params, key);
  if (target.flowStatus !== "accepted") {
    throw new Error(`参数 ${key} 必须是 accepted 目标`);
  }
  return target as AcceptedObjectiveTargetData;
}

function requiredSettledTarget(params: StepParams, key: string): SettledObjectiveTargetData {
  const target = requiredTarget(params, key);
  if (target.flowStatus !== "settled") {
    throw new Error(`参数 ${key} 必须是 settled 目标`);
  }
  return target as SettledObjectiveTargetData;
}

function requiredMetric(params: StepParams, key: string): MetricData {
  const value = params[key];
  if (typeof value !== "object" || value === null) {
    throw new Error(`参数 ${key} 必须是 MetricData`);
  }
  const metric = value as Partial<MetricData>;
  if (
    typeof metric.title !== "string" ||
    metric.difficulty !== "进阶" ||
    metric.score !== 30 ||
    metric.claim !== "completed" ||
    typeof metric.finalEvidence !== "string" ||
    metric.acceptedResult !== "completed"
  ) {
    throw new Error(`参数 ${key} 缺少 title/difficulty/score/claim/finalEvidence/acceptedResult`);
  }
  return metric as MetricData;
}

function requiredFinalLoot(params: StepParams, key: string): FinalLootData {
  const value = params[key];
  if (typeof value !== "object" || value === null) {
    throw new Error(`参数 ${key} 必须是 FinalLootData`);
  }
  const finalLoot = value as Partial<FinalLootData>;
  if (typeof finalLoot.body !== "string" || typeof finalLoot.selfTestReportBody !== "string") {
    throw new Error(`参数 ${key} 缺少 body/selfTestReportBody`);
  }
  return finalLoot as FinalLootData;
}

function requiredSettlement(params: StepParams, key: string): SettlementData {
  const value = params[key];
  if (typeof value !== "object" || value === null) {
    throw new Error(`参数 ${key} 必须是 SettlementData`);
  }
  const settlement = value as Partial<SettlementData>;
  if (
    settlement.basePoints !== 30 ||
    settlement.completionMultiplier !== 1 ||
    settlement.eventKind !== "finalCompletion" ||
    typeof settlement.reason !== "string" ||
    settlement.settlementPoints !== 30
  ) {
    throw new Error(`参数 ${key} 缺少 basePoints/completionMultiplier/eventKind/reason/settlementPoints`);
  }
  return settlement as SettlementData;
}

function requiredUser(params: StepParams, key: string): TestUserAccountRecord {
  const value = params[key];
  if (typeof value !== "object" || value === null) {
    throw new Error(`参数 ${key} 必须是 TestUserAccountRecord`);
  }
  const user = value as Partial<TestUserAccountRecord>;
  if (typeof user.userId !== "string" || typeof user.teamId !== "string" || typeof user.email !== "string" || typeof user.name !== "string") {
    throw new Error(`参数 ${key} 缺少 userId/teamId/email/name`);
  }
  return user as TestUserAccountRecord;
}

function requiredDifficulty(params: StepParams, key: string): MetricData["difficulty"] {
  const value = requiredString(params, key);
  if (value !== "进阶") {
    throw new Error(`参数 ${key} 必须是 进阶`);
  }
  return value;
}

function requiredAcceptanceResult(params: StepParams, key: string): AdminSettleLootCaseData["acceptanceResult"] {
  const value = requiredString(params, key);
  if (value !== "completed") {
    throw new Error(`参数 ${key} 必须是 completed`);
  }
  return value;
}

function requiredResultAcceptedResult(params: StepParams, key: string): MetricData["acceptedResult"] {
  const value = requiredString(params, key);
  if (value !== "completed") {
    throw new Error(`参数 ${key} 必须是 completed`);
  }
  return value;
}
