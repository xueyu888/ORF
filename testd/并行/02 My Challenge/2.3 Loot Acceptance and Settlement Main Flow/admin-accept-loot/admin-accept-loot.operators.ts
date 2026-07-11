import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../../../_framework/types";
import { requiredNumber, requiredString } from "../../../../_operators/params";
import type {
  AcceptedObjectiveTargetData,
  AdminAcceptLootCaseData,
  FinalLootData,
  MetricData,
  ObjectiveTargetStateData,
  SubmittedObjectiveTargetData,
  TestContext,
  TestUserAccountRecord,
} from "./_support/admin-accept-loot.context";
import {
  acceptanceReviewCount,
  acceptanceReviewExists,
  acceptanceReviewHasMetricResult,
  alignmentRequestExists,
  allChallengesContainsAcceptanceReview,
  allChallengesContainsCompletedAlignmentRequest,
  allChallengesContainsObjective,
  allChallengesObjectiveAcceptedAtExists,
  allChallengesObjectiveAcceptedResult,
  allChallengesObjectiveHasStageAndFlowStatus,
  challengeScopeTab,
  completedAlignmentRequestExists,
  deleteAcceptanceReviewsByTarget,
  deleteObjectivesByTitlePrefix,
  fillAcceptanceReason,
  loginAsAdmin,
  metricAbsentByTitle,
  metricAcceptedResultEmpty,
  metricAcceptedResultEquals,
  metricExistsWithScore,
  objectiveAcceptedAtEmpty,
  objectiveAcceptedAtExists,
  objectiveAcceptedResultEmpty,
  objectiveAcceptedResultEquals,
  objectiveChallengerContains,
  objectiveConfirmedAtExists,
  objectiveHasStageAndFlowStatus,
  objectiveLootExists,
  objectiveLootHasMetricClaim,
  objectiveLootHasSelfTest,
  objectiveLootSubmittedAtExists,
  objectivePanel,
  objectivePrefixAbsent,
  openAcceptanceReviewPageFromAlignment,
  openAlignmentRequestCount,
  openMyChallenges,
  prepareAcceptanceAlignmentRequest,
  prepareCalibratedMetric,
  prepareFinalObjectiveLoot,
  prepareSubmittedObjective,
  readSessionUserName,
  selectMetricAcceptanceResult,
  submitAcceptanceReview,
  toastMessageAppeared,
  waitAcceptanceReviewPageLoaded,
} from "./_support/admin-accept-loot.helpers";

