import { expect, type Locator, type Page, type Response } from "@playwright/test";
import { eq, or } from "drizzle-orm";
import { objectives, projects } from "../../../../../../server/db/schema";
import type { ChallengeApplication, UserRole } from "../../../../../../src/types/orf";
import { clearBrowserState, readResponseBody } from "../../../../../_operators/common.helpers";
import { db } from "../../../../../_operators/testd-db-client";
import type {
  ApplyChallengeObjective,
  ApplyChallengeProject,
} from "./member-apply-challenge.context";

const RESPONSE_TIMEOUT_MS = 5_000;

export async function upsertProject(input: { name: string; teamId: string }): Promise<ApplyChallengeProject> {
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

export async function upsertOpenProjectObjective(input: {
  adminUserId: string;
  project: ApplyChallengeProject;
  title: string;
}): Promise<ApplyChallengeObjective> {
  const id = `obj-${slug(input.title)}`;
  const now = today();
  await db
    .insert(objectives)
    .values({
      id,
      teamId: input.project.teamId,
      title: input.title,
      description: "TestD isolated open objective fixture",
      whyItMatters: "Fixture data for applying to an open bounty objective.",
      projectId: input.project.id,
      cycle: "TestD",
      stage: "resultClaiming",
      flowStatus: "open",
      status: "Draft",
      confidence: 70,
      progress: 0,
      boundary: "Owned by the current isolated TestD case.",
      successDefinition: "Fixture is available for challenge application.",
      finalDueAt: addDaysIsoDate(21),
      challengers: [],
      challengerUserIds: [],
      assignedChallengers: [],
      assignedChallengerUserIds: [],
      challengeApplications: [],
      objectiveBasePoints: 0,
      publishedAt: now,
      acceptedAt: null,
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
        flowStatus: "open",
        status: "Draft",
        challengers: [],
        challengerUserIds: [],
        assignedChallengers: [],
        assignedChallengerUserIds: [],
        challengeApplications: [],
        publishedAt: now,
        acceptedAt: null,
        confirmationDueAt: null,
        updatedAt: now,
        createdBy: input.adminUserId,
        updatedBy: input.adminUserId,
      },
    });

  return requiredObjectiveById(id);
}

export async function excludeObjectiveChallenger(
  objective: ApplyChallengeObjective,
  member: { userId: string; name: string },
): Promise<ApplyChallengeObjective> {
  const current = await requiredObjectiveById(objective.id);
  await db
    .update(objectives)
    .set({
      challengers: current.challengers.filter((name) => name !== member.name),
      challengerUserIds: current.challengerUserIds.filter((userId) => userId !== member.userId),
      updatedAt: today(),
    })
    .where(eq(objectives.id, objective.id));

  return requiredObjectiveById(objective.id);
}

