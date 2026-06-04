import type { BrowserContext, Page, Response } from "@playwright/test";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "./testd-db-client";
import { commentThreads, objectives, results, taskChecklistItems, tasks, teamMembers, teams, users } from "../../server/db/schema";
import { canDeleteObjectiveByFlow } from "../../src/domain/orfLifecycle";
import type { UserRole, UserStatus } from "../../src/types/orf";
import type { ChallengeApplication, ObjectiveFlowStatus, OrfStage, WorkStatus } from "../../src/types/orf";
import { createStableUuid, isUuid } from "../_shared/ids";
import { ORF_SESSION_COOKIE, ORY_ADMIN_URL, type BrowserAuthStorageState, type BrowserSession, type OryIdentity } from "./common.context";

export type TestUserAccountRecord = {
  userId: string;
  teamId: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  lastOnlineAt: string | null;
};

export type TestUserRecord = {
  userId: string;
  name: string;
  email: string;
  status: UserStatus;
  lastOnlineAt: string | null;
};

export type TestObjectiveFixtureInput = {
  id?: string;
  teamId: string;
  title: string;
  description?: string;
  whyItMatters?: string;
  cycle?: string;
  stage?: OrfStage;
  flowStatus?: ObjectiveFlowStatus;
  status?: WorkStatus;
  confidence?: number;
  progress?: number;
  boundary?: string;
  successDefinition?: string;
  finalDueAt?: string;
  challengers?: string[];
  challengerUserIds?: string[];
  assignedChallengers?: string[];
  assignedChallengerUserIds?: string[];
  challengeApplications?: ChallengeApplication[];
  objectiveBasePoints?: number;
  createdBy?: string;
  updatedBy?: string;
};

export type TestObjectiveFixtureRecord = {
  id: string;
  teamId: string;
  title: string;
  stage: OrfStage;
  flowStatus: ObjectiveFlowStatus;
  status: WorkStatus;
  challengers: string[];
  challengerUserIds: string[];
  assignedChallengers: string[];
  assignedChallengerUserIds: string[];
  challengeApplications: ChallengeApplication[];
  finalDueAt: string;
  objectiveBasePoints: number;
};

export async function clearBrowserState(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.clear();
      window.sessionStorage.clear();
    } catch {
      // Opaque origins such as about:blank can deny storage access.
    }
  });
  await page
    .evaluate(() => {
      try {
        window.localStorage.clear();
        window.sessionStorage.clear();
      } catch {
        // Opaque origins such as about:blank can deny storage access.
      }
    })
    .catch(() => undefined);
}

export async function readBrowserSession(page: Page): Promise<BrowserSession> {
  const response = await page.request.get("/api/auth/session");
  return {
    status: response.status(),
    body: await response.json(),
  };
}

export async function readBrowserAuthStorageState(page: Page): Promise<BrowserAuthStorageState> {
  return page.evaluate(() => {
    const safeStorageKeys = (readStorage: () => Storage) => {
      try {
        return Object.keys(readStorage());
      } catch {
        return [];
      }
    };

    return {
      localStorageAuthKeys: safeStorageKeys(() => window.localStorage).filter((key) => /auth|session|token|ory/i.test(key)),
      sessionStorageAuthKeys: safeStorageKeys(() => window.sessionStorage).filter((key) => /auth|session|token|ory/i.test(key)),
    };
  });
}

export async function hasSessionCookie(context: BrowserContext) {
  const cookies = await context.cookies();
  return cookies.some((cookie) => cookie.name === ORF_SESSION_COOKIE && cookie.value.length > 0);
}

export async function isBackendReady(page: Page) {
  try {
    const response = await page.request.get("/health");
    if (!response.ok()) {
      return false;
    }

    const body = await response.json();
    return body?.ok === true && body?.service === "orf-api";
  } catch {
    return false;
  }
}

export async function isFrontendReady(page: Page) {
  try {
    const response = await page.request.get("/");
    return response.ok();
  } catch {
    return false;
  }
}

