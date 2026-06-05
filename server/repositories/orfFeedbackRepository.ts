import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Feedback, FeedbackStatus } from "../../src/types/orf";
import { localDateString } from "../../src/utils/date";
import { db } from "../db/client";
import { feedback, feedbackCauseCategories } from "../db/schema";
import { publishOrfDataInvalidation } from "../realtime/orfReadModelInvalidations";
import { getOrfStateSnapshot } from "../readModels/orfTaskManagementReadModel";
import { runtimeScope, runtimeScopeStorageId, type RuntimeScope } from "./runtimeScope";
import { getScopedUsers } from "./userRepository";

export type CreateFeedbackInput = Pick<
  Feedback,
  "phenomenon" | "causeCategories" | "impact" | "suggestedAdjustment" | "owner"
>;
export type CreateFeedbackActor = { id: string; scope?: RuntimeScope | null };
export type CreateFeedbackOutcome =
  | { status: "ok"; feedback: Feedback }
  | { status: "notFound" }
  | { status: "invalidOwner" };
export type FeedbackStatusActor = { id: string; name: string; role: "admin" | "member"; scope?: RuntimeScope | null };
export type FeedbackStatusUpdateResult = { status: "ok" } | { status: "notFound" } | { status: "forbidden" };

const today = () => localDateString(new Date());
let feedbackIdCounter = 0;

function nextFeedbackIdCounter() {
  feedbackIdCounter = (feedbackIdCounter + 1) % Number.MAX_SAFE_INTEGER;
  return feedbackIdCounter.toString(36);
}

function makeFeedbackId() {
  return `fb-${Date.now()}-${nextFeedbackIdCounter()}-${randomUUID()}`;
}

async function resolveActiveMemberByName(storageScopeId: string, memberName: string) {
  const normalizedName = memberName.trim();
  if (!normalizedName) {
    return null;
  }

  const scopedUsers = await getScopedUsers(runtimeScope(storageScopeId));
  const member = scopedUsers.find((user) => user.status === "active" && user.name === normalizedName);
  return member ? { id: member.id, name: member.name } : null;
}

function canManageFeedbackStatus(
  item: { ownerUserId: string | null; createdBy: string | null },
  actor: FeedbackStatusActor,
) {
  return actor.role === "admin" || item.createdBy === actor.id || item.ownerUserId === actor.id;
}

export async function createFeedback(input: CreateFeedbackInput, actor: CreateFeedbackActor): Promise<CreateFeedbackOutcome> {
  const teamId = actor.scope ? runtimeScopeStorageId(actor.scope) : "";
  if (!teamId) {
    return { status: "notFound" };
  }

  const owner = input.owner.trim();
  const ownerUser = await resolveActiveMemberByName(teamId, owner);
  if (!ownerUser) {
    return { status: "invalidOwner" };
  }

  const id = makeFeedbackId();
  const now = today();
  await db.transaction(async (tx) => {
    await tx.insert(feedback).values({
      id,
      teamId,
      phenomenon: input.phenomenon,
      impact: input.impact,
      suggestedAdjustment: input.suggestedAdjustment,
      status: "Open",
      owner: ownerUser.name,
      ownerUserId: ownerUser.id,
      createdAt: now,
      updatedAt: now,
      createdBy: actor.id,
      updatedBy: actor.id,
    });

    const categories = input.causeCategories.map((category, index) => ({ feedbackId: id, category, sortOrder: index }));
    if (categories.length > 0) {
      await tx.insert(feedbackCauseCategories).values(categories);
    }
  });

  publishOrfDataInvalidation({
    actorUserId: actor.id,
    models: ["taskManagement"],
    reason: "feedback.changed",
    target: { id, type: "feedback" },
    teamId,
  });

  const data = await getOrfStateSnapshot({ scope: runtimeScope(teamId) });
  const item = data.feedback.find((entry) => entry.id === id);
  return item ? { status: "ok", feedback: item } : { status: "notFound" };
}

export async function updateFeedbackStatus(
  feedbackId: string,
  status: FeedbackStatus,
  actor: FeedbackStatusActor,
): Promise<FeedbackStatusUpdateResult> {
  const storageScopeId = actor.scope ? runtimeScopeStorageId(actor.scope) : "";
  const [target] = await db
    .select({ id: feedback.id, ownerUserId: feedback.ownerUserId, createdBy: feedback.createdBy, teamId: feedback.teamId })
    .from(feedback)
    .where(eq(feedback.id, feedbackId))
    .limit(1);

  if (!target) {
    return { status: "notFound" };
  }

  if (storageScopeId && target.teamId !== storageScopeId) {
    return { status: "notFound" };
  }

  if (!canManageFeedbackStatus(target, actor)) {
    return { status: "forbidden" };
  }

  const updated = await db
    .update(feedback)
    .set({ status, updatedAt: today(), updatedBy: actor.id })
    .where(eq(feedback.id, feedbackId))
    .returning({ id: feedback.id });
  if (updated.length === 0) {
    return { status: "notFound" };
  }

  publishOrfDataInvalidation({
    actorUserId: actor.id,
    models: ["taskManagement"],
    reason: "feedback.changed",
    target: { id: feedbackId, type: "feedback" },
    teamId: target.teamId,
  });
  return { status: "ok" };
}
