import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import { and, desc, eq, gt, inArray, isNull, lt, or } from "drizzle-orm";
import { initialOrfState } from "../../src/data/initialOrfState";
import type {
  CommentAttachment,
  BountySource,
  ChallengeApplication,
  CommentStatus,
  CommentTargetType,
  ContributionAllocation,
  CommentThread,
  Evidence,
  Feedback,
  FeedbackStatus,
  LootResultClaim,
  MetricDirection,
  Objective,
  ObjectiveAcceptedResult,
  ObjectiveLoot,
  ObjectiveTrialReview,
  ObjectiveTrialReviewStatus,
  OrfState,
  PointLedgerEntry,
  Priority,
  Result,
  ResultAcceptedResult,
  Task,
  TaskChecklistItem,
  TaskStatus,
  UncertaintyLevel,
  UserRole,
} from "../../src/types/orf";
import {
  hasUncalibratedResultPoints,
  objectiveBasePointsForResults,
  planObjectiveSettlement,
  uncertaintyScoreFor,
} from "../../src/domain/orfSettlement";
import {
  canAcceptObjectiveChallengeByFlow,
  canApplyForObjectiveChallenge,
  canDeleteObjectiveByFlow,
  canFreezeObjectiveByFlow,
  canMutateObjectiveCommentsAsChallengerByFlow,
  canMutateObjectiveCommentsByFlow,
  canMutateObjectiveResultsByFlow,
  canMutateObjectiveWorkItemsByFlow,
  canRecruitObjectiveChallengersByFlow,
  canReviewObjectiveChallengeApplications,
  canReviewObjectiveLootByFlow,
  canSubmitObjectiveLootByFlow,
  isObjectiveChallengeDiscoverableByFlow,
  isObjectiveChallengeEntryClosedByFlow,
  isObjectiveReestimateWindowOpen,
  objectiveFlowStatusAfterChallengeApplication,
  objectiveFlowStatusAfterChallengeApplicationReview,
  objectiveFlowStatusAfterRecruitment,
  objectiveLifecycleInitialState,
  objectiveLifecycleTransitions,
} from "../../src/domain/orfLifecycle";
import { validateObjectiveDeadlineChange } from "../../src/domain/orfDeadline";
import { db } from "../db/client";
import {
  commentAttachments,
  commentMessages,
  commentThreads,
  evidence,
  feedback,
  feedbackCauseCategories,
  objectives,
  objectiveLoot,
  objectiveTrialReviews,
  pointLedger,
  results,
  resultTrendPoints,
  taskChecklistItems,
  tasks,
  teamMembers,
  teams,
  users,
} from "../db/schema";
import { getPermissionRulesForScope } from "./permissionRepository";
import {
  createNotifications,
  getActiveAdminNotificationRecipients,
  getActiveMemberNotificationRecipientsByIds,
  getActiveMemberNotificationRecipientsByNames,
  getActiveTeamNotificationRecipients,
  getUserNameById,
} from "./notificationRepository";
import type { RuntimeScope } from "./runtimeScope";
import { runtimeScope, runtimeScopeStorageId } from "./runtimeScope";
import { getScopedUsers } from "./userRepository";
import { getUserAvatarUrlMap } from "../users/avatar/avatarRepository";
import { addCalendarDays, isDateOnlyString, localDateString } from "../../src/utils/date";
import { publishRealtimeReadModelInvalidation, publishRealtimeSystemBroadcast } from "../realtime/realtimeEventBus";
import { objectStorage } from "../storage/objectStorage";
import { validateImageUpload } from "../storage/images";

export type TaskManagementData = Pick<
  OrfState,
  "objectives" | "results" | "tasks" | "evidence" | "feedback" | "comments" | "objectiveLoot" | "objectiveTrialReviews" | "pointLedger" | "permissionRules"
>;

export type TaskManagementDataScope = {
  scope?: RuntimeScope | null;
};

type CommentActor = {
  canManageAllComments?: boolean;
  id: string;
  name: string;
  role: "admin" | "member";
  scope?: RuntimeScope | null;
};

type CommentMutationOutcome =
  | { status: "ok"; thread?: CommentThread }
  | { status: "notFound" }
  | { status: "forbidden" }
  | { status: "invalid" };
type CommentMentionableUsersOutcome =
  | { status: "ok"; users: OrfState["users"] }
  | { status: "notFound" }
  | { status: "forbidden" };
type CommentThreadRow = typeof commentThreads.$inferSelect;
type CommentMessageRow = typeof commentMessages.$inferSelect;
type CommentAttachmentRow = typeof commentAttachments.$inferSelect;

const today = () => localDateString(new Date());
let lastNowMs = 0;
const nowIso = () => {
  const nextNowMs = Math.max(Date.now(), lastNowMs + 1);
  lastNowMs = nextNowMs;
  return new Date(nextNowMs).toISOString();
};
let idCounter = 0;
const nextIdCounter = () => {
  idCounter = (idCounter + 1) % Number.MAX_SAFE_INTEGER;
  return idCounter.toString(36);
};
const makeId = (prefix: string) => `${prefix}-${Date.now()}-${nextIdCounter()}-${randomUUID()}`;
const makeCommentAttachmentId = () => `catt_${Date.now()}_${nextIdCounter()}_${randomUUID()}`;
const HALF_DAY_MS = 12 * 60 * 60 * 1000;
const MAX_CONFIRMATION_HALVES = 18;
const PENDING_COMMENT_ATTACHMENT_TTL_MS = 24 * 60 * 60 * 1000;
const COMMENT_ATTACHMENT_TOKEN_PATTERN = /!\[[^\]\n]*\]\(orf-attachment:([A-Za-z0-9_-]+)\)/g;
const COMMENT_MENTION_TOKEN_PATTERN = /@\[([^\]\n]*)\]\(orf-user:([^) \n]+)\)/g;
const difficultyRanks: Record<UncertaintyLevel, number> = {
  入门: 1,
  进阶: 2,
  破局: 3,
  渡劫: 4,
  飞升: 5,
};

function optional<T>(value: T | null): T | undefined {
  return value ?? undefined;
}

function commentAttachmentContentUrl(id: string) {
  return `/api/comments/attachments/${encodeURIComponent(id)}/content`;
}

function commentAttachmentDto(row: CommentAttachmentRow): CommentAttachment {
  return {
    id: row.id,
    fileName: row.fileName,
    mimeType: row.mimeType,
    fileSize: row.fileSize,
    width: optional(row.width),
    height: optional(row.height),
    contentUrl: commentAttachmentContentUrl(row.id),
  };
}

function groupCommentAttachmentsByMessage(rows: CommentAttachmentRow[]) {
  const grouped = new Map<string, CommentAttachment[]>();
  for (const row of rows) {
    if (!row.messageId) continue;
    const attachments = grouped.get(row.messageId) ?? [];
    attachments.push(commentAttachmentDto(row));
    grouped.set(row.messageId, attachments);
  }
  return grouped;
}

function extractCommentAttachmentIds(body: string) {
  const ids = new Set<string>();
  for (const match of body.matchAll(COMMENT_ATTACHMENT_TOKEN_PATTERN)) {
    if (match[1]) {
      ids.add(match[1]);
    }
  }
  return Array.from(ids);
}

function pendingCommentAttachmentExpiresAt(createdAt: string) {
  return new Date(new Date(createdAt).getTime() + PENDING_COMMENT_ATTACHMENT_TTL_MS).toISOString();
}

function sanitizeFileName(fileName: string, extension: string) {
  const leafName = fileName.split(/[\\/]/).pop()?.trim() ?? "";
  const sanitized = leafName.replace(/[^\w.\-()\u4e00-\u9fff ]+/g, "_").slice(0, 120).trim();
  return sanitized || `image.${extension}`;
}

function commentAttachmentObjectKey(input: {
  attachmentId: string;
  extension: string;
  storageScopeId: string;
  targetId: string;
  targetType: CommentTargetType;
}) {
  const safeTargetId = input.targetId.replace(/[^A-Za-z0-9_-]+/g, "_");
  const now = new Date();
  const year = now.getUTCFullYear().toString();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `comments/${input.storageScopeId}/${input.targetType}/${safeTargetId}/${year}/${month}/${input.attachmentId}.${input.extension}`;
}

async function deleteStoredCommentAttachmentObjects(rows: CommentAttachmentRow[]) {
  await Promise.allSettled(rows.map((row) => objectStorage.deleteObject(row.objectKey)));
}

function confirmationDueAt(finalDueAt: string | null, acceptedAt: string) {
  if (!finalDueAt) return null;

  const finalDueDate = new Date(`${finalDueAt}T23:59:00`);
  const acceptedDate = new Date(acceptedAt);
  if (Number.isNaN(finalDueDate.getTime()) || Number.isNaN(acceptedDate.getTime())) return null;

  const remainingMs = finalDueDate.getTime() - acceptedDate.getTime();
  if (remainingMs < HALF_DAY_MS) return null;

  const roundedHalfDays = Math.round((remainingMs * 0.3) / HALF_DAY_MS);
  const confirmationHalves = Math.min(MAX_CONFIRMATION_HALVES, Math.max(1, roundedHalfDays));
  return new Date(acceptedDate.getTime() + confirmationHalves * HALF_DAY_MS).toISOString();
}

function addDays(value: string, days: number) {
  return addCalendarDays(value, days, value);
}

function isMissingCommentStorageError(error: unknown) {
  const cause = error && typeof error === "object" && "cause" in error ? (error as { cause?: unknown }).cause : error;
  if (!cause || typeof cause !== "object" || !("code" in cause)) {
    return false;
  }

  return cause.code === "42P01" || cause.code === "42704";
}

function scopedStorageId(scope: TaskManagementDataScope = {}) {
  return scope.scope ? runtimeScopeStorageId(scope.scope).trim() : "";
}

function taskAuditUpdate(actorId?: string | null) {
  return actorId ? { updatedBy: actorId } : {};
}

function storageScope(id: string | null | undefined): RuntimeScope | null {
  const storageId = id?.trim();
  return storageId ? runtimeScope(storageId) : null;
}

async function getCommentRows(scope: TaskManagementDataScope = {}): Promise<[CommentThreadRow[], CommentMessageRow[], CommentAttachmentRow[]]> {
  try {
    const storageScopeId = scopedStorageId(scope);
    const threadRows = storageScopeId
      ? await db.select().from(commentThreads).where(eq(commentThreads.teamId, storageScopeId))
      : await db.select().from(commentThreads);
    const threadIds = threadRows.map((thread) => thread.id);
    const messageRows =
      threadIds.length > 0
        ? await db.select().from(commentMessages).where(inArray(commentMessages.threadId, threadIds))
        : [];
    const messageIds = messageRows.map((message) => message.id);
    const attachmentRows =
      messageIds.length > 0
        ? await db.select().from(commentAttachments).where(inArray(commentAttachments.messageId, messageIds))
        : [];

    return [threadRows, messageRows, attachmentRows];
  } catch (error) {
    if (isMissingCommentStorageError(error)) {
      return [[], [], []];
    }

    throw error;
  }
}

function statusFromChecklist(rows: readonly { done: boolean }[], fallback: TaskStatus = "Todo"): TaskStatus {
  if (rows.length === 0) {
    return fallback === "Done" ? "Todo" : fallback;
  }

  const completedCount = rows.filter((row) => row.done).length;
  return completedCount === rows.length ? "Done" : completedCount > 0 ? "In Progress" : "Todo";
}

function reorderIds(ids: string[], movingId: string, referenceId: string, placement: "before" | "after"): string[] {
  const withoutMoving = ids.filter((id) => id !== movingId);
  const referenceIndex = withoutMoving.indexOf(referenceId);
  if (referenceIndex < 0) {
    return [...withoutMoving, movingId];
  }

  const insertIndex = placement === "before" ? referenceIndex : referenceIndex + 1;
  return [...withoutMoving.slice(0, insertIndex), movingId, ...withoutMoving.slice(insertIndex)];
}

function isRealMember(value: string | undefined | null) {
  const name = value?.trim() ?? "";
  return name !== "" && name !== "User" && name !== "未分配";
}

function uniqueMembers(values: Array<string | undefined | null>) {
  return Array.from(new Set(values.filter(isRealMember).map((value) => value!.trim())));
}

async function getActiveMemberNameSetInScope(storageScopeId: string, values: Array<string | undefined | null>) {
  const memberNames = uniqueMembers(values);
  if (memberNames.length === 0) return new Set<string>();

  const rows = await db
    .select({ name: users.name })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(and(eq(teamMembers.teamId, storageScopeId), eq(users.status, "active"), inArray(users.name, memberNames)));
  return new Set(rows.map((member) => member.name));
}

async function getActiveChallengerNameSetInScope(
  client: Pick<typeof db, "select">,
  storageScopeId: string,
  values: Array<string | undefined | null>,
) {
  const memberNames = uniqueMembers(values);
  if (memberNames.length === 0) return new Set<string>();

  const rows = await client
    .select({ name: users.name })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(and(eq(teamMembers.teamId, storageScopeId), eq(teamMembers.role, "member"), eq(users.status, "active"), inArray(users.name, memberNames)));
  return new Set(rows.map((member) => member.name));
}

async function isActiveChallengerInScope(client: Pick<typeof db, "select">, storageScopeId: string, memberName: string) {
  return (await getActiveChallengerNameSetInScope(client, storageScopeId, [memberName])).has(memberName);
}

function challengeObjectiveHref(path: "/bounties" | "/tasks", objectiveId: string) {
  return `${path}#objective:${encodeURIComponent(objectiveId)}`;
}

function challengeCommentTargetHref(targetType: CommentTargetType, targetId: string) {
  const challengeTargetTypeByCommentTarget: Record<CommentTargetType, "action" | "bounty" | "objective" | "subAction"> = {
    objective: "objective",
    result: "bounty",
    subtask: "subAction",
    task: "action",
  };
  return `/tasks#${challengeTargetTypeByCommentTarget[targetType]}:${encodeURIComponent(targetId)}`;
}

function publishOrfDataInvalidation(input: {
  actorUserId?: string | null;
  models?: Array<"taskManagement" | "bountyHall">;
  reason:
    | "objective.created"
    | "objective.changed"
    | "objective.lifecycle.changed"
    | "objective.challenge.application.changed"
    | "objective.challenge.recruitment.changed"
    | "objective.loot.changed"
    | "objective.trialReview.changed"
    | "result.changed"
    | "task.changed"
    | "feedback.changed"
    | "comment.changed";
  target?: { id: string; type: "objective" | "result" | "task" | "subtask" | "feedback" | "comment" };
  teamId: string;
}) {
  publishRealtimeReadModelInvalidation(input.teamId, {
    actorUserId: input.actorUserId,
    models: input.models ?? ["taskManagement"],
    reason: input.reason,
    target: input.target,
  });
}

function publishObjectiveInvalidation(input: {
  actorUserId?: string | null;
  reason:
    | "objective.created"
    | "objective.changed"
    | "objective.lifecycle.changed"
    | "objective.challenge.application.changed"
    | "objective.challenge.recruitment.changed"
    | "objective.loot.changed"
    | "objective.trialReview.changed";
  objectiveId: string;
  teamId: string;
}) {
  publishOrfDataInvalidation({
    actorUserId: input.actorUserId,
    models: ["taskManagement", "bountyHall"],
    reason: input.reason,
    target: { id: input.objectiveId, type: "objective" },
    teamId: input.teamId,
  });
}

async function notifyAdminsOfChallengeApplication(input: {
  actorUserId?: string | null;
  applicant: string;
  objectiveId: string;
  objectiveTitle: string;
  reason: string;
  teamId: string;
}) {
  await createNotifications({
    actorName: input.applicant,
    actorUserId: input.actorUserId,
    body: `${input.applicant} 申请挑战「${input.objectiveTitle}」：${input.reason}`,
    kind: "challenge.application.created",
    metadata: { applicant: input.applicant, objectiveTitle: input.objectiveTitle, reason: input.reason },
    recipientUserIds: await getActiveAdminNotificationRecipients(input.teamId),
    targetHref: challengeObjectiveHref("/tasks", input.objectiveId),
    targetId: input.objectiveId,
    targetType: "objective",
    teamId: input.teamId,
    title: "新的挑战申请",
  });
}

async function notifyTeamOfObjectivePublication(input: {
  actorUserId: string;
  objectiveId: string;
  objectivePublishedAt: string;
  objectiveTitle: string;
  teamId: string;
}) {
  const actorName = await getUserNameById(input.actorUserId);
  const targetHref = challengeObjectiveHref("/bounties", input.objectiveId);
  const body = `新的悬赏目标「${input.objectiveTitle}」已发布到悬赏大厅。`;
  await createNotifications({
    actorName: actorName || "指挥官",
    actorUserId: input.actorUserId,
    body,
    kind: "objective.published",
    metadata: { objectivePublishedAt: input.objectivePublishedAt, objectiveTitle: input.objectiveTitle },
    recipientUserIds: await getActiveTeamNotificationRecipients(input.teamId),
    targetHref,
    targetId: input.objectiveId,
    targetType: "objective",
    teamId: input.teamId,
    title: "新悬赏发布",
  });
  publishRealtimeSystemBroadcast(input.teamId, {
    id: `objective-published:${input.objectiveId}`,
    body,
    createdAt: nowIso(),
    notificationKind: "objective.published",
    targetHref,
    title: "新悬赏发布",
    tone: "bounty",
  });
}

async function notifyMemberOfChallengeApplicationApproval(input: {
  actorUserId: string;
  applicant: string;
  objectiveId: string;
  objectiveTitle: string;
  teamId: string;
}) {
  const actorName = await getUserNameById(input.actorUserId);
  await createNotifications({
    actorName: actorName || "指挥官",
    actorUserId: input.actorUserId,
    body: `你申请挑战「${input.objectiveTitle}」已通过，头像已挂到悬赏大厅目标上。`,
    kind: "challenge.application.approved",
    metadata: { applicant: input.applicant, objectiveTitle: input.objectiveTitle },
    recipientUserIds: await getActiveMemberNotificationRecipientsByNames(input.teamId, [input.applicant]),
    targetHref: challengeObjectiveHref("/bounties", input.objectiveId),
    targetId: input.objectiveId,
    targetType: "objective",
    teamId: input.teamId,
    title: "挑战申请已通过",
  });
}

