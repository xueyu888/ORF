import type { Page } from "@playwright/test";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { canMutateObjectiveCommentsAsChallengerByFlow, canMutateObjectiveCommentsByFlow } from "../../../src/domain/orfLifecycle";
import { db } from "../../_operators/testd-db-client";
import { commentAttachments, commentMessages, commentThreads, objectives, tasks, users } from "../../../server/db/schema";
import { objectStorage } from "../../../server/storage/objectStorage";
import {
  deleteTestObjectives,
  deleteTestUserMemberships,
  deleteTestUsers,
  readTestUserIdByNameInTeam,
  readResponseBody,
  requiredTestUserIdByNameInTeam,
  type TestObjectiveFixtureRecord,
  type TestUserAccountRecord,
  upsertTestUserAccount,
} from "../../_operators/common.helpers";
import type { ObjectiveFlowStatus } from "../../../src/types/orf";
import type {
  CommentCaseData,
  CommentTarget,
  CommentTargetKind,
  CommentTask,
  FixtureComment,
  MockImageFile,
  MyChallengesData,
  MyChallengesResponse,
} from "./comment.context";

export type MyChallengesScope = "mine" | "all";

export async function prepareCommentActor(input: {
  email: string;
  identityId?: string;
  name: string;
  role: "admin" | "member";
}): Promise<TestUserAccountRecord> {
  const account = await upsertTestUserAccount({
    email: input.email,
    identityId: input.identityId,
    name: input.name,
    role: input.role,
    status: "active",
  });
  if (!account) {
    throw new Error("评论测试用户创建后无法读取");
  }
  return account;
}

export async function deleteCommentActor(email: string) {
  await deleteTestUserMemberships({ email });
  await deleteTestUsers({ email });
}

export async function createCommentTask(input: {
  assignee: string;
  id: string;
  linkedObjectiveId: string;
  teamId: string;
  title: string;
  userId?: string;
}): Promise<CommentTask> {
  const today = todayIsoDate();
  await db
    .insert(tasks)
    .values({
      id: input.id,
      teamId: input.teamId,
      title: input.title,
      description: "TestD isolated comment task fixture",
      status: "Todo",
      priority: "Medium",
      assignee: input.assignee,
      linkedObjectiveId: input.linkedObjectiveId,
      feedbackOriginId: null,
      dueDate: addDaysIsoDate(14),
      tags: [],
      createdAt: today,
      updatedAt: today,
      createdBy: input.userId,
      updatedBy: input.userId,
      sortOrder: 0,
    })
    .onConflictDoUpdate({
      target: tasks.id,
      set: {
        teamId: input.teamId,
        title: input.title,
        description: "TestD isolated comment task fixture",
        status: "Todo",
        priority: "Medium",
        assignee: input.assignee,
        linkedObjectiveId: input.linkedObjectiveId,
        feedbackOriginId: null,
        dueDate: addDaysIsoDate(14),
        tags: [],
        updatedAt: today,
        updatedBy: input.userId,
        sortOrder: 0,
      },
    });

  const task = await readCommentTask(input.id);
  if (!task) {
    throw new Error(`评论测试任务创建失败: ${input.id}`);
  }
  return task;
}

export async function deleteCommentTask(input: { id?: string; title?: string }) {
  const predicates = [
    input.id ? eq(tasks.id, input.id) : undefined,
    input.title ? eq(tasks.title, input.title) : undefined,
  ].filter((predicate): predicate is NonNullable<typeof predicate> => Boolean(predicate));
  if (predicates.length === 0) {
    return;
  }
  await db.delete(tasks).where(predicates.length === 1 ? predicates[0] : or(...predicates));
}

export async function deleteCommentTargetAndTask(input: {
  objectiveId: string;
  objectiveTitle: string;
  taskId: string;
  taskTitle: string;
}) {
  await deleteCommentTask({ id: input.taskId, title: input.taskTitle });
  await deleteTestObjectives({ id: input.objectiveId, title: input.objectiveTitle });
}

export async function commentTargetAndTaskAbsent(input: {
  objectiveId: string;
  objectiveTitle: string;
  taskId: string;
  taskTitle: string;
}) {
  const [objective] = await db
    .select({ id: objectives.id })
    .from(objectives)
    .where(or(eq(objectives.id, input.objectiveId), eq(objectives.title, input.objectiveTitle)))
    .limit(1);
  const [task] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(or(eq(tasks.id, input.taskId), eq(tasks.title, input.taskTitle)))
    .limit(1);
  return !objective && !task;
}

