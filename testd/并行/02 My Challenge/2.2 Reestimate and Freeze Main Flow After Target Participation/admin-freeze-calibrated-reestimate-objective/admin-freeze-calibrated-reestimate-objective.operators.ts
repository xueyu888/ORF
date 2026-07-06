import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../../../_framework/types";
import { requiredNumber, requiredString } from "../../../../_operators/params";
import type {
  AdminFreezeCalibratedReestimateObjectiveCaseData,
  MetricData,
  ObjectiveTargetData,
  TestContext,
  TestUserAccountRecord,
} from "./_support/admin-freeze-calibrated-reestimate-objective.context";
import {
  alignmentRequestExists,
  allChallengesContainsAlignmentRequestStatus,
  allChallengesContainsMetricWithScore,
  allChallengesContainsObjective,
  allChallengesObjectiveHasStageAndFlowStatus,
  challengeScopeTab,
  clickCompleteAndFreeze,
  completeAndFreezeActionHidden,
  deleteObjectivesByTitlePrefix,
  loginAsAdmin,
  metricAbsentByTitle,
  metricExistsWithScore,
  metricRow,
  objectiveChallengerContains,
  objectiveConfirmedAtExists,
  objectiveHasStageAndFlowStatus,
  objectivePanel,
  objectivePrefixAbsent,
  openAlignmentRequestCount,
  openMyChallenges,
  prepareCalibratedMetric,
  prepareReestimateCompletionRequest,
  prepareReestimateObjective,
  readSessionUserName,
  selectChallengeScope,
  toast,
} from "./_support/admin-freeze-calibrated-reestimate-objective.helpers";

export const adminFreezeCalibratedReestimateObjectiveOperators: OperatorRegistry<
  TestContext,
  AdminFreezeCalibratedReestimateObjectiveCaseData