async function notifyMembersOfRecruitment(input: {
  actorUserId: string;
  memberNames: string[];
  objectiveId: string;
  objectiveTitle: string;
  teamId: string;
}) {
  const actorName = await getUserNameById(input.actorUserId);
  await createNotifications({
    actorName: actorName || "指挥官",
    actorUserId: input.actorUserId,
    body: `你被征召挑战「${input.objectiveTitle}」，请在悬赏大厅接受或拒绝。`,
    kind: "objective.recruitment.created",
    metadata: { objectiveTitle: input.objectiveTitle },
    recipientUserIds: await getActiveMemberNotificationRecipientsByNames(input.teamId, input.memberNames),
    targetHref: challengeObjectiveHref("/bounties", input.objectiveId),
    targetId: input.objectiveId,
    targetType: "objective",
    teamId: input.teamId,
    title: "新的征召",
  });
}

async function notifyAdminsOfChallengeAcceptance(input: {
  actorUserId?: string | null;
  challenger: string;
  objectiveId: string;
  objectiveTitle: string;
  teamId: string;
}) {
  await createNotifications({
    actorName: input.challenger,
    actorUserId: input.actorUserId,
    body: `${input.challenger} 已接受「${input.objectiveTitle}」的挑战，目标已进入重估。`,
    kind: "objective.challenge.accepted",
    metadata: { challenger: input.challenger, objectiveTitle: input.objectiveTitle },
    recipientUserIds: await getActiveAdminNotificationRecipients(input.teamId),
    targetHref: challengeObjectiveHref("/tasks", input.objectiveId),
    targetId: input.objectiveId,
    targetType: "objective",
    teamId: input.teamId,
    title: "挑战已接受",
  });
}

async function notifyAdminsOfObjectiveLoot(input: {
  actorName: string;
  actorUserId: string;
  lootId: string;
  objectiveId: string;
  objectiveTitle: string;
  teamId: string;
}) {
  await createNotifications({
    actorName: input.actorName,
    actorUserId: input.actorUserId,
    body: `${input.actorName} 已提交「${input.objectiveTitle}」的目标战利品，需要指挥官验收。`,
    kind: "objective.loot.submitted",
    metadata: { objectiveTitle: input.objectiveTitle },
    recipientUserIds: await getActiveAdminNotificationRecipients(input.teamId),
    targetHref: `/objectives/${encodeURIComponent(input.objectiveId)}/loot`,
    targetId: input.lootId,
    targetType: "objectiveLoot",
    teamId: input.teamId,
    title: "战利品待验收",
  });
}

function extractCommentMentionUserIds(body: string) {
  const userIds: string[] = [];
  for (const match of body.matchAll(COMMENT_MENTION_TOKEN_PATTERN)) {
    const rawUserId = match[2]?.trim();
    if (!rawUserId) continue;

    try {
      userIds.push(decodeURIComponent(rawUserId));
    } catch {
      userIds.push(rawUserId);
    }
  }
  return Array.from(new Set(userIds));
}

async function notifyMentionedUsersOfComment(input: {
  actorName: string;
  actorUserId: string;
  body: string;
  commentMessageId: string;
  commentThreadId: string;
  targetId: string;
  targetTitle: string;
  targetType: CommentTargetType;
  teamId: string;
}) {
  const mentionedUserIds = extractCommentMentionUserIds(input.body);
  if (mentionedUserIds.length === 0) {
    return;
  }

  await createNotifications({
    actorName: input.actorName,
    actorUserId: input.actorUserId,
    body: `${input.actorName} 在「${input.targetTitle}」的评论中提到了你。`,
    kind: "comment.mention.created",
    metadata: {
      commentMessageId: input.commentMessageId,
      commentThreadId: input.commentThreadId,
      mentionedUserIds: mentionedUserIds.join(","),
      targetId: input.targetId,
      targetTitle: input.targetTitle,
      targetType: input.targetType,
    },
    recipientUserIds: await getActiveMemberNotificationRecipientsByIds(input.teamId, mentionedUserIds),
    targetHref: challengeCommentTargetHref(input.targetType, input.targetId),
    targetId: input.commentMessageId,
    targetType: "comment",
    teamId: input.teamId,
    title: "评论提到了你",
  });
}

function uncertaintyScore(level: UncertaintyLevel | null) {
  return uncertaintyScoreFor(level);
}

function objectiveClosedForChallengeEntry(objective: Pick<Objective, "acceptedResult" | "flowStatus" | "lootSubmittedAt" | "objectiveSettlementPoints">) {
  return isObjectiveChallengeEntryClosedByFlow(objective) || Boolean(objective.lootSubmittedAt || objective.acceptedResult || objective.objectiveSettlementPoints != null);
}

async function getResultTrendRows(resultIds: string[]) {
  if (resultIds.length === 0) return [];
  return db.select().from(resultTrendPoints).where(inArray(resultTrendPoints.resultId, resultIds));
}

async function getChecklistRows(taskIds: string[]) {
  if (taskIds.length === 0) return [];
  return db.select().from(taskChecklistItems).where(inArray(taskChecklistItems.taskId, taskIds));
}

async function getFeedbackCauseRows(feedbackIds: string[]) {
  if (feedbackIds.length === 0) return [];
  return db.select().from(feedbackCauseCategories).where(inArray(feedbackCauseCategories.feedbackId, feedbackIds));
}

export async function getTaskManagementData(scope: TaskManagementDataScope = {}): Promise<TaskManagementData> {
  const storageScopeId = scopedStorageId(scope);
  const objectiveRows = storageScopeId
    ? await db.select().from(objectives).where(eq(objectives.teamId, storageScopeId)).orderBy(desc(objectives.createdAt), desc(objectives.id))
    : await db.select().from(objectives).orderBy(desc(objectives.createdAt), desc(objectives.id));
  const resultRows = storageScopeId ? await db.select().from(results).where(eq(results.teamId, storageScopeId)) : await db.select().from(results);
  const taskRows = storageScopeId ? await db.select().from(tasks).where(eq(tasks.teamId, storageScopeId)) : await db.select().from(tasks);
  const evidenceRows = storageScopeId ? await db.select().from(evidence).where(eq(evidence.teamId, storageScopeId)) : await db.select().from(evidence);
  const feedbackRows = storageScopeId ? await db.select().from(feedback).where(eq(feedback.teamId, storageScopeId)) : await db.select().from(feedback);
  const objectiveLootRows = storageScopeId ? await db.select().from(objectiveLoot).where(eq(objectiveLoot.teamId, storageScopeId)) : await db.select().from(objectiveLoot);
  const objectiveTrialReviewRows = storageScopeId
    ? await db.select().from(objectiveTrialReviews).where(eq(objectiveTrialReviews.teamId, storageScopeId))
    : await db.select().from(objectiveTrialReviews);
  const pointLedgerRows = storageScopeId ? await db.select().from(pointLedger).where(eq(pointLedger.teamId, storageScopeId)) : await db.select().from(pointLedger);
  const scopeRows = storageScopeId ? await db.select({ id: teams.id }).from(teams).where(eq(teams.id, storageScopeId)) : await db.select({ id: teams.id }).from(teams);
  const resultIds = resultRows.map((result) => result.id);
  const taskIds = taskRows.map((task) => task.id);
  const feedbackIds = feedbackRows.map((item) => item.id);
  const trendRows = await getResultTrendRows(resultIds);
  const checklistRows = await getChecklistRows(taskIds);
  const causeRows = await getFeedbackCauseRows(feedbackIds);
  const [commentThreadRows, commentMessageRows, commentAttachmentRows] = await getCommentRows({ scope: storageScope(storageScopeId) });
  const commentAuthorAvatarUrls = await getUserAvatarUrlMap(commentMessageRows.map((message) => message.authorUserId).filter((userId): userId is string => Boolean(userId)));
  const permissionRules = scopeRows[0] ? await getPermissionRulesForScope(runtimeScope(scopeRows[0].id)) : initialOrfState.permissionRules;

  const checklistByTask = new Map<string, Task["checklist"]>();
  for (const item of checklistRows.sort((left, right) => left.sortOrder - right.sortOrder)) {
    const list = checklistByTask.get(item.taskId) ?? [];
    list.push({ id: item.id, label: item.label, done: item.done, updatedAt: item.updatedAt });
    checklistByTask.set(item.taskId, list);
  }

  const trendByResult = new Map<string, Result["trend"]>();
  for (const point of trendRows.sort((left, right) => left.sortOrder - right.sortOrder)) {
    const list = trendByResult.get(point.resultId) ?? [];
    list.push({ date: point.date, value: point.value });
    trendByResult.set(point.resultId, list);
  }

  const causeCategoriesByFeedback = new Map<string, string[]>();
  for (const item of causeRows.sort((left, right) => left.sortOrder - right.sortOrder)) {
    const list = causeCategoriesByFeedback.get(item.feedbackId) ?? [];
    list.push(item.category);
    causeCategoriesByFeedback.set(item.feedbackId, list);
  }

  const orderedTaskRows = [...taskRows].sort((left, right) => left.sortOrder - right.sortOrder);
  const orderedResultRows = [...resultRows].sort((left, right) => left.sortOrder - right.sortOrder);
  const messagesByThread = new Map<string, CommentThread["messages"]>();
  const attachmentsByMessage = groupCommentAttachmentsByMessage(commentAttachmentRows);
  for (const message of [...commentMessageRows].sort(
    (left, right) => left.sortOrder - right.sortOrder || left.createdAt.localeCompare(right.createdAt),
  )) {
    const messages = messagesByThread.get(message.threadId) ?? [];
    messages.push({
      id: message.id,
      author: message.author,
      authorUserId: optional(message.authorUserId),
      authorAvatarUrl: message.authorUserId ? commentAuthorAvatarUrls.get(message.authorUserId) ?? null : null,
      body: message.body,
      attachments: attachmentsByMessage.get(message.id) ?? [],
      createdAt: message.createdAt,
      parentMessageId: optional(message.parentMessageId),
      replyToMessageId: optional(message.replyToMessageId),
      replyToAuthor: optional(message.replyToAuthor),
    });
    messagesByThread.set(message.threadId, messages);
  }

  const taskItems: Task[] = orderedTaskRows.map((task) => ({
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    assignee: task.assignee,
    linkedObjectiveId: task.linkedObjectiveId,
    feedbackOriginId: optional(task.feedbackOriginId),
    dueDate: task.dueDate,
    tags: task.tags,
    checklist: checklistByTask.get(task.id) ?? [],
    createdBy: task.createdBy,
    updatedBy: task.updatedBy,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  }));

  const evidenceItems: Evidence[] = evidenceRows.map((item) => ({
    id: item.id,
    type: item.type,
    title: item.title,
    summary: item.summary,
    source: item.source,
    date: item.date,
    owner: item.owner,
    linkedResultId: item.linkedResultId,
    linkedFeedbackId: optional(item.linkedFeedbackId),
  }));

  const feedbackItems: Feedback[] = feedbackRows.map((item) => ({
    id: item.id,
    phenomenon: item.phenomenon,
    evidenceIds: evidenceItems.filter((evidenceItem) => evidenceItem.linkedFeedbackId === item.id).map((evidenceItem) => evidenceItem.id),
    causeCategories: causeCategoriesByFeedback.get(item.id) ?? [],
    impact: item.impact,
    linkedObjectiveId: item.linkedObjectiveId,
    linkedResultId: item.linkedResultId,
    suggestedAdjustment: item.suggestedAdjustment,
    source: item.source,
    status: item.status,
    owner: item.owner,
    createdBy: item.createdBy,
    updatedBy: item.updatedBy,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    activity: [],
  }));

  const resultItems: Result[] = orderedResultRows.map((result) => ({
    id: result.id,
    objectiveId: result.objectiveId,
    title: result.title,
    description: result.description,
    metricName: result.metricName,
    metricRequirement: optional(result.metricRequirement),
    statisticalObject: optional(result.statisticalObject),
    completionStandard: optional(result.completionStandard),
    sampleSet: optional(result.sampleSet),
    measurementScope: optional(result.measurementScope),
    uncertaintyLevel: optional(result.uncertaintyLevel),
    baseline: result.baseline,
    current: result.current,
    target: result.target,
    unit: result.unit,
    direction: result.direction,
    status: result.status,
    confidence: result.confidence,
    source: result.source,
    definer: result.definer,
    uncertaintyScore: result.uncertaintyScore ?? uncertaintyScore(result.uncertaintyLevel),
    acceptedResult: result.acceptedResult ?? "unreviewed",
    evidenceIds: evidenceItems.filter((item) => item.linkedResultId === result.id).map((item) => item.id),
    feedbackIds: feedbackItems.filter((item) => item.linkedResultId === result.id).map((item) => item.id),
    trend: trendByResult.get(result.id) ?? [],
    reviewCadence: result.reviewCadence,
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
  }));

  const objectiveItems: Objective[] = objectiveRows.map((objective) => {
    const objectiveResults = resultItems.filter((result) => result.objectiveId === objective.id);
    const objectiveBasePoints = objectiveBasePointsForResults(objectiveResults);
    const challengers = uniqueMembers(objective.challengers ?? []);
    const assignedChallengers = uniqueMembers(objective.assignedChallengers ?? []).filter((member) => !challengers.includes(member));

    return {
      id: objective.id,
      title: objective.title,
      description: objective.description,
      whyItMatters: objective.whyItMatters,
      cycle: objective.cycle,
      stage: objective.stage,
      flowStatus: objective.flowStatus,
      status: objective.status,
      confidence: objective.confidence,
      progress: Math.max(0, Math.min(100, Math.round(objective.progress))),
      boundary: objective.boundary,
      successDefinition: objective.successDefinition,
      resultIds: objectiveResults.map((result) => result.id),
      feedbackIds: feedbackItems.filter((item) => item.linkedObjectiveId === objective.id).map((item) => item.id),
      taskIds: taskItems.filter((task) => task.linkedObjectiveId === objective.id).map((task) => task.id),
      finalDueAt: objective.finalDueAt || addDays(objective.updatedAt, 14),
      challengers,
      assignedChallengers,
      challengeApplications: objective.challengeApplications,
      acceptedAt: objective.acceptedAt,
      confirmationDueAt: objective.confirmationDueAt,
      confirmedAt: objective.confirmedAt,
      lootSubmittedAt: objective.lootSubmittedAt,
      acceptedResult: objective.acceptedResult,
      completionMultiplier: objective.completionMultiplier,
      objectiveBasePoints,
      objectiveSettlementPoints: objective.objectiveSettlementPoints,
      publishedAt: objective.publishedAt,
      createdAt: objective.createdAt,
      updatedAt: objective.updatedAt,
    };
  });
  const objectiveLootItems: ObjectiveLoot[] = objectiveLootRows
    .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt))
    .map((item) => ({
      id: item.id,
      objectiveId: item.objectiveId,
      submittedBy: item.submittedBy,
      body: item.body,
      resultClaims: item.resultClaims,
      selfTestReportUrl: item.selfTestReportUrl,
      selfTestReportBody: item.selfTestReportBody,
      submittedAt: item.submittedAt,
    }));
  const objectiveTrialReviewItems: ObjectiveTrialReview[] = objectiveTrialReviewRows
    .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt))
    .map((item) => ({
      id: item.id,
      objectiveId: item.objectiveId,
      requestedBy: item.requestedBy,
      body: item.body,
      resultClaims: item.resultClaims,
      selfTestReportBody: item.selfTestReportBody,
      status: item.status,
      commanderFeedback: item.commanderFeedback,
      reviewedBy: item.reviewedBy,
      reviewedAt: item.reviewedAt,
      requestedAt: item.requestedAt,
    }));
  const pointLedgerItems: PointLedgerEntry[] = pointLedgerRows
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((item) => ({
      id: item.id,
      objectiveId: item.objectiveId,
      userId: item.userId,
      memberName: item.memberName,
      points: item.points,
      reason: item.reason,
      createdAt: item.createdAt,
    }));
  const commentItems: CommentThread[] = [...commentThreadRows]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((thread) => ({
      id: thread.id,
      targetType: thread.targetType,
      targetId: thread.targetId,
      targetTitle: thread.targetTitle,
      status: thread.status,
      createdBy: thread.createdBy,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      messages: messagesByThread.get(thread.id) ?? [],
    }));

  return {
    objectives: objectiveItems,
    results: resultItems,
    tasks: taskItems,
    evidence: evidenceItems,
    feedback: feedbackItems,
    comments: commentItems,
    objectiveLoot: objectiveLootItems,
    objectiveTrialReviews: objectiveTrialReviewItems,
    pointLedger: pointLedgerItems,
    permissionRules,
  };
}

export async function getOrfStateSnapshot(scope: TaskManagementDataScope = {}): Promise<OrfState> {
  const storageScopeId = scopedStorageId(scope);
  const data = await getTaskManagementData(scope);
  const [scopeRow] = storageScopeId
    ? await db.select({ id: teams.id }).from(teams).where(eq(teams.id, storageScopeId)).limit(1)
    : await db.select({ id: teams.id }).from(teams).limit(1);
  const scopeUsers = scopeRow ? await getScopedUsers(runtimeScope(scopeRow.id)) : initialOrfState.users;

  return {
    ...data,
    users: scopeUsers,
    currentUserId: scopeUsers[0]?.id ?? initialOrfState.currentUserId,
    decisions: [],
    evalRuns: [],
    scenarios: [],
    failureSamples: [],
    comments: data.comments,
    causeCategories: Array.from(new Set(data.feedback.flatMap((item) => item.causeCategories))),
    rules: {
      requireResultForTask: false,
      requireEvidenceForFeedback: true,
      weeklyFeedbackCadence: true,
      autoCreateReviewSummary: false,
    },
  };
}

