import { expect } from "@playwright/test";
import type { OperatorRegistry, StepParams } from "../../../../_framework/types";
import { requiredNumber, requiredString } from "../../../../_operators/params";
import type {
  FinalLootData,
  MemberAcceptanceAlignmentRequestCaseData,
  MetricData,
  SubmittedObjectiveTargetData,
  TestContext,
  TestUserAccountRecord,
} from "./_support/member-acceptance-alignment-request.context";
import {
  alignmentRequestExists,
  alignmentRequestProposedAtExists,
  challengeScopeTab,
  deleteObjectivesByTitlePrefix,
  deleteOpenAlignmentRequests,
  loginAsMember,
  metricAbsentByTitle,
  metricExistsWithScore,
  myChallengesAlignmentRequestProposedAtExists,
  myChallengesContainsAlignmentRequest,
  myChallengesContainsObjective,
  myChallengesContainsObjectiveLoot,
  myChallengesObjectiveHasStageAndFlowStatus,
  objectiveChallengerContains,
  objectiveConfirmedAtExists,
  objectiveHasStageAndFlowStatus,
  objectiveLootExists,
  objectiveLootHasMetricClaim,
  objectiveLootHasSelfTest,
  objectiveLootSubmittedAtExists,
  objectivePanel,
  objectivePrefixAbsent,
  openAlignmentRequestCount,
  openMyChallenges,
  prepareCalibratedMetric,
  prepareFinalObjectiveLoot,
  prepareSubmittedObjective,
  readSessionUserName,
  requestAcceptanceAlignment,
  toastMessageAppeared,
} from "./_support/member-acceptance-alignment-request.helpers";