> = {
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

    url: async ({ ctx }) => {
      await expect(ctx.page).toHaveURL(/\/tasks(?:[?#].*)?$/);
    },
  },

  "page.challenge_scope": {
    select: async ({ ctx, params }) => {
      await selectChallengeScope(ctx.page, requiredString(params, "label"));
    },

    selected: async ({ ctx, params }) => {
      await expect(challengeScopeTab(ctx.page, requiredString(params, "label"))).toHaveClass(/orf-scope-tab-active/);
    },
  },

  "page.challenge_toast": {
    alignment_completed: async ({ ctx }) => {
      await expect(toast(ctx.page, "对齐已完成")).toBeVisible();
    },
  },

  "page.challenge_objectives": {
    visible_title: async ({ ctx, params }) => {
      await expect(objectivePanel(ctx.page, requiredString(params, "title"))).toBeVisible();
    },
  },

  "page.challenge_objective": {
    status_visible: async ({ ctx, params }) => {
      await expect(objectivePanel(ctx.page, requiredString(params, "title"))).toContainText(requiredString(params, "statusLabel"));
    },
  },

  "page.objective_alignment": {
    complete_and_freeze: async ({ ctx, params }) => {
      await clickCompleteAndFreeze(ctx.page, requiredString(params, "targetTitle"));
    },

    complete_and_freeze_hidden: async ({ ctx, params }) => {
      await completeAndFreezeActionHidden(ctx.page, requiredString(params, "targetTitle"));
    },
  },

  "page.challenge_metric": {
    visible_under_objective: async ({ ctx, params }) => {
      const panel = objectivePanel(ctx.page, requiredString(params, "targetTitle"));
      await expect(panel).toBeVisible();
      await expect(panel.locator(".orf-result-row").filter({ hasText: requiredString(params, "metricTitle") })).toBeVisible();
    },
  },

  "page.metric_difficulty": {
    visible: async ({ ctx, params }) => {
      await expect(metricRow(ctx.page, requiredString(params, "metricTitle"))).toContainText(requiredDifficulty(params, "difficulty"));
    },
  },

  "api.all_challenges": {
    contains_objective: async ({ ctx, params }) => {
      await expect.poll(() => allChallengesContainsObjective(ctx.page, requiredString(params, "title"))).toBe(true);
    },

    objective_stage_flow: async ({ ctx, params }) => {
      await expect.poll(() => allChallengesObjectiveHasStageAndFlowStatus(ctx.page, requiredTarget(params, "target"))).toBe(true);
    },

    contains_metric_with_score: async ({ ctx, params }) => {
      await expect
        .poll(() =>
          allChallengesContainsMetricWithScore(ctx.page, {
            targetTitle: requiredString(params, "targetTitle"),
            metricTitle: requiredString(params, "metricTitle"),
            difficulty: requiredDifficulty(params, "difficulty"),
            score: requiredNumber(params, "score"),
          }),
        )
        .toBe(true);
    },

    contains_alignment_request_status: async ({ ctx, params }) => {
      await expect
        .poll(() =>
          allChallengesContainsAlignmentRequestStatus(ctx.page, {
            targetTitle: requiredString(params, "targetTitle"),
            kind: requiredAlignmentKind(params, "kind"),
            status: requiredAlignmentStatus(params, "status"),
          }),
        )
        .toBe(true);
    },
  },

  "db.objectives_by_prefix": {
    delete: async ({ params }) => {
      await deleteObjectivesByTitlePrefix(requiredString(params, "prefix"));
    },

    absent: async ({ params }) => {
      await expect.poll(() => objectivePrefixAbsent(requiredString(params, "prefix"))).toBe(true);
    },
  },

  "db.reestimate_objective_fixture": {
    prepare: async ({ params }) =>
      prepareReestimateObjective({
        adminUser: requiredUser(params, "adminUser"),
        memberUser: requiredUser(params, "memberUser"),
        target: requiredTarget(params, "target"),
      }),

    exists: async ({ params }) => {
      await expect.poll(() => objectiveHasStageAndFlowStatus(requiredTarget(params, "target"))).toBe(true);
    },

    challenger_contains: async ({ params }) => {
      await expect
        .poll(() =>
          objectiveChallengerContains({
            target: requiredTarget(params, "target"),
            memberUser: requiredUser(params, "memberUser"),
          }),
        )
        .toBe(true);
    },

    confirmed_at_exists: async ({ params }) => {
      await expect.poll(() => objectiveConfirmedAtExists(requiredTarget(params, "target"))).toBe(true);
    },
  },

  "db.metric": {
    prepare_calibrated: async ({ params }) =>
      prepareCalibratedMetric({
        target: requiredTarget(params, "target"),
        metric: requiredMetric(params, "metric"),
        memberUser: requiredUser(params, "memberUser"),
      }),

    absent: async ({ params }) => {
      await expect.poll(() => metricAbsentByTitle(requiredString(params, "title"))).toBe(true);
    },

    exists_with_score: async ({ params }) => {
      await expect
        .poll(() =>
          metricExistsWithScore({
            target: requiredTarget(params, "target"),
            title: requiredString(params, "title"),
            difficulty: requiredDifficulty(params, "difficulty"),
            score: requiredNumber(params, "score"),
          }),
        )
        .toBe(true);
    },
  },

  "db.objective_alignment_request": {
    prepare: async ({ params }) =>
      prepareReestimateCompletionRequest({
        target: requiredTarget(params, "target"),
        kind: requiredAlignmentKind(params, "kind"),
        status: requiredAlignmentStatus(params, "status"),
        memberUser: requiredUser(params, "memberUser"),
      }),

    exists: async ({ params }) => {
      await expect
        .poll(() =>
          alignmentRequestExists({
            target: requiredTarget(params, "target"),
            kind: requiredAlignmentKind(params, "kind"),
            status: requiredAlignmentStatus(params, "status"),
            memberUser: requiredUser(params, "memberUser"),
            adminUser: optionalUser(params, "adminUser"),
          }),
        )
        .toBe(true);
    },

    open_count: async ({ params }) => {
      await expect
        .poll(() =>
          openAlignmentRequestCount({
            target: requiredTarget(params, "target"),
            kind: requiredAlignmentKind(params, "kind"),
          }),
        )
        .toBe(requiredNumber(params, "count"));
    },
  },
};

function requiredTarget(params: StepParams, key: string): ObjectiveTargetData {
  const value = params[key];
  if (typeof value !== "object" || value === null) {
    throw new Error(`参数 ${key} 必须是 ObjectiveTargetData`);
  }
  const target = value as Partial<ObjectiveTargetData>;
  if (typeof target.title !== "string" || typeof target.stage !== "string" || typeof target.flowStatus !== "string") {
    throw new Error(`参数 ${key} 缺少 title/stage/flowStatus`);
  }
  return target as ObjectiveTargetData;
}

function requiredMetric(params: StepParams, key: string): MetricData {
  const value = params[key];
  if (typeof value !== "object" || value === null) {
    throw new Error(`参数 ${key} 必须是 MetricData`);
  }
  const metric = value as Partial<MetricData>;
  if (typeof metric.title !== "string" || metric.difficulty !== "进阶" || metric.score !== 30) {
    throw new Error(`参数 ${key} 缺少 title/difficulty/score`);
  }
  return metric as MetricData;
}

function requiredUser(params: StepParams, key: string): TestUserAccountRecord {
  const value = params[key];
  if (typeof value !== "object" || value === null) {
    throw new Error(`参数 ${key} 必须是 TestUserAccountRecord`);
  }
  const account = value as Partial<TestUserAccountRecord>;
  if (
    typeof account.userId !== "string" ||
    typeof account.teamId !== "string" ||
    typeof account.email !== "string" ||
    typeof account.name !== "string"
  ) {
    throw new Error(`参数 ${key} 缺少 userId/teamId/email/name`);
  }
  return account as TestUserAccountRecord;
}

function optionalUser(params: StepParams, key: string): TestUserAccountRecord | undefined {
  return params[key] === undefined ? undefined : requiredUser(params, key);
}

function requiredDifficulty(params: StepParams, key: string): AdminFreezeCalibratedReestimateObjectiveCaseData["metric"]["difficulty"] {
  const value = requiredString(params, key);
  if (value !== "进阶") {
    throw new Error(`参数 ${key} 必须是 进阶`);
  }
  return value;
}

function requiredAlignmentKind(params: StepParams, key: string): AdminFreezeCalibratedReestimateObjectiveCaseData["alignmentKind"] {
  const value = requiredString(params, key);
  if (value !== "reestimateCompletion") {
    throw new Error(`参数 ${key} 必须是 reestimateCompletion`);
  }
  return value;
}

function requiredAlignmentStatus(params: StepParams, key: string): AdminFreezeCalibratedReestimateObjectiveCaseData["requestedStatus"] | AdminFreezeCalibratedReestimateObjectiveCaseData["completedStatus"] {
  const value = requiredString(params, key);
  if (value !== "requested" && value !== "completed") {
    throw new Error(`参数 ${key} 必须是 requested 或 completed`);
  }
  return value;
}
