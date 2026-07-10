import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../../../_framework/types";
import { requiredNumber, requiredString } from "../../../../_operators/params";
import type {
  AdminApproveFrozenReestimateReopenCaseData,
  MetricData,
  ObjectiveTargetData,
  TestContext,
  TestUserAccountRecord,
} from "./_support/admin-approve-frozen-reestimate-reopen.context";
import {
  alignmentRequestExists,
  allChallengesContainsAlignmentRequestStatus,
  challengeScopeTab,
  deleteObjectivesByTitlePrefix,
  deleteOpenAlignmentRequests,
  fillFrozenReestimateDue,
  login,
  metricAbsentByTitle,
  metricExistsWithScore,
  metricRow,
  myChallengesContainsAlignmentRequestStatus,
  myChallengesContainsMetricWithScore,
  myChallengesContainsObjective,
  myChallengesObjectiveHasStageAndFlowStatus,
  objectiveChallengerContains,
  objectiveConfirmedAtExists,
  objectiveConfirmedAtNull,
  objectiveHasStageAndFlowStatus,
  objectivePanel,
  objectivePrefixAbsent,
  objectiveReestimateDueFuture,
  openAlignmentRequestCount,
  openMyChallenges,
  prepareAlignmentRequest,
  prepareCalibratedMetric,
  prepareFrozenObjective,
  readSessionUserName,
  reestimateCompletionActionHidden,
  requestReestimateCompletion,
  approveFrozenReestimate,
  selectChallengeScope,
  toastMessageAppeared,
} from "./_support/admin-approve-frozen-reestimate-reopen.helpers";

export const adminApproveFrozenReestimateReopenOperators: OperatorRegistry<
  TestContext,
  AdminApproveFrozenReestimateReopenCaseData
> = {
  "auth.session.user_name": {
    equals: async ({ ctx, params }) => {
      await expect.poll(() => readSessionUserName(ctx.page)).toBe(requiredString(params, "name"));
    },
  },

  "page.auth": {
    login: async ({ ctx, params }) => {
      await login(ctx.page, {
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
    reestimate_alignment_requested: async ({ ctx }) => {
      await expect.poll(() => toastMessageAppeared(ctx.page, "已申请重估对齐，请约时间并定好会议室")).toBe(true);
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

  "page.frozen_reestimate_approval": {
    fill_due: async ({ ctx, params }) => {
      await fillFrozenReestimateDue(ctx.page, {
        targetTitle: requiredString(params, "targetTitle"),
        offsetHours: requiredNumber(params, "offsetHours"),
      });
    },

    approve: async ({ ctx, params }) => {
      await approveFrozenReestimate(ctx.page, requiredString(params, "targetTitle"));
    },
  },

  "page.objective_alignment": {
    request_reestimate_completion: async ({ ctx, params }) => {
      await requestReestimateCompletion(ctx.page, requiredString(params, "targetTitle"));
    },

    request_reestimate_completion_hidden: async ({ ctx, params }) => {
      await reestimateCompletionActionHidden(ctx.page, requiredString(params, "targetTitle"));
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

  "api.my_challenges": {
    contains_objective: async ({ ctx, params }) => {
      await expect.poll(() => myChallengesContainsObjective(ctx.page, requiredString(params, "title"))).toBe(true);
    },

    objective_stage_flow: async ({ ctx, params }) => {
      await expect.poll(() => myChallengesObjectiveHasStageAndFlowStatus(ctx.page, requiredTarget(params, "target"))).toBe(true);
    },

    contains_metric_with_score: async ({ ctx, params }) => {
      await expect
        .poll(() =>
          myChallengesContainsMetricWithScore(ctx.page, {
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
          myChallengesContainsAlignmentRequestStatus(ctx.page, {
            targetTitle: requiredString(params, "targetTitle"),
            kind: requiredAlignmentKind(params, "kind"),
            status: requiredAlignmentStatus(params, "status"),
          }),
        )
        .toBe(true);
    },
  },

  "api.all_challenges": {
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

  "db.frozen_objective_fixture": {
    prepare: async ({ params }) =>
      prepareFrozenObjective({
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

  "db.reestimate_objective": {
    exists: async ({ params }) => {
      await expect.poll(() => objectiveHasStageAndFlowStatus(requiredTarget(params, "target"))).toBe(true);
    },

    confirmed_at_null: async ({ params }) => {
      await expect.poll(() => objectiveConfirmedAtNull(requiredTarget(params, "target"))).toBe(true);
    },

    reestimate_due_future: async ({ params }) => {
      await expect.poll(() => objectiveReestimateDueFuture(requiredTarget(params, "target"))).toBe(true);
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
      prepareAlignmentRequest({
        target: requiredTarget(params, "target"),
        kind: requiredAlignmentKind(params, "kind"),
        status: requiredAlignmentStatus(params, "status"),
        memberUser: requiredUser(params, "memberUser"),
        reason: optionalString(params, "reason"),
      }),

    delete_open: async ({ params }) => {
      await deleteOpenAlignmentRequests({
        target: requiredTarget(params, "target"),
        kind: requiredAlignmentKind(params, "kind"),
      });
    },

    exists: async ({ params }) => {
      await expect
        .poll(() =>
          alignmentRequestExists({
            target: requiredTarget(params, "target"),
            kind: requiredAlignmentKind(params, "kind"),
            status: requiredAlignmentStatus(params, "status"),
            memberUser: requiredUser(params, "memberUser"),
            adminUser: optionalUser(params, "adminUser"),
            reason: optionalString(params, "reason"),
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

function requiredDifficulty(params: StepParams, key: string): AdminApproveFrozenReestimateReopenCaseData["metric"]["difficulty"] {
  const value = requiredString(params, key);
  if (value !== "进阶") {
    throw new Error(`参数 ${key} 必须是 进阶`);
  }
  return value;
}

function requiredAlignmentKind(
  params: StepParams,
  key: string,
): AdminApproveFrozenReestimateReopenCaseData["frozenReestimateKind"] | AdminApproveFrozenReestimateReopenCaseData["reestimateCompletionKind"] {
  const value = requiredString(params, key);
  if (value !== "frozenReestimate" && value !== "reestimateCompletion") {
    throw new Error(`参数 ${key} 必须是 frozenReestimate 或 reestimateCompletion`);
  }
  return value;
}

function requiredAlignmentStatus(
  params: StepParams,
  key: string,
): AdminApproveFrozenReestimateReopenCaseData["requestedStatus"] | AdminApproveFrozenReestimateReopenCaseData["completedStatus"] {
  const value = requiredString(params, key);
  if (value !== "requested" && value !== "completed") {
    throw new Error(`参数 ${key} 必须是 requested 或 completed`);
  }
  return value;
}

function optionalString(params: StepParams, key: string) {
  const value = params[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new Error(`参数 ${key} 必须是 string`);
  }
  return value;
}
