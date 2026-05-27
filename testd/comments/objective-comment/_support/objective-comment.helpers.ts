import type { Page } from "@playwright/test";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../../../server/db/client";
import { commentMessages, commentThreads, objectives, users } from "../../../../server/db/schema";
import {
  type MyChallengesData,
  type MyChallengesResponse,
  type ObjectiveCommentTarget,
} from "./objective-comment.context";

export async function objectiveCommentTargetFromObjective(objectiveId: string): Promise<ObjectiveCommentTarget> {
  const [row] = await db
    .select({ id: objectives.id, title: objectives.title })
    .from(objectives)
    .where(eq(objectives.id, objectiveId))
    .limit(1);
  if (!row) {
    throw new Error(`目标评论对象不存在: ${objectiveId}`);
  }
  return { type: "objective", id: row.id, title: row.title };
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

export type MyChallengesScope = "mine" | "all";

export async function readMyChallenges(page: Page, scope: MyChallengesScope = "mine"): Promise<MyChallengesResponse> {
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

export async function myChallengesHasObjectiveTarget(page: Page, target: ObjectiveCommentTarget, scope: MyChallengesScope = "mine") {
  const response = await readMyChallenges(page, scope);
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
  scope: MyChallengesScope = "mine",
) {
  const response = await readMyChallenges(page, scope);
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
