import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../../../_framework/types";
import { requiredNumber, requiredString } from "../../../../_operators/params";
import type {
  FinalLootData,
  FrozenObjectiveTargetData,
  MemberTrialFeedbackFinalSubmitCaseData,
  MetricData,
  ObjectiveTargetStateData,
  TestContext,
  TestUserAccountRecord,
  TrialReviewData,
} from "./_support/member-trial-feedback-final-submit.context";
import {
  challengeScopeTab,
  deleteObjectiveLootByTarget,
  deleteObjectivesByTitlePrefix,
  fillLootBody,
  fillMetricEvidence,
  fillSelfTestReport,
  loginAsMember,
  metricAbsentByTitle,
  metricExistsWithScore,
  myChallengesContainsObjective,
  myChallengesContainsObjectiveLoot,
  myChallengesContainsTrialReview,
  myChallengesObjectiveHasStageAndFlowStatus,
  myChallengesObjectiveLootHasMetricClaim,
  myChallengesObjectiveLootHasSelfTest,
  myChallengesObjectiveLootSubmittedAtExists,
  objectiveChallengerContains,
  objectiveConfirmedAtExists,
  objectiveHasStageAndFlowStatus,
  objectiveLootCount,
  objectiveLootExists,
  objectiveLootHasMetricClaim,
  objectiveLootHasSelfTest,
  objectiveLootSubmittedAtEmpty,
  objectiveLootSubmittedAtExists,
  objectivePanel,
  objectivePrefixAbsent,
  openLootPageFromMyChallenges,
  openMyChallenges,
  prepareApprovedTrialReview,
  prepareCalibratedMetric,
  prepareFrozenObjective,
  readSessionUserName,
  selectMetricClaim,
  submitFinalLoot,
  toastMessageAppeared,
  trialReviewCount,
  trialReviewExists,
  trialReviewFeedbackVisible,
  trialReviewReviewedAtExists,
  trialReviewStatusVisible,
  waitLootPageLoaded,
} from "./_support/member-trial-feedback-final-submit.helpers";

