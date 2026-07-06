import { expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { objectiveAlignmentRequests, objectives, results } from "../../../../../../server/db/schema";
import type { ObjectiveAlignmentRequestKind, ObjectiveAlignmentRequestStatus } from "../../../../../../src/types/orf";
import { createStableUuid } from "../../../../../_shared/ids";
import { db } from "../../../../../_operators/testd-db-client";
import type { ObjectiveTargetData, TestUserAccountRecord, UncalibratedMetricData } from "./admin-reject-uncalibrated-reestimate-objective.context";
import {
  alignmentRequestExists,
  allChallengesContainsAlignmentRequestStatus,
  allChallengesContainsObjective,
  allChallengesObjectiveHasStageAndFlowStatus,
  challengeScopeTab,
  deleteObjectivesByTitlePrefix,
  loginAsAdmin,
  metricAbsentByTitle,
  metricRow,
  objectiveChallengerContains,
  objectiveHasStageAndFlowStatus,
  objectivePanel,
  objectivePrefixAbsent,
  openAlignmentRequestCount,
  openMyChallenges,
  prepareReestimateCompletionRequest,
  prepareReestimateObjective,
  readAllChallenges,
  readSessionUserName,
  selectChallengeScope,
  toast,
} from "../../admin-freeze-calibrated-reestimate-objective/_support/admin-freeze-calibrated-reestimate-objective.helpers";

export {
  alignmentRequestExists,
  allChallengesContainsAlignmentRequestStatus,
  allChallengesContainsObjective,
  allChallengesObjectiveHasStageAndFlowStatus,
  challengeScopeTab,
  deleteObjectivesByTitlePrefix,
  loginAsAdmin,
  metricAbsentByTitle,
  metricRow,
  objectiveChallengerContains,
  objectiveHasStageAndFlowStatus,
  objectivePanel,
  objectivePrefixAbsent,
  openAlignmentRequestCount,
  openMyChallenges,
  prepareReestimateCompletionRequest,
  prepareReestimateObjective,
  readSessionUserName,
  selectChallengeScope,
  toast,
};

export async function prepareUncalibratedMetric(input: {
  target: ObjectiveTargetData;
  metric: UncalibratedMetricData;
  memberUser: TestUserAccountRecord;
}) {
  const objective = await requiredObjectiveByTitle(input.target.title);
  const id = createStableUuid("testd-result", `${objective.id}:${input.metric.title}`);
  const values = {
    id,
    teamId: objective.teamId,
    objectiveId: objective.id,
    title: input.metric.title,
    detail: "TestD uncalibrated metric fixture",
    uncertaintyLevel: null,
    baseline: 0,
    current: 0,
    target: 100,
    unit: "%",
    direction: "increase" as const,
    status: "Draft" as const,
    confidence: 50,
    source: "memberProposed" as const,
    definer: input.memberUser.name,
    definerUserId: input.memberUser.userId,
    uncertaintyScore: 0,
    acceptedResult: "unreviewed" as const,
    reviewCadence: "Weekly",
    sortOrder: 0,
    createdAt: today(),
    updatedAt: today(),
    createdBy: input.memberUser.userId,
    updatedBy: input.memberUser.userId,
  };

  await db
    .insert(results)
    .values(values)
    .onConflictDoUpdate({
      target: results.id,
      set: {
        teamId: values.teamId,
        objectiveId: values.objectiveId,
        title: values.title,
        detail: values.detail,
        uncertaintyLevel: values.uncertaintyLevel,
        baseline: values.baseline,
        current: values.current,
        target: values.target,
        unit: values.unit,
        direction: values.direction,
        status: values.status,
        confidence: values.confidence,
        source: values.source,
        definer: values.definer,
        definerUserId: values.definerUserId,
        uncertaintyScore: values.uncertaintyScore,
        acceptedResult: values.acceptedResult,
        reviewCadence: values.reviewCadence,
        sortOrder: values.sortOrder,
        updatedAt: values.updatedAt,
        createdBy: values.createdBy,
        updatedBy: values.updatedBy,
      },
    });

  return metricByTitle(input.metric.title);
}

export async function metricExistsUncalibrated(input: {
  target: ObjectiveTargetData;
  title: string;
}) {
  const objective = await objectiveByTitle(input.target.title);
  if (!objective) return false;
  const row = await metricByTitle(input.title);
  return row?.objectiveId === objective.id && row.uncertaintyLevel === null && row.uncertaintyScore === 0;
}

export async function objectiveConfirmedAtAbsent(target: ObjectiveTargetData) {
  const row = await objectiveByTitle(target.title);
  return row ? row.confirmedAt === null : false;
}

export async function allChallengesContainsUncalibratedMetric(page: Page, input: {
  targetTitle: string;
  metricTitle: string;
}) {
  const data = await readAllChallenges(page);
  const objective = data.objectives.find((item) => item.title === input.targetTitle);
  if (!objective) return false;
  return data.results.some(
    (result) =>
      result.objectiveId === objective.id &&
      result.title === input.metricTitle &&
      (result.uncertaintyLevel === null || result.uncertaintyLevel === undefined) &&
      result.uncertaintyScore === 0,
  );
}

export async function completeAndFreezeActionNotClickable(page: Page, targetTitle: string) {
  const panel = objectivePanel(page, targetTitle);
  await expect(panel).toBeVisible();
  const button = panel.getByRole("button", { name: "完成并冻结", exact: true });
  if ((await button.count()) === 0) return;
  await expect(button.first()).toBeDisabled();
}

export async function rejectReestimateActionEnabled(page: Page, targetTitle: string) {
  const panel = objectivePanel(page, targetTitle);
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("button", { name: "打回重估", exact: true })).toBeEnabled();
}