export async function excludeObjectiveAssignment(
  objective: ApplyChallengeObjective,
  member: { userId: string; name: string },
): Promise<ApplyChallengeObjective> {
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
  objective: ApplyChallengeObjective,
  member: { userId: string },
): Promise<ApplyChallengeObjective> {
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

export async function requiredObjectiveById(id: string): Promise<ApplyChallengeObjective> {
  const objective = await readObjective({ id });
  if (!objective) {
    throw new Error(`测试目标不存在: ${id}`);
  }
  return objective;
}

export async function readObjective(input: { id?: string; title?: string }): Promise<ApplyChallengeObjective | null> {
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

export async function openBountyHallOpenAs(page: Page, input: { email: string; password: string }) {
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

  await selectBountyHallTab(page, "开放中");
}

export async function selectBountyHallTab(page: Page, name: "开放中" | "我的相关") {
  const tab = page.getByRole("tab", { name: new RegExp(name) });
  await expect(page.getByRole("tablist", { name: "悬赏目标分组" })).toBeVisible();
  await tab.click({ timeout: RESPONSE_TIMEOUT_MS });
  await expect(tab).toHaveAttribute("aria-selected", "true");
}

export function bountyObjectiveRow(page: Page, objective: Pick<ApplyChallengeObjective, "id" | "title">): Locator {
  return page
    .locator(`[data-bounty-objective-id="${cssAttributeValue(objective.id)}"]`)
    .or(page.locator(".bounty-list-row").filter({ hasText: objective.title }))
    .first();
}

export function applyChallengeDialog(page: Page) {
  return page.getByRole("dialog", { name: "提交后等待指挥官确认", exact: true });
}

export function applicationReasonInput(page: Page) {
  return applyChallengeDialog(page).getByLabel("申请理由");
}

export async function bountyAllowsApply(page: Page, objective: Pick<ApplyChallengeObjective, "id" | "title">) {
  const item = await readBountyItem(page, objective);
  if (!item) return false;
  const row = item as {
    currentApplicationStatus?: unknown;
    hasCurrentApplication?: unknown;
    isCurrentChallenger?: unknown;
    isRecruitment?: unknown;
    objective?: { flowStatus?: unknown };
  };
  return (
    canApplyByFlowStatus(row.objective?.flowStatus) &&
    row.currentApplicationStatus !== "pending" &&
    row.hasCurrentApplication !== true &&
    row.isCurrentChallenger !== true &&
    row.isRecruitment !== true
  );
}

export async function bountyShowsApplied(page: Page, objective: Pick<ApplyChallengeObjective, "id" | "title">) {
  const item = await readBountyItem(page, objective);
  if (!item) return false;
  const row = item as {
    currentApplicationStatus?: unknown;
    hasCurrentApplication?: unknown;
    pendingApplications?: unknown;
  };
  return (
    row.hasCurrentApplication === true ||
    row.currentApplicationStatus === "pending" ||
    (Array.isArray(row.pendingApplications) && row.pendingApplications.length > 0)
  );
}

export async function submitBountyChallengeApplication(
  page: Page,
  objective: ApplyChallengeObjective,
): Promise<ApplyChallengeObjective> {
  const responsePromise = page
    .waitForResponse(
      (response) =>
        response.request().method().toUpperCase() === "POST" &&
        response.url().endsWith(`/api/objectives/${encodeURIComponent(objective.id)}/challenge-applications`),
      { timeout: RESPONSE_TIMEOUT_MS },
    )
    .then(readObjectiveFromResponse);

  await applyChallengeDialog(page).getByRole("button", { name: "申请挑战", exact: true }).click();
  return responsePromise;
}

export async function objectiveAssignedExcludes(
  objective: ApplyChallengeObjective,
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

export async function objectiveChallengersExclude(
  objective: ApplyChallengeObjective,
  userId: string,
  memberName: string,
) {
  const current = await readObjective({ id: objective.id });
  return Boolean(
    current &&
      !current.challengerUserIds.includes(userId) &&
      !current.challengers.includes(memberName),
  );
}

export async function objectiveHasFlowStatus(objective: ApplyChallengeObjective, flowStatus: string) {
  const current = await readObjective({ id: objective.id });
  return current?.flowStatus === flowStatus;
}

export async function objectivePendingApplicationAbsent(objective: ApplyChallengeObjective, userId: string) {
  const current = await readObjective({ id: objective.id });
  return Boolean(current && !findPendingApplication(current, userId));
}

export async function objectivePendingApplicationPresent(objective: ApplyChallengeObjective, userId: string) {
  const current = await readObjective({ id: objective.id });
  return Boolean(current && findPendingApplication(current, userId));
}

export async function objectivePendingApplicationReasonEquals(
  objective: ApplyChallengeObjective,
  userId: string,
  reason: string,
) {
  const current = await readObjective({ id: objective.id });
  return findPendingApplication(current, userId)?.reason === reason;
}

export async function readObjectiveFromResponse(response: Response): Promise<ApplyChallengeObjective> {
  if (!response.ok()) {
    throw new Error(`申请挑战接口请求失败: ${response.status()} ${response.url()}`);
  }
  const body = await readResponseBody(response);
  return objectiveFromUnknown((body as { objective?: unknown }).objective);
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

export function objectiveFromUnknown(value: unknown): ApplyChallengeObjective {
  if (typeof value !== "object" || value === null) {
    throw new Error("目标接口响应缺少 objective");
  }

  const objective = value as Partial<ApplyChallengeObjective>;
  if (
    typeof objective.id !== "string" ||
    typeof objective.title !== "string" ||
    typeof objective.flowStatus !== "string" ||
    typeof objective.stage !== "string"
  ) {
    throw new Error("目标接口响应中的 objective 格式不完整");
  }

  return {
    id: objective.id,
    title: objective.title,
    flowStatus: objective.flowStatus,
    stage: objective.stage,
    projectId: typeof objective.projectId === "string" ? objective.projectId : null,
    publishedAt: typeof objective.publishedAt === "string" ? objective.publishedAt : null,
    assignedChallengers: Array.isArray(objective.assignedChallengers) ? objective.assignedChallengers.filter(isString) : [],
    assignedChallengerUserIds: Array.isArray(objective.assignedChallengerUserIds) ? objective.assignedChallengerUserIds.filter(isString) : [],
    challengers: Array.isArray(objective.challengers) ? objective.challengers.filter(isString) : [],
    challengerUserIds: Array.isArray(objective.challengerUserIds) ? objective.challengerUserIds.filter(isString) : [],
    challengeApplications: Array.isArray(objective.challengeApplications)
      ? objective.challengeApplications.filter(isChallengeApplication)
      : [],
  };
}

async function readBountyItem(page: Page, objective: Pick<ApplyChallengeObjective, "id" | "title">) {
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

function findBountyItem(body: unknown, objective: Pick<ApplyChallengeObjective, "id" | "title">) {
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

function findPendingApplication(objective: ApplyChallengeObjective | null, userId: string) {
  return (
    objective?.challengeApplications.find(
      (application) => application.applicantUserId === userId && application.status === "pending",
    ) ?? null
  );
}

function isChallengeApplication(value: unknown): value is ChallengeApplication {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { id?: unknown }).id === "string" &&
    typeof (value as { applicant?: unknown }).applicant === "string" &&
    typeof (value as { applicantUserId?: unknown }).applicantUserId === "string" &&
    typeof (value as { status?: unknown }).status === "string" &&
    typeof (value as { createdAt?: unknown }).createdAt === "string"
  );
}

function canApplyByFlowStatus(flowStatus: unknown) {
  return flowStatus === "open" || flowStatus === "applying" || flowStatus === "recruiting" || flowStatus === "reestimating";
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

function isString(value: unknown): value is string {
  return typeof value === "string";
}
