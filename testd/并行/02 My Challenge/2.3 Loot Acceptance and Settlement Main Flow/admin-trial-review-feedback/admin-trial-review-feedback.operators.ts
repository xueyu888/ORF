import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../../../_framework/types";
import { requiredNumber, requiredString } from "../../../../_operators/params";
import type {
  AdminTrialReviewFeedbackCaseData,
  FrozenObjectiveTargetData,
  MetricData,
  TestContext,
  TestUserAccountRecord,
  TrialReviewData,
} from "./_support/admin-trial-review-feedback.context";
import {
  allChallengesContainsObjective,
  allChallengesContainsTrialReview,
  allChallengesObjectiveHasStageAndFlowStatus,
  allChallengesTrialReviewReviewedAtExists,
  allChallengesTrialReviewReviewedBy,
  challengeScopeTab,
  deleteObjectiveLootByTarget,
  deleteObjectivesByTitlePrefix,
  fillTrialFeedback,
  loginAsAdmin,
  metricAbsentByTitle,
  metricExistsWithScore,
  objectiveChallengerContains,
  objectiveConfirmedAtExists,
  objectiveHasStageAndFlowStatus,
  objectiveLootCount,
  objectivePanel,
  objectivePrefixAbsent,
  openMyChallenges,
  openTrialReviewPageFromAllChallenges,
  prepareCalibratedMetric,
  prepareFrozenObjective,
  prepareRequestedTrialReview,
  readSessionUserName,
  selectTrialDecision,
  submitTrialFeedback,
  toastMessageAppeared,
  trialReviewCount,
  trialReviewExists,
  trialReviewFeedbackEmpty,
  trialReviewHasMetricClaim,
  trialReviewHasSelfTest,
  trialReviewReviewedAtEmpty,
  trialReviewReviewedAtExists,
  trialReviewReviewedBy,
  waitTrialReviewPageLoaded,
} from "./_support/admin-trial-review-feedback.helpers";