export type BountyHallItem = {
  applications: ChallengeApplication[];
  approvedApplicants: string[];
  challengers: string[];
  uncertaintyPoints: number;
  deadline: string;
  definer: string;
  difficultyRank: number;
  hasCurrentApplication: boolean;
  isCurrentChallenger: boolean;
  isRecruitment: boolean;
  objective: Objective;
  pendingApplications: ChallengeApplication[];
  result: Result | null;
  results: Result[];
  source: BountySource;
};

export type BountyHallData = {
  publicItems: BountyHallItem[];
  recruitmentItems: BountyHallItem[];
  availableItems: BountyHallItem[];
  objectiveOptions: Objective[];
  contribution: { points: number };
};

function resultDifficultyRank(result: Result) {
  return result.uncertaintyLevel ? difficultyRanks[result.uncertaintyLevel] : 0;
}

function bountySortTitle(item: BountyHallItem) {
  return item.result?.title ?? item.objective.title;
}

function compareBountyItems(left: BountyHallItem, right: BountyHallItem) {
  if (left.isRecruitment !== right.isRecruitment) return left.isRecruitment ? -1 : 1;
  const leftDeadline = left.deadline || "9999-12-31";
  const rightDeadline = right.deadline || "9999-12-31";
  return leftDeadline.localeCompare(rightDeadline) || right.uncertaintyPoints - left.uncertaintyPoints || bountySortTitle(left).localeCompare(bountySortTitle(right));
}

function objectiveVisibleInBountyHall(objective: Objective) {
  return isObjectiveChallengeDiscoverableByFlow(objective) && !objectiveClosedForChallengeEntry(objective);
}

function objectiveAvailableForBountyApplication(objective: Objective) {
  return canApplyForObjectiveChallenge(objective) && !objectiveClosedForChallengeEntry(objective);
}

function contributionSummaryFor(data: TaskManagementData, member: string) {
  const ledgerPoints = data.pointLedger
    .filter((entry) => entry.memberName === member)
    .reduce((sum, entry) => sum + entry.points, 0);
  if (ledgerPoints > 0) {
    return { points: ledgerPoints };
  }

  return {
    points: data.objectives.reduce((sum, objective) => {
      if (!objective.challengers.includes(member)) return sum;
      return sum + (objective.objectiveSettlementPoints ?? 0);
    }, 0),
  };
}

export async function getBountyHallData(viewerName: string, scope: TaskManagementDataScope = {}, viewerRole: UserRole = "member"): Promise<BountyHallData> {
  const data = await getTaskManagementData(scope);
  const canUseChallengeActions = viewerRole === "member";
  const items = data.objectives.flatMap((objective) => {
    const objectiveResults = data.results.filter((result) => result.objectiveId === objective.id);
    const result = objectiveResults[0];
    const isRecruitment = canUseChallengeActions && objective.assignedChallengers.includes(viewerName) && canAcceptObjectiveChallengeByFlow(objective);
    if (!objectiveVisibleInBountyHall(objective) && !isRecruitment) return [];

    const applications = objective.challengeApplications ?? [];
    const pendingApplications = applications.filter((application) => application.status === "pending");
    const approvedApplicants = applications.filter((application) => application.status === "approved").map((application) => application.applicant);
    const challengers = uniqueMembers(objective.challengers ?? []);
    return [{
      applications,
      approvedApplicants,
      challengers,
      uncertaintyPoints: objectiveBasePointsForResults(objectiveResults),
      deadline: objective.finalDueAt,
      definer: result?.definer ?? "",
      difficultyRank: objectiveResults.length > 0 ? Math.max(...objectiveResults.map(resultDifficultyRank)) : 0,
      hasCurrentApplication: canUseChallengeActions && pendingApplications.some((application) => application.applicant === viewerName),
      isCurrentChallenger: canUseChallengeActions && challengers.includes(viewerName),
      isRecruitment,
      objective,
      pendingApplications,
      result: result ?? null,
      results: objectiveResults,
      source: result?.source ?? "managerDefined",
    }];
  }).sort(compareBountyItems);

  const availableItems = items.filter((item) => !item.isRecruitment && objectiveAvailableForBountyApplication(item.objective));
  const objectiveOptionIds = new Set(items.map((item) => item.objective.id));

  return {
    publicItems: items,
    recruitmentItems: items.filter((item) => item.isRecruitment),
    availableItems,
    objectiveOptions: data.objectives.filter((objective) => objectiveOptionIds.has(objective.id)),
    contribution: contributionSummaryFor(data, viewerName),
  };
}

function filterComments(data: TaskManagementData, ids: {
  objectiveIds: Set<string>;
  resultIds: Set<string>;
  taskIds: Set<string>;
  checklistItemIds: Set<string>;
}) {
  return data.comments.filter((thread) => {
    if (thread.targetType === "objective") return ids.objectiveIds.has(thread.targetId);
    if (thread.targetType === "result") return ids.resultIds.has(thread.targetId);
    if (thread.targetType === "task") return ids.taskIds.has(thread.targetId);
    if (thread.targetType === "subtask") return ids.checklistItemIds.has(thread.targetId);
    return false;
  });
}

export async function getMyChallengesData(member: string, includeAll = false, scope: TaskManagementDataScope = {}): Promise<TaskManagementData> {
  const data = await getTaskManagementData(scope);
  if (includeAll) return data;

  const objectivesForMember = data.objectives.filter((objective) => objective.challengers.includes(member));
  const objectiveIds = new Set(objectivesForMember.map((objective) => objective.id));
  const resultsForMember = data.results.filter((result) => objectiveIds.has(result.objectiveId));
  const resultIds = new Set(resultsForMember.map((result) => result.id));
  const tasksForMember = data.tasks.filter((task) => objectiveIds.has(task.linkedObjectiveId));
  const taskIds = new Set(tasksForMember.map((task) => task.id));
  const checklistItemIds = new Set(tasksForMember.flatMap((task) => task.checklist.map((item) => item.id)));

  return {
    objectives: objectivesForMember,
    results: resultsForMember,
    tasks: tasksForMember,
    evidence: data.evidence.filter((item) => resultIds.has(item.linkedResultId)),
    feedback: data.feedback.filter((item) => objectiveIds.has(item.linkedObjectiveId) || resultIds.has(item.linkedResultId)),
    comments: filterComments(data, { objectiveIds, resultIds, taskIds, checklistItemIds }),
    objectiveLoot: data.objectiveLoot.filter((item) => objectiveIds.has(item.objectiveId)),
    objectiveTrialReviews: data.objectiveTrialReviews.filter((item) => objectiveIds.has(item.objectiveId)),
    pointLedger: data.pointLedger,
    permissionRules: data.permissionRules,
  };
}

export interface CreateResultInput {
  objectiveId: string;
  title: string;
  metricName: string;
  actorId?: string | null;
  description?: string;
  baseline?: number;
  current?: number;
  target?: number;
  unit?: string;
  direction?: MetricDirection;
  uncertaintyLevel?: UncertaintyLevel;
  source?: BountySource;
  definer?: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  assignee?: string;
  actorId?: string | null;
  priority?: Priority;
  linkedObjectiveId: string;
  dueDate?: string;
  feedbackOriginId?: string;
}

export interface CreateObjectiveInput {
  title: string;
  whyItMatters: string;
  cycle: string;
  boundary: string;
  finalDueAt?: string;
}

export async function createObjective(input: CreateObjectiveInput, context: { scope: RuntimeScope; userId: string }): Promise<Objective | null> {
  const id = makeId("obj");
  const now = today();
  const storageScopeId = runtimeScopeStorageId(context.scope);

  await db.insert(objectives).values({
    id,
    teamId: storageScopeId,
    title: input.title,
    description: input.whyItMatters,
    whyItMatters: input.whyItMatters,
    cycle: input.cycle,
    stage: objectiveLifecycleInitialState.stage,
    flowStatus: objectiveLifecycleInitialState.flowStatus,
    status: "Draft",
    confidence: 50,
    progress: 0,
    boundary: input.boundary,
    successDefinition: "Success definition will be refined during result planning.",
    finalDueAt: input.finalDueAt ?? addDays(now, 14),
    challengers: [],
    assignedChallengers: [],
    challengeApplications: [],
    acceptedAt: null,
    confirmationDueAt: null,
    confirmedAt: null,
    lootSubmittedAt: null,
    acceptedResult: null,
    completionMultiplier: null,
    objectiveBasePoints: 0,
    objectiveSettlementPoints: null,
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
    createdBy: context.userId,
    updatedBy: context.userId,
  });

  publishOrfDataInvalidation({
    actorUserId: context.userId,
    models: ["taskManagement"],
    reason: "objective.created",
    target: { id, type: "objective" },
    teamId: storageScopeId,
  });

  const data = await getTaskManagementData({ scope: context.scope });
  return data.objectives.find((objective) => objective.id === id) ?? null;
}

export interface CreateChecklistItemInput {
  label?: string;
  afterItemId?: string;
}

export async function createResult(input: CreateResultInput): Promise<Result | null> {
  const title = input.title.trim();
  const metricName = input.metricName.trim();
  if (!title || !metricName) {
    return null;
  }

  const created = await db.transaction(async (tx) => {
    const [objective] = await tx.select().from(objectives).where(eq(objectives.id, input.objectiveId)).limit(1).for("update");
    if (!objective) {
      return null;
    }
    if (!canMutateObjectiveResultsByFlow(objective)) {
      return null;
    }

    const siblingRows = await tx.select({ sortOrder: results.sortOrder }).from(results).where(eq(results.objectiveId, input.objectiveId));
    const sortOrder = siblingRows.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;
    const id = makeId("res");
    const now = today();

    await tx.insert(results).values({
      id,
      teamId: objective.teamId,
      objectiveId: objective.id,
      title,
      description: input.description?.trim() || "由 ORF Flow 规划创建的指标。",
      metricName,
      metricRequirement: `${metricName}：写清统计对象和完成标准后进入执行。`,
      statisticalObject: null,
      completionStandard: null,
      sampleSet: null,
      measurementScope: null,
      uncertaintyLevel: input.uncertaintyLevel ?? null,
      baseline: input.baseline ?? 0,
      current: input.current ?? 0,
      target: input.target ?? 100,
      unit: input.unit?.trim() || "%",
      direction: input.direction ?? "increase",
      status: "Draft",
      confidence: 50,
      source: input.source ?? "managerDefined",
      definer: input.definer?.trim() || "",
      uncertaintyScore: uncertaintyScore(input.uncertaintyLevel ?? null),
      acceptedResult: "unreviewed",
      reviewCadence: "Weekly",
      sortOrder,
      createdAt: now,
      updatedAt: now,
      createdBy: input.actorId ?? null,
      updatedBy: input.actorId ?? null,
    });

    return { id, scope: runtimeScope(objective.teamId) };
  });

  if (!created) {
    return null;
  }

  publishOrfDataInvalidation({
    models: ["taskManagement", "bountyHall"],
    reason: "result.changed",
    target: { id: created.id, type: "result" },
    teamId: runtimeScopeStorageId(created.scope),
  });

  const data = await getTaskManagementData({ scope: created.scope });
  return data.results.find((result) => result.id === created.id) ?? null;
}

export type AcceptObjectiveChallengeOutcome =
  | { status: "accepted"; objective: Objective }
  | { status: "alreadyAccepted"; challengers: string[] }
  | { status: "forbidden" }
  | { status: "invalidDueDate" }
  | { status: "closed" }
  | { status: "notFound" };

export async function acceptObjectiveChallenge(objectiveId: string, challenger: string, actorId?: string): Promise<AcceptObjectiveChallengeOutcome> {
  const nextChallenger = challenger.trim();
  if (!nextChallenger) {
    return { status: "notFound" };
  }

  const acceptedResult = await db.transaction(async (tx) => {
    const [objective] = await tx.select().from(objectives).where(eq(objectives.id, objectiveId)).limit(1).for("update");
    if (!objective) {
      return { status: "notFound" as const };
    }

    const currentChallengers = uniqueMembers(objective.challengers ?? []);
    if (currentChallengers.includes(nextChallenger)) {
      return { status: "alreadyAccepted" as const, challengers: currentChallengers };
    }
    if (objectiveClosedForChallengeEntry(objective) || !canAcceptObjectiveChallengeByFlow(objective)) {
      return { status: "closed" as const };
    }
    if (!(await isActiveChallengerInScope(tx, objective.teamId, nextChallenger))) {
      return { status: "forbidden" as const };
    }

    const assignedChallengers = uniqueMembers(objective.assignedChallengers ?? []);
    const applications = objective.challengeApplications ?? [];
    const hasApprovedApplication = applications.some((application) => application.applicant === nextChallenger && application.status === "approved");
    if (!assignedChallengers.includes(nextChallenger) && !hasApprovedApplication) {
      return { status: "forbidden" as const };
    }

    const acceptedAt = nowIso();
    const nextConfirmationDueAt = confirmationDueAt(objective.finalDueAt, acceptedAt);
    if (!nextConfirmationDueAt) {
      return { status: "invalidDueDate" as const };
    }

    await tx
      .update(objectives)
      .set({
        challengers: [...currentChallengers, nextChallenger],
        assignedChallengers: assignedChallengers.filter((member) => member !== nextChallenger),
        flowStatus: objectiveLifecycleTransitions.acceptChallenge.to,
        stage: objectiveLifecycleTransitions.acceptChallenge.stage,
        acceptedAt: objective.acceptedAt ?? acceptedAt,
        confirmationDueAt: objective.confirmationDueAt ?? nextConfirmationDueAt,
        challengeApplications: applications.map((application) =>
          application.applicant === nextChallenger && application.status === "approved" ? { ...application, decidedAt: application.decidedAt ?? acceptedAt } : application,
        ),
        status: objective.status === "Draft" ? "On Track" : objective.status,
        updatedAt: today(),
        updatedBy: actorId ?? objective.updatedBy,
      })
      .where(eq(objectives.id, objectiveId));

    return {
      status: "accepted" as const,
      scope: runtimeScope(objective.teamId),
      notification: {
        actorUserId: actorId,
        challenger: nextChallenger,
        objectiveId,
        objectiveTitle: objective.title,
        teamId: objective.teamId,
      },
    };
  });

  if (acceptedResult.status !== "accepted") {
    return acceptedResult;
  }

  await notifyAdminsOfChallengeAcceptance(acceptedResult.notification);
  publishObjectiveInvalidation({
    actorUserId: actorId,
    reason: "objective.lifecycle.changed",
    objectiveId,
    teamId: runtimeScopeStorageId(acceptedResult.scope),
  });

  const data = await getTaskManagementData({ scope: acceptedResult.scope });
  const accepted = data.objectives.find((item) => item.id === objectiveId);
  return accepted ? { status: "accepted", objective: accepted } : { status: "notFound" };
}

export type ApplyObjectiveChallengeOutcome =
  | { status: "applied"; objective: Objective }
  | { status: "alreadyApplied" }
  | { status: "alreadyAccepted"; challengers: string[] }
  | { status: "forbidden" }
  | { status: "invalidReason" }
  | { status: "closed" }
  | { status: "notFound" };

export async function applyForObjectiveChallenge(objectiveId: string, applicant: string, actorUserId: string | null | undefined, reason: string): Promise<ApplyObjectiveChallengeOutcome> {
  const nextApplicant = applicant.trim();
  if (!nextApplicant) {
    return { status: "notFound" };
  }
  const applicationReason = reason.trim();
  if (!applicationReason) {
    return { status: "invalidReason" };
  }

  const appliedResult = await db.transaction(async (tx) => {
    const [objective] = await tx.select().from(objectives).where(eq(objectives.id, objectiveId)).limit(1).for("update");
    if (!objective) {
      return { status: "notFound" as const };
    }

    const challengers = uniqueMembers(objective.challengers ?? []);
    if (challengers.includes(nextApplicant)) {
      return { status: "alreadyAccepted" as const, challengers };
    }
    if (objectiveClosedForChallengeEntry(objective) || !canApplyForObjectiveChallenge(objective)) {
      return { status: "closed" as const };
    }
    if (!(await isActiveChallengerInScope(tx, objective.teamId, nextApplicant))) {
      return { status: "forbidden" as const };
    }

    const applications = objective.challengeApplications ?? [];
    if (applications.some((application) => application.applicant === nextApplicant && application.status === "pending")) {
      return { status: "alreadyApplied" as const };
    }

    const application: ChallengeApplication = {
      id: makeId("challenge-application"),
      applicant: nextApplicant,
      reason: applicationReason,
      status: "pending",
      createdAt: nowIso(),
      decidedAt: null,
    };

    await tx
      .update(objectives)
      .set({
        challengeApplications: [application, ...applications],
        flowStatus: objectiveFlowStatusAfterChallengeApplication(objective.flowStatus),
        updatedAt: today(),
      })
      .where(eq(objectives.id, objectiveId));

    return {
      status: "applied" as const,
      scope: runtimeScope(objective.teamId),
      notification: {
        actorUserId,
        applicant: nextApplicant,
        objectiveId,
        objectiveTitle: objective.title,
        reason: applicationReason,
        teamId: objective.teamId,
      },
    };
  });

  if (appliedResult.status !== "applied") {
    return appliedResult;
  }

  await notifyAdminsOfChallengeApplication(appliedResult.notification);
  publishObjectiveInvalidation({
    actorUserId,
    reason: "objective.challenge.application.changed",
    objectiveId,
    teamId: runtimeScopeStorageId(appliedResult.scope),
  });

  const data = await getTaskManagementData({ scope: appliedResult.scope });
  const applied = data.objectives.find((item) => item.id === objectiveId);
  return applied ? { status: "applied", objective: applied } : { status: "notFound" };
}

export type ObjectiveFlowMutationOutcome =
  | { status: "ok"; objective: Objective }
  | { status: "invalid" }
  | { status: "notFound" };

async function objectiveOutcome(objectiveId: string, scope?: RuntimeScope | null): Promise<ObjectiveFlowMutationOutcome> {
  const data = await getTaskManagementData({ scope });
  const objective = data.objectives.find((item) => item.id === objectiveId);
  return objective ? { status: "ok", objective } : { status: "notFound" };
}