export async function isFrontendAuthEntryReady(page: Page) {
  try {
    const response = await page.request.get("/auth");
    return response.ok();
  } catch {
    return false;
  }
}

export async function isSessionEndpointReady(page: Page) {
  try {
    const response = await page.request.get("/api/auth/session");
    if (response.status() !== 200) {
      return false;
    }

    const body = await response.json().catch(() => null);
    return typeof body?.authenticated === "boolean";
  } catch {
    return false;
  }
}

export async function isDatabaseReady() {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}

export async function isDatabaseSchemaCurrent() {
  try {
    await db.execute(sql`select id, email, ory_identity_id, status from users limit 0`);
    await db.execute(sql`select team_id, user_id, role from team_members limit 0`);
    return true;
  } catch {
    return false;
  }
}

export async function isOryAdminReady() {
  try {
    const response = await fetch(`${ORY_ADMIN_URL}/health/ready`, {
      headers: { accept: "application/json" },
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function isOryAdminPublicReady(page: Page) {
  if (!(await isOryAdminReady())) {
    return false;
  }

  try {
    const response = await page.request.get("/health/auth");
    if (!response.ok()) {
      return false;
    }

    const body = await response.json().catch(() => null);
    return body?.ok === true && body?.service === "orf-auth";
  } catch {
    return false;
  }
}

export async function findOryIdentityByEmail(email: string) {
  const identities = await oryAdminFetch<OryIdentity[]>(
    `/admin/identities?credentials_identifier=${encodeURIComponent(email)}`,
  );
  return identities.find((identity) => identity.traits?.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

export async function upsertOryIdentityWithPassword(input: { email: string; name: string; password: string }) {
  const existing = await findOryIdentityByEmail(input.email);
  const body = {
    schema_id: existing?.schema_id ?? "default",
    traits: {
      email: input.email,
      name: {
        first: input.name,
      },
    },
    credentials: {
      password: {
        config: {
          password: input.password,
        },
      },
    },
    state: "active",
  };

  if (!existing) {
    return oryAdminFetch<OryIdentity>("/admin/identities", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  return oryAdminFetch<OryIdentity>(`/admin/identities/${encodeURIComponent(existing.id)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function oryIdentityPasswordAvailable(email: string) {
  const identity = await findOryIdentityByEmail(email);
  if (!identity) {
    return false;
  }

  const response = await oryAdminFetch<{
    credentials?: Record<string, unknown>;
  }>(`/admin/identities/${encodeURIComponent(identity.id)}`);
  return typeof response.credentials?.password === "object" && response.credentials.password !== null;
}

export async function deleteOryIdentityByEmail(email: string) {
  const identity = await findOryIdentityByEmail(email);
  if (!identity) {
    return;
  }

  const response = await fetch(`${ORY_ADMIN_URL}/admin/identities/${encodeURIComponent(identity.id)}`, {
    method: "DELETE",
    headers: { accept: "application/json" },
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(`Ory identity delete failed with ${response.status}: ${await response.text()}`);
  }
}

export async function revokeOrySessionsByEmail(email: string) {
  const identity = await findOryIdentityByEmail(email);
  if (!identity) {
    return;
  }

  const response = await fetch(`${ORY_ADMIN_URL}/admin/identities/${encodeURIComponent(identity.id)}/sessions`, {
    method: "DELETE",
    headers: { accept: "application/json" },
  });

  if (!response.ok && response.status !== 404 && response.status !== 405) {
    throw new Error(`Ory session cleanup failed with ${response.status}: ${await response.text()}`);
  }
}

export async function upsertTestUserAccount(input: {
  userId?: string;
  email: string;
  name: string;
  role: UserRole;
  status?: UserStatus;
  identityId?: string;
}) {
  const user = await upsertTestUserRecord(input);
  await upsertDefaultTeamMembership({ userId: user.userId, role: input.role });
  return readTestUserAccount({ userId: user.userId, role: input.role });
}

export async function upsertTestUserRecord(input: {
  userId?: string;
  email: string;
  name: string;
  status?: UserStatus;
  identityId?: string;
}) {
  const requestedUserId = isUuid(input.userId) ? input.userId : undefined;
  const [existingById] = requestedUserId ? await db.select({ id: users.id }).from(users).where(eq(users.id, requestedUserId)).limit(1) : [];
  const [existingByEmail] = existingById
    ? []
    : await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${input.email.toLowerCase()}`).limit(1);
  const fallbackUserId = isUuid(input.identityId)
    ? input.identityId
    : createStableUuid("testd-user", `${input.email.toLowerCase()}:${input.identityId ?? ""}`);
  const userId = existingById?.id ?? existingByEmail?.id ?? requestedUserId ?? fallbackUserId;
  const status = input.status ?? "active";

  if (existingById || existingByEmail) {
    await db
      .update(users)
      .set({
        name: input.name,
        email: input.email,
        status,
        ...(input.identityId ? { oryIdentityId: input.identityId } : {}),
      })
      .where(eq(users.id, userId));
  } else {
    await db.insert(users).values({
      id: userId,
      name: input.name,
      email: input.email,
      status,
      oryIdentityId: input.identityId,
      createdAt: today(),
      lastOnlineAt: null,
    });
  }

  const record = await readTestUserRecord({ userId });
  if (!record) {
    throw new Error("测试用户记录创建后无法读取");
  }
  return record;
}

export async function upsertDefaultTeamMembership(input: {
  email?: string;
  userId?: string;
  role: UserRole;
}) {
  const teamId = await ensureDefaultTeam();
  const userId = isUuid(input.userId) ? input.userId : (await readTestUserIds({ email: input.email }))[0];
  if (!userId) {
    throw new Error("默认团队成员关系需要已存在的测试用户");
  }

  await db
    .insert(teamMembers)
    .values({ teamId, userId, role: input.role })
    .onConflictDoUpdate({
      target: [teamMembers.teamId, teamMembers.userId],
      set: { role: input.role },
    });

  return readTestUserAccount({ userId, role: input.role });
}

export async function readTestUserRecord(input: { email?: string; userId?: string }) {
  const [row] = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      status: users.status,
      lastOnlineAt: users.lastOnlineAt,
    })
    .from(users)
    .where(userPredicate(input))
    .limit(1);

  return row
    ? {
        userId: row.userId,
        name: row.name,
        email: row.email ?? "",
        status: row.status,
        lastOnlineAt: row.lastOnlineAt,
      }
    : null;
}

export async function readTestUserAccount(input: { email?: string; userId?: string; role?: UserRole }) {
  const rows = await readTestUserAccountRecords(input);
  return input.role ? rows.find((row) => row.role === input.role) ?? null : rows[0] ?? null;
}

export async function readTestUserIdByNameInTeam(input: { teamId: string; name: string }) {
  return (await readTestUserIdsByNamesInTeam({ teamId: input.teamId, names: [input.name] }))[0] ?? null;
}

export async function requiredTestUserIdByNameInTeam(input: { teamId: string; name: string }) {
  const userId = await readTestUserIdByNameInTeam(input);
  if (!userId) {
    throw new Error(`测试用户不属于目标团队或不存在: ${input.name}`);
  }
  return userId;
}

export async function readTestUserIdsByNamesInTeam(input: { teamId: string; names: readonly string[] }) {
  const names = uniqueStrings(input.names);
  if (names.length === 0) {
    return [];
  }

  const rows = await db
    .select({ userId: users.id, name: users.name })
    .from(users)
    .innerJoin(teamMembers, eq(teamMembers.userId, users.id))
    .where(and(eq(teamMembers.teamId, input.teamId), inArray(users.name, names)));
  const userIdByName = new Map(rows.map((row) => [row.name, row.userId]));
  return names.map((name) => userIdByName.get(name)).filter((userId): userId is string => Boolean(userId));
}

export async function testUserRecordMatches(input: {
  email?: string;
  userId?: string;
  name?: string;
  status?: UserStatus;
}) {
  const user = await readTestUserRecord({ email: input.email, userId: input.userId });
  if (!user) {
    return false;
  }

  return (
    (input.email === undefined || user.email.toLowerCase() === input.email.toLowerCase()) &&
    (input.userId === undefined || user.userId === input.userId) &&
    (input.name === undefined || user.name === input.name) &&
    (input.status === undefined || user.status === input.status)
  );
}

export async function testDefaultTeamMembershipMatches(input: {
  email?: string;
  userId?: string;
  role?: UserRole;
}) {
  const teamId = await ensureDefaultTeam();
  const userId = isUuid(input.userId) ? input.userId : (await readTestUserIds({ email: input.email }))[0];
  if (!userId) {
    return false;
  }

  const rows = await db
    .select({ teamId: teamMembers.teamId, role: teamMembers.role })
    .from(teamMembers)
    .where(eq(teamMembers.userId, userId));

  return rows.some(
    (row) =>
      row.teamId === teamId &&
      (input.role === undefined || row.role === input.role),
  );
}

export async function testUserAccountMatches(input: {
  email?: string;
  userId?: string;
  name?: string;
  role?: UserRole;
  status?: UserStatus;
}) {
  const account = await readTestUserAccount({ email: input.email, userId: input.userId, role: input.role });
  if (!account) {
    return false;
  }

  return (
    (input.email === undefined || account.email.toLowerCase() === input.email.toLowerCase()) &&
    (input.userId === undefined || account.userId === input.userId) &&
    (input.name === undefined || account.name === input.name) &&
    (input.role === undefined || account.role === input.role) &&
    (input.status === undefined || account.status === input.status)
  );
}

export async function restoreTestUserLastOnlineAt(account: TestUserAccountRecord | null | undefined) {
  if (!account) {
    return;
  }
  await db.update(users).set({ lastOnlineAt: account.lastOnlineAt }).where(eq(users.id, account.userId));
}

export async function deleteTestUserMemberships(input: { email?: string; emails?: string[]; userId?: string }) {
  const ids = await readTestUserIds(input);
  for (const id of ids) {
    await db.delete(teamMembers).where(eq(teamMembers.userId, id));
  }
}

export async function deleteTestUsers(input: { email?: string; emails?: string[]; userId?: string }) {
  const deadline = Date.now() + 10_000;
  let absentSince: number | null = null;

  while (Date.now() < deadline) {
    const ids = await readTestUserIds(input);
    if (ids.length === 0) {
      absentSince ??= Date.now();
      if (Date.now() - absentSince >= 750) {
        return;
      }
    } else {
      absentSince = null;
      for (const id of ids) {
        await db.delete(teamMembers).where(eq(teamMembers.userId, id));
        await db.delete(users).where(eq(users.id, id));
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const ids = await readTestUserIds(input);
  if (ids.length > 0) {
    throw new Error(`测试用户未能清理干净: ${ids.join(", ")}`);
  }
}

export async function upsertTestObjective(input: TestObjectiveFixtureInput) {
  const id = input.id ?? `obj-${slug(input.title)}`;
  const todayValue = today();
  const challengers = input.challengers ?? [];
  const assignedChallengers = input.assignedChallengers ?? [];
  const challengerUserIds = input.challengerUserIds ?? (await readTestUserIdsByNamesInTeam({ teamId: input.teamId, names: challengers }));
  const assignedChallengerUserIds = input.assignedChallengerUserIds ?? (await readTestUserIdsByNamesInTeam({ teamId: input.teamId, names: assignedChallengers }));
  const values = {
    id,
    teamId: input.teamId,
    title: input.title,
    description: input.description ?? "TestD isolated objective fixture",
    whyItMatters: input.whyItMatters ?? "Fixture data for an isolated TestD case.",
    cycle: input.cycle ?? "TestD",
    stage: input.stage ?? "resultClaiming",
    flowStatus: input.flowStatus ?? "open",
    status: input.status ?? "Draft",
    confidence: input.confidence ?? 70,
    progress: input.progress ?? 0,
    boundary: input.boundary ?? "Owned by the current isolated TestD case.",
    successDefinition: input.successDefinition ?? "Fixture is available for the current TestD action.",
    finalDueAt: input.finalDueAt ?? addDaysIsoDate(21),
    challengers,
    challengerUserIds,
    assignedChallengers,
    assignedChallengerUserIds,
    challengeApplications: input.challengeApplications ?? [],
    objectiveBasePoints: input.objectiveBasePoints ?? 0,
    createdAt: todayValue,
    updatedAt: todayValue,
    createdBy: input.createdBy,
    updatedBy: input.updatedBy,
  };

  await db
    .insert(objectives)
    .values(values)
    .onConflictDoUpdate({
      target: objectives.id,
      set: {
        teamId: values.teamId,
        title: values.title,
        description: values.description,
        whyItMatters: values.whyItMatters,
        cycle: values.cycle,
        stage: values.stage,
        flowStatus: values.flowStatus,
        status: values.status,
        confidence: values.confidence,
        progress: values.progress,
        boundary: values.boundary,
        successDefinition: values.successDefinition,
        finalDueAt: values.finalDueAt,
        challengers: values.challengers,
        challengerUserIds: values.challengerUserIds,
        assignedChallengers: values.assignedChallengers,
        assignedChallengerUserIds: values.assignedChallengerUserIds,
        challengeApplications: values.challengeApplications,
        objectiveBasePoints: values.objectiveBasePoints,
        updatedAt: values.updatedAt,
        createdBy: values.createdBy,
        updatedBy: values.updatedBy,
      },
    });

  const record = await readTestObjective({ id });
  if (!record) {
    throw new Error(`测试目标创建失败: ${id}`);
  }
  return record;
}

export async function readTestObjective(input: { id?: string; title?: string }): Promise<TestObjectiveFixtureRecord | null> {
  const [row] = await db
    .select({
      id: objectives.id,
      teamId: objectives.teamId,
      title: objectives.title,
      stage: objectives.stage,
      flowStatus: objectives.flowStatus,
      status: objectives.status,
      challengers: objectives.challengers,
      challengerUserIds: objectives.challengerUserIds,
      assignedChallengers: objectives.assignedChallengers,
      assignedChallengerUserIds: objectives.assignedChallengerUserIds,
      challengeApplications: objectives.challengeApplications,
      finalDueAt: objectives.finalDueAt,
      objectiveBasePoints: objectives.objectiveBasePoints,
    })
    .from(objectives)
    .where(objectivePredicate(input))
    .limit(1);

  return row ?? null;
}

export async function testObjectiveAbsent(input: { id?: string; title?: string }) {
  return (await readTestObjective(input)) === null;
}

export async function deleteTestObjectives(input: { id?: string; title?: string }) {
  const rows = await db.select({ id: objectives.id }).from(objectives).where(objectivePredicate(input));
  for (const row of rows) {
    const deleted = await deleteTestObjective(row.id);
    if (!deleted) {
      await db.delete(objectives).where(eq(objectives.id, row.id));
    }
  }
}

export async function deleteTestObjective(objectiveId: string): Promise<boolean> {
  const deleted = await db.transaction(async (tx) => {
    const [objective] = await tx
      .select({ flowStatus: objectives.flowStatus, id: objectives.id })
      .from(objectives)
      .where(eq(objectives.id, objectiveId))
      .limit(1);

    if (!objective || !canDeleteObjectiveByFlow(objective)) {
      return false;
    }

    const resultRows = await tx.select({ id: results.id }).from(results).where(eq(results.objectiveId, objectiveId));
    const taskRows = await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.linkedObjectiveId, objectiveId));
    const resultIds = resultRows.map((result) => result.id);
    const taskIds = taskRows.map((task) => task.id);
    const checklistRows =
      taskIds.length > 0
        ? await tx.select({ id: taskChecklistItems.id }).from(taskChecklistItems).where(inArray(taskChecklistItems.taskId, taskIds))
        : [];
    const checklistIds = checklistRows.map((item) => item.id);

    if (checklistIds.length > 0) {
      await tx.delete(commentThreads).where(and(eq(commentThreads.targetType, "subtask"), inArray(commentThreads.targetId, checklistIds)));
    }
    if (taskIds.length > 0) {
      await tx.delete(commentThreads).where(and(eq(commentThreads.targetType, "task"), inArray(commentThreads.targetId, taskIds)));
    }
    if (resultIds.length > 0) {
      await tx.delete(commentThreads).where(and(eq(commentThreads.targetType, "result"), inArray(commentThreads.targetId, resultIds)));
    }
    await tx.delete(commentThreads).where(and(eq(commentThreads.targetType, "objective"), eq(commentThreads.targetId, objectiveId)));

    const deletedObjectives = await tx.delete(objectives).where(eq(objectives.id, objectiveId)).returning({ id: objectives.id });
    return deletedObjectives.length > 0;
  });

  return deleted;
}

export async function oryAdminFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${ORY_ADMIN_URL}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Ory Admin API failed with ${response.status}: ${await response.text()}`);
  }

  return response.json() as Promise<T>;
}

export async function readResponseBody(response: Response) {
  const headers = response.headers();
  const contentType = headers["content-type"] ?? "";

  if (contentType.includes("application/json")) {
    return response.json().catch(() => null);
  }

  return response.text().catch(() => null);
}

async function ensureDefaultTeam() {
  const [existing] = await db.select({ id: teams.id }).from(teams).orderBy(asc(teams.id)).limit(1);
  if (existing) {
    return existing.id;
  }

  const id = "team-testd-default";
  await db
    .insert(teams)
    .values({
      id,
      name: "TestD Default Team",
      createdAt: today(),
    })
    .onConflictDoNothing();
  return id;
}

async function readTestUserAccountRecords(input: { email?: string; userId?: string; role?: UserRole }): Promise<TestUserAccountRecord[]> {
  const rows = await db
    .select({
      userId: users.id,
      teamId: teamMembers.teamId,
      name: users.name,
      email: users.email,
      role: teamMembers.role,
      status: users.status,
      lastOnlineAt: users.lastOnlineAt,
    })
    .from(users)
    .innerJoin(teamMembers, eq(teamMembers.userId, users.id))
    .where(userPredicate(input));

  return rows
    .filter((row) => row.role === "admin" || row.role === "member")
    .map((row) => ({
      userId: row.userId,
      teamId: row.teamId,
      name: row.name,
      email: row.email ?? "",
      role: row.role === "admin" ? "admin" : "member",
      status: row.status,
      lastOnlineAt: row.lastOnlineAt,
    }));
}

async function readTestUserIds(input: { email?: string; emails?: string[]; userId?: string }) {
  const rows = await db.select({ id: users.id }).from(users).where(userPredicate(input));
  return rows.map((row) => row.id);
}

function userPredicate(input: { email?: string; emails?: string[]; userId?: string; role?: UserRole }) {
  const emails = [...(input.email ? [input.email] : []), ...(input.emails ?? [])].map((email) => email.toLowerCase());
  const predicates = [
    isUuid(input.userId) ? eq(users.id, input.userId) : undefined,
    ...emails.map((email) => sql`lower(${users.email}) = ${email}`),
  ].filter((predicate): predicate is NonNullable<typeof predicate> => Boolean(predicate));

  if (predicates.length === 0) {
    throw new Error("用户查询必须提供 email、emails 或 userId");
  }

  return predicates.length === 1 ? predicates[0] : or(...predicates);
}

function objectivePredicate(input: { id?: string; title?: string }) {
  const predicates = [
    input.id ? eq(objectives.id, input.id) : undefined,
    input.title ? eq(objectives.title, input.title) : undefined,
  ].filter((predicate): predicate is NonNullable<typeof predicate> => Boolean(predicate));

  if (predicates.length === 0) {
    throw new Error("目标查询必须提供 id 或 title");
  }

  return predicates.length === 1 ? predicates[0] : or(...predicates);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIsoDate(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function uniqueStrings(values: readonly string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