export const memberTrialFeedbackFinalSubmitOperators: OperatorRegistry<TestContext, MemberTrialFeedbackFinalSubmitCaseData> = {
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
    loot_submitted: async ({ ctx }) => {
      await expect.poll(() => toastMessageAppeared(ctx.page, "战利品已提交")).toBe(true);
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

    trial_review_status_visible: async ({ ctx, params }) => {
      await trialReviewStatusVisible(ctx.page, requiredString(params, "statusLabel"));
    },

    trial_review_feedback_visible: async ({ ctx, params }) => {
      await trialReviewFeedbackVisible(ctx.page, requiredString(params, "feedback"));
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

    submit_final: async ({ ctx, params }) => {
      await submitFinalLoot(ctx.page, {
        target: requiredTargetState(params, "target"),
        finalLoot: requiredFinalLoot(params, "finalLoot"),
        memberUser: requiredUser(params, "memberUser"),
      });
    },
  },

  "api.my_challenges": {
    contains_objective: async ({ ctx, params }) => {
      await expect.poll(() => myChallengesContainsObjective(ctx.page, requiredString(params, "title"))).toBe(true);
    },

    objective_stage_flow: async ({ ctx, params }) => {
      await expect
        .poll(() => myChallengesObjectiveHasStageAndFlowStatus(ctx.page, requiredTargetState(params, "target")), { timeout: 15_000 })
        .toBe(true);
    },

    loot_submitted_at_exists: async ({ ctx, params }) => {
      await expect.poll(() => myChallengesObjectiveLootSubmittedAtExists(ctx.page, requiredString(params, "targetTitle"))).toBe(true);
    },

    contains_objective_loot: async ({ ctx, params }) => {
      await expect
        .poll(
          () =>
            myChallengesContainsObjectiveLoot(ctx.page, {
              targetTitle: requiredString(params, "targetTitle"),
              finalLoot: requiredFinalLoot(params, "finalLoot"),
              memberUser: requiredUser(params, "memberUser"),
            }),
          { timeout: 15_000 },
        )
        .toBe(true);
    },

    objective_loot_self_test: async ({ ctx, params }) => {
      await expect
        .poll(() =>
          myChallengesObjectiveLootHasSelfTest(ctx.page, {
            targetTitle: requiredString(params, "targetTitle"),
            selfTestReportBody: requiredString(params, "selfTestReportBody"),
          }),
        )
        .toBe(true);
    },

    objective_loot_metric_claim: async ({ ctx, params }) => {
      await expect
        .poll(() =>
          myChallengesObjectiveLootHasMetricClaim(ctx.page, {
            targetTitle: requiredString(params, "targetTitle"),
            metric: requiredMetric(params, "metric"),
          }),
        )
        .toBe(true);
    },

    contains_trial_review: async ({ ctx, params }) => {
      await expect
        .poll(() =>
          myChallengesContainsTrialReview(ctx.page, {
            targetTitle: requiredString(params, "targetTitle"),
            trialReview: requiredTrialReview(params, "trialReview"),
            memberUser: requiredUser(params, "memberUser"),
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
        target: requiredFrozenTarget(params, "target"),
      }),

    exists: async ({ params }) => {
      await expect.poll(() => objectiveHasStageAndFlowStatus(requiredTargetState(params, "target"))).toBe(true);
    },

    challenger_contains: async ({ params }) => {
      await expect
        .poll(() =>
          objectiveChallengerContains({
            target: requiredFrozenTarget(params, "target"),
            memberUser: requiredUser(params, "memberUser"),
          }),
        )
        .toBe(true);
    },

    confirmed_at_exists: async ({ params }) => {
      await expect.poll(() => objectiveConfirmedAtExists(requiredFrozenTarget(params, "target"))).toBe(true);
    },

    loot_submitted_at_empty: async ({ params }) => {
      await expect.poll(() => objectiveLootSubmittedAtEmpty(requiredFrozenTarget(params, "target"))).toBe(true);
    },

    loot_submitted_at_exists: async ({ params }) => {
      await expect.poll(() => objectiveLootSubmittedAtExists(requiredTargetState(params, "target"))).toBe(true);
    },
  },

  "db.metric": {
    prepare_calibrated: async ({ params }) =>
      prepareCalibratedMetric({
        target: requiredFrozenTarget(params, "target"),
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
            target: requiredFrozenTarget(params, "target"),
            title: requiredString(params, "title"),
            difficulty: requiredDifficulty(params, "difficulty"),
            score: requiredNumber(params, "score"),
          }),
        )
        .toBe(true);
    },
  },

  "db.objective_trial_review": {
    prepare_approved: async ({ params }) =>
      prepareApprovedTrialReview({
        target: requiredFrozenTarget(params, "target"),
        metrics: [requiredMetric(params, "metricA"), requiredMetric(params, "metricB")],
        trialReview: requiredTrialReview(params, "trialReview"),
        memberUser: requiredUser(params, "memberUser"),
        adminUser: requiredUser(params, "adminUser"),
      }),

    exists: async ({ params }) => {
      await expect
        .poll(() =>
          trialReviewExists({
            target: requiredFrozenTarget(params, "target"),
            trialReview: requiredTrialReview(params, "trialReview"),
            memberUser: requiredUser(params, "memberUser"),
            adminUser: requiredUser(params, "adminUser"),
          }),
        )
        .toBe(true);
    },

    reviewed_at_exists: async ({ params }) => {
      await expect.poll(() => trialReviewReviewedAtExists(requiredFrozenTarget(params, "target"))).toBe(true);
    },

    count: async ({ params }) => {
      await expect.poll(() => trialReviewCount(requiredFrozenTarget(params, "target"))).toBe(requiredNumber(params, "count"));
    },
  },

  "db.objective_loot": {
    delete_by_target: async ({ params }) => {
      await deleteObjectiveLootByTarget(requiredFrozenTarget(params, "target"));
    },

    count: async ({ params }) => {
      await expect.poll(() => objectiveLootCount(requiredTargetState(params, "target"))).toBe(requiredNumber(params, "count"));
    },

    exists: async ({ params }) => {
      await expect
        .poll(
          () =>
            objectiveLootExists({
              target: requiredTargetState(params, "target"),
              finalLoot: requiredFinalLoot(params, "finalLoot"),
              memberUser: requiredUser(params, "memberUser"),
            }),
          { timeout: 15_000 },
        )
        .toBe(true);
    },

    self_test: async ({ params }) => {
      await expect
        .poll(() =>
          objectiveLootHasSelfTest({
            target: requiredTargetState(params, "target"),
            selfTestReportBody: requiredString(params, "selfTestReportBody"),
          }),
        )
        .toBe(true);
    },

    metric_claim: async ({ params }) => {
      await expect
        .poll(() =>
          objectiveLootHasMetricClaim({
            target: requiredTargetState(params, "target"),
            metric: requiredMetric(params, "metric"),
          }),
        )
        .toBe(true);
    },
  },
};

function requiredFrozenTarget(params: StepParams, key: string): FrozenObjectiveTargetData {
  const target = requiredTargetState(params, key);
  if (target.flowStatus !== "frozen") {
    throw new Error(`参数 ${key} 必须是 frozen 目标`);
  }
  return target as FrozenObjectiveTargetData;
}

function requiredTargetState(params: StepParams, key: string): ObjectiveTargetStateData {
  const value = params[key];
  if (typeof value !== "object" || value === null) {
    throw new Error(`参数 ${key} 必须是 ObjectiveTargetStateData`);
  }
  const target = value as Partial<ObjectiveTargetStateData>;
  if (
    typeof target.title !== "string" ||
    target.stage !== "goalFrozen" ||
    (target.flowStatus !== "frozen" && target.flowStatus !== "submitted") ||
    target.finalDueOffsetDays !== 8
  ) {
    throw new Error(`参数 ${key} 缺少 title/stage/flowStatus/finalDueOffsetDays`);
  }
  return target as ObjectiveTargetStateData;
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
    metric.claim !== "completed" ||
    typeof metric.trialEvidence !== "string" ||
    typeof metric.finalEvidence !== "string" ||
    !["进阶", "破局"].includes(String(metric.difficulty))
  ) {
    throw new Error(`参数 ${key} 缺少 title/difficulty/score/claim/trialEvidence/finalEvidence`);
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
    trialReview.status !== "approved" ||
    typeof trialReview.commanderFeedback !== "string"
  ) {
    throw new Error(`参数 ${key} 缺少 body/selfTestReportBody/status/commanderFeedback`);
  }
  return trialReview as TrialReviewData;
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
  if (value !== "进阶" && value !== "破局") {
    throw new Error(`参数 ${key} 必须是 进阶 或 破局`);
  }
  return value;
}