export async function setCommentObjectiveParticipant(objectiveId: string, memberName: string) {
  const objective = await readCommentObjective(objectiveId);
  if (!objective) {
    throw new Error(`评论测试目标不存在: ${objectiveId}`);
  }
  const memberUserId = await requiredTestUserIdByNameInTeam({ teamId: objective.teamId, name: memberName });

  await db
    .update(objectives)
    .set({
      stage: "orfReestimate",
      flowStatus: "reestimating",
      challengers: uniqueMembers([...objective.challengers, memberName]),
      challengerUserIds: uniqueMembers([...objective.challengerUserIds, memberUserId]),
      updatedAt: todayIsoDate(),
    })
    .where(eq(objectives.id, objectiveId));
}

export async function commentTargetFromFixture(input: {
  objectiveId: string;
  taskId: string;
  targetType: CommentTargetKind;
}): Promise<CommentTarget> {
  if (input.targetType === "objective") {
    const objective = await readCommentObjective(input.objectiveId);
    if (!objective) {
      throw new Error(`评论目标不存在: ${input.objectiveId}`);
    }
    return {
      type: "objective",
      id: objective.id,
      title: objective.title,
      objectiveId: objective.id,
    };
  }

  const task = await readCommentTask(input.taskId);
  if (!task) {
    throw new Error(`任务评论目标不存在: ${input.taskId}`);
  }
  return {
    type: "task",
    id: task.id,
    title: task.title,
    objectiveId: task.linkedObjectiveId,
  };
}

export async function commentTargetCanMutate(input: {
  actorName: string;
  role: "admin" | "member";
  target: CommentTarget;
}) {
  const objective = await readCommentObjective(input.target.objectiveId);
  if (!objective || !canMutateObjectiveCommentsByFlow(objective)) {
    return false;
  }

  if (input.role === "admin") {
    return true;
  }
  const actorUserId = await readTestUserIdByNameInTeam({ teamId: objective.teamId, name: input.actorName });

  return (
    canMutateObjectiveCommentsAsChallengerByFlow(objective) &&
    !!actorUserId &&
    objective.challengerUserIds.includes(actorUserId)
  );
}

export async function commentTargetCannotMutate(input: {
  actorName: string;
  role: "admin" | "member";
  target: CommentTarget;
}) {
  return !(await commentTargetCanMutate(input));
}

