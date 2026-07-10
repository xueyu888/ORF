import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../../../_framework/types";
import { requiredNumber, requiredString } from "../../../../_operators/params";
import type {
  AdminRejectUncalibratedReestimateObjectiveCaseData,
  ObjectiveTargetData,
  TestContext,
  TestUserAccountRecord,
  UncalibratedMetricData,
} from "./_support/admin-reject-uncalibrated-reestimate-objective.context";
import {
  alignmentRequestExists,
  allChallengesContainsAlignmentRequestStatus,
  allChallengesContainsObjective,
  allChallengesContainsUncalibratedMetric,
  allChallengesObjectiveHasStageAndFlowStatus,
  challengeScopeTab,
  clickRejectReestimate,
  completeAndFreezeActionNotClickable,
  deleteObjectivesByTitlePrefix,
  loginAsAdmin,
  metricAbsentByTitle,
  metricExistsUncalibrated,
  metricRow,
  objectiveChallengerContains,
  objectiveConfirmedAtAbsent,
  objectiveHasStageAndFlowStatus,
  objectivePanel,
  objectivePrefixAbsent,
  openAlignmentRequestCount,
  openMyChallenges,
  prepareReestimateCompletionRequest,
  prepareReestimateObjective,
  prepareUncalibratedMetric,
  readSessionUserName,
  rejectReestimateActionEnabled,
  rejectReestimateActionHidden,
  selectChallengeScope,
  toast,
} from "./_support/admin-reject-uncalibrated-reestimate-objective.helpers";

export const adminRejectUncalibratedReestimateObjectiveOperators: OperatorRegistry<
  TestContext,
  AdminRejectUncalibratedReestimateObjectiveCaseData
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
    alignment_feedback_submitted: async ({ ctx }) => {
      await expect(toast(ctx.page, "对齐反馈已提交")).toBeVisible();
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
    complete_and_freeze_not_clickable: async ({ ctx, params }) => {
      await completeAndFreezeActionNotClickable(ctx.page, requiredString(params, "targetTitle"));
    },

    reject_reestimate_enabled: async ({ ctx, params }) => {
      await rejectReestimateActionEnabled(ctx.page, requiredString(params, "targetTitle"));
    },

    reject_reestimate: async ({ ctx, params }) => {
      await clickRejectReestimate(ctx.page, requiredString(params, "targetTitle"));
    },

    reject_reestimate_hidden: async ({ ctx, params }) => {
      await rejectReestimateActionHidden(ctx.page, requiredString(params, "targetTitle"));
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
    uncalibrated_visible: async ({ ctx, params }) => {
      await expect(metricRow(ctx.page, requiredString(params, "metricTitle"))).toContainText("待校准");
    },
  },

  "api.all_challenges": {
    contains_objective: async ({ ctx, params }) => {
      await expect.poll(() => allChallengesContainsObjective(ctx.page, requiredString(params, "title"))).toBe(true);
    },

    objective_stage_flow: async ({ ctx, params }) => {
      await expect.poll(() => allChallengesObjectiveHasStageAndFlowStatus(ctx.page, requiredTarget(params, "target"))).toBe(true);
    },

    contains_uncalibrated_metric: async ({ ctx, params }) => {
      await expect
        .poll(() =>
          allChallengesContainsUncalibratedMetric(ctx.page, {
            targetTitle: requiredString(params, "targetTitle"),
            metricTitle: requiredString(params, "metricTitle"),
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

    confirmed_at_absent: async ({ params }) => {
      await expect.poll(() => objectiveConfirmedAtAbsent(requiredTarget(params, "target"))).toBe(true);
    },
  },

  "db.metric": {
    prepare_uncalibrated: async ({ params }) =>
      prepareUncalibratedMetric({
        target: requiredTarget(params, "target"),
        metric: requiredMetric(params, "metric"),
        memberUser: requiredUser(params, "memberUser"),
      }),

    absent: async ({ params }) => {
      await expect.poll(() => metricAbsentByTitle(requiredString(params, "title"))).toBe(true);
    },

    exists_uncalibrated: async ({ params }) => {
      await expect
        .poll(() =>
          metricExistsUncalibrated({
            target: requiredTarget(params, "target"),
            title: requiredString(params, "title"),
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

function requiredMetric(params: StepParams, key: string): UncalibratedMetricData {
  const value = params[key];
  if (typeof value !== "object" || value === null) {
    throw new Error(`参数 ${key} 必须是 UncalibratedMetricData`);
  }
  const metric = value as Partial<UncalibratedMetricData>;
  if (typeof metric.title !== "string") {
    throw new Error(`参数 ${key} 缺少 title`);
  }
  return metric as UncalibratedMetricData;
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

function requiredAlignmentKind(params: StepParams, key: string): AdminRejectUncalibratedReestimateObjectiveCaseData["alignmentKind"] {
  const value = requiredString(params, key);
  if (value !== "reestimateCompletion") {
    throw new Error(`参数 ${key} 必须是 reestimateCompletion`);
  }
  return value;
}

function requiredAlignmentStatus(
  params: StepParams,
  key: string,
): AdminRejectUncalibratedReestimateObjectiveCaseData["requestedStatus"] | AdminRejectUncalibratedReestimateObjectiveCaseData["needsWorkStatus"] {
  const value = requiredString(params, key);
  if (value !== "requested" && value !== "needsWork") {
    throw new Error(`参数 ${key} 必须是 requested 或 needsWork`);
  }
  return value;
}