export async function publishObjective(objectiveId: string, actorId: string): Promise<ObjectiveFlowMutationOutcome> {
  const transition = objectiveLifecycleTransitions.publishCandidate;
  const publishedAt = today();
  const updated = await db
    .update(objectives)
    .set({ flowStatus: transition.to, stage: transition.stage, status: "Draft", publishedAt, updatedAt: publishedAt, updatedBy: actorId })
    .where(and(eq(objectives.id, objectiveId), eq(objectives.flowStatus, transition.from)))
    .returning({ id: objectives.id, teamId: objectives.teamId, title: objectives.title });
  if (updated.length === 0) {
    const [existing] = await db.select({ id: objectives.id }).from(objectives).where(eq(objectives.id, objectiveId)).limit(1);
    return existing ? { status: "invalid" } : { status: "notFound" };
  }
  const published = updated[0]!;
  await notifyTeamOfObjectivePublication({
    actorUserId: actorId,
    objectiveId: published.id,
    objectivePublishedAt: publishedAt,
    objectiveTitle: published.title,
    teamId: published.teamId,
  });
  publishObjectiveInvalidation({
    actorUserId: actorId,
    reason: "objective.lifecycle.changed",
    objectiveId,
    teamId: published.teamId,
  });
  return objectiveOutcome(objectiveId, storageScope(published.teamId));
}

export async function approveObjectiveChallengeApplication(
  objectiveId: string,
  applicationId: string,
  actorId: string,
): Promise<ObjectiveFlowMutationOutcome> {
  const approvedResult = await db.transaction(async (tx) => {
    const [objective] = await tx.select().from(objectives).where(eq(objectives.id, objectiveId)).limit(1).for("update");
    if (!objective) return { status: "notFound" as const };
    if (objectiveClosedForChallengeEntry(objective) || !canReviewObjectiveChallengeApplications(objective)) return { status: "invalid" as const };

    const applications = objective.challengeApplications ?? [];
    const application = applications.find((item) => item.id === applicationId && item.status === "pending");
    if (!application) return { status: "notFound" as const };

    const acceptedAt = nowIso();
    const nextConfirmationDueAt = confirmationDueAt(objective.finalDueAt, acceptedAt);
    if (!nextConfirmationDueAt) return { status: "invalid" as const };
    if (!(await isActiveChallengerInScope(tx, objective.teamId, application.applicant))) return { status: "invalid" as const };

    const challengers = uniqueMembers([...(objective.challengers ?? []), application.applicant]);
    await tx
      .update(objectives)
      .set({
        challengers,
        flowStatus: objectiveLifecycleTransitions.acceptChallenge.to,
        stage: objectiveLifecycleTransitions.acceptChallenge.stage,
        acceptedAt: objective.acceptedAt ?? acceptedAt,
        confirmationDueAt: objective.confirmationDueAt ?? nextConfirmationDueAt,
        challengeApplications: applications.map((item) =>
          item.id === applicationId ? { ...item, status: "approved", decidedAt: acceptedAt, decidedBy: actorId } : item,
        ),
        status: objective.status === "Draft" ? "On Track" : objective.status,
        updatedAt: today(),
        updatedBy: actorId,
      })
      .where(eq(objectives.id, objectiveId));

    return {
      status: "ok" as const,
      scope: runtimeScope(objective.teamId),
      notification: {
        actorUserId: actorId,
        applicant: application.applicant,
        objectiveId,
        objectiveTitle: objective.title,
        teamId: objective.teamId,
      },
    };
  });

  if (approvedResult.status !== "ok") return approvedResult;
  await notifyMemberOfChallengeApplicationApproval(approvedResult.notification);
  publishObjectiveInvalidation({
    actorUserId: actorId,
    reason: "objective.challenge.application.changed",
    objectiveId,
    teamId: runtimeScopeStorageId(approvedResult.scope),
  });
  return objectiveOutcome(objectiveId, approvedResult.scope);
}

export async function rejectObjectiveChallengeApplication(
  objectiveId: string,
  applicationId: string,
  actorId: string,
): Promise<ObjectiveFlowMutationOutcome> {
  const rejectedResult = await db.transaction(async (tx) => {
    const [objective] = await tx.select().from(objectives).where(eq(objectives.id, objectiveId)).limit(1).for("update");
    if (!objective) return { status: "notFound" as const };
    if (objectiveClosedForChallengeEntry(objective) || !canReviewObjectiveChallengeApplications(objective)) return { status: "invalid" as const };
    const applications = objective.challengeApplications ?? [];
    if (!applications.some((item) => item.id === applicationId && item.status === "pending")) return { status: "notFound" as const };
    const nextApplications = applications.map((item) =>
      item.id === applicationId ? { ...item, status: "declined" as const, decidedAt: nowIso(), decidedBy: actorId } : item,
    );
    const hasPending = nextApplications.some((item) => item.status === "pending");
    const assignedChallengers = uniqueMembers(objective.assignedChallengers ?? []);
    const challengers = uniqueMembers(objective.challengers ?? []);
    await tx
      .update(objectives)
      .set({
        challengeApplications: nextApplications,
        flowStatus: objectiveFlowStatusAfterChallengeApplicationReview({
          hasAcceptedChallengers: challengers.length > 0,
          hasAssignedChallengers: assignedChallengers.length > 0,
          hasPendingApplications: hasPending,
        }),
        updatedAt: today(),
        updatedBy: actorId,
      })
      .where(eq(objectives.id, objectiveId));
    return { status: "ok" as const, scope: runtimeScope(objective.teamId) };
  });

  if (rejectedResult.status === "ok") {
    publishObjectiveInvalidation({
      actorUserId: actorId,
      reason: "objective.challenge.application.changed",
      objectiveId,
      teamId: runtimeScopeStorageId(rejectedResult.scope),
    });
    return objectiveOutcome(objectiveId, rejectedResult.scope);
  }

  return rejectedResult;
}

export async function recruitObjectiveChallengers(
  objectiveId: string,
  members: string[],
  actorId: string,
): Promise<ObjectiveFlowMutationOutcome> {
  const recruitedResult = await db.transaction(async (tx) => {
    const [objective] = await tx.select().from(objectives).where(eq(objectives.id, objectiveId)).limit(1).for("update");
    if (!objective) return { status: "notFound" as const };
    if (objectiveClosedForChallengeEntry(objective) || !canRecruitObjectiveChallengersByFlow(objective)) return { status: "invalid" as const };
    const currentChallengers = uniqueMembers(objective.challengers ?? []);
    const recruitMembers = uniqueMembers(members).filter((member) => !currentChallengers.includes(member));
    if (recruitMembers.length === 0) return { status: "invalid" as const };
    const activeChallengerNames = await getActiveChallengerNameSetInScope(tx, objective.teamId, recruitMembers);
    if (recruitMembers.some((member) => !activeChallengerNames.has(member))) return { status: "invalid" as const };
    const assignedChallengers = uniqueMembers([...(objective.assignedChallengers ?? []), ...recruitMembers]).filter((member) => !currentChallengers.includes(member));
    if (assignedChallengers.length === 0) return { status: "invalid" as const };
    await tx
      .update(objectives)
      .set({
        assignedChallengers,
        flowStatus: objectiveFlowStatusAfterRecruitment({
          currentFlowStatus: objective.flowStatus,
          hasAcceptedChallengers: currentChallengers.length > 0,
        }),
        updatedAt: today(),
        updatedBy: actorId,
      })
      .where(eq(objectives.id, objectiveId));
    return {
      status: "ok" as const,
      scope: runtimeScope(objective.teamId),
      notification: {
        actorUserId: actorId,
        memberNames: recruitMembers,
        objectiveId,
        objectiveTitle: objective.title,
        teamId: objective.teamId,
      },
    };
  });

  if (recruitedResult.status === "ok") {
    await notifyMembersOfRecruitment(recruitedResult.notification);
    publishObjectiveInvalidation({
      actorUserId: actorId,
      reason: "objective.challenge.recruitment.changed",
      objectiveId,
      teamId: runtimeScopeStorageId(recruitedResult.scope),
    });
  }

  return recruitedResult.status === "ok" ? objectiveOutcome(objectiveId, recruitedResult.scope) : recruitedResult;
}

export async function freezeObjectiveAfterReestimate(objectiveId: string, actorId: string): Promise<ObjectiveFlowMutationOutcome> {
  const frozen = await db.transaction(async (tx) => {
    const [objective] = await tx.select().from(objectives).where(eq(objectives.id, objectiveId)).limit(1).for("update");
    if (!objective) return { status: "notFound" as const };
    if (!canFreezeObjectiveByFlow(objective)) return { status: "invalid" as const };

    const objectiveResults = await tx
      .select({ id: results.id, uncertaintyLevel: results.uncertaintyLevel, uncertaintyScore: results.uncertaintyScore })
      .from(results)
      .where(eq(results.objectiveId, objectiveId));
    if (objectiveResults.length === 0) return { status: "invalid" as const };
    if (hasUncalibratedResultPoints(objectiveResults)) return { status: "invalid" as const };

    const decidedAt = nowIso();
    const challengeApplications = (objective.challengeApplications ?? []).map((application) =>
      application.status === "pending"
        ? { ...application, status: "declined" as const, decidedAt, decidedBy: actorId }
        : application,
    );

    await tx
      .update(objectives)
      .set({
        assignedChallengers: [],
        challengeApplications,
        flowStatus: objectiveLifecycleTransitions.freezeAfterReestimate.to,
        stage: objectiveLifecycleTransitions.freezeAfterReestimate.stage,
        confirmedAt: decidedAt,
        updatedAt: today(),
        updatedBy: actorId,
      })
      .where(eq(objectives.id, objectiveId));

    return { status: "ok" as const, scope: runtimeScope(objective.teamId) };
  });

  if (frozen.status === "ok") {
    publishObjectiveInvalidation({
      actorUserId: actorId,
      reason: "objective.lifecycle.changed",
      objectiveId,
      teamId: runtimeScopeStorageId(frozen.scope),
    });
    return objectiveOutcome(objectiveId, frozen.scope);
  }

  return frozen;
}

export async function canEditResultDuringReestimate(resultId: string, member: string): Promise<boolean> {
  const actorName = member.trim();
  if (!actorName) return false;

  const [row] = await db
    .select({
      flowStatus: objectives.flowStatus,
      challengers: objectives.challengers,
      confirmationDueAt: objectives.confirmationDueAt,
    })
    .from(results)
    .innerJoin(objectives, eq(objectives.id, results.objectiveId))
    .where(eq(results.id, resultId))
    .limit(1);

  return Boolean(
    row &&
      isObjectiveReestimateWindowOpen(row) &&
      uniqueMembers(row.challengers ?? []).includes(actorName),
  );
}

export type ObjectiveStateMutationAccess =
  | { status: "allowed"; flowStatus: Objective["flowStatus"] }
  | { status: "locked"; flowStatus: Objective["flowStatus"] }
  | { status: "notFound" };

export async function canMutateObjectiveResults(objectiveId: string): Promise<ObjectiveStateMutationAccess> {
  const [objective] = await db
    .select({ flowStatus: objectives.flowStatus })
    .from(objectives)
    .where(eq(objectives.id, objectiveId))
    .limit(1);
  if (!objective) {
    return { status: "notFound" };
  }

  return canMutateObjectiveResultsByFlow(objective)
    ? { status: "allowed", flowStatus: objective.flowStatus }
    : { status: "locked", flowStatus: objective.flowStatus };
}

export async function canMutateResult(resultId: string): Promise<ObjectiveStateMutationAccess> {
  const [row] = await db
    .select({ flowStatus: objectives.flowStatus })
    .from(results)
    .innerJoin(objectives, eq(objectives.id, results.objectiveId))
    .where(eq(results.id, resultId))
    .limit(1);
  if (!row) {
    return { status: "notFound" };
  }

  return canMutateObjectiveResultsByFlow(row)
    ? { status: "allowed", flowStatus: row.flowStatus }
    : { status: "locked", flowStatus: row.flowStatus };
}

export async function canDeleteObjective(objectiveId: string): Promise<ObjectiveStateMutationAccess> {
  const [objective] = await db
    .select({ flowStatus: objectives.flowStatus })
    .from(objectives)
    .where(eq(objectives.id, objectiveId))
    .limit(1);
  if (!objective) {
    return { status: "notFound" };
  }

  return canDeleteObjectiveByFlow(objective)
    ? { status: "allowed", flowStatus: objective.flowStatus }
    : { status: "locked", flowStatus: objective.flowStatus };
}

export async function canEditObjectiveResultsDuringReestimate(objectiveId: string, member: string, scope?: RuntimeScope | null): Promise<boolean> {
  const actorName = member.trim();
  if (!actorName) return false;
  const storageScopeId = scope ? runtimeScopeStorageId(scope) : "";

  const [objective] = await db
    .select({
      flowStatus: objectives.flowStatus,
      challengers: objectives.challengers,
      confirmationDueAt: objectives.confirmationDueAt,
      teamId: objectives.teamId,
    })
    .from(objectives)
    .where(eq(objectives.id, objectiveId))
    .limit(1);

  return (
    objective &&
    isObjectiveReestimateWindowOpen(objective) &&
    (!storageScopeId || objective.teamId === storageScopeId) &&
    uniqueMembers(objective.challengers ?? []).includes(actorName)
  );
}

export type CreateFeedbackInput = Pick<
  Feedback,
  "phenomenon" | "causeCategories" | "impact" | "linkedResultId" | "suggestedAdjustment" | "source" | "owner"
>;
export type CreateFeedbackOutcome =
  | { status: "ok"; feedback: Feedback }
  | { status: "notFound" }
  | { status: "invalidOwner" };

export async function canCreateFeedbackForResult(
  resultId: string,
  actor: Pick<CommentActor, "name" | "role" | "scope">,
): Promise<ObjectiveWorkItemMutationOutcome> {
  const storageScopeId = actor.scope ? runtimeScopeStorageId(actor.scope) : "";
  const [target] = await db
    .select({ objectiveId: results.objectiveId, challengers: objectives.challengers, teamId: results.teamId })
    .from(results)
    .innerJoin(objectives, eq(objectives.id, results.objectiveId))
    .where(eq(results.id, resultId))
    .limit(1);
  if (!target) {
    return "notFound";
  }

  if (storageScopeId && target.teamId !== storageScopeId) {
    return "notFound";
  }

  if (actor.role === "admin") {
    return "allowed";
  }

  const member = actor.name.trim();
  return member && uniqueMembers(target.challengers ?? []).includes(member)
    ? "allowed"
    : "forbidden";
}

export async function createFeedback(input: CreateFeedbackInput, actorId: string): Promise<CreateFeedbackOutcome> {
  const [result] = await db.select().from(results).where(eq(results.id, input.linkedResultId)).limit(1);
  if (!result) {
    return { status: "notFound" };
  }

  const owner = input.owner.trim();
  const activeOwnerNames = await getActiveMemberNameSetInScope(result.teamId, [owner]);
  if (!activeOwnerNames.has(owner)) {
    return { status: "invalidOwner" };
  }

  const id = makeId("fb");
  const now = today();
  await db.transaction(async (tx) => {
    await tx.insert(feedback).values({
      id,
      teamId: result.teamId,
      phenomenon: input.phenomenon,
      impact: input.impact,
      linkedObjectiveId: result.objectiveId,
      linkedResultId: result.id,
      suggestedAdjustment: input.suggestedAdjustment,
      source: input.source,
      status: "New",
      owner,
      createdAt: now,
      updatedAt: now,
      createdBy: actorId,
      updatedBy: actorId,
    });

    const categories = input.causeCategories.map((category, index) => ({ feedbackId: id, category, sortOrder: index }));
    if (categories.length > 0) {
      await tx.insert(feedbackCauseCategories).values(categories);
    }
  });

  publishOrfDataInvalidation({
    actorUserId: actorId,
    models: ["taskManagement"],
    reason: "feedback.changed",
    target: { id, type: "feedback" },
    teamId: result.teamId,
  });

  const data = await getTaskManagementData({ scope: runtimeScope(result.teamId) });
  const item = data.feedback.find((entry) => entry.id === id);
  return item ? { status: "ok", feedback: item } : { status: "notFound" };
}

type FeedbackStatusActor = { id: string; name: string; role: "admin" | "member"; scope?: RuntimeScope | null };

export type FeedbackStatusUpdateResult = { status: "ok" } | { status: "notFound" } | { status: "forbidden" };

function canManageFeedbackStatus(
  item: { owner: string; createdBy: string | null },
  actor: FeedbackStatusActor,
) {
  return actor.role === "admin" || item.createdBy === actor.id || item.owner === actor.name;
}