export async function createRootFixtureComment(input: {
  actorEmail: string;
  actorName: string;
  body: string;
  marker: string;
  target: CommentTarget;
}): Promise<FixtureComment> {
  const [actor] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${input.actorEmail.toLowerCase()}`)
    .limit(1);
  if (!actor) {
    throw new Error(`评论作者不存在: ${input.actorEmail}`);
  }

  const objective = await readCommentObjective(input.target.objectiveId);
  if (!objective) {
    throw new Error(`评论目标所属目标不存在: ${input.target.objectiveId}`);
  }

  const createdAt = new Date().toISOString();
  const threadId = `cthread-${slug(input.marker)}-${input.target.type}`;
  const messageId = `cmsg-${slug(input.marker)}-${input.target.type}-root`;

  await db
    .insert(commentThreads)
    .values({
      id: threadId,
      teamId: objective.teamId,
      targetType: input.target.type,
      targetId: input.target.id,
      targetTitle: input.target.title,
      status: "open",
      createdBy: actor.id,
      createdAt,
      updatedAt: createdAt,
    })
    .onConflictDoUpdate({
      target: commentThreads.id,
      set: {
        teamId: objective.teamId,
        targetType: input.target.type,
        targetId: input.target.id,
        targetTitle: input.target.title,
        status: "open",
        updatedAt: createdAt,
      },
    });

  await db
    .insert(commentMessages)
    .values({
      id: messageId,
      threadId,
      authorUserId: actor.id,
      author: input.actorName,
      body: input.body,
      createdAt,
      parentMessageId: null,
      replyToMessageId: null,
      replyToAuthor: null,
      sortOrder: 0,
    })
    .onConflictDoUpdate({
      target: commentMessages.id,
      set: {
        authorUserId: actor.id,
        author: input.actorName,
        body: input.body,
        createdAt,
        parentMessageId: null,
        replyToMessageId: null,
        replyToAuthor: null,
        sortOrder: 0,
      },
    });

  return fixtureComment({ body: input.body, messageId, target: input.target, threadId });
}

export async function removeTestComments(input: {
  actorEmail?: string;
  imageFileName?: string;
  marker: string;
}): Promise<string[]> {
  const authorRows = input.actorEmail
    ? await db.select({ id: users.id }).from(users).where(eq(users.email, input.actorEmail))
    : [];
  const authorIds = authorRows.map((author) => author.id);
  const messagePredicates = [
    sql`${commentMessages.body} like ${`%${input.marker}%`}`,
    authorIds.length > 0 ? inArray(commentMessages.authorUserId, authorIds) : undefined,
  ].filter((predicate): predicate is NonNullable<typeof predicate> => Boolean(predicate));
  const messageRows = await db
    .select({ id: commentMessages.id, threadId: commentMessages.threadId })
    .from(commentMessages)
    .where(messagePredicates.length === 1 ? messagePredicates[0] : or(...messagePredicates));
  const messageIds = new Set(messageRows.map((message) => message.id));
  const threadIds = new Set(messageRows.map((message) => message.threadId));
  const attachmentPredicates = [
    messageIds.size > 0 ? inArray(commentAttachments.messageId, [...messageIds]) : undefined,
    input.imageFileName ? eq(commentAttachments.fileName, input.imageFileName) : undefined,
  ].filter((predicate): predicate is NonNullable<typeof predicate> => Boolean(predicate));
  const attachmentRows =
    attachmentPredicates.length > 0
      ? await db
          .select({ id: commentAttachments.id, messageId: commentAttachments.messageId, objectKey: commentAttachments.objectKey })
          .from(commentAttachments)
          .where(attachmentPredicates.length === 1 ? attachmentPredicates[0] : or(...attachmentPredicates))
      : [];
  const attachmentMessageIds = attachmentRows
    .map((attachment) => attachment.messageId)
    .filter((messageId): messageId is string => Boolean(messageId));
  const missingAttachmentMessageIds = attachmentMessageIds.filter((messageId) => !messageIds.has(messageId));
  if (missingAttachmentMessageIds.length > 0) {
    const linkedMessageRows = await db
      .select({ id: commentMessages.id, threadId: commentMessages.threadId })
      .from(commentMessages)
      .where(inArray(commentMessages.id, missingAttachmentMessageIds));
    for (const message of linkedMessageRows) {
      messageIds.add(message.id);
      threadIds.add(message.threadId);
    }
  }

  if (attachmentRows.length > 0) {
    await db.delete(commentAttachments).where(inArray(commentAttachments.id, attachmentRows.map((attachment) => attachment.id)));
  }
  if (messageIds.size > 0) {
    await db.delete(commentMessages).where(inArray(commentMessages.id, [...messageIds]));
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

  return attachmentRows.map((attachment) => attachment.objectKey);
}

export async function deleteCommentAttachmentObjects(objectKeys: string[] | undefined) {
  await Promise.allSettled((objectKeys ?? []).map((objectKey) => objectStorage.deleteObject(objectKey)));
}

export async function testCommentsAbsent(input: { actorEmail?: string; imageFileName?: string; marker: string }) {
  const authorRows = input.actorEmail
    ? await db.select({ id: users.id }).from(users).where(eq(users.email, input.actorEmail))
    : [];
  const authorIds = authorRows.map((author) => author.id);
  const messagePredicates = [
    sql`${commentMessages.body} like ${`%${input.marker}%`}`,
    authorIds.length > 0 ? inArray(commentMessages.authorUserId, authorIds) : undefined,
  ].filter((predicate): predicate is NonNullable<typeof predicate> => Boolean(predicate));
  const [message] = await db
    .select({ id: commentMessages.id })
    .from(commentMessages)
    .where(messagePredicates.length === 1 ? messagePredicates[0] : or(...messagePredicates))
    .limit(1);
  if (message) {
    return false;
  }

  if (!input.imageFileName) {
    return true;
  }

  const [attachment] = await db
    .select({ id: commentAttachments.id })
    .from(commentAttachments)
    .where(eq(commentAttachments.fileName, input.imageFileName))
    .limit(1);
  return !attachment;
}

export async function commentBodyAbsent(body: string) {
  const [message] = await db
    .select({ id: commentMessages.id })
    .from(commentMessages)
    .where(eq(commentMessages.body, body))
    .limit(1);
  return !message;
}

export async function commentImageAbsent(fileName: string) {
  const [attachment] = await db
    .select({ id: commentAttachments.id })
    .from(commentAttachments)
    .where(eq(commentAttachments.fileName, fileName))
    .limit(1);
  return !attachment;
}

export async function rootCommentPersisted(input: {
  authorEmail: string;
  body: string;
  target: CommentTarget;
}) {
  const row = await readCommentMessageByBody(input);
  return !!row && row.parentMessageId === null && row.replyToMessageId === null && row.replyToAuthor === null;
}

export async function replyCommentPersisted(input: {
  body: string;
  parent: FixtureComment;
  target: CommentTarget;
}) {
  const row = await readCommentMessageByBody({
    authorEmail: undefined,
    body: input.body,
    target: input.target,
  });
  return !!row && row.parentMessageId === input.parent.messageId;
}

export async function replyCountForParent(parent: FixtureComment) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(commentMessages)
    .where(and(eq(commentMessages.threadId, parent.threadId), eq(commentMessages.parentMessageId, parent.messageId)));
  return row?.count ?? 0;
}

export async function imageCommentPersisted(input: {
  bodyMarker: string;
  fileName: string;
  target: CommentTarget;
}) {
  const [row] = await db
    .select({
      attachmentId: commentAttachments.id,
      messageBody: commentMessages.body,
    })
    .from(commentThreads)
    .innerJoin(commentMessages, eq(commentMessages.threadId, commentThreads.id))
    .innerJoin(commentAttachments, eq(commentAttachments.messageId, commentMessages.id))
    .where(
      and(
        eq(commentThreads.targetType, input.target.type),
        eq(commentThreads.targetId, input.target.id),
        sql`${commentMessages.body} like ${`%${input.bodyMarker}%`}`,
        eq(commentAttachments.fileName, input.fileName),
      ),
    )
    .limit(1);
  return !!row;
}

export async function readMyChallenges(page: Page, scope: MyChallengesScope): Promise<MyChallengesResponse> {
  return page.evaluate(async (requestedScope) => {
    const response = await fetch(`/api/my-challenges?scope=${encodeURIComponent(requestedScope)}`, {
      credentials: "include",
    });
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
  }, scope);
}

export async function myChallengesLacksTarget(page: Page, target: CommentTarget, scope: MyChallengesScope) {
  const response = await readMyChallenges(page, scope);
  return response.status === 200 && !myChallengesResponseHasTarget(response, target);
}

export async function myChallengesHasTarget(page: Page, target: CommentTarget, scope: MyChallengesScope) {
  const response = await readMyChallenges(page, scope);
  return response.status === 200 && myChallengesResponseHasTarget(response, target);
}

function myChallengesResponseHasTarget(response: MyChallengesResponse, target: CommentTarget) {
  if (target.type === "objective") {
    return (response.body.objectives ?? []).some((objective) => objective.id === target.id && objective.title === target.title);
  }

  return (response.body.tasks ?? []).some((task) => task.id === target.id && task.title === target.title && task.linkedObjectiveId === target.objectiveId);
}

export async function myChallengesHasRootComment(page: Page, input: {
  author?: string;
  body: string;
  scope: MyChallengesScope;
  target: CommentTarget;
}) {
  const response = await readMyChallenges(page, input.scope);
  return (
    response.status === 200 &&
    (response.body.comments ?? []).some(
      (thread) =>
        thread.targetType === input.target.type &&
        thread.targetId === input.target.id &&
        thread.messages.some(
          (message) =>
            message.body.includes(input.body) &&
            (!input.author || message.author === input.author) &&
            message.parentMessageId === undefined,
        ),
    )
  );
}

export async function myChallengesHasReply(page: Page, input: {
  body: string;
  scope: MyChallengesScope;
  target: CommentTarget;
}) {
  const response = await readMyChallenges(page, input.scope);
  return (
    response.status === 200 &&
    (response.body.comments ?? []).some(
      (thread) =>
        thread.targetType === input.target.type &&
        thread.targetId === input.target.id &&
        thread.messages.some((message) => message.body === input.body && message.parentMessageId !== undefined),
    )
  );
}

export async function myChallengesLacksComment(page: Page, input: {
  body: string;
  scope: MyChallengesScope;
}) {
  const response = await readMyChallenges(page, input.scope);
  return (
    response.status === 200 &&
    !(response.body.comments ?? []).some((thread) => thread.messages.some((message) => message.body.includes(input.body)))
  );
}

export async function myChallengesHasImageComment(page: Page, input: {
  body: string;
  fileName: string;
  scope: MyChallengesScope;
  target: CommentTarget;
}) {
  const response = await readMyChallenges(page, input.scope);
  return (
    response.status === 200 &&
    (response.body.comments ?? []).some(
      (thread) =>
        thread.targetType === input.target.type &&
        thread.targetId === input.target.id &&
        thread.messages.some(
          (message) =>
            message.body.includes(input.body) &&
            (message.attachments ?? []).some((attachment) => attachment.fileName === input.fileName),
        ),
    )
  );
}

export function commentPanel(page: Page) {
  return page.locator('[data-comment-panel="true"]');
}

export function commentComposer(page: Page) {
  return commentPanel(page).getByPlaceholder("添加评论...");
}

export function commentReplyComposer(page: Page) {
  return commentPanel(page).getByPlaceholder(/^(回复 .+|添加回复)\.\.\.$/);
}

export function commentEditComposer(page: Page) {
  return commentPanel(page).getByPlaceholder("编辑评论...");
}

export function commentTargetRow(page: Page, target: CommentTarget) {
  return page.locator(`[data-challenge-row-target="${challengeRowTarget(target)}"]`).first();
}

export function commentMessageRow(page: Page, body: string) {
  return commentPanel(page).locator(".orf-comment-message-row").filter({ hasText: body }).first();
}

export function commentImagePreviewButton(page: Page, fileName: string, body?: string) {
  const scope = body ? commentMessageRow(page, body) : commentPanel(page);
  return scope.getByRole("button", { name: `查看图片 ${fileName}` }).first();
}

export async function openCommentPanel(page: Page, target: CommentTarget) {
  const row = commentTargetRow(page, target);
  await row.hover();
  await row.locator('[data-challenge-row-actions] button[aria-label$="打开块菜单"]').click();
  await row.locator(".orf-block-menu").getByRole("button", { name: "评论", exact: true }).click();
}

export function makeMockPngFile(fileName: string): MockImageFile {
  return {
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
      "base64",
    ),
    fileName,
    mimeType: "image/png",
  };
}

export function makeMockTextFile(fileName: string): MockImageFile {
  return {
    buffer: Buffer.from("not an image\n", "utf8"),
    fileName,
    mimeType: "text/plain",
  };
}

export function fixtureComment(input: {
  body: string;
  messageId: string;
  target: CommentTarget;
  threadId: string;
}): FixtureComment {
  return {
    ...input,
    messageApiPath: `/api/comments/${encodeURIComponent(input.threadId)}/messages/${encodeURIComponent(input.messageId)}`,
  };
}

export function myChallengesScopeFor(role: CommentCaseData["role"]): MyChallengesScope {
  return role === "admin" ? "all" : "mine";
}

export async function capturedResponseBody(response: { body: unknown }) {
  return response.body;
}

export async function toCapturedResponse(response: import("@playwright/test").Response) {
  return {
    ok: response.ok(),
    status: response.status(),
    url: response.url(),
    method: response.request().method(),
    body: await readResponseBody(response),
  };
}

function challengeRowTarget(target: CommentTarget) {
  return `${target.type === "objective" ? "objective" : "action"}:${target.id}`;
}

async function readCommentObjective(objectiveId: string): Promise<(TestObjectiveFixtureRecord & {
  challengers: string[];
  challengerUserIds: string[];
  flowStatus: ObjectiveFlowStatus;
}) | null> {
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
    .where(eq(objectives.id, objectiveId))
    .limit(1);
  return row ?? null;
}

async function readCommentTask(taskId: string): Promise<CommentTask | null> {
  const [row] = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      linkedObjectiveId: tasks.linkedObjectiveId,
      status: tasks.status,
      priority: tasks.priority,
    })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  return row ?? null;
}

async function readCommentMessageByBody(input: {
  authorEmail?: string;
  body: string;
  target: CommentTarget;
}) {
  const predicates = [
    eq(commentThreads.targetType, input.target.type),
    eq(commentThreads.targetId, input.target.id),
    eq(commentMessages.body, input.body),
    input.authorEmail ? sql`lower(${users.email}) = ${input.authorEmail.toLowerCase()}` : undefined,
  ].filter((predicate): predicate is NonNullable<typeof predicate> => Boolean(predicate));

  const [row] = await db
    .select({
      parentMessageId: commentMessages.parentMessageId,
      replyToMessageId: commentMessages.replyToMessageId,
      replyToAuthor: commentMessages.replyToAuthor,
    })
    .from(commentThreads)
    .innerJoin(commentMessages, eq(commentMessages.threadId, commentThreads.id))
    .innerJoin(users, eq(users.id, commentMessages.authorUserId))
    .where(and(...predicates))
    .limit(1);
  return row ?? null;
}

function uniqueMembers(members: string[]) {
  return Array.from(new Set(members.map((member) => member.trim()).filter(Boolean)));
}

function todayIsoDate() {
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
