import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../../../_framework/types";
import { requiredNumber, requiredString } from "../../../../_operators/params";
import type {
  AcceptedObjectiveTargetData,
  FinalLootData,
  LocalSettlementReview,
  MemberPeerReviewSubmitCaseData,
  MetricData,
  TestContext,
  TestUserAccountRecord,
} from "./_support/member-peer-review-submit.context";
import {
  acceptanceReviewExists,
  challengeScopeTab,
  clearMyLocalSettlementDraft,
  deleteFinalSettlementEventsByTarget,
  deleteObjectivesByTitlePrefix,
  fillMetricContributionPercent,
  finalSettlementEventCount,
  latestPeerReviewForTarget,
  localSettlementServiceAvailable,
  loginAsMember,
  metricAbsentByTitle,
  metricContributionRowTotalVisible,
  metricExistsAccepted,
  myChallengesContainsObjective,
  myChallengesObjectiveHasStageAndFlowStatus,
  myLocalSettlementDraftEmpty,
  myLocalSettlementReviewEmpty,
  objectiveAcceptedAtExists,
  objectiveAcceptedResultEquals,
  objectiveChallengerContains,
  objectiveHasStageAndFlowStatus,
  objectiveLootExists,
  objectivePanel,
  objectivePrefixAbsent,
  openMyChallenges,
  openPeerReviewPage,
  peerReviewContainsMetric,
  peerReviewIsScored,
  peerReviewMetricAllocationPercent,
  peerReviewMetricAllocationTotal,
  peerReviewReviewerEquals,
  peerReviewSubmittedAtExists,
  prepareAcceptedMetric,
  prepareAcceptedObjective,
  prepareCompletedAcceptanceReview,
  prepareFinalObjectiveLoot,
  readSessionUserName,
  submitPeerReview,
  toastMessageAppeared,
  waitPeerReviewPageLoaded,
} from "./_support/member-peer-review-submit.helpers";