export async function updateFeedbackStatus(
  feedbackId: string,
  status: FeedbackStatus,
  actor: FeedbackStatusActor,
): Promise<FeedbackStatusUpdateResult> {
  const storageScopeId = actor.scope ? runtimeScopeStorageId(actor.scope) : "";
  const [target] = await db
    .select({ id: feedback.id, owner: feedback.owner, createdBy: feedback.createdBy, teamId: feedback.teamId })
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

export async function updateResultConfidence(resultId: string, confidence: number, actorId: string): Promise<boolean> {
  const updatedResult = await db.transaction(async (tx) => {
    const [target] = await tx
      .select({ flowStatus: objectives.flowStatus, teamId: results.teamId })
      .from(results)
      .innerJoin(objectives, eq(objectives.id, results.objectiveId))
      .where(eq(results.id, resultId))
      .limit(1)
      .for("update");
    if (!target || !canMutateObjectiveResultsByFlow(target)) {
      return false;
    }

    const updated = await tx
      .update(results)
      .set({ confidence, updatedAt: today(), updatedBy: actorId })
      .where(eq(results.id, resultId))
      .returning({ id: results.id });
    return updated.length > 0 ? { teamId: target.teamId } : null;
  });

  if (!updatedResult) {
    return false;
  }

  publishOrfDataInvalidation({
    actorUserId: actorId,
    models: ["taskManagement", "bountyHall"],
    reason: "result.changed",
    target: { id: resultId, type: "result" },
    teamId: updatedResult.teamId,
  });
  return true;
}

export async function updateResultUncertaintyLevel(resultId: string, uncertaintyLevel: UncertaintyLevel, actorId: string): Promise<boolean> {
  const updatedResult = await db.transaction(async (tx) => {
    const [target] = await tx
      .select({ flowStatus: objectives.flowStatus, teamId: results.teamId })
      .from(results)
      .innerJoin(objectives, eq(objectives.id, results.objectiveId))
      .where(eq(results.id, resultId))
      .limit(1)
      .for("update");
    if (!target || !canMutateObjectiveResultsByFlow(target)) {
      return false;
    }

    const updated = await tx
      .update(results)
      .set({ uncertaintyLevel, uncertaintyScore: uncertaintyScore(uncertaintyLevel), updatedAt: today(), updatedBy: actorId })
      .where(eq(results.id, resultId))
      .returning({ id: results.id });
    return updated.length > 0 ? { teamId: target.teamId } : null;
  });

  if (!updatedResult) {
    return false;
  }

  publishOrfDataInvalidation({
    actorUserId: actorId,
    models: ["taskManagement", "bountyHall"],
    reason: "result.changed",
    target: { id: resultId, type: "result" },
    teamId: updatedResult.teamId,
  });
  return true;
}

export async function proposeResultUpdate(
  input: { resultId: string; title: string; reason: string; feedbackId?: string },
  actor: { id: string; name: string },
): Promise<boolean> {
  const nextTitle = input.title.trim();
  const reason = input.reason.trim();
  if (!nextTitle || !reason) {
    return false;
  }

  const updatedResult = await db.transaction(async (tx) => {
    const [target] = await tx
      .select({
        id: results.id,
        teamId: results.teamId,
        flowStatus: objectives.flowStatus,
      })
      .from(results)
      .innerJoin(objectives, eq(objectives.id, results.objectiveId))
      .where(eq(results.id, input.resultId))
      .limit(1)
      .for("update");
    if (!target || !canMutateObjectiveResultsByFlow(target)) {
      return false;
    }

    if (input.feedbackId) {
      const [linkedFeedback] = await tx
        .select({ id: feedback.id, teamId: feedback.teamId, linkedResultId: feedback.linkedResultId })
        .from(feedback)
        .where(eq(feedback.id, input.feedbackId))
        .limit(1);
      if (!linkedFeedback || linkedFeedback.teamId !== target.teamId || linkedFeedback.linkedResultId !== target.id) {
        return null;
      }
    }

    const updated = await tx
      .update(results)
      .set({ title: nextTitle, updatedAt: today(), updatedBy: actor.id })
      .where(eq(results.id, input.resultId))
      .returning({ id: results.id });
    if (updated.length === 0) {
      return null;
    }

    await tx
      .update(commentThreads)
      .set({ targetTitle: nextTitle, updatedAt: nowIso() })
      .where(and(eq(commentThreads.targetType, "result"), eq(commentThreads.targetId, input.resultId)));

    if (input.feedbackId) {
      await tx
        .update(feedback)
        .set({ status: "Result Updated", updatedAt: today(), updatedBy: actor.id })
        .where(eq(feedback.id, input.feedbackId));
    }

    const threadId = makeId("cthread");
    const messageId = makeId("cmsg");
    const now = nowIso();
    await tx.insert(commentThreads).values({
      id: threadId,
      teamId: target.teamId,
      targetType: "result",
      targetId: target.id,
      targetTitle: nextTitle,
      status: "open",
      createdBy: actor.id,
      createdAt: now,
      updatedAt: now,
    });
    await tx.insert(commentMessages).values({
      id: messageId,
      threadId,
      authorUserId: actor.id,
      author: actor.name,
      body: `指标更新：${nextTitle}\n原因：${reason}`,
      createdAt: now,
      parentMessageId: null,
      replyToMessageId: null,
      replyToAuthor: null,
      sortOrder: 0,
    });

    return { teamId: target.teamId };
  });

  if (!updatedResult) {
    return false;
  }

  publishOrfDataInvalidation({
    actorUserId: actor.id,
    models: ["taskManagement", "bountyHall"],
    reason: "result.changed",
    target: { id: input.resultId, type: "result" },
    teamId: updatedResult.teamId,
  });
  return true;
}

export interface CreateCommentInput {
  targetType: CommentTargetType;
  targetId: string;
  targetTitle: string;
  body: string;
  parentMessageId?: string;
  replyToMessageId?: string;
  replyToAuthor?: string;
}

type CommentTarget = {
  objectiveId: string;
  storageScopeId: string;
  title: string;
};

export type ObjectiveWorkItemTarget =
  | { type: "objective"; id: string }
  | { type: "result"; id: string }
  | { type: "task"; id: string }
  | { type: "subtask"; id: string; taskId?: string };

export type ObjectiveWorkItemMutationOutcome = "allowed" | "forbidden" | "notFound";

export async function resolveObjectiveIdForWorkItem(target: ObjectiveWorkItemTarget): Promise<string | null> {
  if (target.type === "objective") {
    const [objective] = await db.select({ objectiveId: objectives.id }).from(objectives).where(eq(objectives.id, target.id)).limit(1);
    return objective?.objectiveId ?? null;
  }

  if (target.type === "result") {
    const [result] = await db.select({ objectiveId: results.objectiveId }).from(results).where(eq(results.id, target.id)).limit(1);
    return result?.objectiveId ?? null;
  }

  if (target.type === "task") {
    const [task] = await db.select({ objectiveId: tasks.linkedObjectiveId }).from(tasks).where(eq(tasks.id, target.id)).limit(1);
    return task?.objectiveId ?? null;
  }

  const conditions = target.taskId
    ? and(eq(taskChecklistItems.id, target.id), eq(taskChecklistItems.taskId, target.taskId))
    : eq(taskChecklistItems.id, target.id);
  const [item] = await db
    .select({ objectiveId: tasks.linkedObjectiveId })
    .from(taskChecklistItems)
    .innerJoin(tasks, eq(tasks.id, taskChecklistItems.taskId))
    .where(conditions)
    .limit(1);
  return item?.objectiveId ?? null;
}

export async function resolveRuntimeScopeForWorkItem(target: ObjectiveWorkItemTarget): Promise<RuntimeScope | null> {
  if (target.type === "objective") {
    const [objective] = await db.select({ teamId: objectives.teamId }).from(objectives).where(eq(objectives.id, target.id)).limit(1);
    return storageScope(objective?.teamId);
  }

  if (target.type === "result") {
    const [result] = await db.select({ teamId: results.teamId }).from(results).where(eq(results.id, target.id)).limit(1);
    return storageScope(result?.teamId);
  }

  if (target.type === "task") {
    const [task] = await db.select({ teamId: tasks.teamId }).from(tasks).where(eq(tasks.id, target.id)).limit(1);
    return storageScope(task?.teamId);
  }

  const conditions = target.taskId
    ? and(eq(taskChecklistItems.id, target.id), eq(taskChecklistItems.taskId, target.taskId))
    : eq(taskChecklistItems.id, target.id);
  const [item] = await db
    .select({ teamId: tasks.teamId })
    .from(taskChecklistItems)
    .innerJoin(tasks, eq(tasks.id, taskChecklistItems.taskId))
    .where(conditions)
    .limit(1);
  return storageScope(item?.teamId);
}

export async function resolveRuntimeScopeForFeedback(feedbackId: string): Promise<RuntimeScope | null> {
  const [target] = await db.select({ teamId: feedback.teamId }).from(feedback).where(eq(feedback.id, feedbackId)).limit(1);
  return storageScope(target?.teamId);
}

export async function canMutateObjectiveWorkItem(
  actor: Pick<CommentActor, "name" | "role" | "scope">,
  objectiveId: string,
): Promise<ObjectiveWorkItemMutationOutcome> {
  const storageScopeId = actor.scope ? runtimeScopeStorageId(actor.scope) : "";
  const [objective] = await db
    .select({ challengers: objectives.challengers, flowStatus: objectives.flowStatus, teamId: objectives.teamId })
    .from(objectives)
    .where(eq(objectives.id, objectiveId))
    .limit(1);
  if (!objective) {
    return "notFound";
  }

  if (storageScopeId && objective.teamId !== storageScopeId) {
    return "notFound";
  }

  if (!canMutateObjectiveWorkItemsByFlow(objective)) {
    return "forbidden";
  }

  if (actor.role === "admin") {
    return "allowed";
  }

  // Task and subtask maintenance is shared at Objective scope. Task createdBy
  // remains audit metadata and must not become a private ownership gate.
  const member = actor.name.trim();
  return member && uniqueMembers(objective.challengers ?? []).includes(member)
    ? "allowed"
    : "forbidden";
}

async function canMutateObjectiveComment(
  actor: CommentActor,
  objectiveId: string,
): Promise<ObjectiveWorkItemMutationOutcome> {
  const storageScopeId = actor.scope ? runtimeScopeStorageId(actor.scope) : "";
  const [objective] = await db
    .select({ challengers: objectives.challengers, flowStatus: objectives.flowStatus, teamId: objectives.teamId })
    .from(objectives)
    .where(eq(objectives.id, objectiveId))
    .limit(1);
  if (!objective) {
    return "notFound";
  }

  if (storageScopeId && objective.teamId !== storageScopeId) {
    return "notFound";
  }

  if (!canMutateObjectiveCommentsByFlow(objective)) {
    return "forbidden";
  }

  if (actor.role === "admin" || actor.canManageAllComments === true) {
    return "allowed";
  }

  const member = actor.name.trim();
  return member &&
    canMutateObjectiveCommentsAsChallengerByFlow(objective) &&
    uniqueMembers(objective.challengers ?? []).includes(member)
    ? "allowed"
    : "forbidden";
}

async function canReadObjectiveComment(
  actor: CommentActor,
  objectiveId: string,
): Promise<ObjectiveWorkItemMutationOutcome> {
  const storageScopeId = actor.scope ? runtimeScopeStorageId(actor.scope) : "";
  const [objective] = await db
    .select({
      assignedChallengers: objectives.assignedChallengers,
      challengers: objectives.challengers,
      teamId: objectives.teamId,
    })
    .from(objectives)
    .where(eq(objectives.id, objectiveId))
    .limit(1);
  if (!objective) {
    return "notFound";
  }

  if (storageScopeId && objective.teamId !== storageScopeId) {
    return "notFound";
  }

  if (actor.role === "admin" || actor.canManageAllComments === true) {
    return "allowed";
  }

  const member = actor.name.trim();
  const participants = uniqueMembers([...(objective.challengers ?? []), ...(objective.assignedChallengers ?? [])]);
  return member && participants.includes(member) ? "allowed" : "forbidden";
}

async function resolveCommentTarget(targetType: CommentTargetType, targetId: string): Promise<CommentTarget | null> {
  if (targetType === "objective") {
    const [target] = await db
      .select({ objectiveId: objectives.id, teamId: objectives.teamId, title: objectives.title })
      .from(objectives)
      .where(eq(objectives.id, targetId))
      .limit(1);
    return target ? { objectiveId: target.objectiveId, storageScopeId: target.teamId, title: target.title } : null;
  }

  if (targetType === "result") {
    const [target] = await db
      .select({ objectiveId: results.objectiveId, teamId: results.teamId, title: results.title })
      .from(results)
      .where(eq(results.id, targetId))
      .limit(1);
    return target ? { objectiveId: target.objectiveId, storageScopeId: target.teamId, title: target.title } : null;
  }

  if (targetType === "task") {
    const [target] = await db
      .select({ objectiveId: tasks.linkedObjectiveId, teamId: tasks.teamId, title: tasks.title })
      .from(tasks)
      .where(eq(tasks.id, targetId))
      .limit(1);
    return target ? { objectiveId: target.objectiveId, storageScopeId: target.teamId, title: target.title } : null;
  }

  const [target] = await db
    .select({ objectiveId: tasks.linkedObjectiveId, teamId: tasks.teamId, title: taskChecklistItems.label })
    .from(taskChecklistItems)
    .innerJoin(tasks, eq(tasks.id, taskChecklistItems.taskId))
    .where(eq(taskChecklistItems.id, targetId))
    .limit(1);
  return target ? { objectiveId: target.objectiveId, storageScopeId: target.teamId, title: target.title } : null;
}

async function getCommentThread(threadId: string): Promise<CommentThread | null> {
  const [thread] = await db.select().from(commentThreads).where(eq(commentThreads.id, threadId)).limit(1);
  if (!thread) {
    return null;
  }

  const messages = await db.select().from(commentMessages).where(eq(commentMessages.threadId, thread.id));
  const messageIds = messages.map((message) => message.id);
  const attachmentRows =
    messageIds.length > 0
      ? await db.select().from(commentAttachments).where(inArray(commentAttachments.messageId, messageIds))
      : [];
  const authorAvatarUrls = await getUserAvatarUrlMap(messages.map((message) => message.authorUserId).filter((userId): userId is string => Boolean(userId)));
  const attachmentsByMessage = groupCommentAttachmentsByMessage(attachmentRows);
  return {
    id: thread.id,
    targetType: thread.targetType,
    targetId: thread.targetId,
    targetTitle: thread.targetTitle,
    status: thread.status,
    createdBy: thread.createdBy,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    messages: messages
      .sort((left, right) => left.sortOrder - right.sortOrder || left.createdAt.localeCompare(right.createdAt))
      .map((message) => ({
        id: message.id,
        author: message.author,
        authorUserId: optional(message.authorUserId),
        authorAvatarUrl: message.authorUserId ? authorAvatarUrls.get(message.authorUserId) ?? null : null,
        body: message.body,
        attachments: attachmentsByMessage.get(message.id) ?? [],
        createdAt: message.createdAt,
        parentMessageId: optional(message.parentMessageId),
        replyToMessageId: optional(message.replyToMessageId),
        replyToAuthor: optional(message.replyToAuthor),
      })),
  };
}

function canManageComment(actor: CommentActor, ownerUserId: string) {
  return actor.role === "admin" || actor.canManageAllComments === true || actor.id === ownerUserId;
}

export async function listCommentMentionableUsers(
  input: Pick<UploadCommentAttachmentInput, "targetId" | "targetType">,
  actor: CommentActor,
): Promise<CommentMentionableUsersOutcome> {
  const target = await resolveCommentTarget(input.targetType, input.targetId);
  if (!target) {
    return { status: "notFound" };
  }

  const access = await canMutateObjectiveComment(actor, target.objectiveId);
  if (access !== "allowed") {
    return { status: access === "notFound" ? "notFound" : "forbidden" };
  }

  const scopedUsers = await getScopedUsers(runtimeScope(target.storageScopeId));
  return {
    status: "ok",
    users: scopedUsers.filter((user) => user.status === "active"),
  };
}

export type UploadCommentAttachmentInput = {
  body: Buffer;
  fileName: string;
  mimeType: string;
  targetId: string;
  targetType: CommentTargetType;
};

export type CommentAttachmentUploadOutcome =
  | { status: "ok"; attachment: CommentAttachment; markdown: string }
  | { status: "notFound" }
  | { status: "forbidden" }
  | { status: "invalid" }
  | { status: "tooLarge" }
  | { status: "unsupported" };

export type CommentAttachmentContentOutcome =
  | { status: "ok"; body: Readable; contentLength?: number; contentType: string }
  | { status: "notFound" }
  | { status: "forbidden" };

export async function uploadCommentAttachment(
  input: UploadCommentAttachmentInput,
  actor: CommentActor,
): Promise<CommentAttachmentUploadOutcome> {
  if (!input.body.byteLength || !input.fileName.trim()) {
    return { status: "invalid" };
  }

  await deleteExpiredPendingCommentAttachments().catch(() => 0);

  const target = await resolveCommentTarget(input.targetType, input.targetId);
  if (!target) {
    return { status: "notFound" };
  }
  const access = await canMutateObjectiveComment(actor, target.objectiveId);
  if (access !== "allowed") {
    return { status: access === "notFound" ? "notFound" : "forbidden" };
  }

  const validation = validateImageUpload({ buffer: input.body, contentType: input.mimeType });
  if (validation.status !== "ok") {
    return { status: validation.status };
  }

  const attachmentId = makeCommentAttachmentId();
  const createdAt = nowIso();
  const objectKey = commentAttachmentObjectKey({
    attachmentId,
    extension: validation.metadata.extension,
    storageScopeId: target.storageScopeId,
    targetId: input.targetId,
    targetType: input.targetType,
  });
  const fileName = sanitizeFileName(input.fileName, validation.metadata.extension);

  await objectStorage.putObject({
    body: input.body,
    contentLength: input.body.byteLength,
    contentType: validation.metadata.mimeType,
    key: objectKey,
  });

  try {
    const [row] = await db
      .insert(commentAttachments)
      .values({
        id: attachmentId,
        teamId: target.storageScopeId,
        targetType: input.targetType,
        targetId: input.targetId,
        messageId: null,
        objectKey,
        fileName,
        mimeType: validation.metadata.mimeType,
        fileSize: input.body.byteLength,
        width: validation.metadata.width ?? null,
        height: validation.metadata.height ?? null,
        createdBy: actor.id,
        createdAt,
        attachedAt: null,
        expiresAt: pendingCommentAttachmentExpiresAt(createdAt),
      })
      .returning();

    return {
      status: "ok",
      attachment: commentAttachmentDto(row),
      markdown: `![${fileName}](orf-attachment:${attachmentId})`,
    };
  } catch (error) {
    await deleteStoredCommentAttachmentObjects([
      {
        id: attachmentId,
        teamId: target.storageScopeId,
        targetType: input.targetType,
        targetId: input.targetId,
        messageId: null,
        objectKey,
        fileName,
        mimeType: validation.metadata.mimeType,
        fileSize: input.body.byteLength,
        width: validation.metadata.width ?? null,
        height: validation.metadata.height ?? null,
        createdBy: actor.id,
        createdAt,
        attachedAt: null,
        expiresAt: pendingCommentAttachmentExpiresAt(createdAt),
      },
    ]);
    throw error;
  }
}

export async function getCommentAttachmentContent(
  attachmentId: string,
  actor: CommentActor,
): Promise<CommentAttachmentContentOutcome> {
  const [attachment] = await db.select().from(commentAttachments).where(eq(commentAttachments.id, attachmentId)).limit(1);
  if (!attachment) {
    return { status: "notFound" };
  }

  const target = await resolveCommentTarget(attachment.targetType, attachment.targetId);
  if (!target) {
    return { status: "notFound" };
  }
  const access = await canReadObjectiveComment(actor, target.objectiveId);
  if (access !== "allowed") {
    return { status: access === "notFound" ? "notFound" : "forbidden" };
  }

  const stored = await objectStorage.getObject(attachment.objectKey);
  if (!stored) {
    return { status: "notFound" };
  }

  return {
    status: "ok",
    body: stored.body,
    contentLength: stored.contentLength,
    contentType: stored.contentType ?? attachment.mimeType,
  };
}

export async function createComment(input: CreateCommentInput, actor: CommentActor): Promise<CommentMutationOutcome> {
  const body = input.body.trim();
  if (!body) {
    return { status: "invalid" };
  }

  const target = await resolveCommentTarget(input.targetType, input.targetId);
  if (!target) {
    return { status: "notFound" };
  }
  const access = await canMutateObjectiveComment(actor, target.objectiveId);
  if (access === "notFound") {
    return { status: "notFound" };
  }
  if (access === "forbidden") {
    return { status: "forbidden" };
  }

  const targetTitle = target.title;
  const createdAt = nowIso();
  const attachmentIds = extractCommentAttachmentIds(body);
  const createdComment = await db.transaction(async (tx) => {
    const [lockedObjective] = await tx
      .select({ id: objectives.id })
      .from(objectives)
      .where(eq(objectives.id, target.objectiveId))
      .limit(1)
      .for("update");
    if (!lockedObjective) {
      return null;
    }

    const arePendingAttachmentsAvailable = async () => {
      if (attachmentIds.length === 0) {
        return true;
      }

      const rows = await tx
        .select({ id: commentAttachments.id })
        .from(commentAttachments)
        .where(
          and(
            inArray(commentAttachments.id, attachmentIds),
            eq(commentAttachments.createdBy, actor.id),
            eq(commentAttachments.targetType, input.targetType),
            eq(commentAttachments.targetId, input.targetId),
            isNull(commentAttachments.messageId),
            gt(commentAttachments.expiresAt, createdAt),
          ),
        );
      return rows.length === attachmentIds.length;
    };
    const bindMessageAttachments = async (messageId: string) => {
      if (attachmentIds.length === 0) {
        return;
      }

      await tx
        .update(commentAttachments)
        .set({ attachedAt: createdAt, messageId })
        .where(inArray(commentAttachments.id, attachmentIds));
    };

    if (input.parentMessageId) {
      const [parent] = await tx
        .select({ threadId: commentMessages.threadId })
        .from(commentMessages)
        .innerJoin(commentThreads, eq(commentThreads.id, commentMessages.threadId))
        .where(
          and(
            eq(commentMessages.id, input.parentMessageId),
            eq(commentThreads.targetType, input.targetType),
            eq(commentThreads.targetId, input.targetId),
          ),
        )
        .limit(1);

      if (!parent) {
        return null;
      }

      let replyToMessageId: string | null = null;
      let replyToAuthor: string | null = null;
      if (input.replyToMessageId) {
        const [replyTarget] = await tx
          .select({ id: commentMessages.id, author: commentMessages.author })
          .from(commentMessages)
          .where(and(eq(commentMessages.threadId, parent.threadId), eq(commentMessages.id, input.replyToMessageId)))
          .limit(1);
        if (!replyTarget) {
          return null;
        }
        replyToMessageId = replyTarget.id;
        replyToAuthor = replyTarget.author;
      }

      if (!(await arePendingAttachmentsAvailable())) {
        return null;
      }

      const messageRows = await tx
        .select({ sortOrder: commentMessages.sortOrder })
        .from(commentMessages)
        .where(eq(commentMessages.threadId, parent.threadId));
      const sortOrder = messageRows.reduce((max, message) => Math.max(max, message.sortOrder), -1) + 1;
      const nextMessageId = makeId("cmsg");

      await tx.insert(commentMessages).values({
        id: nextMessageId,
        threadId: parent.threadId,
        authorUserId: actor.id,
        author: actor.name,
        body,
        createdAt,
        parentMessageId: input.parentMessageId,
        replyToMessageId,
        replyToAuthor,
        sortOrder,
      });
      await bindMessageAttachments(nextMessageId);
      await tx.update(commentThreads).set({ targetTitle, updatedAt: createdAt }).where(eq(commentThreads.id, parent.threadId));
      return { messageId: nextMessageId, threadId: parent.threadId };
    }

    const [openThread] = await tx
      .select({ id: commentThreads.id })
      .from(commentThreads)
      .where(and(eq(commentThreads.targetType, input.targetType), eq(commentThreads.targetId, input.targetId), eq(commentThreads.status, "open")))
      .limit(1);
    const nextThreadId = openThread?.id ?? makeId("cthread");

    if (!(await arePendingAttachmentsAvailable())) {
      return null;
    }

    if (!openThread) {
      await tx.insert(commentThreads).values({
        id: nextThreadId,
        teamId: target.storageScopeId,
        targetType: input.targetType,
        targetId: input.targetId,
        targetTitle,
        status: "open",
        createdBy: actor.id,
        createdAt,
        updatedAt: createdAt,
      });
    } else {
      await tx.update(commentThreads).set({ targetTitle, updatedAt: createdAt }).where(eq(commentThreads.id, nextThreadId));
    }

    const messageRows = await tx
      .select({ sortOrder: commentMessages.sortOrder })
      .from(commentMessages)
      .where(eq(commentMessages.threadId, nextThreadId));
    const sortOrder = messageRows.reduce((max, message) => Math.max(max, message.sortOrder), -1) + 1;
    const nextMessageId = makeId("cmsg");

    await tx.insert(commentMessages).values({
      id: nextMessageId,
      threadId: nextThreadId,
      authorUserId: actor.id,
      author: actor.name,
      body,
      createdAt,
      parentMessageId: null,
      replyToMessageId: null,
      replyToAuthor: null,
      sortOrder,
    });
    await bindMessageAttachments(nextMessageId);

    return { messageId: nextMessageId, threadId: nextThreadId };
  });

  if (!createdComment) {
    return { status: "notFound" };
  }

  await notifyMentionedUsersOfComment({
    actorName: actor.name,
    actorUserId: actor.id,
    body,
    commentMessageId: createdComment.messageId,
    commentThreadId: createdComment.threadId,
    targetId: input.targetId,
    targetTitle,
    targetType: input.targetType,
    teamId: target.storageScopeId,
  });

  publishOrfDataInvalidation({
    actorUserId: actor.id,
    models: ["taskManagement"],
    reason: "comment.changed",
    target: { id: createdComment.threadId, type: "comment" },
    teamId: target.storageScopeId,
  });

  return { status: "ok", thread: (await getCommentThread(createdComment.threadId)) ?? undefined };
}

export async function updateCommentThreadStatus(
  threadId: string,
  status: CommentStatus,
  actor: CommentActor,
): Promise<CommentMutationOutcome> {
  const [thread] = await db.select().from(commentThreads).where(eq(commentThreads.id, threadId)).limit(1);
  if (!thread) {
    return { status: "notFound" };
  }

  const target = await resolveCommentTarget(thread.targetType, thread.targetId);
  if (!target) {
    return { status: "notFound" };
  }
  const access = await canMutateObjectiveComment(actor, target.objectiveId);
  if (access !== "allowed") {
    return { status: access === "notFound" ? "notFound" : "forbidden" };
  }

  if (!canManageComment(actor, thread.createdBy)) {
    return { status: "forbidden" };
  }

  await db.update(commentThreads).set({ status, updatedAt: nowIso() }).where(eq(commentThreads.id, threadId));
  publishOrfDataInvalidation({
    actorUserId: actor.id,
    models: ["taskManagement"],
    reason: "comment.changed",
    target: { id: threadId, type: "comment" },
    teamId: target.storageScopeId,
  });
  return { status: "ok", thread: (await getCommentThread(threadId)) ?? undefined };
}

export async function updateCommentMessage(
  threadId: string,
  messageId: string,
  body: string,
  actor: CommentActor,
): Promise<CommentMutationOutcome> {
  const nextBody = body.trim();
  if (!nextBody) {
    return { status: "invalid" };
  }

  const [thread] = await db.select().from(commentThreads).where(eq(commentThreads.id, threadId)).limit(1);
  if (!thread) {
    return { status: "notFound" };
  }
  const target = await resolveCommentTarget(thread.targetType, thread.targetId);
  if (!target) {
    return { status: "notFound" };
  }
  const access = await canMutateObjectiveComment(actor, target.objectiveId);
  if (access !== "allowed") {
    return { status: access === "notFound" ? "notFound" : "forbidden" };
  }

  const [message] = await db
    .select({ authorUserId: commentMessages.authorUserId })
    .from(commentMessages)
    .where(and(eq(commentMessages.threadId, threadId), eq(commentMessages.id, messageId)))
    .limit(1);
  if (!message) {
    return { status: "notFound" };
  }

  if (!canManageComment(actor, message.authorUserId)) {
    return { status: "forbidden" };
  }

  const nextAttachmentIds = extractCommentAttachmentIds(nextBody);
  const existingAttachments = await db.select().from(commentAttachments).where(eq(commentAttachments.messageId, messageId));
  const existingAttachmentIds = new Set(existingAttachments.map((attachment) => attachment.id));
  const attachmentsToDelete = existingAttachments.filter((attachment) => !nextAttachmentIds.includes(attachment.id));
  const pendingAttachmentIds = nextAttachmentIds.filter((attachmentId) => !existingAttachmentIds.has(attachmentId));

  const updateResult = await db.transaction(async (tx) => {
    const updatedAt = nowIso();
    if (pendingAttachmentIds.length > 0) {
      const pendingRows = await tx
        .select({ id: commentAttachments.id })
        .from(commentAttachments)
        .where(
          and(
            inArray(commentAttachments.id, pendingAttachmentIds),
            eq(commentAttachments.createdBy, actor.id),
            eq(commentAttachments.targetType, thread.targetType),
            eq(commentAttachments.targetId, thread.targetId),
            isNull(commentAttachments.messageId),
            gt(commentAttachments.expiresAt, updatedAt),
          ),
        );
      if (pendingRows.length !== pendingAttachmentIds.length) {
        return "notFound" as const;
      }
    }

    if (attachmentsToDelete.length > 0) {
      await tx.delete(commentAttachments).where(inArray(commentAttachments.id, attachmentsToDelete.map((attachment) => attachment.id)));
    }

    if (pendingAttachmentIds.length > 0) {
      await tx
        .update(commentAttachments)
        .set({ attachedAt: updatedAt, messageId })
        .where(inArray(commentAttachments.id, pendingAttachmentIds));
    }

    await tx
      .update(commentMessages)
      .set({ body: nextBody })
      .where(and(eq(commentMessages.threadId, threadId), eq(commentMessages.id, messageId)));
    await tx.update(commentThreads).set({ updatedAt }).where(eq(commentThreads.id, threadId));
    return "ok" as const;
  });
  if (updateResult === "notFound") {
    return { status: "notFound" };
  }

  await deleteStoredCommentAttachmentObjects(attachmentsToDelete);

  publishOrfDataInvalidation({
    actorUserId: actor.id,
    models: ["taskManagement"],
    reason: "comment.changed",
    target: { id: threadId, type: "comment" },
    teamId: target.storageScopeId,
  });

  return { status: "ok", thread: (await getCommentThread(threadId)) ?? undefined };
}

export async function deleteCommentMessage(
  threadId: string,
  messageId: string,
  actor: CommentActor,
): Promise<CommentMutationOutcome> {
  const [thread] = await db.select().from(commentThreads).where(eq(commentThreads.id, threadId)).limit(1);
  if (!thread) {
    return { status: "notFound" };
  }
  const target = await resolveCommentTarget(thread.targetType, thread.targetId);
  if (!target) {
    return { status: "notFound" };
  }
  const access = await canMutateObjectiveComment(actor, target.objectiveId);
  if (access !== "allowed") {
    return { status: access === "notFound" ? "notFound" : "forbidden" };
  }

  const [message] = await db
    .select({ authorUserId: commentMessages.authorUserId })
    .from(commentMessages)
    .where(and(eq(commentMessages.threadId, threadId), eq(commentMessages.id, messageId)))
    .limit(1);
  if (!message) {
    return { status: "notFound" };
  }

  if (!canManageComment(actor, message.authorUserId)) {
    return { status: "forbidden" };
  }

  const messagesToDelete = await db
    .select({ id: commentMessages.id })
    .from(commentMessages)
    .where(
      and(
        eq(commentMessages.threadId, threadId),
        or(eq(commentMessages.id, messageId), eq(commentMessages.parentMessageId, messageId)),
      ),
    );
  const messageIdsToDelete = messagesToDelete.map((item) => item.id);
  const attachmentsToDelete =
    messageIdsToDelete.length > 0
      ? await db.select().from(commentAttachments).where(inArray(commentAttachments.messageId, messageIdsToDelete))
      : [];

  const threadRemoved = await db.transaction(async (tx) => {
    await tx
      .delete(commentMessages)
      .where(
        and(
          eq(commentMessages.threadId, threadId),
          or(eq(commentMessages.id, messageId), eq(commentMessages.parentMessageId, messageId)),
        ),
      );
    await tx
      .update(commentMessages)
      .set({ replyToMessageId: null, replyToAuthor: null })
      .where(and(eq(commentMessages.threadId, threadId), eq(commentMessages.replyToMessageId, messageId)));

    const [remaining] = await tx.select({ id: commentMessages.id }).from(commentMessages).where(eq(commentMessages.threadId, threadId)).limit(1);
    if (!remaining) {
      await tx.delete(commentThreads).where(eq(commentThreads.id, threadId));
      return true;
    }

    await tx.update(commentThreads).set({ updatedAt: nowIso() }).where(eq(commentThreads.id, threadId));
    return false;
  });
  await deleteStoredCommentAttachmentObjects(attachmentsToDelete);

  publishOrfDataInvalidation({
    actorUserId: actor.id,
    models: ["taskManagement"],
    reason: "comment.changed",
    target: { id: threadId, type: "comment" },
    teamId: target.storageScopeId,
  });

  return threadRemoved ? { status: "ok" } : { status: "ok", thread: (await getCommentThread(threadId)) ?? undefined };
}

export async function deleteExpiredPendingCommentAttachments(referenceTime = nowIso()) {
  const expiredRows = await db
    .select()
    .from(commentAttachments)
    .where(and(isNull(commentAttachments.messageId), lt(commentAttachments.expiresAt, referenceTime)));
  if (expiredRows.length === 0) {
    return 0;
  }

  await db.delete(commentAttachments).where(inArray(commentAttachments.id, expiredRows.map((row) => row.id)));
  await deleteStoredCommentAttachmentObjects(expiredRows);
  return expiredRows.length;
}

export interface SubmitObjectiveLootInput {
  body: string;
  resultClaims: LootResultClaim[];
  selfTestReportUrl?: string | null;
  selfTestReportBody?: string | null;
}

export type ObjectiveLootMutationOutcome =
  | { status: "ok"; loot: ObjectiveLoot }
  | { status: "notFound" }
  | { status: "forbidden" }
  | { status: "invalid" }
  | { status: "closed" };

export type ObjectiveTrialReviewMutationOutcome =
  | { status: "ok"; trialReview: ObjectiveTrialReview }
  | { status: "notFound" }
  | { status: "forbidden" }
  | { status: "invalid" }
  | { status: "closed" }
  | { status: "duplicate" };

type ObjectiveResultClaimsValidation =
  | { status: "ok"; resultClaims: LootResultClaim[] }
  | { status: "invalid" };

async function validateObjectiveResultClaims(objectiveId: string, resultClaims: LootResultClaim[]): Promise<ObjectiveResultClaimsValidation> {
  const objectiveResults = await db.select({ id: results.id }).from(results).where(eq(results.objectiveId, objectiveId));
  const resultIds = new Set(objectiveResults.map((result) => result.id));
  const claimsByResult = new Map<string, LootResultClaim>();

  for (const claim of resultClaims) {
    if (!resultIds.has(claim.resultId)) continue;
    const evidenceText = claim.evidenceText.trim();
    if (claim.claim !== "notClaimed" && !evidenceText) {
      return { status: "invalid" };
    }

    claimsByResult.set(claim.resultId, {
      resultId: claim.resultId,
      claim: claim.claim,
      evidenceText,
    });
  }

  if (claimsByResult.size !== resultIds.size) {
    return { status: "invalid" };
  }

  return { status: "ok", resultClaims: Array.from(claimsByResult.values()) };
}

export async function submitObjectiveLoot(
  objectiveId: string,
  input: SubmitObjectiveLootInput,
  actor: Pick<CommentActor, "id" | "name" | "role">,
): Promise<ObjectiveLootMutationOutcome> {
  const body = input.body.trim();
  if (!body) {
    return { status: "invalid" };
  }

  const [objective] = await db.select().from(objectives).where(eq(objectives.id, objectiveId)).limit(1);
  if (!objective) {
    return { status: "notFound" };
  }

  if (!canSubmitObjectiveLootByFlow(objective)) {
    return { status: "closed" };
  }

  if (actor.role !== "member" || !uniqueMembers(objective.challengers ?? []).includes(actor.name)) {
    return { status: "forbidden" };
  }

  const resultClaims = await validateObjectiveResultClaims(objectiveId, input.resultClaims);
  if (resultClaims.status === "invalid") {
    return { status: "invalid" };
  }

  const submittedAt = nowIso();
  const lootId = makeId("loot");
  const submitted = await db.transaction(async (tx) => {
    const updated = await tx
      .update(objectives)
      .set({ lootSubmittedAt: submittedAt, flowStatus: objectiveLifecycleTransitions.submitLoot.to, updatedAt: today(), updatedBy: actor.id })
      .where(and(eq(objectives.id, objectiveId), eq(objectives.flowStatus, objectiveLifecycleTransitions.submitLoot.from)))
      .returning({ id: objectives.id });
    if (updated.length === 0) {
      return false;
    }

    await tx.insert(objectiveLoot).values({
      id: lootId,
      teamId: objective.teamId,
      objectiveId: objective.id,
      submittedBy: actor.name,
      body,
      resultClaims: resultClaims.resultClaims,
      selfTestReportUrl: input.selfTestReportUrl?.trim() || null,
      selfTestReportBody: input.selfTestReportBody?.trim() || null,
      submittedAt,
    });
    return true;
  });
  if (!submitted) {
    return { status: "closed" };
  }

  await notifyAdminsOfObjectiveLoot({
    actorName: actor.name,
    actorUserId: actor.id,
    lootId,
    objectiveId: objective.id,
    objectiveTitle: objective.title,
    teamId: objective.teamId,
  });

  publishObjectiveInvalidation({
    actorUserId: actor.id,
    reason: "objective.loot.changed",
    objectiveId: objective.id,
    teamId: objective.teamId,
  });

  const data = await getTaskManagementData({ scope: runtimeScope(objective.teamId) });
  const loot = data.objectiveLoot.find((item) => item.id === lootId);
  return loot ? { status: "ok", loot } : { status: "notFound" };
}

export async function submitObjectiveTrialReview(
  objectiveId: string,
  input: SubmitObjectiveLootInput,
  actor: Pick<CommentActor, "id" | "name" | "role">,
): Promise<ObjectiveTrialReviewMutationOutcome> {
  const body = input.body.trim();
  if (!body) {
    return { status: "invalid" };
  }

  const [objective] = await db.select().from(objectives).where(eq(objectives.id, objectiveId)).limit(1);
  if (!objective) {
    return { status: "notFound" };
  }

  if (!canSubmitObjectiveLootByFlow(objective)) {
    return { status: "closed" };
  }

  if (actor.role !== "member" || !uniqueMembers(objective.challengers ?? []).includes(actor.name)) {
    return { status: "forbidden" };
  }

  const resultClaims = await validateObjectiveResultClaims(objectiveId, input.resultClaims);
  if (resultClaims.status === "invalid") {
    return { status: "invalid" };
  }

  const requestedAt = nowIso();
  const trialReviewId = makeId("trial-review");
  const created = await db.transaction(async (tx) => {
    const [lockedObjective] = await tx.select().from(objectives).where(eq(objectives.id, objectiveId)).limit(1).for("update");
    if (!lockedObjective) return { status: "notFound" as const };
    if (!canSubmitObjectiveLootByFlow(lockedObjective)) return { status: "closed" as const };

    const existing = await tx
      .select({ id: objectiveTrialReviews.id })
      .from(objectiveTrialReviews)
      .where(eq(objectiveTrialReviews.objectiveId, objectiveId))
      .limit(1);
    if (existing.length > 0) return { status: "duplicate" as const };

    await tx.insert(objectiveTrialReviews).values({
      id: trialReviewId,
      teamId: lockedObjective.teamId,
      objectiveId: lockedObjective.id,
      requestedBy: actor.name,
      body,
      resultClaims: resultClaims.resultClaims,
      selfTestReportBody: input.selfTestReportBody?.trim() || null,
      status: "requested",
      commanderFeedback: null,
      reviewedBy: null,
      reviewedAt: null,
      requestedAt,
    });

    await tx
      .update(objectives)
      .set({ updatedAt: today(), updatedBy: actor.id })
      .where(eq(objectives.id, objectiveId));

    return { status: "created" as const, teamId: lockedObjective.teamId };
  });

  if (created.status === "notFound") return { status: "notFound" };
  if (created.status === "closed") return { status: "closed" };
  if (created.status === "duplicate") return { status: "duplicate" };

  publishObjectiveInvalidation({
    actorUserId: actor.id,
    reason: "objective.trialReview.changed",
    objectiveId: objective.id,
    teamId: created.teamId,
  });

  const data = await getTaskManagementData({ scope: runtimeScope(created.teamId) });
  const trialReview = data.objectiveTrialReviews.find((item) => item.id === trialReviewId);
  return trialReview ? { status: "ok", trialReview } : { status: "notFound" };
}

export async function reviewObjectiveTrialReview(
  objectiveId: string,
  trialReviewId: string,
  input: { status: Exclude<ObjectiveTrialReviewStatus, "requested">; commanderFeedback: string },
  actorId: string,
): Promise<ObjectiveTrialReviewMutationOutcome> {
  const commanderFeedback = input.commanderFeedback.trim();
  if (!commanderFeedback) {
    return { status: "invalid" };
  }

  const reviewedAt = nowIso();
  const reviewed = await db.transaction(async (tx) => {
    const [objective] = await tx.select().from(objectives).where(eq(objectives.id, objectiveId)).limit(1).for("update");
    if (!objective) return { status: "notFound" as const };
    if (!canSubmitObjectiveLootByFlow(objective)) return { status: "closed" as const };

    const [trialReview] = await tx
      .select()
      .from(objectiveTrialReviews)
      .where(and(eq(objectiveTrialReviews.id, trialReviewId), eq(objectiveTrialReviews.objectiveId, objectiveId)))
      .limit(1);
    if (!trialReview) return { status: "notFound" as const };
    if (trialReview.status !== "requested") return { status: "closed" as const };

    await tx
      .update(objectiveTrialReviews)
      .set({
        status: input.status,
        commanderFeedback,
        reviewedBy: actorId,
        reviewedAt,
      })
      .where(eq(objectiveTrialReviews.id, trialReviewId));

    await tx
      .update(objectives)
      .set({ updatedAt: today(), updatedBy: actorId })
      .where(eq(objectives.id, objectiveId));

    return { status: "reviewed" as const, teamId: objective.teamId };
  });

  if (reviewed.status === "notFound") return { status: "notFound" };
  if (reviewed.status === "closed") return { status: "closed" };

  publishObjectiveInvalidation({
    actorUserId: actorId,
    reason: "objective.trialReview.changed",
    objectiveId,
    teamId: reviewed.teamId,
  });

  const data = await getTaskManagementData({ scope: runtimeScope(reviewed.teamId) });
  const trialReview = data.objectiveTrialReviews.find((item) => item.id === trialReviewId);
  return trialReview ? { status: "ok", trialReview } : { status: "notFound" };
}

export interface ReviewObjectiveLootInput {
  lootId?: string;
  acceptedResult?: ObjectiveAcceptedResult;
  resultReviews?: Array<{ resultId: string; acceptedResult: ResultAcceptedResult }>;
  contributionResolution?: { ratios: ContributionAllocation[]; reason: string };
  contributionRatios?: Array<{ member: string; ratio: number }>;
  reason?: string;
}

export async function reviewObjectiveLoot(
  objectiveId: string,
  input: ReviewObjectiveLootInput,
  actorId: string,
): Promise<ObjectiveFlowMutationOutcome> {
  const [objective] = await db.select().from(objectives).where(eq(objectives.id, objectiveId)).limit(1);
  if (!objective) return { status: "notFound" };
  if (!canReviewObjectiveLootByFlow(objective) || !objective.lootSubmittedAt) return { status: "invalid" };

  const lootRows = await db
    .select()
    .from(objectiveLoot)
    .where(eq(objectiveLoot.objectiveId, objectiveId));
  const sortedLootRows = [...lootRows].sort((left, right) => right.submittedAt.localeCompare(left.submittedAt));
  const loot = input.lootId ? sortedLootRows.find((item) => item.id === input.lootId) : sortedLootRows[0];
  if (!loot) return { status: "notFound" };

  const resultRows = await db.select().from(results).where(eq(results.objectiveId, objectiveId));
  const challengers = uniqueMembers(objective.challengers ?? []);
  const settlementPlan = planObjectiveSettlement({
    objective: { ...objective, challengers },
    results: resultRows.map((result) => ({
      id: result.id,
      uncertaintyLevel: result.uncertaintyLevel ?? undefined,
      uncertaintyScore: result.uncertaintyScore,
    })),
    loot,
    resultReviews: input.resultReviews,
    acceptedResult: input.acceptedResult,
    contributionResolution: input.contributionResolution,
    contributionRatios: input.contributionRatios,
  });
  if (!settlementPlan) return { status: "invalid" };
  const memberRows =
    settlementPlan.contributionRatios.length > 0
      ? await db
          .select({ id: users.id, name: users.name })
          .from(teamMembers)
          .innerJoin(users, eq(teamMembers.userId, users.id))
          .where(
            and(
              eq(teamMembers.teamId, objective.teamId),
              inArray(
                users.name,
                settlementPlan.contributionRatios.map((item) => item.member),
              ),
            ),
          )
      : [];
  const userIdByName = new Map(memberRows.map((user) => [user.name, user.id]));
  const createdAt = nowIso();
  const reason = input.reason?.trim() || input.contributionResolution?.reason.trim() || `目标结算：${objective.title}`;

  const settled = await db.transaction(async (tx) => {
    const updated = await tx
      .update(objectives)
      .set({
        flowStatus: objectiveLifecycleTransitions.settleLoot.to,
        stage: objectiveLifecycleTransitions.settleLoot.stage,
        acceptedResult: settlementPlan.objectiveAcceptedResult,
        completionMultiplier: settlementPlan.completionMultiplier,
        objectiveBasePoints: settlementPlan.basePoints,
        objectiveSettlementPoints: settlementPlan.settlementPoints,
        assignedChallengers: [],
        updatedAt: today(),
        updatedBy: actorId,
      })
      .where(and(eq(objectives.id, objectiveId), eq(objectives.flowStatus, objectiveLifecycleTransitions.settleLoot.from)))
      .returning({ id: objectives.id });
    if (updated.length === 0) {
      return false;
    }

    for (const result of resultRows) {
      await tx
        .update(results)
        .set({ acceptedResult: settlementPlan.acceptedResultByResultId.get(result.id) ?? "failed", updatedBy: actorId })
        .where(eq(results.id, result.id));
    }
    await tx.delete(pointLedger).where(eq(pointLedger.objectiveId, objectiveId));
    if (settlementPlan.contributionRatios.length > 0) {
      await tx.insert(pointLedger).values(
        settlementPlan.contributionRatios.map((item) => ({
          id: makeId("points"),
          teamId: objective.teamId,
          objectiveId: objective.id,
          userId: userIdByName.get(item.member) ?? null,
          memberName: item.member,
          points: Number((settlementPlan.settlementPoints * item.ratio).toFixed(2)),
          reason,
          createdAt,
        })),
      );
    }
    return true;
  });
  if (!settled) return { status: "invalid" };

  publishObjectiveInvalidation({
    actorUserId: actorId,
    reason: "objective.lifecycle.changed",
    objectiveId,
    teamId: objective.teamId,
  });

  return objectiveOutcome(objectiveId, runtimeScope(objective.teamId));
}

export async function createTask(input: CreateTaskInput): Promise<Task | null> {
  const title = input.title.trim();
  if (!title) {
    return null;
  }

  const dueDate = input.dueDate?.trim();
  if (dueDate && !isDateOnlyString(dueDate)) {
    return null;
  }

  const created = await db.transaction(async (tx) => {
    const [objective] = await tx.select().from(objectives).where(eq(objectives.id, input.linkedObjectiveId)).limit(1).for("update");
    if (!objective) {
      return null;
    }

    const feedbackOriginId = input.feedbackOriginId?.trim() || null;
    if (feedbackOriginId) {
      const [originFeedback] = await tx
        .select({ id: feedback.id, teamId: feedback.teamId, linkedObjectiveId: feedback.linkedObjectiveId })
        .from(feedback)
        .where(eq(feedback.id, feedbackOriginId))
        .limit(1);
      if (!originFeedback || originFeedback.teamId !== objective.teamId || originFeedback.linkedObjectiveId !== objective.id) {
        return null;
      }
    }

    const siblingRows = await tx.select({ sortOrder: tasks.sortOrder }).from(tasks).where(eq(tasks.linkedObjectiveId, objective.id));
    const sortOrder = siblingRows.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;
    const id = makeId("ORF");
    const now = today();

    await tx.insert(tasks).values({
      id,
      teamId: objective.teamId,
      title,
      description: input.description?.trim() || "执行支撑目标的下一步技术任务。",
      status: "Todo",
      priority: input.priority ?? "Medium",
      assignee: input.assignee?.trim() || "User",
      linkedObjectiveId: objective.id,
      feedbackOriginId,
      dueDate: dueDate ?? now,
      tags: ["ORF"],
      createdAt: now,
      updatedAt: now,
      sortOrder,
      createdBy: input.actorId ?? null,
      updatedBy: input.actorId ?? null,
    });

    return { id, scope: runtimeScope(objective.teamId) };
  });

  if (!created) {
    return null;
  }

  publishOrfDataInvalidation({
    models: ["taskManagement"],
    reason: "task.changed",
    target: { id: created.id, type: "task" },
    teamId: runtimeScopeStorageId(created.scope),
  });

  const data = await getTaskManagementData({ scope: created.scope });
  return data.tasks.find((task) => task.id === created.id) ?? null;
}

export async function createChecklistItem(taskId: string, input: CreateChecklistItemInput, actorId?: string | null): Promise<TaskChecklistItem | null> {
  const created = await db.transaction(async (tx) => {
    const [task] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).limit(1).for("update");
    if (!task) {
      return null;
    }

    const rows = await tx
      .select({ id: taskChecklistItems.id })
      .from(taskChecklistItems)
      .where(eq(taskChecklistItems.taskId, taskId))
      .orderBy(taskChecklistItems.sortOrder);
    const id = makeId("ck");
    const label = input.label?.trim() || "新子任务";
    const updatedAt = today();
    const afterIndex = input.afterItemId ? rows.findIndex((row) => row.id === input.afterItemId) : -1;
    const insertIndex = afterIndex >= 0 ? afterIndex + 1 : rows.length;
    const orderedIds = [...rows.map((row) => row.id)];
    orderedIds.splice(insertIndex, 0, id);

    await tx.insert(taskChecklistItems).values({
      id,
      taskId,
      label,
      done: false,
      sortOrder: insertIndex,
      updatedAt,
    });

    for (const [index, itemId] of orderedIds.entries()) {
      await tx.update(taskChecklistItems).set({ sortOrder: index }).where(and(eq(taskChecklistItems.taskId, taskId), eq(taskChecklistItems.id, itemId)));
    }
    await tx
      .update(tasks)
      .set({ status: task.status === "Done" ? "In Progress" : task.status, updatedAt, ...taskAuditUpdate(actorId) })
      .where(eq(tasks.id, taskId));

    return { item: { id, label, done: false, updatedAt }, teamId: task.teamId };
  });

  if (!created) {
    return null;
  }

  publishOrfDataInvalidation({
    actorUserId: actorId,
    models: ["taskManagement"],
    reason: "task.changed",
    target: { id: created.item.id, type: "subtask" },
    teamId: created.teamId,
  });
  return created.item;
}