export const memberAcceptanceAlignmentRequestOperators: OperatorRegistry<TestContext, MemberAcceptanceAlignmentRequestCaseData> = {
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
    acceptance_alignment_requested: async ({ ctx }) => {
      await expect.poll(() => toastMessageAppeared(ctx.page, "已申请验收对齐")).toBe(true);
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
    request_acceptance_enabled: async ({ ctx, params }) => {
      const action = objectivePanel(ctx.page, requiredString(params, "targetTitle")).getByRole("button", {
        name: "申请验收对齐",
        exact: true,
      });
      await expect(action).toBeVisible();
      await expect(action).toBeEnabled();
    },

    request_acceptance: async ({ ctx, params }) => {
      await requestAcceptanceAlignment(ctx.page, requiredString(params, "targetTitle"));
    },

    request_acceptance_hidden: async ({ ctx, params }) => {
      await expect(
        objectivePanel(ctx.page, requiredString(params, "targetTitle")).getByRole("button", {
          name: "申请验收对齐",
          exact: true,
        }),
      ).toHaveCount(0);
    },
  },

  "api.my_challenges": {
    contains_objective: async ({ ctx, params }) => {
      await expect.poll(() => myChallengesContainsObjective(ctx.page, requiredString(params, "title"))).toBe(true);
    },

    objective_stage_flow: async ({ ctx, params }) => {
      await expect
        .poll(() => myChallengesObjectiveHasStageAndFlowStatus(ctx.page, requiredSubmittedTarget(params, "target")), { timeout: 15_000 })
        .toBe(true);
    },

    contains_alignment_request: async ({ ctx, params }) => {
      await expect
        .poll(
          () =>
            myChallengesContainsAlignmentRequest(ctx.page, {
              targetTitle: requiredString(params, "targetTitle"),
              kind: requiredAlignmentKind(params, "kind"),
              status: requiredAlignmentStatus(params, "status"),
              memberUser: requiredUser(params, "memberUser"),
            }),
          { timeout: 15_000 },
        )
        .toBe(true);
    },

    alignment_request_proposed_at_exists: async ({ ctx, params }) => {
      await expect
        .poll(
          () =>
            myChallengesAlignmentRequestProposedAtExists(ctx.page, {
              targetTitle: requiredString(params, "targetTitle"),
              kind: requiredAlignmentKind(params, "kind"),
              status: requiredAlignmentStatus(params, "status"),
              memberUser: requiredUser(params, "memberUser"),
            }),
          { timeout: 15_000 },
        )
        .toBe(true);
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

    challenger_contains: async ({ params }) => {
      await expect
        .poll(() =>
          objectiveChallengerContains({
            target: requiredSubmittedTarget(params, "target"),
            memberUser: requiredUser(params, "memberUser"),
          }),
        )
        .toBe(true);
    },

    confirmed_at_exists: async ({ params }) => {
      await expect.poll(() => objectiveConfirmedAtExists(requiredSubmittedTarget(params, "target"))).toBe(true);
    },

    loot_submitted_at_exists: async ({ params }) => {
      await expect.poll(() => objectiveLootSubmittedAtExists(requiredSubmittedTarget(params, "target"))).toBe(true);
    },
  },

  "db.metric": {
    prepare_calibrated: async ({ params }) =>
      prepareCalibratedMetric({
        target: requiredSubmittedTarget(params, "target"),
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
            target: requiredSubmittedTarget(params, "target"),
            title: requiredString(params, "title"),
            difficulty: requiredDifficulty(params, "difficulty"),
            score: requiredNumber(params, "score"),
          }),
        )
        .toBe(true);
    },
  },

  "db.objective_loot": {
    prepare_final: async ({ params }) =>
      prepareFinalObjectiveLoot({
        target: requiredSubmittedTarget(params, "target"),
        metric: requiredMetric(params, "metric"),
        finalLoot: requiredFinalLoot(params, "finalLoot"),
        memberUser: requiredUser(params, "memberUser"),
      }),

    exists: async ({ params }) => {
      await expect
        .poll(
          () =>
            objectiveLootExists({
              target: requiredSubmittedTarget(params, "target"),
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
            target: requiredSubmittedTarget(params, "target"),
            selfTestReportBody: requiredString(params, "selfTestReportBody"),
          }),
        )
        .toBe(true);
    },

    metric_claim: async ({ params }) => {
      await expect
        .poll(() =>
          objectiveLootHasMetricClaim({
            target: requiredSubmittedTarget(params, "target"),
            metric: requiredMetric(params, "metric"),
          }),
        )
        .toBe(true);
    },
  },

  "db.objective_alignment_request": {
    delete_open: async ({ params }) => {
      await deleteOpenAlignmentRequests({
        target: requiredSubmittedTarget(params, "target"),
        kind: requiredAlignmentKind(params, "kind"),
      });
    },

    open_count: async ({ params }) => {
      await expect
        .poll(() =>
          openAlignmentRequestCount({
            target: requiredSubmittedTarget(params, "target"),
            kind: requiredAlignmentKind(params, "kind"),
          }),
        )
        .toBe(requiredNumber(params, "count"));
    },

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

    proposed_at_exists: async ({ params }) => {
      await expect
        .poll(
          () =>
            alignmentRequestProposedAtExists({
              target: requiredSubmittedTarget(params, "target"),
              kind: requiredAlignmentKind(params, "kind"),
              status: requiredAlignmentStatus(params, "status"),
              memberUser: requiredUser(params, "memberUser"),
            }),
          { timeout: 15_000 },
        )
        .toBe(true);
    },
  },
};

function requiredSubmittedTarget(params: StepParams, key: string): SubmittedObjectiveTargetData {
  const value = params[key];
  if (typeof value !== "object" || value === null) {
    throw new Error(`参数 ${key} 必须是 SubmittedObjectiveTargetData`);
  }
  const target = value as Partial<SubmittedObjectiveTargetData>;
  if (
    typeof target.title !== "string" ||
    target.stage !== "goalFrozen" ||
    target.flowStatus !== "submitted" ||
    target.finalDueOffsetDays !== 8
  ) {
    throw new Error(`参数 ${key} 缺少 title/stage/flowStatus/finalDueOffsetDays`);
  }
  return target as SubmittedObjectiveTargetData;
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
    typeof metric.finalEvidence !== "string"
  ) {
    throw new Error(`参数 ${key} 缺少 title/difficulty/score/claim/finalEvidence`);
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

function requiredAlignmentKind(params: StepParams, key: string): MemberAcceptanceAlignmentRequestCaseData["alignmentKind"] {
  const value = requiredString(params, key);
  if (value !== "acceptance") {
    throw new Error(`参数 ${key} 必须是 acceptance`);
  }
  return value;
}

function requiredAlignmentStatus(params: StepParams, key: string): MemberAcceptanceAlignmentRequestCaseData["alignmentStatus"] {
  const value = requiredString(params, key);
  if (value !== "requested") {
    throw new Error(`参数 ${key} 必须是 requested`);
  }
  return value;
}