export const adminTrialReviewFeedbackOperators: OperatorRegistry<TestContext, AdminTrialReviewFeedbackCaseData> = {
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
    selected: async ({ ctx, params }) => {
      await expect(challengeScopeTab(ctx.page, requiredString(params, "label"))).toHaveClass(/orf-scope-tab-active/);
    },
  },

  "page.challenge_toast": {
    trial_review_feedback_submitted: async ({ ctx }) => {
      await expect.poll(() => toastMessageAppeared(ctx.page, "试验收反馈已提交")).toBe(true);
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

  "page.trial_review_feedback": {
    open_from_all_challenges: async ({ ctx, params }) => {
      await openTrialReviewPageFromAllChallenges(ctx.page, { targetTitle: requiredString(params, "targetTitle") });
    },

    loaded: async ({ ctx, params }) => {
      await waitTrialReviewPageLoaded(ctx.page, { targetTitle: requiredString(params, "targetTitle") });
    },

    material_visible: async ({ ctx, params }) => {
      await expect(ctx.page.getByText(requiredString(params, "body"), { exact: true })).toBeVisible();
    },

    evidence_visible: async ({ ctx, params }) => {
      await expect(ctx.page.getByText(requiredString(params, "metricTitle"), { exact: true })).toBeVisible();
      await expect(ctx.page.getByText(requiredString(params, "evidence"), { exact: true })).toBeVisible();
    },

    select_decision: async ({ ctx, params }) => {
      await selectTrialDecision(ctx.page, requiredString(params, "decisionLabel"));
    },

    fill_feedback: async ({ ctx, params }) => {
      await fillTrialFeedback(ctx.page, requiredString(params, "feedback"));
    },

    submit: async ({ ctx, params }) => {
      await submitTrialFeedback(ctx.page, {
        target: requiredTarget(params, "target"),
        trialReview: requiredTrialReview(params, "trialReview"),
        adminUser: requiredUser(params, "adminUser"),
        memberUser: requiredUser(params, "memberUser"),
      });
    },
  },

  "api.all_challenges": {
    contains_objective: async ({ ctx, params }) => {
      await expect.poll(() => allChallengesContainsObjective(ctx.page, requiredString(params, "title"))).toBe(true);
    },

    objective_stage_flow: async ({ ctx, params }) => {
      await expect.poll(() => allChallengesObjectiveHasStageAndFlowStatus(ctx.page, requiredTarget(params, "target"))).toBe(true);
    },

    contains_trial_review: async ({ ctx, params }) => {
      await expect
        .poll(
          () =>
            allChallengesContainsTrialReview(ctx.page, {
              targetTitle: requiredString(params, "targetTitle"),
              status: requiredTrialReviewStatus(params, "status"),
              commanderFeedback: requiredString(params, "commanderFeedback"),
              memberUser: requiredUser(params, "memberUser"),
              adminUser: requiredUser(params, "adminUser"),
            }),
          { timeout: 15_000 },
        )
        .toBe(true);
    },

    trial_review_reviewed_by: async ({ ctx, params }) => {
      await expect
        .poll(() =>
          allChallengesTrialReviewReviewedBy(ctx.page, {
            targetTitle: requiredString(params, "targetTitle"),
            adminUser: requiredUser(params, "adminUser"),
          }),
        )
        .toBe(true);
    },

    trial_review_reviewed_at_exists: async ({ ctx, params }) => {
      await expect.poll(() => allChallengesTrialReviewReviewedAtExists(ctx.page, requiredString(params, "targetTitle"))).toBe(true);
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

  "db.objective_trial_review": {
    prepare_requested: async ({ params }) =>
      prepareRequestedTrialReview({
        target: requiredTarget(params, "target"),
        metric: requiredMetric(params, "metric"),
        trialReview: requiredTrialReview(params, "trialReview"),
        memberUser: requiredUser(params, "memberUser"),
      }),

    exists: async ({ params }) => {
      await expect
        .poll(() =>
          trialReviewExists({
            target: requiredTarget(params, "target"),
            trialReview: requiredTrialReview(params, "trialReview"),
            memberUser: requiredUser(params, "memberUser"),
            status: requiredTrialReviewStatus(params, "status"),
            commanderFeedback: params.commanderFeedback === undefined ? undefined : requiredString(params, "commanderFeedback"),
          }),
        )
        .toBe(true);
    },

    self_test: async ({ params }) => {
      await expect
        .poll(() =>
          trialReviewHasSelfTest({
            target: requiredTarget(params, "target"),
            selfTestReportBody: requiredString(params, "selfTestReportBody"),
          }),
        )
        .toBe(true);
    },

    metric_claim: async ({ params }) => {
      await expect
        .poll(() =>
          trialReviewHasMetricClaim({
            target: requiredTarget(params, "target"),
            metric: requiredMetric(params, "metric"),
          }),
        )
        .toBe(true);
    },

    feedback_empty: async ({ params }) => {
      await expect.poll(() => trialReviewFeedbackEmpty(requiredTarget(params, "target"))).toBe(true);
    },

    reviewed_at_empty: async ({ params }) => {
      await expect.poll(() => trialReviewReviewedAtEmpty(requiredTarget(params, "target"))).toBe(true);
    },

    reviewed_by: async ({ params }) => {
      await expect
        .poll(() =>
          trialReviewReviewedBy({
            target: requiredTarget(params, "target"),
            adminUser: requiredUser(params, "adminUser"),
          }),
        )
        .toBe(true);
    },

    reviewed_at_exists: async ({ params }) => {
      await expect.poll(() => trialReviewReviewedAtExists(requiredTarget(params, "target"))).toBe(true);
    },

    count: async ({ params }) => {
      await expect.poll(() => trialReviewCount(requiredTarget(params, "target"))).toBe(requiredNumber(params, "count"));
    },
  },

  "db.objective_loot": {
    delete_by_target: async ({ params }) => {
      await deleteObjectiveLootByTarget(requiredTarget(params, "target"));
    },

    count: async ({ params }) => {
      await expect.poll(() => objectiveLootCount(requiredTarget(params, "target"))).toBe(requiredNumber(params, "count"));
    },
  },
};

function requiredTarget(params: StepParams, key: string): FrozenObjectiveTargetData {
  const value = params[key];
  if (typeof value !== "object" || value === null) {
    throw new Error(`参数 ${key} 必须是 FrozenObjectiveTargetData`);
  }
  const target = value as Partial<FrozenObjectiveTargetData>;
  if (
    typeof target.title !== "string" ||
    target.stage !== "goalFrozen" ||
    target.flowStatus !== "frozen" ||
    target.finalDueOffsetDays !== 8
  ) {
    throw new Error(`参数 ${key} 缺少 title/stage/flowStatus/finalDueOffsetDays`);
  }
  return target as FrozenObjectiveTargetData;
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
    typeof metric.evidence !== "string"
  ) {
    throw new Error(`参数 ${key} 缺少 title/difficulty/score/claim/evidence`);
  }
  return metric as MetricData;
}

function requiredTrialReview(params: StepParams, key: string): TrialReviewData {
  const value = params[key];
  if (typeof value !== "object" || value === null) {
    throw new Error(`参数 ${key} 必须是 TrialReviewData`);
  }
  const trialReview = value as Partial<TrialReviewData>;
  if (
    typeof trialReview.body !== "string" ||
    typeof trialReview.selfTestReportBody !== "string" ||
    trialReview.initialStatus !== "requested" ||
    trialReview.reviewedStatus !== "approved" ||
    typeof trialReview.commanderFeedback !== "string"
  ) {
    throw new Error(`参数 ${key} 缺少 body/selfTestReportBody/status/commanderFeedback`);
  }
  return trialReview as TrialReviewData;
}

function requiredUser(params: StepParams, key: string): TestUserAccountRecord {
  const value = params[key];
  if (typeof value !== "object" || value === null) {
    throw new Error(`参数 ${key} 必须是 TestUserAccountRecord`);
  }
  const user = value as Partial<TestUserAccountRecord>;
  if (typeof user.userId !== "string" || typeof user.teamId !== "string" || typeof user.email !== "string") {
    throw new Error(`参数 ${key} 缺少 userId/teamId/email`);
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

function requiredTrialReviewStatus(params: StepParams, key: string): TrialReviewData["initialStatus"] | TrialReviewData["reviewedStatus"] {
  const value = requiredString(params, key);
  if (value !== "requested" && value !== "approved") {
    throw new Error(`参数 ${key} 必须是 requested 或 approved`);
  }
  return value;
}