export type ObjectiveDetailsMutationOutcome =
  | { status: "ok"; objective: Objective }
  | { status: "notFound" }
  | { status: "invalid" }
  | { status: "locked" };

export async function updateObjectiveDetails(
  objectiveId: string,
  input: { finalDueAt?: string; title?: string },
  actorId?: string | null,
): Promise<ObjectiveDetailsMutationOutcome> {
  const nextTitle = input.title?.trim();
  if (input.title !== undefined && !nextTitle) {
    return { status: "invalid" };
  }

  const updatedObjective = await db.transaction(async (tx) => {
    const [objective] = await tx.select().from(objectives).where(eq(objectives.id, objectiveId)).limit(1).for("update");
    if (!objective) return { status: "notFound" as const };

    const update: Partial<typeof objectives.$inferInsert> = {
      updatedAt: today(),
      updatedBy: actorId ?? objective.updatedBy,
    };

    if (nextTitle !== undefined) {
      update.title = nextTitle;
    }

    if (input.finalDueAt !== undefined) {
      const deadlineChange = validateObjectiveDeadlineChange(objective, input.finalDueAt);
      if (deadlineChange.status === "invalidDate") return { status: "invalid" as const };
      if (deadlineChange.status === "locked" || deadlineChange.status === "frozenMustExtend") return { status: "locked" as const };
      update.finalDueAt = input.finalDueAt;
    }

    const updated = await tx
      .update(objectives)
      .set(update)
      .where(eq(objectives.id, objectiveId))
      .returning({ id: objectives.id, teamId: objectives.teamId });
    if (updated.length === 0) {
      return { status: "notFound" as const };
    }

    if (nextTitle !== undefined) {
      await tx
        .update(commentThreads)
        .set({ targetTitle: nextTitle, updatedAt: nowIso() })
        .where(and(eq(commentThreads.targetType, "objective"), eq(commentThreads.targetId, objectiveId)));
    }
    return { status: "updated" as const, teamId: updated[0]!.teamId };
  });

  if (updatedObjective.status === "notFound") return { status: "notFound" };
  if (updatedObjective.status === "invalid") return { status: "invalid" };
  if (updatedObjective.status === "locked") return { status: "locked" };

  publishObjectiveInvalidation({
    actorUserId: actorId,
    reason: "objective.changed",
    objectiveId,
    teamId: updatedObjective.teamId,
  });
  return objectiveOutcome(objectiveId, runtimeScope(updatedObjective.teamId));
}