export const adminAcceptLootOperators: OperatorRegistry<TestContext, AdminAcceptLootCaseData> = {
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
    acceptance_review_completed: async ({ ctx }) => {
      await expect.poll(() => toastMessageAppeared(ctx.page, "战利品验收处理已完成")).toBe(true);
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
    acceptance_visible: async ({ ctx, params }) => {
      await expect(objectivePanel(ctx.page, requiredString(params, "targetTitle"))).toContainText("验收对齐");
    },

    acceptance_hidden: async ({ ctx, params }) => {
      await expect(objectivePanel(ctx.page, requiredString(params, "targetTitle"))).not.toContainText("验收对齐");
    },
  },

  "page.acceptance_review": {
    open_from_alignment: async ({ ctx, params }) => {
      await openAcceptanceReviewPageFromAlignment(ctx.page, { targetTitle: requiredString(params, "targetTitle") });
    },

    loaded: async ({ ctx, params }) => {
      await waitAcceptanceReviewPageLoaded(ctx.page, { targetTitle: requiredString(params, "targetTitle") });
    },

    material_visible: async ({ ctx, params }) => {
      await expect(ctx.page.getByText(requiredString(params, "body"), { exact: true })).toBeVisible();
    },

    self_test_visible: async ({ ctx, params }) => {
      await expect(ctx.page.getByText(requiredString(params, "selfTestReportBody"), { exact: true })).toBeVisible();
    },

    evidence_visible: async ({ ctx, params }) => {
      await expect(ctx.page.getByText(requiredString(params, "metricTitle"), { exact: true })).toBeVisible();
      await expect(ctx.page.getByText(requiredString(params, "evidence"), { exact: true })).toBeVisible();
    },

    select_metric_result: async ({ ctx, params }) => {
      await selectMetricAcceptanceResult(ctx.page, {
        metricTitle: requiredString(params, "metricTitle"),
        resultLabel: requiredString(params, "resultLabel"),
      });
    },

    summary_visible: async ({ ctx, params }) => {
      await expect(ctx.page.getByText(requiredString(params, "summary"), { exact: true })).toBeVisible();
    },

    fill_reason: async ({ ctx, params }) => {
      await fillAcceptanceReason(ctx.page, requiredString(params, "reason"));
    },

    submit: async ({ ctx, params }) => {
      await submitAcceptanceReview(ctx.page, {
        acceptedTarget: requiredAcceptedTarget(params, "acceptedTarget"),
        metric: requiredMetric(params, "metric"),
        acceptanceResult: requiredAcceptanceResult(params, "acceptanceResult"),
        reviewReason: requiredString(params, "reviewReason"),
        alignmentFeedback: requiredString(params, "alignmentFeedback"),
        adminUser: requiredUser(params, "adminUser"),
      });
    },
  },

  "api.all_challenges": {
    contains_objective: async ({ ctx, params }) => {
      await expect.poll(() => allChallengesContainsObjective(ctx.page, requiredString(params, "title"))).toBe(true);
    },

    objective_stage_flow: async ({ ctx, params }) => {
      await expect
        .poll(() => allChallengesObjectiveHasStageAndFlowStatus(ctx.page, requiredTarget(params, "target")), { timeout: 20_000 })
        .toBe(true);
    },

    accepted_at_exists: async ({ ctx, params }) => {
      await expect.poll(() => allChallengesObjectiveAcceptedAtExists(ctx.page, requiredString(params, "title")), { timeout: 20_000 }).toBe(true);
    },

    accepted_result: async ({ ctx, params }) => {
      await expect
        .poll(
          () =>
            allChallengesObjectiveAcceptedResult(ctx.page, {
              title: requiredString(params, "title"),
              acceptanceResult: requiredAcceptanceResult(params, "acceptanceResult"),
            }),
          { timeout: 20_000 },
        )
        .toBe(true);
    },

    contains_acceptance_review: async ({ ctx, params }) => {
      await expect
        .poll(
          () =>
            allChallengesContainsAcceptanceReview(ctx.page, {
              targetTitle: requiredString(params, "targetTitle"),
              metric: requiredMetric(params, "metric"),
              acceptanceResult: requiredAcceptanceResult(params, "acceptanceResult"),
              reason: requiredString(params, "reason"),
              adminUser: requiredUser(params, "adminUser"),
            }),
          { timeout: 20_000 },
        )
        .toBe(true);
    },

    contains_completed_alignment_request: async ({ ctx, params }) => {
      await expect
        .poll(
          () =>
            allChallengesContainsCompletedAlignmentRequest(ctx.page, {
              targetTitle: requiredString(params, "targetTitle"),
              kind: requiredAlignmentKind(params, "kind"),
              status: requiredAlignmentStatus(params, "status"),
              feedback: requiredString(params, "feedback"),
              adminUser: requiredUser(params, "adminUser"),
            }),
          { timeout: 20_000 },
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

  "db.submitted_objective_fixture": {
    prepare: async ({ params }) =>
      prepareSubmittedObjective({
        adminUser: requiredUser(params, "adminUser"),
        memberUser: requiredUser(params, "memberUser"),
        target: requiredSubmittedTarget(params, "target"),
      }),

    exists: async ({ params }) => {
      await expect.poll(() => objectiveHasStageAndFlowStatus(requiredSubmittedTarget(params, "target"))).toBe(true);
    },

    accepted: async ({ params }) => {
      await expect.poll(() => objectiveHasStageAndFlowStatus(requiredAcceptedTarget(params, "target")), { timeout: 20_000 }).toBe(true);
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

    loot_submitted_at_exists: async ({ params }) => {
      await expect.poll(() => objectiveLootSubmittedAtExists(requiredTarget(params, "target"))).toBe(true);
    },

    accepted_at_empty: async ({ params }) => {
      await expect.poll(() => objectiveAcceptedAtEmpty(requiredTarget(params, "target"))).toBe(true);
    },

    accepted_at_exists: async ({ params }) => {
      await expect.poll(() => objectiveAcceptedAtExists(requiredTarget(params, "target")), { timeout: 20_000 }).toBe(true);
    },

    accepted_result_empty: async ({ params }) => {
      await expect.poll(() => objectiveAcceptedResultEmpty(requiredTarget(params, "target"))).toBe(true);
    },

    accepted_result: async ({ params }) => {
      await expect
        .poll(() =>
          objectiveAcceptedResultEquals({
            target: requiredTarget(params, "target"),
            acceptanceResult: requiredAcceptanceResult(params, "acceptanceResult"),
          }),
        )
        .toBe(true);
    },
  },

  "db.metric": {
    prepare_calibrated: async ({ params }) =>
      prepareCalibratedMetric({
        target: requiredSubmittedTarget(params, "target"),
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

    accepted_result_empty: async ({ params }) => {
      await expect.poll(() => metricAcceptedResultEmpty(requiredString(params, "title"))).toBe(true);
    },

    accepted_result: async ({ params }) => {
      await expect
        .poll(() =>
          metricAcceptedResultEquals({
            title: requiredString(params, "title"),
            acceptedResult: requiredResultAcceptedResult(params, "acceptedResult"),
          }),
        )
        .toBe(true);
    },
  },

  "db.objective_loot": {
    prepare_final: async ({ params }) =>
      prepareFinalObjectiveLoot({
        target: requiredTarget(params, "target"),
        metric: requiredMetric(params, "metric"),
        finalLoot: requiredFinalLoot(params, "finalLoot"),
        memberUser: requiredUser(params, "memberUser"),
      }),

    exists: async ({ params }) => {
      await expect
        .poll(
          () =>
            objectiveLootExists({
              target: requiredTarget(params, "target"),
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
            target: requiredTarget(params, "target"),
            selfTestReportBody: requiredString(params, "selfTestReportBody"),
          }),
        )
        .toBe(true);
    },

    metric_claim: async ({ params }) => {
      await expect
        .poll(() =>
          objectiveLootHasMetricClaim({
            target: requiredTarget(params, "target"),
            metric: requiredMetric(params, "metric"),
          }),
        )
        .toBe(true);
    },
  },

  "db.objective_alignment_request": {
    prepare_acceptance: async ({ params }) =>
      prepareAcceptanceAlignmentRequest({
        target: requiredSubmittedTarget(params, "target"),
        kind: requiredAlignmentKind(params, "kind"),
        status: requiredAlignmentStatus(params, "status"),
        note: requiredString(params, "note"),
        memberUser: requiredUser(params, "memberUser"),
      }),

    exists: async ({ params }) => {
      await expect
        .poll(
          () =>
            alignmentRequestExists({
              target: requiredSubmittedTarget(params, "target"),
              kind: requiredAlignmentKind(params, "kind"),
              status: requiredAlignmentStatus(params, "status"),
              memberUser: requiredUser(params, "memberUser"),
            }),
          { timeout: 15_000 },
        )
        .toBe(true);
    },

    completed: async ({ params }) => {
      await expect
        .poll(
          () =>
            completedAlignmentRequestExists({
              target: requiredAcceptedTarget(params, "target"),
              kind: requiredAlignmentKind(params, "kind"),
              status: requiredAlignmentStatus(params, "status"),
              feedback: requiredString(params, "feedback"),
              adminUser: requiredUser(params, "adminUser"),
            }),
          { timeout: 20_000 },
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

  "db.objective_acceptance_review": {
    delete_by_target: async ({ params }) => {
      await deleteAcceptanceReviewsByTarget(requiredSubmittedTarget(params, "target"));
    },

    count: async ({ params }) => {
      await expect.poll(() => acceptanceReviewCount(requiredTarget(params, "target"))).toBe(requiredNumber(params, "count"));
    },

    exists: async ({ params }) => {
      await expect
        .poll(
          () =>
            acceptanceReviewExists({
              target: requiredAcceptedTarget(params, "target"),
              metric: requiredMetric(params, "metric"),
              acceptanceResult: requiredAcceptanceResult(params, "acceptanceResult"),
              reason: requiredString(params, "reason"),
              adminUser: requiredUser(params, "adminUser"),
            }),
          { timeout: 20_000 },
        )
        .toBe(true);
    },

    metric_result: async ({ params }) => {
      await expect
        .poll(() =>
          acceptanceReviewHasMetricResult({
            target: requiredAcceptedTarget(params, "target"),
            metric: requiredMetric(params, "metric"),
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
    (target.flowStatus !== "submitted" && target.flowStatus !== "accepted") ||
    target.finalDueOffsetDays !== 8
  ) {
    throw new Error(`参数 ${key} 缺少 title/stage/flowStatus/finalDueOffsetDays`);
  }
  return target as ObjectiveTargetStateData;
}

function requiredSubmittedTarget(params: StepParams, key: string): SubmittedObjectiveTargetData {
  const target = requiredTarget(params, key);
  if (target.flowStatus !== "submitted") {
    throw new Error(`参数 ${key} 必须是 submitted 目标`);
  }
  return target as SubmittedObjectiveTargetData;
}

function requiredAcceptedTarget(params: StepParams, key: string): AcceptedObjectiveTargetData {
  const target = requiredTarget(params, key);
  if (target.flowStatus !== "accepted") {
    throw new Error(`参数 ${key} 必须是 accepted 目标`);
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

function requiredAlignmentKind(params: StepParams, key: string): AdminAcceptLootCaseData["alignmentKind"] {
  const value = requiredString(params, key);
  if (value !== "acceptance") {
    throw new Error(`参数 ${key} 必须是 acceptance`);
  }
  return value;
}

function requiredAlignmentStatus(params: StepParams, key: string): AdminAcceptLootCaseData["alignmentStatus"] | AdminAcceptLootCaseData["completedAlignmentStatus"] {
  const value = requiredString(params, key);
  if (value !== "requested" && value !== "completed") {
    throw new Error(`参数 ${key} 必须是 requested 或 completed`);
  }
  return value;
}

function requiredAcceptanceResult(params: StepParams, key: string): AdminAcceptLootCaseData["acceptanceResult"] {
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
