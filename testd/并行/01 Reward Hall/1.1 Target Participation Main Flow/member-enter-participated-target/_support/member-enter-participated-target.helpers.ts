import { expect, type Locator, type Page } from "@playwright/test";
import { eq, or } from "drizzle-orm";
import { objectives, projects } from "../../../../../../server/db/schema";
import type { ChallengeApplication, UserRole } from "../../../../../../src/types/orf";
import { clearBrowserState, dismissWorkLogReminderModalIfVisible } from "../../../../../_operators/common.helpers";
import { db } from "../../../../../_operators/testd-db-client";
import type {
  EnterParticipatedObjective,
  EnterParticipatedProject,
} from "./member-enter-participated-target.context";

const RESPONSE_TIMEOUT_MS = 5_000;

export async function upsertProject(input: { name: string; teamId: string }): Promise<EnterParticipatedProject> {
  const id = `project-${slug(input.name)}`;
  const now = today();
  await db
    .insert(projects)
    .values({
      id,
      teamId: input.teamId,
      name: input.name,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: projects.id,
      set: {
        teamId: input.teamId,
        name: input.name,
        updatedAt: now,
      },
    });

  return { id, name: input.name, teamId: input.teamId };
}

export async function deleteProjectByName(name: string) {
  await db.delete(projects).where(eq(projects.name, name));
}

export async function projectAbsentByName(name: string) {
  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.name, name)).limit(1);
  return !project;
}

export async function upsertParticipatedProjectObjective(input: {
  adminUserId: string;
  memberName: string;
  memberUserId: string;
  project: EnterParticipatedProject;
  title: string;
}): Promise<EnterParticipatedObjective> {
  const id = `obj-${slug(input.title)}`;
  const now = today();
  await db
    .insert(objectives)
    .values({
      id,
      teamId: input.project.teamId,
      title: input.title,
      description: "TestD isolated participated objective fixture",
      whyItMatters: "Fixture data for entering a participated bounty objective.",
      projectId: input.project.id,
      cycle: "TestD",
      stage: "resultClaiming",
      flowStatus: "reestimating",
      status: "Draft",
      confidence: 70,
      progress: 0,
      boundary: "Owned by the current isolated TestD case.",
      successDefinition: "Fixture is available for entering challenge work.",
      finalDueAt: addDaysIsoDate(21),
      challengers: [input.memberName],
      challengerUserIds: [input.memberUserId],
      assignedChallengers: [],
      assignedChallengerUserIds: [],
      challengeApplications: [],
      objectiveBasePoints: 0,
      publishedAt: now,
      acceptedAt: now,
      confirmationDueAt: null,
      createdAt: now,
      updatedAt: now,
      createdBy: input.adminUserId,
      updatedBy: input.adminUserId,
    })
    .onConflictDoUpdate({
      target: objectives.id,
      set: {
        teamId: input.project.teamId,
        title: input.title,
        projectId: input.project.id,
        stage: "resultClaiming",
        flowStatus: "reestimating",
        status: "Draft",
        challengers: [input.memberName],
        challengerUserIds: [input.memberUserId],
        assignedChallengers: [],
        assignedChallengerUserIds: [],
        challengeApplications: [],
        publishedAt: now,
        acceptedAt: now,
        confirmationDueAt: null,
        updatedAt: now,
        createdBy: input.adminUserId,
        updatedBy: input.adminUserId,
      },
    });

  return requiredObjectiveById(id);
}

export async function excludeObjectiveAssignment(
  objective: EnterParticipatedObjective,
  member: { userId: string; name: string },
): Promise<EnterParticipatedObjective> {
  const current = await requiredObjectiveById(objective.id);
  await db
    .update(objectives)
    .set({
      assignedChallengers: current.assignedChallengers.filter((name) => name !== member.name),
      assignedChallengerUserIds: current.assignedChallengerUserIds.filter((userId) => userId !== member.userId),
      updatedAt: today(),
    })
    .where(eq(objectives.id, objective.id));

  return requiredObjectiveById(objective.id);
}