export async function updateObjectiveTitle(objectiveId: string, title: string): Promise<boolean> {
  return (await updateObjectiveDetails(objectiveId, { title })).status === "ok";
}

export async function updateResultTitle(resultId: string, title: string, actorId?: string | null): Promise<boolean> {
  const nextTitle = title.trim();
  if (!nextTitle) {
    return false;
  }

  const updatedResult = await db.transaction(async (tx) => {
    const [target] = await tx
      .select({ flowStatus: objectives.flowStatus, teamId: results.teamId })
      .from(results)
      .innerJoin(objectives, eq(objectives.id, results.objectiveId))
      .where(eq(results.id, resultId))
      .limit(1)
      .for("update");
    if (!target || !canMutateObjectiveResultsByFlow(target)) {
      return null;
    }

    const updated = await tx
      .update(results)
      .set({ title: nextTitle, updatedAt: today(), updatedBy: actorId ?? null })
      .where(eq(results.id, resultId))
      .returning({ id: results.id });
    if (updated.length === 0) {
      return null;
    }

    await tx
      .update(commentThreads)
      .set({ targetTitle: nextTitle, updatedAt: nowIso() })
      .where(and(eq(commentThreads.targetType, "result"), eq(commentThreads.targetId, resultId)));
    return { teamId: target.teamId };
  });

  if (!updatedResult) {
    return false;
  }

  publishOrfDataInvalidation({
    models: ["taskManagement", "bountyHall"],
    reason: "result.changed",
    target: { id: resultId, type: "result" },
    teamId: updatedResult.teamId,
  });
  return true;
}

