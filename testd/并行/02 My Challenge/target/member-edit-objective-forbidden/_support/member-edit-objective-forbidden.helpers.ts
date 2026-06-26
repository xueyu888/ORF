import { expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { objectives } from "../../../../../../server/db/schema";
import { objectivePanelByTitle } from "../../../../../_operators/challenge-workbench.helpers";
import { readTestUserIdByNameInTeam } from "../../../../../_operators/common.helpers";
import { db } from "../../../../../_operators/testd-db-client";
import type {
  MemberEditObjectiveForbiddenObjective,
  ObjectiveUpdateResponse,
} from "./member-edit-objective-forbidden.context";

export async function upsertActiveMemberObjective(input: {
  id: string;
  teamId: string;
  title: string;
  memberName: string;
  memberUserId: string;
  status: string;
}): Promise<MemberEditObjectiveForbiddenObjective> {
  const today = todayIsoDate();
  await db
    .insert(objectives)
    .values({
      id: input.id,
      teamId: input.teamId,
      title: input.title,
      description: "TestD isolated non-commander objective edit permission fixture.",
      whyItMatters: "Fixture data for verifying objective content edit permission.",
      projectId: null,
      cycle: "TestD",
      stage: "goalFrozen",
      flowStatus: "frozen",
      status: input.status,
      confidence: 70,
      progress: 10,
      boundary: "Owned by the current isolated TestD case.",
      successDefinition: "Non-commander cannot enter or submit objective editing.",
      finalDueAt: addDaysIsoDate(21),
      challengers: [input.memberName],
      challengerUserIds: [input.memberUserId],
      assignedChallengers: [],
      assignedChallengerUserIds: [],
      challengeApplications: [],
      objectiveBasePoints: 0,
      publishedAt: today,
      createdAt: today,
      updatedAt: today,
      createdBy: input.memberUserId,
      updatedBy: input.memberUserId,
    })
    .onConflictDoUpdate({
      target: objectives.id,
      set: {
        teamId: input.teamId,
        title: input.title,
        projectId: null,
        stage: "goalFrozen",
        flowStatus: "frozen",
        status: input.status,
        challengers: [input.memberName],
        challengerUserIds: [input.memberUserId],
        assignedChallengers: [],
        assignedChallengerUserIds: [],
        challengeApplications: [],
        publishedAt: today,
        updatedAt: today,
        updatedBy: input.memberUserId,
      },
    });

  return requiredObjectiveById(input.id);
}

export async function requiredObjectiveById(id: string): Promise<MemberEditObjectiveForbiddenObjective> {
  const objective = await readObjectiveById(id);
  if (!objective) {
    throw new Error(`目标编辑权限用例目标不存在: ${id}`);
  }
  return objective;
}

export async function readObjectiveById(id: string): Promise<MemberEditObjectiveForbiddenObjective | null> {
  const [row] = await db
    .select({
      id: objectives.id,
      teamId: objectives.teamId,
      title: objectives.title,
      flowStatus: objectives.flowStatus,
      stage: objectives.stage,
      challengerUserIds: objectives.challengerUserIds,
      challengers: objectives.challengers,
    })
    .from(objectives)
    .where(eq(objectives.id, id))
    .limit(1);

  return row ?? null;
}

export async function objectiveFlowStatus(objective: Pick<MemberEditObjectiveForbiddenObjective, "id">) {
  return (await readObjectiveById(objective.id))?.flowStatus ?? null;
}

export async function objectiveHasChallenger(objective: Pick<MemberEditObjectiveForbiddenObjective, "id" | "teamId">, memberName: string) {
  const current = await readObjectiveById(objective.id);
  if (!current) return false;
  const memberUserId = await readTestUserIdByNameInTeam({ teamId: current.teamId, name: memberName });
  return Boolean(memberUserId && current.challengerUserIds.includes(memberUserId));
}

export async function objectiveTitleEquals(objective: Pick<MemberEditObjectiveForbiddenObjective, "id">, title: string) {
  return (await readObjectiveById(objective.id))?.title === title;
}

export function challengeScopeTab(page: Page, label: string) {
  return page.getByRole("button", { name: label, exact: true });
}

export function challengeStatusTrigger(page: Page) {
  return page.getByRole("button", { name: "挑战状态", exact: true });
}

export function objectivePanel(page: Page, objective: Pick<MemberEditObjectiveForbiddenObjective, "title">) {
  return objectivePanelByTitle(page, objective.title);
}

export function objectiveTitlePreview(page: Page, objective: Pick<MemberEditObjectiveForbiddenObjective, "title">) {
  return objectivePanel(page, objective).locator(".orf-objective-title").filter({ hasText: exactText(objective.title) }).first();
}

export function objectiveTitleInput(page: Page) {
  return page.getByLabel("编辑目标标题", { exact: true });
}

export async function doubleClickObjectiveTitle(page: Page, objective: Pick<MemberEditObjectiveForbiddenObjective, "title">) {
  const title = objectiveTitlePreview(page, objective);
  await expect(title).toBeVisible();
  await title.dblclick();
}

export function toastMessage(page: Page, message: string) {
  return page.locator(".orf-toast-card").filter({ hasText: message }).last();
}

export async function submitObjectiveTitleUpdate(
  page: Page,
  objective: Pick<MemberEditObjectiveForbiddenObjective, "id">,
  title: string,
): Promise<ObjectiveUpdateResponse> {
  return page.evaluate(
    async ({ objectiveId, nextTitle }) => {
      const response = await fetch(`/api/objectives/${encodeURIComponent(objectiveId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: nextTitle }),
      });

      return {
        ok: response.ok,
        status: response.status,
        body: await response.json().catch(() => null),
      };
    },
    { objectiveId: objective.id, nextTitle: title },
  );
}

function addDaysIsoDate(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function exactText(value: string) {
  return new RegExp(`^${escapeRegExp(value)}$`);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