export async function excludeObjectiveApplication(
  objective: EnterParticipatedObjective,
  member: { userId: string },
): Promise<EnterParticipatedObjective> {
  const current = await requiredObjectiveById(objective.id);
  await db
    .update(objectives)
    .set({
      challengeApplications: current.challengeApplications.filter(
        (application) => application.applicantUserId !== member.userId,
      ),
      updatedAt: today(),
    })
    .where(eq(objectives.id, objective.id));

  return requiredObjectiveById(objective.id);
}

export async function requiredObjectiveById(id: string): Promise<EnterParticipatedObjective> {
  const objective = await readObjective({ id });
  if (!objective) {
    throw new Error(`测试目标不存在: ${id}`);
  }
  return objective;
}

export async function readObjective(input: { id?: string; title?: string }): Promise<EnterParticipatedObjective | null> {
  const predicates = [
    input.id ? eq(objectives.id, input.id) : undefined,
    input.title ? eq(objectives.title, input.title) : undefined,
  ].filter((predicate): predicate is NonNullable<typeof predicate> => Boolean(predicate));
  if (predicates.length === 0) {
    throw new Error("读取目标必须提供 id 或 title");
  }

  const [row] = await db
    .select({
      id: objectives.id,
      title: objectives.title,
      flowStatus: objectives.flowStatus,
      stage: objectives.stage,
      projectId: objectives.projectId,
      publishedAt: objectives.publishedAt,
      assignedChallengers: objectives.assignedChallengers,
      assignedChallengerUserIds: objectives.assignedChallengerUserIds,
      challengers: objectives.challengers,
      challengerUserIds: objectives.challengerUserIds,
      challengeApplications: objectives.challengeApplications,
    })
    .from(objectives)
    .where(predicates.length === 1 ? predicates[0] : or(...predicates))
    .limit(1);

  return row ?? null;
}

export async function openBountyHallRelatedAs(page: Page, input: { email: string; password: string }) {
  await page.context().clearCookies();
  await clearBrowserState(page);
  const loginResponse = await page.request.post("/api/auth/login", {
    data: {
      email: input.email,
      password: input.password,
    },
    timeout: RESPONSE_TIMEOUT_MS,
  });
  expect(loginResponse.ok()).toBe(true);

  await page.goto("/bounties", { waitUntil: "domcontentloaded", timeout: 15_000 });
  await expect.poll(async () => {
    const response = await page.evaluate(async () => {
      const sessionResponse = await fetch("/api/auth/session", { credentials: "include" });
      return {
        status: sessionResponse.status,
        body: await sessionResponse.json(),
      };
    });
    return response.status === 200 && response.body?.authenticated === true;
  }).toBe(true);

  await dismissWorkLogReminderModalIfVisible(page);
  await selectBountyHallTab(page, "我的相关");
}

export async function selectBountyHallTab(page: Page, name: "我的相关") {
  const tab = page.getByRole("tab", { name: new RegExp(name) });
  await expect(page.getByRole("tablist", { name: "悬赏目标分组" })).toBeVisible();
  await dismissWorkLogReminderModalIfVisible(page);
  await clickAfterReminderDismissal(page, tab);
  await expect(tab).toHaveAttribute("aria-selected", "true");
}

async function clickAfterReminderDismissal(page: Page, locator: Locator) {
  try {
    await locator.click({ timeout: RESPONSE_TIMEOUT_MS });
  } catch (error) {
    if (!isWorkLogReminderInterception(error)) {
      throw error;
    }
    await dismissWorkLogReminderModalIfVisible(page);
    await locator.click({ timeout: RESPONSE_TIMEOUT_MS });
  }
}

function isWorkLogReminderInterception(error: unknown) {
  return error instanceof Error && error.message.includes("work-log-reminder-modal-backdrop");
}

export function bountyObjectiveRow(page: Page, objective: Pick<EnterParticipatedObjective, "id" | "title">): Locator {
  return page
    .locator(`[data-bounty-objective-id="${cssAttributeValue(objective.id)}"]`)
    .or(page.locator(".bounty-list-row").filter({ hasText: objective.title }))
    .first();
}

export async function bountyShowsParticipated(page: Page, objective: Pick<EnterParticipatedObjective, "id" | "title">) {
  const item = await readBountyItem(page, objective);
  return Boolean(item && (item as { isCurrentChallenger?: unknown }).isCurrentChallenger === true);
}