export async function updateTaskTitle(taskId: string, title: string, actorId?: string | null): Promise<boolean> {
  const nextTitle = title.trim();
  if (!nextTitle) {
    return false;
  }

  const updatedTask = await db.transaction(async (tx) => {
    const updated = await tx
      .update(tasks)
      .set({ title: nextTitle, updatedAt: today(), ...taskAuditUpdate(actorId) })
      .where(eq(tasks.id, taskId))
      .returning({ id: tasks.id, teamId: tasks.teamId });
    if (updated.length === 0) {
      return null;
    }

    await tx
      .update(commentThreads)
      .set({ targetTitle: nextTitle, updatedAt: nowIso() })
      .where(and(eq(commentThreads.targetType, "task"), eq(commentThreads.targetId, taskId)));
    return { teamId: updated[0]!.teamId };
  });

  if (!updatedTask) {
    return false;
  }

  publishOrfDataInvalidation({
    actorUserId: actorId,
    models: ["taskManagement"],
    reason: "task.changed",
    target: { id: taskId, type: "task" },
    teamId: updatedTask.teamId,
  });
  return true;
}

export async function updateChecklistItemLabel(taskId: string, itemId: string, label: string, actorId?: string | null): Promise<boolean> {
  const nextLabel = label.trim();
  if (!nextLabel) {
    return false;
  }

  const updatedItem = await db.transaction(async (tx) => {
    const [task] = await tx.select({ teamId: tasks.teamId }).from(tasks).where(eq(tasks.id, taskId)).limit(1).for("update");
    if (!task) {
      return null;
    }
    const updated = await tx
      .update(taskChecklistItems)
      .set({ label: nextLabel, updatedAt: today() })
      .where(and(eq(taskChecklistItems.taskId, taskId), eq(taskChecklistItems.id, itemId)))
      .returning({ id: taskChecklistItems.id });

    if (updated.length === 0) {
      return null;
    }

    await tx.update(tasks).set({ updatedAt: today(), ...taskAuditUpdate(actorId) }).where(eq(tasks.id, taskId));
    await tx
      .update(commentThreads)
      .set({ targetTitle: nextLabel, updatedAt: nowIso() })
      .where(and(eq(commentThreads.targetType, "subtask"), eq(commentThreads.targetId, itemId)));
    return { teamId: task.teamId };
  });

  if (!updatedItem) {
    return false;
  }

  publishOrfDataInvalidation({
    actorUserId: actorId,
    models: ["taskManagement"],
    reason: "task.changed",
    target: { id: itemId, type: "subtask" },
    teamId: updatedItem.teamId,
  });
  return true;
}

export async function deleteObjective(objectiveId: string): Promise<boolean> {
  const deletedObjective = await db.transaction(async (tx) => {
    const [objective] = await tx.select({ flowStatus: objectives.flowStatus, id: objectives.id, teamId: objectives.teamId }).from(objectives).where(eq(objectives.id, objectiveId)).limit(1);
    if (!objective) {
      return null;
    }
    if (!canDeleteObjectiveByFlow(objective)) {
      return null;
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

    const deleted = await tx.delete(objectives).where(eq(objectives.id, objectiveId)).returning({ id: objectives.id });
    return deleted.length > 0 ? { teamId: objective.teamId } : null;
  });

  if (!deletedObjective) {
    return false;
  }

  publishObjectiveInvalidation({
    reason: "objective.changed",
    objectiveId,
    teamId: deletedObjective.teamId,
  });
  return true;
}

export async function deleteResult(resultId: string): Promise<boolean> {
  const deletedResult = await db.transaction(async (tx) => {
    const [result] = await tx
      .select({ flowStatus: objectives.flowStatus, id: results.id, objectiveId: results.objectiveId, teamId: results.teamId })
      .from(results)
      .innerJoin(objectives, eq(objectives.id, results.objectiveId))
      .where(eq(results.id, resultId))
      .limit(1)
      .for("update");
    if (!result) {
      return null;
    }
    if (!canMutateObjectiveResultsByFlow(result)) {
      return null;
    }

    await tx.delete(commentThreads).where(and(eq(commentThreads.targetType, "result"), eq(commentThreads.targetId, resultId)));

    const deleted = await tx.delete(results).where(eq(results.id, resultId)).returning({ id: results.id });
    return deleted.length > 0 ? { objectiveId: result.objectiveId, teamId: result.teamId } : null;
  });

  if (!deletedResult) {
    return false;
  }

  publishOrfDataInvalidation({
    models: ["taskManagement", "bountyHall"],
    reason: "result.changed",
    target: { id: resultId, type: "result" },
    teamId: deletedResult.teamId,
  });
  return true;
}

export async function deleteTask(taskId: string): Promise<boolean> {
  const deletedTask = await db.transaction(async (tx) => {
    const [task] = await tx.select({ id: tasks.id, teamId: tasks.teamId }).from(tasks).where(eq(tasks.id, taskId)).limit(1);
    if (!task) {
      return null;
    }

    const checklistRows = await tx.select({ id: taskChecklistItems.id }).from(taskChecklistItems).where(eq(taskChecklistItems.taskId, taskId));
    const checklistIds = checklistRows.map((item) => item.id);

    if (checklistIds.length > 0) {
      await tx.delete(commentThreads).where(and(eq(commentThreads.targetType, "subtask"), inArray(commentThreads.targetId, checklistIds)));
    }
    await tx.delete(commentThreads).where(and(eq(commentThreads.targetType, "task"), eq(commentThreads.targetId, taskId)));

    const deleted = await tx.delete(tasks).where(eq(tasks.id, taskId)).returning({ id: tasks.id });
    return deleted.length > 0 ? { teamId: task.teamId } : null;
  });

  if (!deletedTask) {
    return false;
  }

  publishOrfDataInvalidation({
    models: ["taskManagement"],
    reason: "task.changed",
    target: { id: taskId, type: "task" },
    teamId: deletedTask.teamId,
  });
  return true;
}

export async function deleteChecklistItem(taskId: string, itemId: string, actorId?: string | null): Promise<boolean> {
  const deletedItem = await db.transaction(async (tx) => {
    const [task] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).limit(1).for("update");
    if (!task) {
      return null;
    }

    const deleted = await tx
      .delete(taskChecklistItems)
      .where(and(eq(taskChecklistItems.taskId, taskId), eq(taskChecklistItems.id, itemId)))
      .returning({ id: taskChecklistItems.id });
    if (deleted.length === 0) {
      return null;
    }

    await tx.delete(commentThreads).where(and(eq(commentThreads.targetType, "subtask"), eq(commentThreads.targetId, itemId)));
    const rows = await tx
      .select({ id: taskChecklistItems.id, done: taskChecklistItems.done })
      .from(taskChecklistItems)
      .where(eq(taskChecklistItems.taskId, taskId))
      .orderBy(taskChecklistItems.sortOrder);
    for (const [index, row] of rows.entries()) {
      await tx.update(taskChecklistItems).set({ sortOrder: index }).where(eq(taskChecklistItems.id, row.id));
    }
    await tx
      .update(tasks)
      .set({ status: statusFromChecklist(rows, task.status), updatedAt: today(), ...taskAuditUpdate(actorId) })
      .where(eq(tasks.id, taskId));
    return { teamId: task.teamId };
  });

  if (!deletedItem) {
    return false;
  }

  publishOrfDataInvalidation({
    actorUserId: actorId,
    models: ["taskManagement"],
    reason: "task.changed",
    target: { id: itemId, type: "subtask" },
    teamId: deletedItem.teamId,
  });
  return true;
}

export async function moveResult(resultId: string, referenceResultId: string, placement: "before" | "after"): Promise<boolean> {
  const movedResult = await db.transaction(async (tx) => {
    const [moving] = await tx.select().from(results).where(eq(results.id, resultId)).limit(1);
    const [reference] = await tx.select().from(results).where(eq(results.id, referenceResultId)).limit(1);
    if (!moving || !reference || moving.objectiveId !== reference.objectiveId || moving.id === reference.id) {
      return null;
    }
    const [objective] = await tx
      .select({ flowStatus: objectives.flowStatus, id: objectives.id })
      .from(objectives)
      .where(eq(objectives.id, moving.objectiveId))
      .limit(1)
      .for("update");
    if (!objective) {
      return null;
    }
    if (!canMutateObjectiveResultsByFlow(objective)) {
      return null;
    }

    const rows = await tx
      .select({ id: results.id })
      .from(results)
      .where(eq(results.objectiveId, moving.objectiveId))
      .orderBy(results.sortOrder);
    const orderedIds = reorderIds(rows.map((row) => row.id), resultId, referenceResultId, placement);
    for (const [index, id] of orderedIds.entries()) {
      await tx.update(results).set({ sortOrder: index }).where(eq(results.id, id));
    }
    await tx.update(objectives).set({ updatedAt: today() }).where(eq(objectives.id, moving.objectiveId));
    return { teamId: moving.teamId };
  });

  if (!movedResult) {
    return false;
  }

  publishOrfDataInvalidation({
    models: ["taskManagement", "bountyHall"],
    reason: "result.changed",
    target: { id: resultId, type: "result" },
    teamId: movedResult.teamId,
  });
  return true;
}

export async function moveTask(
  taskId: string,
  input: { objectiveId: string; referenceTaskId?: string; placement?: "before" | "after" },
  actorId?: string | null,
): Promise<boolean> {
  const movedTask = await db.transaction(async (tx) => {
    const [task] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
    const [objective] = await tx.select({ id: objectives.id }).from(objectives).where(eq(objectives.id, input.objectiveId)).limit(1).for("update");
    if (!task || !objective || task.linkedObjectiveId !== objective.id) {
      return null;
    }
    if (input.referenceTaskId) {
      const [referenceTask] = await tx.select().from(tasks).where(eq(tasks.id, input.referenceTaskId)).limit(1);
      if (!referenceTask || referenceTask.linkedObjectiveId !== objective.id || referenceTask.id === task.id) {
        return null;
      }
    }

    await tx.update(tasks).set({ updatedAt: today(), ...taskAuditUpdate(actorId) }).where(eq(tasks.id, taskId));

    const rows = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.linkedObjectiveId, objective.id))
      .orderBy(tasks.sortOrder);
    const ids = rows.map((row) => row.id);
    const orderedIds = input.referenceTaskId
      ? reorderIds(ids, taskId, input.referenceTaskId, input.placement ?? "after")
      : ids.filter((id) => id !== taskId).concat(taskId);

    for (const [index, id] of orderedIds.entries()) {
      await tx.update(tasks).set({ sortOrder: index }).where(eq(tasks.id, id));
    }

    return { teamId: task.teamId };
  });

  if (!movedTask) {
    return false;
  }

  publishOrfDataInvalidation({
    actorUserId: actorId,
    models: ["taskManagement"],
    reason: "task.changed",
    target: { id: taskId, type: "task" },
    teamId: movedTask.teamId,
  });
  return true;
}

export async function moveChecklistItem(
  taskId: string,
  itemId: string,
  input: { toTaskId: string; referenceItemId?: string; placement?: "before" | "after" },
  actorId?: string | null,
): Promise<boolean> {
  const movedItem = await db.transaction(async (tx) => {
    const [item] = await tx
      .select()
      .from(taskChecklistItems)
      .where(and(eq(taskChecklistItems.taskId, taskId), eq(taskChecklistItems.id, itemId)))
      .limit(1);
    const [targetTask] = await tx.select().from(tasks).where(eq(tasks.id, input.toTaskId)).limit(1);
    const [sourceTask] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
    if (!item || !targetTask || !sourceTask) {
      return null;
    }
    const affectedTaskIds = Array.from(new Set([taskId, input.toTaskId])).sort();
    const lockedTasks = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(inArray(tasks.id, affectedTaskIds))
      .for("update");
    if (lockedTasks.length !== affectedTaskIds.length) {
      return null;
    }
    if (input.referenceItemId) {
      const [referenceItem] = await tx.select().from(taskChecklistItems).where(eq(taskChecklistItems.id, input.referenceItemId)).limit(1);
      if (!referenceItem || referenceItem.taskId !== input.toTaskId || referenceItem.id === itemId) {
        return null;
      }
    }

    await tx.update(taskChecklistItems).set({ taskId: input.toTaskId, updatedAt: today() }).where(eq(taskChecklistItems.id, itemId));

    for (const currentTaskId of affectedTaskIds) {
      const rows = await tx
        .select({ id: taskChecklistItems.id, done: taskChecklistItems.done })
        .from(taskChecklistItems)
        .where(eq(taskChecklistItems.taskId, currentTaskId))
        .orderBy(taskChecklistItems.sortOrder);
      const ids = rows.map((row) => row.id);
      const orderedIds =
        currentTaskId === input.toTaskId && input.referenceItemId
          ? reorderIds(ids, itemId, input.referenceItemId, input.placement ?? "after")
          : currentTaskId === input.toTaskId
            ? ids.filter((id) => id !== itemId).concat(itemId)
          : ids;

      for (const [index, id] of orderedIds.entries()) {
        await tx.update(taskChecklistItems).set({ sortOrder: index }).where(eq(taskChecklistItems.id, id));
      }
      const fallback = currentTaskId === sourceTask.id ? sourceTask.status : targetTask.status;
      await tx
        .update(tasks)
        .set({ status: statusFromChecklist(rows, fallback), updatedAt: today(), ...taskAuditUpdate(actorId) })
        .where(eq(tasks.id, currentTaskId));
    }

    return { teamId: sourceTask.teamId };
  });

  if (!movedItem) {
    return false;
  }

  publishOrfDataInvalidation({
    actorUserId: actorId,
    models: ["taskManagement"],
    reason: "task.changed",
    target: { id: itemId, type: "subtask" },
    teamId: movedItem.teamId,
  });
  return true;
}

export async function updateTaskStatus(taskId: string, status: TaskStatus, actorId?: string | null): Promise<boolean> {
  const updated = await db
    .update(tasks)
    .set({ status, updatedAt: today(), ...taskAuditUpdate(actorId) })
    .where(eq(tasks.id, taskId))
    .returning({ id: tasks.id, teamId: tasks.teamId });
  if (updated.length === 0) {
    return false;
  }

  publishOrfDataInvalidation({
    actorUserId: actorId,
    models: ["taskManagement"],
    reason: "task.changed",
    target: { id: taskId, type: "task" },
    teamId: updated[0]!.teamId,
  });
  return true;
}

export async function setTaskCompletion(taskId: string, done: boolean, actorId?: string | null): Promise<boolean> {
  const status: TaskStatus = done ? "Done" : "Todo";
  const updatedTask = await db.transaction(async (tx) => {
    const updated = await tx
      .update(tasks)
      .set({ status, updatedAt: today(), ...taskAuditUpdate(actorId) })
      .where(eq(tasks.id, taskId))
      .returning({ id: tasks.id, teamId: tasks.teamId });
    if (updated.length === 0) {
      return null;
    }

    await tx.update(taskChecklistItems).set({ done, updatedAt: today() }).where(eq(taskChecklistItems.taskId, taskId));
    return { teamId: updated[0]!.teamId };
  });

  if (!updatedTask) {
    return false;
  }

  publishOrfDataInvalidation({
    actorUserId: actorId,
    models: ["taskManagement"],
    reason: "task.changed",
    target: { id: taskId, type: "task" },
    teamId: updatedTask.teamId,
  });
  return true;
}

export async function updateChecklistItem(taskId: string, itemId: string, done: boolean, actorId?: string | null): Promise<boolean> {
  const updatedItem = await db.transaction(async (tx) => {
    const updated = await tx
      .update(taskChecklistItems)
      .set({ done, updatedAt: today() })
      .where(and(eq(taskChecklistItems.taskId, taskId), eq(taskChecklistItems.id, itemId)))
      .returning({ id: taskChecklistItems.id });

    if (updated.length === 0) {
      return null;
    }

    const [task] = await tx.select({ teamId: tasks.teamId }).from(tasks).where(eq(tasks.id, taskId)).limit(1);
    if (!task) {
      return null;
    }

    const checklist = await tx.select({ done: taskChecklistItems.done }).from(taskChecklistItems).where(eq(taskChecklistItems.taskId, taskId));
    const completedCount = checklist.filter((item) => item.done).length;
    const status: TaskStatus = completedCount === checklist.length ? "Done" : completedCount > 0 ? "In Progress" : "Todo";

    await tx.update(tasks).set({ status, updatedAt: today(), ...taskAuditUpdate(actorId) }).where(eq(tasks.id, taskId));
    return { teamId: task.teamId };
  });

  if (!updatedItem) {
    return false;
  }

  publishOrfDataInvalidation({
    actorUserId: actorId,
    models: ["taskManagement"],
    reason: "task.changed",
    target: { id: itemId, type: "subtask" },
    teamId: updatedItem.teamId,
  });
  return true;
}