export const memberPeerReviewSubmitOperators: OperatorRegistry<TestContext, MemberPeerReviewSubmitCaseData> = {
  "auth.session.user_name": {
    equals: async ({ ctx, params }) => {
      await expect.poll(() => readSessionUserName(ctx.page)).toBe(requiredString(params, "name"));
    },
  },

  "api.local_settlement": {
    available: async ({ ctx }) => {
      await expect.poll(() => localSettlementServiceAvailable(ctx.page), { timeout: 20_000 }).toBe(true);
    },

    ensure_my_draft_absent: async ({ ctx, params }) => {
      const target = requiredAcceptedTarget(params, "target");
      await clearMyLocalSettlementDraft(ctx.page, target);
      await expect.poll(() => myLocalSettlementDraftEmpty(ctx.page, target), { timeout: 15_000 }).toBe(true);
    },

    my_review_empty: async ({ ctx, params }) => {
      await expect.poll(() => myLocalSettlementReviewEmpty(ctx.page, requiredAcceptedTarget(params, "target")), { timeout: 15_000 }).toBe(true);
    },

    my_draft_empty: async ({ ctx, params }) => {
      await expect.poll(() => myLocalSettlementDraftEmpty(ctx.page, requiredAcceptedTarget(params, "target")), { timeout: 15_000 }).toBe(true);
    },

    submit_result_success: async ({ ctx, params }) => {
      const target = requiredAcceptedTarget(params, "target");
      let review: LocalSettlementReview | null = null;
      await expect
        .poll(
          async () => {
            review = await latestPeerReviewForTarget(ctx.page, target);
            return peerReviewIsScored(review);
          },
          { timeout: 20_000 },
        )
        .toBe(true);
      return review;
    },

    latest_review_contains_target: async ({ ctx, params }) => {
      const target = requiredAcceptedTarget(params, "target");
      let review: LocalSettlementReview | null = null;
      await expect
        .poll(
          async () => {
            review = await latestPeerReviewForTarget(ctx.page, target);
            return review !== null;
          },
          { timeout: 20_000 },
        )
        .toBe(true);
      return review;
    },
  },

  "api.peer_review": {
    scored: async ({ params }) => {
      expect(peerReviewIsScored(requiredReview(params, "review"))).toBe(true);
    },

    reviewer: async ({ params }) => {
      expect(peerReviewReviewerEquals(requiredReview(params, "review"), requiredUser(params, "memberUser"))).toBe(true);
    },

    submitted_at_exists: async ({ params }) => {
      expect(peerReviewSubmittedAtExists(requiredReview(params, "review"))).toBe(true);
    },

    contains_metric: async ({ params }) => {
      expect(peerReviewContainsMetric(requiredReview(params, "review"), requiredMetric(params, "metric"))).toBe(true);
    },

    metric_allocation_percent: async ({ params }) => {
      expect(
        peerReviewMetricAllocationPercent({
          memberUser: requiredUser(params, "memberUser"),
          metric: requiredMetric(params, "metric"),
          percent: requiredNumber(params, "percent"),
          review: requiredReview(params, "review"),
        }),
      ).toBe(true);
    },

    metric_allocation_total: async ({ params }) => {
      expect(
        peerReviewMetricAllocationTotal({
          metric: requiredMetric(params, "metric"),
          review: requiredReview(params, "review"),
          totalPercent: requiredNumber(params, "totalPercent"),
        }),
      ).toBe(true);
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
    peer_review_submitted: async ({ ctx }) => {
      await expect.poll(() => toastMessageAppeared(ctx.page, "匿名互评已通过 ORF 提交到共享结算服务"), { timeout: 15_000 }).toBe(true);
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

    action_visible: async ({ ctx, params }) => {
      await expect(
        objectivePanel(ctx.page, requiredString(params, "title")).getByRole("link", {
          name: requiredString(params, "actionLabel"),
          exact: true,
        }),
      ).toBeVisible({ timeout: 20_000 });
    },

    action_enabled: async ({ ctx, params }) => {
      const action = objectivePanel(ctx.page, requiredString(params, "title")).getByRole("link", {
        name: requiredString(params, "actionLabel"),
        exact: true,
      });
      await expect(action).toBeVisible({ timeout: 20_000 });
      await expect(action).toBeEnabled();
    },
  },

  "page.peer_review": {
    open_from_objective: async ({ ctx, params }) => {
      await openPeerReviewPage(ctx.page, requiredString(params, "targetTitle"));
    },

    loaded: async ({ ctx, params }) => {
      await waitPeerReviewPageLoaded(ctx.page, requiredString(params, "targetTitle"));
    },

    target_visible: async ({ ctx, params }) => {
      await expect(ctx.page.getByText(requiredString(params, "targetTitle"), { exact: true })).toBeVisible();
    },

    title_visible: async ({ ctx, params }) => {
      await expect(ctx.page.getByRole("heading", { name: requiredString(params, "title"), exact: true })).toBeVisible();
    },

    notice_visible: async ({ ctx, params }) => {
      await expect(ctx.page.getByText(requiredString(params, "notice"), { exact: true })).toBeVisible();
    },

    matrix_visible: async ({ ctx, params }) => {
      await expect(ctx.page.getByText(requiredString(params, "title"), { exact: true })).toBeVisible();
    },

    metric_visible: async ({ ctx, params }) => {
      await expect(ctx.page.getByText(requiredString(params, "metricTitle"), { exact: true })).toBeVisible();
    },

    fill_metric_percent: async ({ ctx, params }) => {
      await fillMetricContributionPercent(ctx.page, {
        memberName: requiredString(params, "memberName"),
        metricTitle: requiredString(params, "metricTitle"),
        percent: requiredNumber(params, "percent"),
      });
    },

    row_total_visible: async ({ ctx, params }) => {
      await metricContributionRowTotalVisible(ctx.page, {
        metricTitle: requiredString(params, "metricTitle"),
        totalPercent: requiredNumber(params, "totalPercent"),
      });
    },

    submit_enabled: async ({ ctx, params }) => {
      await expect(ctx.page.getByRole("button", { name: requiredString(params, "label"), exact: true })).toBeEnabled();
    },

    submit: async ({ ctx }) => {
      await submitPeerReview(ctx.page);
    },
  },

  "api.my_challenges": {
    contains_objective: async ({ ctx, params }) => {
      await expect.poll(() => myChallengesContainsObjective(ctx.page, requiredString(params, "title")), { timeout: 15_000 }).toBe(true);
    },

    objective_stage_flow: async ({ ctx, params }) => {
      await expect
        .poll(() => myChallengesObjectiveHasStageAndFlowStatus(ctx.page, requiredAcceptedTarget(params, "target")), { timeout: 15_000 })
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

  "db.accepted_objective_fixture": {
    prepare: async ({ params }) =>
      prepareAcceptedObjective({
        adminUser: requiredUser(params, "adminUser"),
        memberUser: requiredUser(params, "memberUser"),
        teammateUser: requiredUser(params, "teammateUser"),
        target: requiredAcceptedTarget(params, "target"),
      }),

    exists: async ({ params }) => {
      await expect.poll(() => objectiveHasStageAndFlowStatus(requiredAcceptedTarget(params, "target"))).toBe(true);
    },

    challenger_contains: async ({ params }) => {
      await expect
        .poll(() =>
          objectiveChallengerContains({
            target: requiredAcceptedTarget(params, "target"),
            memberUser: requiredUser(params, "memberUser"),
          }),
        )
        .toBe(true);
    },

    accepted_at_exists: async ({ params }) => {
      await expect.poll(() => objectiveAcceptedAtExists(requiredAcceptedTarget(params, "target"))).toBe(true);
    },

    accepted_result: async ({ params }) => {
      await expect
        .poll(() =>
          objectiveAcceptedResultEquals({
            target: requiredAcceptedTarget(params, "target"),
            acceptanceResult: requiredAcceptanceResult(params, "acceptanceResult"),
          }),
        )
        .toBe(true);
    },
  },

  "db.metric": {
    prepare_accepted: async ({ params }) =>
      prepareAcceptedMetric({
        target: requiredAcceptedTarget(params, "target"),
        metric: requiredMetric(params, "metric"),
        memberUser: requiredUser(params, "memberUser"),
      }),

    exists_accepted: async ({ params }) => {
      await expect
        .poll(() =>
          metricExistsAccepted({
            target: requiredAcceptedTarget(params, "target"),
            title: requiredString(params, "title"),
            difficulty: requiredDifficulty(params, "difficulty"),
            score: requiredNumber(params, "score"),
            acceptedResult: requiredResultAcceptedResult(params, "acceptedResult"),
          }),
        )
        .toBe(true);
    },

    absent: async ({ params }) => {
      await expect.poll(() => metricAbsentByTitle(requiredString(params, "title"))).toBe(true);
    },
  },

  "db.objective_loot": {
    prepare_final: async ({ params }) =>
      prepareFinalObjectiveLoot({
        target: requiredAcceptedTarget(params, "target"),
        metric: requiredMetric(params, "metric"),
        finalLoot: requiredFinalLoot(params, "finalLoot"),
        memberUser: requiredUser(params, "memberUser"),
      }),

    exists: async ({ params }) => {
      await expect
        .poll(
          () =>
            objectiveLootExists({
              target: requiredAcceptedTarget(params, "target"),
              finalLoot: requiredFinalLoot(params, "finalLoot"),
              memberUser: requiredUser(params, "memberUser"),
            }),
          { timeout: 15_000 },
        )
        .toBe(true);
    },
  },

  "db.objective_acceptance_review": {
    prepare_completed: async ({ params }) =>
      prepareCompletedAcceptanceReview({
        target: requiredAcceptedTarget(params, "target"),
        metric: requiredMetric(params, "metric"),
        acceptanceResult: requiredAcceptanceResult(params, "acceptanceResult"),
        reason: requiredString(params, "reason"),
        adminUser: requiredUser(params, "adminUser"),
      }),

    exists: async ({ params }) => {
      await expect
        .poll(
          () =>
            acceptanceReviewExists({
              target: requiredAcceptedTarget(params, "target"),
              metric: requiredMetric(params, "metric"),
              acceptanceResult: requiredAcceptanceResult(params, "acceptanceResult"),
              reason: params.reason === undefined ? undefined : requiredString(params, "reason"),
              adminUser: requiredUser(params, "adminUser"),
            }),
          { timeout: 15_000 },
        )
        .toBe(true);
    },
  },

  "db.objective_settlement_events": {
    delete_final_completion: async ({ params }) => {
      await deleteFinalSettlementEventsByTarget(requiredAcceptedTarget(params, "target"));
    },

    final_completion_count: async ({ params }) => {
      await expect.poll(() => finalSettlementEventCount(requiredAcceptedTarget(params, "target"))).toBe(requiredNumber(params, "count"));
    },
  },
};

function requiredAcceptedTarget(params: StepParams, key: string): AcceptedObjectiveTargetData {
  const value = params[key];
  if (typeof value !== "object" || value === null) {
    throw new Error(`参数 ${key} 必须是 AcceptedObjectiveTargetData`);
  }
  const target = value as Partial<AcceptedObjectiveTargetData>;
  if (
    typeof target.title !== "string" ||
    target.stage !== "goalFrozen" ||
    target.flowStatus !== "accepted" ||
    target.finalDueOffsetDays !== 8
  ) {
    throw new Error(`参数 ${key} 缺少 title/stage/flowStatus/finalDueOffsetDays`);
  }
  return target as AcceptedObjectiveTargetData;
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

function requiredReview(params: StepParams, key: string): LocalSettlementReview | null {
  const value = params[key];
  if (value === null) return null;
  if (typeof value !== "object") {
    throw new Error(`参数 ${key} 必须是 LocalSettlementReview`);
  }
  return value as LocalSettlementReview;
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

function requiredAcceptanceResult(params: StepParams, key: string): MemberPeerReviewSubmitCaseData["acceptanceResult"] {
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
