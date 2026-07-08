import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../../../_framework/types";
import { requiredNumber, requiredString } from "../../../../_operators/params";
import type {
  FrozenObjectiveTargetData,
  MemberFrozenTrialReviewSubmitCaseData,
  MetricData,
  TestContext,
  TestUserAccountRecord,
  TrialReviewData,
} from "./_support/member-frozen-trial-review-submit.context";
import {
  challengeScopeTab,
  deleteObjectiveLootByTarget,
  deleteObjectivesByTitlePrefix,
  deleteTrialReviewsByTarget,
  fillLootBody,
  fillMetricEvidence,
  fillSelfTestReport,
  loginAsMember,
  metricAbsentByTitle,
  metricExistsWithScore,
  myChallengesContainsObjective,
  myChallengesContainsTrialReview,
  myChallengesObjectiveHasStageAndFlowStatus,
  myChallengesTrialReviewHasMetricClaim,
  myChallengesTrialReviewHasSelfTest,
  objectiveChallengerContains,
  objectiveConfirmedAtExists,
  objectiveHasStageAndFlowStatus,
  objectiveLootCount,
  objectiveLootSubmittedAtEmpty,
  objectivePanel,
  objectivePrefixAbsent,
  openLootPageFromMyChallenges,
  openMyChallenges,
  prepareCalibratedMetric,
  prepareFrozenObjective,
  readSessionUserName,
  selectMetricClaim,
  submitTrialReview,
  toastMessageAppeared,
  trialReviewCount,
  trialReviewExists,
  trialReviewHasMetricClaim,
  trialReviewHasSelfTest,
  waitLootPageLoaded,
} from "./_support/member-frozen-trial-review-submit.helpers";

export const memberFrozenTrialReviewSubmitOperators: OperatorRegistry<TestContext, MemberFrozenTrialReviewSubmitCaseData> = {
  "auth.session.user_name": {
    equals: async ({ ctx, params }) => {
      await expect.poll(() => readSessionUserName(ctx.page)).toBe(requiredString(params, "name"));
    },
  },

  "page.auth": {
    login: async ({ ctx, params }) => {
      await loginAsMember(ctx.page, {
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
    trial_review_submitted: async ({ ctx }) => {
      await expect.poll(() => toastMessageAppeared(ctx.page, "试验收已提交")).toBe(true);
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

  "page.loot_submission": {
    open_from_my_challenges: async ({ ctx, params }) => {
      await openLootPageFromMyChallenges(ctx.page, { targetTitle: requiredString(params, "targetTitle") });
    },

    loaded: async ({ ctx, params }) => {
      await waitLootPageLoaded(ctx.page, { targetTitle: requiredString(params, "targetTitle") });
    },

    fill_body: async ({ ctx, params }) => {
      await fillLootBody(ctx.page, requiredString(params, "body"));
    },

    select_metric_claim: async ({ ctx, params }) => {
      await selectMetricClaim(ctx.page, {
        metricTitle: requiredString(params, "metricTitle"),
        claimLabel: requiredString(params, "claimLabel"),
      });
    },

    fill_metric_evidence: async ({ ctx, params }) => {
      await fillMetricEvidence(ctx.page, {
        metricTitle: requiredString(params, "metricTitle"),
        evidence: requiredString(params, "evidence"),
      });
    },

    fill_self_test_report: async ({ ctx, params }) => {
      await fillSelfTestReport(ctx.page, requiredString(params, "selfTestReportBody"));
    },

    submit_trial_review: async ({ ctx, params }) => {
      await submitTrialReview(ctx.page, {
        target: requiredTarget(params, "target"),
        trialReview: requiredTrialReview(params, "trialReview"),
      });
    },
  },

  "api.my_challenges": {
    contains_objective: async ({ ctx, params }) => {
      await expect.poll(() => myChallengesContainsObjective(ctx.page, requiredString(params, "title"))).toBe(true);
    },

    objective_stage_flow: async ({ ctx, params }) => {
      await expect.poll(() => myChallengesObjectiveHasStageAndFlowStatus(ctx.page, requiredTarget(params, "target"))).toBe(true);
    },

    contains_trial_review: async ({ ctx, params }) => {
      await expect
        .poll(
          () =>
            myChallengesContainsTrialReview(ctx.page, {
              targetTitle: requiredString(params, "targetTitle"),
              status: requiredTrialReviewStatus(params, "status"),
              body: requiredString(params, "body"),
              memberUser: requiredUser(params, "memberUser"),
            }),
          { timeout: 15_000 },
        )
        .toBe(true);
    },

    trial_review_self_test: async ({ ctx, params }) => {
      await expect
        .poll(() =>
          myChallengesTrialReviewHasSelfTest(ctx.page, {
            targetTitle: requiredString(params, "targetTitle"),
            selfTestReportBody: requiredString(params, "selfTestReportBody"),
          }),
        )
        .toBe(true);
    },

    trial_review_metric_claim: async ({ ctx, params }) => {
      await expect
        .poll(() =>
          myChallengesTrialReviewHasMetricClaim(ctx.page, {
            targetTitle: requiredString(params, "targetTitle"),
            metric: requiredMetric(params, "metric"),
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

    loot_submitted_at_empty: async ({ params }) => {
      await expect.poll(() => objectiveLootSubmittedAtEmpty(requiredTarget(params, "target"))).toBe(true);
    },
  },

  "db.metric": {
    prepare_calibrated: async ({ params }) =>
      prepareCalibratedMetric({
        target: requiredTarget(params, "target"),
        metric: requiredMetric(params, "metric"),
        memberUser: requiredUser(params, "memberUser"),
        sortOrder: requiredNumber(params, "sortOrder"),
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
    delete_by_target: async ({ params }) => {
      await deleteTrialReviewsByTarget(requiredTarget(params, "target"));
    },

    count: async ({ params }) => {
      await expect.poll(() => trialReviewCount(requiredTarget(params, "target"))).toBe(requiredNumber(params, "count"));
    },

    exists: async ({ params }) => {
      await expect
        .poll(
          () =>
            trialReviewExists({
              target: requiredTarget(params, "target"),
              trialReview: requiredTrialReview(params, "trialReview"),
              memberUser: requiredUser(params, "memberUser"),
            }),
          { timeout: 15_000 },
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
    typeof metric.score !== "number" ||
    typeof metric.evidence !== "string" ||
    metric.claim !== "completed" ||
    !["进阶", "破局"].includes(String(metric.difficulty))
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
    trialReview.status !== "requested"
  ) {
    throw new Error(`参数 ${key} 缺少 body/selfTestReportBody/status`);
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
  if (value !== "进阶" && value !== "破局") {
    throw new Error(`参数 ${key} 必须是 进阶 或 破局`);
  }
  return value;
}

function requiredTrialReviewStatus(params: StepParams, key: string): TrialReviewData["status"] {
  const value = requiredString(params, key);
  if (value !== "requested") {
    throw new Error(`参数 ${key} 必须是 requested`);
  }
  return value;
}