export async function rejectReestimateActionHidden(page: Page, targetTitle: string) {
  await expect(objectivePanel(page, targetTitle).getByRole("button", { name: "打回重估", exact: true })).toHaveCount(0);
}

export async function clickRejectReestimate(page: Page, targetTitle: string) {
  const panel = objectivePanel(page, targetTitle);
  await expect(panel).toBeVisible();
  const button = panel.getByRole("button", { name: "打回重估", exact: true });
  await expect(button).toBeEnabled();
  const responsePromise = page.waitForResponse(
    (response) => response.request().method() === "PATCH" && response.url().includes("/alignment-requests/"),
  );
  await button.click();
  const response = await responsePromise;
  if (!response.ok()) {
    throw new Error(`打回重估接口失败: ${response.status()} ${response.url()}`);
  }
  await expect(toast(page, "对齐反馈已提交")).toBeVisible();
}

async function objectiveByTitle(title: string) {
  const [row] = await db
    .select({
      id: objectives.id,
      teamId: objectives.teamId,
      title: objectives.title,
      stage: objectives.stage,
      flowStatus: objectives.flowStatus,
      challengerUserIds: objectives.challengerUserIds,
      confirmedAt: objectives.confirmedAt,
    })
    .from(objectives)
    .where(eq(objectives.title, title))
    .limit(1);
  return row ?? null;
}

async function requiredObjectiveByTitle(title: string) {
  const objective = await objectiveByTitle(title);
  if (!objective) {
    throw new Error(`目标不存在: ${title}`);
  }
  return objective;
}

async function metricByTitle(title: string) {
  const [row] = await db
    .select({
      id: results.id,
      objectiveId: results.objectiveId,
      title: results.title,
      uncertaintyLevel: results.uncertaintyLevel,
      uncertaintyScore: results.uncertaintyScore,
    })
    .from(results)
    .where(eq(results.title, title))
    .limit(1);
  return row ?? null;
}

export async function alignmentRequestReviewedByAdmin(input: {
  target: ObjectiveTargetData;
  kind: ObjectiveAlignmentRequestKind;
  status: ObjectiveAlignmentRequestStatus;
  memberUser: TestUserAccountRecord;
  adminUser: TestUserAccountRecord;
}) {
  const objective = await objectiveByTitle(input.target.title);
  if (!objective) return false;
  const [row] = await db
    .select({ id: objectiveAlignmentRequests.id })
    .from(objectiveAlignmentRequests)
    .where(eq(objectiveAlignmentRequests.objectiveId, objective.id))
    .limit(1);
  if (!row) return false;
  return alignmentRequestExists(input);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
