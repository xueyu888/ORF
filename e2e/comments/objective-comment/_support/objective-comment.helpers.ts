import type { BrowserContext, Page } from "@playwright/test";
import { and, eq, sql } from "drizzle-orm";
import { closeDb, db } from "../../../../server/db/client";
import { commentMessages, commentThreads, objectives, teamMembers, users } from "../../../../server/db/schema";
import {
  ORF_SESSION_COOKIE,
  ORY_ADMIN_URL,
  type BrowserAuthStorageState,
  type BrowserSession,
  type MyChallengesData,
  type MyChallengesResponse,
  type ObjectiveCommentCaseData,
  type ObjectiveCommentTarget,
  type OryIdentity,
} from "./objective-comment.context";

export async function closeObjectiveCommentTestDb() {
  await closeDb();
}

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
  return page.evaluate(async () => {
    const response = await fetch("/api/auth/session", { credentials: "include" });
    return {
      status: response.status,
      body: await response.json(),
    };
  });
}

export async function readBrowserAuthStorageState(page: Page): Promise<BrowserAuthStorageState> {
  return page.evaluate(() => ({
    localStorageAuthKeys: Object.keys(window.localStorage).filter((key) => /auth|session|token|ory/i.test(key)),
    sessionStorageAuthKeys: Object.keys(window.sessionStorage).filter((key) => /auth|session|token|ory/i.test(key)),
  }));
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

export async function isDatabaseReady() {
  try {
    await db.execute(sql`select 1`);
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

export async function findOryIdentityByEmail(email: string) {
  const identities = await oryAdminFetch<OryIdentity[]>(
    `/admin/identities?credentials_identifier=${encodeURIComponent(email)}`,
  );
  return identities.find((identity) => identity.traits?.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

export async function testMemberFixtureExists(data: Pick<ObjectiveCommentCaseData, "email" | "role">) {
  const memberships = await readMemberMemberships(data.email);
  return memberships.some((membership) => membership.role === data.role && membership.status === "active");
}

export async function visibleObjectiveFixtureExists(data: Pick<ObjectiveCommentCaseData, "email" | "name" | "role">) {
  const memberships = await readMemberMemberships(data.email);
  const teamIds = new Set(
    memberships
      .filter((membership) => membership.role === data.role && membership.status === "active")
      .map((membership) => membership.teamId),
  );
  if (teamIds.size === 0) {
    return false;
  }

  const rows = await db
    .select({
      id: objectives.id,
      teamId: objectives.teamId,
      title: objectives.title,
      challengers: objectives.challengers,
    })
    .from(objectives);

  return rows.some(
    (objective) =>
      teamIds.has(objective.teamId) &&
      objective.title.trim().length > 0 &&
      Array.isArray(objective.challengers) &&
      objective.challengers.includes(data.name),
  );
}

export async function testCommentBodiesAbsent(prefix: string) {
  const [message] = await db
    .select({ id: commentMessages.id })
    .from(commentMessages)
    .where(sql`${commentMessages.body} like ${`${prefix}%`}`)
    .limit(1);
  return !message;
}

export async function removeTestComments(prefix: string) {
  const messages = await db
    .select({ id: commentMessages.id, threadId: commentMessages.threadId })
    .from(commentMessages)
    .where(sql`${commentMessages.body} like ${`${prefix}%`}`);
  const threadIds = [...new Set(messages.map((message) => message.threadId))];

  for (const message of messages) {
    await db.delete(commentMessages).where(eq(commentMessages.id, message.id));
  }

  for (const threadId of threadIds) {
    const [remaining] = await db
      .select({ id: commentMessages.id })
      .from(commentMessages)
      .where(eq(commentMessages.threadId, threadId))
      .limit(1);
    if (!remaining) {
      await db.delete(commentThreads).where(eq(commentThreads.id, threadId));
    }
  }
}

export async function readMyChallenges(page: Page): Promise<MyChallengesResponse> {
  return page.evaluate(async () => {
    const response = await fetch("/api/my-challenges?scope=mine", { credentials: "include" });
    let body: MyChallengesData = {};
    try {
      body = await response.json();
    } catch {
      body = {};
    }

    return {
      status: response.status,
      body,
    };
  });
}

export async function selectObjectiveCommentTarget(page: Page): Promise<ObjectiveCommentTarget> {
  const response = await readMyChallenges(page);
  if (response.status !== 200) {
    throw new Error(`读取我的挑战数据失败: HTTP ${response.status}`);
  }

  const objectives = (response.body.objectives ?? []).filter((objective) => objective.id && objective.title.trim());
  if (objectives.length === 0) {
    throw new Error("当前成员可见挑战树中没有可用于评论测试的目标");
  }

  const titleCounts = new Map<string, number>();
  for (const objective of objectives) {
    titleCounts.set(objective.title, (titleCounts.get(objective.title) ?? 0) + 1);
  }

  const objective = objectives.find((item) => titleCounts.get(item.title) === 1) ?? objectives[0];
  return {
    type: "objective",
    id: objective.id,
    title: objective.title,
  };
}

export async function myChallengesHasObjectiveTarget(page: Page, target: ObjectiveCommentTarget) {
  const response = await readMyChallenges(page);
  return (
    response.status === 200 &&
    (response.body.objectives ?? []).some((objective) => objective.id === target.id && objective.title === target.title)
  );
}

export async function myChallengesHasComment(
  page: Page,
  target: ObjectiveCommentTarget,
  body: string,
  author: string,
) {
  const response = await readMyChallenges(page);
  return (
    response.status === 200 &&
    (response.body.comments ?? []).some(
      (thread) =>
        thread.targetType === target.type &&
        thread.targetId === target.id &&
        thread.targetTitle === target.title &&
        thread.messages.some(
          (message) =>
            message.body === body &&
            message.author === author &&
            message.parentMessageId === undefined &&
            message.replyToMessageId === undefined &&
            message.replyToAuthor === undefined,
        ),
    )
  );
}

export async function persistedObjectiveCommentExists(
  target: ObjectiveCommentTarget,
  body: string,
  authorUserEmail: string,
) {
  const [row] = await db
    .select({
      threadId: commentThreads.id,
      messageId: commentMessages.id,
      authorUserId: commentMessages.authorUserId,
      parentMessageId: commentMessages.parentMessageId,
      replyToMessageId: commentMessages.replyToMessageId,
      replyToAuthor: commentMessages.replyToAuthor,
    })
    .from(commentThreads)
    .innerJoin(commentMessages, eq(commentMessages.threadId, commentThreads.id))
    .innerJoin(users, eq(users.id, commentMessages.authorUserId))
    .where(
      and(
        eq(commentThreads.targetType, target.type),
        eq(commentThreads.targetId, target.id),
        eq(commentThreads.status, "open"),
        eq(commentMessages.body, body),
        sql`lower(${users.email}) = ${authorUserEmail.toLowerCase()}`,
      ),
    )
    .limit(1);

  return (
    !!row &&
    row.parentMessageId === null &&
    row.replyToMessageId === null &&
    row.replyToAuthor === null
  );
}

async function readMemberMemberships(email: string) {
  return db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      status: users.status,
      teamId: teamMembers.teamId,
      role: teamMembers.role,
    })
    .from(users)
    .innerJoin(teamMembers, eq(teamMembers.userId, users.id))
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`);
}

async function oryAdminFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
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