export async function enterChallengeTargetFromBountyHall(
  page: Page,
  objective: Pick<EnterParticipatedObjective, "id" | "title">,
) {
  await bountyObjectiveRow(page, objective).getByRole("button", { name: "进入目标", exact: true }).click();
}

export function challengeObjectivePanel(page: Page, objective: Pick<EnterParticipatedObjective, "id" | "title">): Locator {
  const byId = page.locator(`[data-objective-panel-id="${cssAttributeValue(objective.id)}"]`);
  return byId.or(page.locator(".orf-objective-panel").filter({ hasText: objective.title })).first();
}

export async function myChallengesContainsObjective(
  page: Page,
  objective: Pick<EnterParticipatedObjective, "id" | "title">,
) {
  const response = await page.evaluate(async () => {
    const dataResponse = await fetch("/api/my-challenges?scope=mine", { credentials: "include" });
    return {
      status: dataResponse.status,
      body: await dataResponse.json().catch(() => ({})),
    };
  });
  if (response.status !== 200 || typeof response.body !== "object" || response.body === null) {
    return false;
  }
  const objectivesValue = (response.body as { objectives?: unknown }).objectives;
  const objectiveRows = Array.isArray(objectivesValue) ? objectivesValue : [];
  return objectiveRows.some((item) => {
    if (typeof item !== "object" || item === null) return false;
    const row = item as { id?: unknown; title?: unknown };
    return row.id === objective.id || row.title === objective.title;
  });
}

export async function objectiveAssignedExcludes(
  objective: EnterParticipatedObjective,
  userId: string,
  memberName: string,
) {
  const current = await readObjective({ id: objective.id });
  return Boolean(
    current &&
      !current.assignedChallengerUserIds.includes(userId) &&
      !current.assignedChallengers.includes(memberName),
  );
}

export async function objectiveChallengersContains(
  objective: EnterParticipatedObjective,
  userId: string,
  memberName: string,
) {
  const current = await readObjective({ id: objective.id });
  return Boolean(
    current &&
      current.challengerUserIds.includes(userId) &&
      current.challengers.includes(memberName),
  );
}

export async function objectiveHasFlowStatus(objective: EnterParticipatedObjective, flowStatus: string) {
  const current = await readObjective({ id: objective.id });
  return current?.flowStatus === flowStatus;
}

export async function objectivePendingApplicationAbsent(objective: EnterParticipatedObjective, userId: string) {
  const current = await readObjective({ id: objective.id });
  return Boolean(
    current &&
      !current.challengeApplications.some(
        (application) => application.applicantUserId === userId && application.status === "pending",
      ),
  );
}

export function requiredTestUser(value: unknown): { userId: string; name: string; role: UserRole; teamId: string } {
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { userId?: unknown }).userId === "string" &&
    typeof (value as { name?: unknown }).name === "string" &&
    typeof (value as { role?: unknown }).role === "string" &&
    typeof (value as { teamId?: unknown }).teamId === "string"
  ) {
    return value as { userId: string; name: string; role: UserRole; teamId: string };
  }
  throw new Error("参数必须是测试用户账号记录");
}

async function readBountyItem(page: Page, objective: Pick<EnterParticipatedObjective, "id" | "title">) {
  const response = await page.evaluate(async () => {
    const bountyResponse = await fetch("/api/bounties", { credentials: "include" });
    return {
      status: bountyResponse.status,
      body: await bountyResponse.json().catch(() => ({})),
    };
  });
  if (response.status !== 200) return null;
  return findBountyItem(response.body, objective);
}

function findBountyItem(body: unknown, objective: Pick<EnterParticipatedObjective, "id" | "title">) {
  if (typeof body !== "object" || body === null) return null;
  const containers = ["publicItems", "availableItems", "recruitmentItems", "objectiveOptions"].flatMap((key) => {
    const value = (body as Record<string, unknown>)[key];
    return Array.isArray(value) ? value : [];
  });

  return containers.find((item) => {
    if (typeof item !== "object" || item === null) return false;
    const itemObjective = "objective" in item ? (item as { objective?: unknown }).objective : item;
    if (typeof itemObjective !== "object" || itemObjective === null) return false;
    const row = itemObjective as { id?: unknown; title?: unknown };
    return row.id === objective.id || row.title === objective.title;
  }) ?? null;
}

function addDaysIsoDate(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function cssAttributeValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
