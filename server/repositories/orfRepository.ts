import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import { and, eq, gt, inArray, isNull, lt, or } from "drizzle-orm";
import type {
  CommentAttachment,
  BountySource,
  ChallengeApplication,
  CommentStatus,
  CommentTargetType,
  ContributionAllocation,
  CommentThread,
  LootResultClaim,
  MetricDirection,
  ObjectiveAlignmentRequest,
  ObjectiveAlignmentRequestKind,
  ObjectiveAlignmentRequestStatus,
  Objective,
  ObjectiveAcceptedResult,
  ObjectiveLoot,
  ObjectiveTrialReview,
  ObjectiveTrialReviewStatus,
  OrfState,
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
  objectiveBasePointsForResults,
  planObjectiveSettlement,
  uncertaintyScoreFor,
} from "../../src/domain/orfSettlement";
import {
  isObjectiveAssignedChallenger,
  isObjectiveChallenger,
  objectiveChallengerUserIds,
  objectiveHasChallengers,
  participantDisplayNamesForUserIds,
  participantUserIdsForNames,
  uniqueParticipantNames,
  uniqueParticipantUserIds,
} from "../../src/domain/orfObjectiveParticipants";
import {
  canAcceptObjectiveChallengeByFlow,
  canApplyForObjectiveChallenge,
  canDeleteObjectiveByFlow,
  canMutateObjectiveCommentsAsChallengerByFlow,
  canMutateObjectiveCommentsByFlow,
  canMutateObjectiveResultsByFlow,
  canRecruitObjectiveChallengersByFlow,
  canReviewObjectiveChallengeApplications,
  canReviewObjectiveLootByFlow,
  canSubmitObjectiveLootByFlow,
  isObjectiveReestimateWindowOpen,
  objectiveFreezeReadinessAfterReestimate,
  type ObjectiveFreezeBlockReason,
  objectiveFlowStatusAfterChallengeApplication,
  objectiveFlowStatusAfterChallengeApplicationReview,
  objectiveFlowStatusAfterRecruitment,
  objectiveLifecycleInitialState,
  objectiveLifecycleTransitions,
} from "../../src/domain/orfLifecycle";
import { objectiveChallengeEntryClosed as objectiveClosedForChallengeEntry } from "../../src/domain/orfChallengeEntry";
import { validateObjectiveDeadlineChange } from "../../src/domain/orfDeadline";
import { db } from "../db/client";
import {
  commentAttachments,
  commentMessages,
  commentThreads,
  feedback,
  objectiveAlignmentRequests,
  objectives,
  objectiveLoot,
  objectiveTrialReviews,
  pointLedger,
  projects,
  results,
  taskChecklistItems,
  tasks,
  teamMembers,
  users,
} from "../db/schema";
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
import { publishRealtimeSystemBroadcast } from "../realtime/realtimeEventBus";
import { publishObjectiveInvalidation, publishOrfDataInvalidation } from "../realtime/orfReadModelInvalidations";
import { objectStorage } from "../storage/objectStorage";
import { getOrfStateSnapshot } from "../readModels/orfTaskManagementReadModel";
import {
  commentAttachmentDto,
  deleteStoredCommentAttachmentObjects,
  groupCommentAttachmentsByMessage,
  prepareCommentAttachment,
} from "./commentAttachmentRepository";

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
const HALF_DAY_MS = 12 * 60 * 60 * 1000;
const MAX_CONFIRMATION_HALVES = 18;
const COMMENT_ATTACHMENT_TOKEN_PATTERN = /!\[[^\]\n]*\]\(orf-attachment:([A-Za-z0-9_-]+)\)/g;
const COMMENT_MENTION_TOKEN_PATTERN = /@\[([^\]\n]*)\]\(orf-user:([^) \n]+)\)/g;
function optional<T>(value: T | null): T | undefined {
  return value ?? undefined;
}

function nullableTrimmedText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed || null;
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

function taskAuditUpdate(actorId?: string | null) {
  return actorId ? { updatedBy: actorId } : {};
}

function storageScope(id: string | null | undefined): RuntimeScope | null {
  const storageId = id?.trim();
  return storageId ? runtimeScope(storageId) : null;
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

type ScopedMemberIdentity = { id: string; name: string };

async function getActiveMemberRowsByNamesInScope(storageScopeId: string, values: Array<string | undefined | null>) {
  const memberNames = uniqueParticipantNames(values);
  if (memberNames.length === 0) return [];

  const rows = await db
    .select({ id: users.id, name: users.name })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(and(eq(teamMembers.teamId, storageScopeId), eq(users.status, "active"), inArray(users.name, memberNames)));
  return rows;
}

async function getActiveChallengerRowsByNamesInScope(
  client: Pick<typeof db, "select">,
  storageScopeId: string,
  values: Array<string | undefined | null>,
) {
  const memberNames = uniqueParticipantNames(values);
  if (memberNames.length === 0) return [];

  const rows = await client
    .select({ id: users.id, name: users.name })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(and(eq(teamMembers.teamId, storageScopeId), eq(teamMembers.role, "member"), eq(users.status, "active"), inArray(users.name, memberNames)));
  return rows;
}

async function getActiveChallengerRowsByIdsInScope(
  client: Pick<typeof db, "select">,
  storageScopeId: string,
  values: Array<string | undefined | null>,
) {
  const userIds = uniqueParticipantUserIds(values);
  if (userIds.length === 0) return [];

  return client
    .select({ id: users.id, name: users.name })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(and(eq(teamMembers.teamId, storageScopeId), eq(teamMembers.role, "member"), eq(users.status, "active"), inArray(users.id, userIds)));
}

async function getActiveMemberRowsByIdsInScope(
  client: Pick<typeof db, "select">,
  storageScopeId: string,
  values: Array<string | undefined | null>,
) {
  const userIds = uniqueParticipantUserIds(values);
  if (userIds.length === 0) return [];

  return client
    .select({ id: users.id, name: users.name })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(and(eq(teamMembers.teamId, storageScopeId), eq(users.status, "active"), inArray(users.id, userIds)));
}

async function getMemberRowsByIdsInScope(
  client: Pick<typeof db, "select">,
  storageScopeId: string,
  values: Array<string | undefined | null>,
) {
  const userIds = uniqueParticipantUserIds(values);
  if (userIds.length === 0) return [];

  return client
    .select({ id: users.id, name: users.name })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(and(eq(teamMembers.teamId, storageScopeId), inArray(users.id, userIds)));
}

async function resolveActiveMemberByName(storageScopeId: string, memberName: string): Promise<ScopedMemberIdentity | null> {
  const rows = await getActiveMemberRowsByNamesInScope(storageScopeId, [memberName]);
  return rows.find((member) => member.name === memberName.trim()) ?? null;
}

async function resolveActiveChallengerByName(
  client: Pick<typeof db, "select">,
  storageScopeId: string,
  memberName: string,
): Promise<ScopedMemberIdentity | null> {
  const rows = await getActiveChallengerRowsByNamesInScope(client, storageScopeId, [memberName]);
  return rows.find((member) => member.name === memberName.trim()) ?? null;
}

async function challengerUserIdsForRow(
  client: Pick<typeof db, "select">,
  storageScopeId: string,
  userIds: Array<string | undefined | null>,
  names: Array<string | undefined | null>,
) {
  const normalizedUserIds = uniqueParticipantUserIds(userIds);
  if (normalizedUserIds.length > 0) return normalizedUserIds;
  const rows = await getActiveChallengerRowsByNamesInScope(client, storageScopeId, names);
  return participantUserIdsForNames(new Map(rows.map((member) => [member.name, member.id])), names);
}

async function assignedChallengerUserIdsForRow(
  client: Pick<typeof db, "select">,
  storageScopeId: string,
  userIds: Array<string | undefined | null>,
  names: Array<string | undefined | null>,
) {
  const normalizedUserIds = uniqueParticipantUserIds(userIds);
  if (normalizedUserIds.length > 0) return normalizedUserIds;
  const rows = await getActiveChallengerRowsByNamesInScope(client, storageScopeId, names);
  return participantUserIdsForNames(new Map(rows.map((member) => [member.name, member.id])), names);
}

function challengeObjectiveHref(path: "/bounties" | "/tasks", objectiveId: string) {
  return `${path}#objective:${encodeURIComponent(objectiveId)}`;
}

function commentTargetHref(targetType: CommentTargetType, targetId: string) {
  if (targetType === "feedback") {
    return `/feedback/${encodeURIComponent(targetId)}`;
  }

  const challengeTargetTypeByCommentTarget: Record<Exclude<CommentTargetType, "feedback">, "action" | "bounty" | "objective" | "subAction"> = {
    objective: "objective",
    result: "bounty",
    subtask: "subAction",
    task: "action",
  };
  return `/tasks#${challengeTargetTypeByCommentTarget[targetType]}:${encodeURIComponent(targetId)}`;
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

function objectiveAlignmentKindLabel(kind: ObjectiveAlignmentRequestKind) {
  return kind === "reestimateCompletion" ? "重估完成" : "验收";
}

function objectiveAlignmentTargetHref(kind: ObjectiveAlignmentRequestKind, objectiveId: string) {
  return kind === "acceptance" ? `/objectives/${encodeURIComponent(objectiveId)}/loot` : challengeObjectiveHref("/tasks", objectiveId);
}

async function notifyAdminsOfObjectiveAlignmentRequest(input: {
  actorName: string;
  actorUserId: string;
  kind: ObjectiveAlignmentRequestKind;
  meetingRoom?: string | null;
  objectiveId: string;
  objectiveTitle: string;
  requestId: string;
  scheduledAt?: string | null;
  teamId: string;
}) {
  const label = objectiveAlignmentKindLabel(input.kind);
  const scheduleText = input.scheduledAt ? `，建议时间 ${input.scheduledAt}` : "";
  const roomText = input.meetingRoom ? `，会议室 ${input.meetingRoom}` : "，请约时间并定好会议室";
  await createNotifications({
    actorName: input.actorName,
    actorUserId: input.actorUserId,
    body: `${input.actorName} 申请「${input.objectiveTitle}」${label}对齐${scheduleText}${roomText}。`,
    kind: "objective.alignment.requested",
    metadata: { kind: input.kind, objectiveTitle: input.objectiveTitle, requestedBy: input.actorName },
    recipientUserIds: await getActiveAdminNotificationRecipients(input.teamId),
    targetHref: objectiveAlignmentTargetHref(input.kind, input.objectiveId),
    targetId: input.objectiveId,
    targetType: "objective",
    teamId: input.teamId,
    title: `${label}待对齐`,
  });
}

async function notifyMemberOfObjectiveAlignmentReview(input: {
  actorUserId: string;
  commanderFeedback?: string | null;
  kind: ObjectiveAlignmentRequestKind;
  objectiveId: string;
  objectiveTitle: string;
  requestedBy: string;
  status: ObjectiveAlignmentRequestStatus;
  teamId: string;
}) {
  const actorName = await getUserNameById(input.actorUserId);
  const label = objectiveAlignmentKindLabel(input.kind);
  const statusText =
    input.status === "scheduled"
      ? "已约定"
      : input.status === "completed"
        ? "已完成"
        : input.status === "needsWork"
          ? "需要补充"
          : input.status;
  const feedback = input.commanderFeedback?.trim();
  await createNotifications({
    actorName: actorName || "指挥官",
    actorUserId: input.actorUserId,
    body: feedback
      ? `「${input.objectiveTitle}」${label}对齐${statusText}：${feedback}`
      : `「${input.objectiveTitle}」${label}对齐${statusText}。`,
    kind: "objective.alignment.reviewed",
    metadata: { kind: input.kind, objectiveTitle: input.objectiveTitle, status: input.status },
    recipientUserIds: await getActiveMemberNotificationRecipientsByNames(input.teamId, [input.requestedBy]),
    targetHref: objectiveAlignmentTargetHref(input.kind, input.objectiveId),
    targetId: input.objectiveId,
    targetType: "objective",
    teamId: input.teamId,
    title: `${label}对齐更新`,
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

function uniqueNotificationUserIds(userIds: Array<string | null | undefined>) {
  const normalized = userIds.map((userId) => userId?.trim()).filter((userId): userId is string => Boolean(userId));
  return Array.from(new Set(normalized));
}

async function notifyMentionedUsersOfComment(input: {
  actorName: string;
  actorUserId: string;
  body: string;
  commentMessageId: string;
  commentThreadId: string;
  mentionedUserIds?: string[];
  targetId: string;
  targetTitle: string;
  targetType: CommentTargetType;
  teamId: string;
}) {
  const mentionedUserIds = input.mentionedUserIds ?? extractCommentMentionUserIds(input.body);
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
    targetHref: commentTargetHref(input.targetType, input.targetId),
    targetId: input.commentMessageId,
    targetType: "comment",
    teamId: input.teamId,
    title: "评论提到了你",
  });
}

async function getFeedbackCommentNotificationRecipients(input: {
  actorUserId: string;
  excludedUserIds: string[];
  feedbackId: string;
  teamId: string;
}) {
  const [target] = await db
    .select({
      createdBy: feedback.createdBy,
      ownerUserId: feedback.ownerUserId,
      teamId: feedback.teamId,
    })
    .from(feedback)
    .where(eq(feedback.id, input.feedbackId))
    .limit(1);
  if (!target || target.teamId !== input.teamId) {
    return [];
  }

  const participantRows = await db
    .select({ authorUserId: commentMessages.authorUserId })
    .from(commentThreads)
    .innerJoin(commentMessages, eq(commentMessages.threadId, commentThreads.id))
    .where(
      and(
        eq(commentThreads.teamId, input.teamId),
        eq(commentThreads.targetType, "feedback"),
        eq(commentThreads.targetId, input.feedbackId),
      ),
    );
  const participantUserIds = participantRows.map((row) => row.authorUserId);
  const relatedUserIds = uniqueNotificationUserIds([target.createdBy, target.ownerUserId, ...participantUserIds]);
  const [adminUserIds, activeRelatedUserIds] = await Promise.all([
    getActiveAdminNotificationRecipients(input.teamId),
    getActiveMemberNotificationRecipientsByIds(input.teamId, relatedUserIds),
  ]);

  const excludedUserIds = new Set(uniqueNotificationUserIds([input.actorUserId, ...input.excludedUserIds]));
  return uniqueNotificationUserIds([...adminUserIds, ...activeRelatedUserIds]).filter(
    (userId) => !excludedUserIds.has(userId),
  );
}

async function notifyFeedbackParticipantsOfComment(input: {
  actorName: string;
  actorUserId: string;
  commentMessageId: string;
  commentThreadId: string;
  mentionedUserIds: string[];
  targetId: string;
  targetTitle: string;
  teamId: string;
}) {
  const recipientUserIds = await getFeedbackCommentNotificationRecipients({
    actorUserId: input.actorUserId,
    excludedUserIds: input.mentionedUserIds,
    feedbackId: input.targetId,
    teamId: input.teamId,
  });
  if (recipientUserIds.length === 0) {
    return;
  }

  await createNotifications({
    actorName: input.actorName,
    actorUserId: input.actorUserId,
    body: `${input.actorName} 回复了反馈「${input.targetTitle}」。`,
    kind: "feedback.commented",
    metadata: {
      commentMessageId: input.commentMessageId,
      commentThreadId: input.commentThreadId,
      targetId: input.targetId,
      targetTitle: input.targetTitle,
      targetType: "feedback",
    },
    recipientUserIds,
    targetHref: commentTargetHref("feedback", input.targetId),
    targetId: input.targetId,
    targetType: "feedback",
    teamId: input.teamId,
    title: "反馈有新回复",
  });
}

export interface CreateResultInput {
  objectiveId: string;
  title: string;
  actorId?: string | null;
  detail?: string | null;
  baseline?: number;
  current?: number;
  target?: number;
  unit?: string;
  direction?: MetricDirection;
  uncertaintyLevel?: UncertaintyLevel;
  source?: BountySource;
  definer?: string;
  definerUserId?: string | null;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  assignee: string;
  actorId?: string | null;
  priority?: Priority;
  linkedObjectiveId: string;
  dueDate?: string;
}

export interface CreateObjectiveInput {
  title: string;
  whyItMatters: string;
  projectId?: string | null;
  cycle: string;
  boundary: string;
  finalDueAt?: string;
}

export interface CreateProjectInput {
  name: string;
}

export async function createProject(input: CreateProjectInput, context: { scope: RuntimeScope; userId: string }) {
  const name = input.name.trim();
  if (!name) return { status: "invalid" as const };

  const storageScopeId = runtimeScopeStorageId(context.scope);
  const existing = await db.select().from(projects).where(and(eq(projects.teamId, storageScopeId), eq(projects.name, name))).limit(1);
  if (existing[0]) return { status: "duplicate" as const, project: existing[0] };

  const now = today();
  const id = makeId("project");
  const [project] = await db
    .insert(projects)
    .values({
      id,
      teamId: storageScopeId,
      name,
      createdAt: now,
      updatedAt: now,
      createdBy: context.userId,
      updatedBy: context.userId,
    })
    .returning();

  publishOrfDataInvalidation({
    actorUserId: context.userId,
    models: ["taskManagement"],
    reason: "project.changed",
    target: { id, type: "project" },
    teamId: storageScopeId,
  });

  return { status: "ok" as const, project };
}

export async function deleteProject(projectId: string, context: { scope: RuntimeScope; userId: string }) {
  const nextProjectId = projectId.trim();
  if (!nextProjectId) return { status: "notFound" as const };

  const storageScopeId = runtimeScopeStorageId(context.scope);
  const deletedProject = await db.transaction(async (tx) => {
    const [project] = await tx
      .select({
        id: projects.id,
        name: projects.name,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
      })
      .from(projects)
      .where(and(eq(projects.id, nextProjectId), eq(projects.teamId, storageScopeId)))
      .limit(1)
      .for("update");
    if (!project) return null;

    await tx
      .update(objectives)
      .set({ projectId: null, updatedAt: today(), updatedBy: context.userId })
      .where(and(eq(objectives.teamId, storageScopeId), eq(objectives.projectId, nextProjectId)));
    await tx.delete(projects).where(and(eq(projects.id, nextProjectId), eq(projects.teamId, storageScopeId)));
    return project;
  });

  if (!deletedProject) return { status: "notFound" as const };

  publishOrfDataInvalidation({
    actorUserId: context.userId,
    models: ["taskManagement"],
    reason: "project.changed",
    target: { id: nextProjectId, type: "project" },
    teamId: storageScopeId,
  });

  return { status: "deleted" as const, project: deletedProject };
}

export async function createObjective(input: CreateObjectiveInput, context: { scope: RuntimeScope; userId: string }): Promise<Objective | null> {
  const id = makeId("obj");
  const now = today();
  const storageScopeId = runtimeScopeStorageId(context.scope);
  const projectId = nullableTrimmedText(input.projectId);
  if (projectId) {
    const [project] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), eq(projects.teamId, storageScopeId))).limit(1);
    if (!project) return null;
  }

  await db.insert(objectives).values({
    id,
    teamId: storageScopeId,
    title: input.title,
    description: input.whyItMatters,
    whyItMatters: input.whyItMatters,
    projectId,
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
    challengerUserIds: [],
    assignedChallengers: [],
    assignedChallengerUserIds: [],
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

  const data = await getOrfStateSnapshot({ scope: context.scope });
  return data.objectives.find((objective) => objective.id === id) ?? null;
}

export interface CreateChecklistItemInput {
  label?: string;
  afterItemId?: string;
}

export async function createResult(input: CreateResultInput): Promise<Result | null> {
  const title = input.title.trim();
  if (!title) {
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
    const requestedDefinerName = input.definer?.trim() || "";
    const resolvedDefiner = input.definerUserId
      ? (await getActiveMemberRowsByIdsInScope(tx, objective.teamId, [input.definerUserId]))[0] ?? null
      : requestedDefinerName
        ? await resolveActiveMemberByName(objective.teamId, requestedDefinerName)
        : null;
    if ((input.definerUserId || requestedDefinerName) && !resolvedDefiner) {
      return null;
    }

    await tx.insert(results).values({
      id,
      teamId: objective.teamId,
      objectiveId: objective.id,
      title,
      detail: input.detail?.trim() ?? "",
      uncertaintyLevel: input.uncertaintyLevel ?? null,
      baseline: input.baseline ?? 0,
      current: input.current ?? 0,
      target: input.target ?? 100,
      unit: input.unit?.trim() || "%",
      direction: input.direction ?? "increase",
      status: "Draft",
      confidence: 50,
      source: input.source ?? "managerDefined",
      definer: resolvedDefiner?.name ?? "",
      definerUserId: resolvedDefiner?.id ?? null,
      uncertaintyScore: uncertaintyScoreFor(input.uncertaintyLevel ?? null),
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

  const data = await getOrfStateSnapshot({ scope: created.scope });
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
  if (!nextChallenger && !actorId) {
    return { status: "notFound" };
  }

  const acceptedResult = await db.transaction(async (tx) => {
    const [objective] = await tx.select().from(objectives).where(eq(objectives.id, objectiveId)).limit(1).for("update");
    if (!objective) {
      return { status: "notFound" as const };
    }

    const actor = actorId
      ? (await getActiveChallengerRowsByIdsInScope(tx, objective.teamId, [actorId]))[0] ?? null
      : await resolveActiveChallengerByName(tx, objective.teamId, nextChallenger);
    if (!actor) {
      return { status: "forbidden" as const };
    }

    const currentChallengerUserIds = await challengerUserIdsForRow(tx, objective.teamId, objective.challengerUserIds ?? [], objective.challengers ?? []);
    const currentChallengers = uniqueParticipantNames(objective.challengers ?? []);
    if (currentChallengerUserIds.includes(actor.id)) {
      return { status: "alreadyAccepted" as const, challengers: currentChallengers };
    }
    if (objectiveClosedForChallengeEntry(objective) || !canAcceptObjectiveChallengeByFlow(objective)) {
      return { status: "closed" as const };
    }

    const assignedChallengerUserIds = await assignedChallengerUserIdsForRow(tx, objective.teamId, objective.assignedChallengerUserIds ?? [], objective.assignedChallengers ?? []);
    const assignedChallengers = uniqueParticipantNames(objective.assignedChallengers ?? []);
    const applications = objective.challengeApplications ?? [];
    const hasApprovedApplication = applications.some((application) => (application.applicantUserId ?? null) === actor.id && application.status === "approved");
    if (!isObjectiveAssignedChallenger({ assignedChallengerUserIds, challengerUserIds: currentChallengerUserIds }, actor.id) && !hasApprovedApplication) {
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
        challengers: [...currentChallengers, actor.name],
        challengerUserIds: [...currentChallengerUserIds, actor.id],
        assignedChallengers: assignedChallengers.filter((member) => member !== actor.name),
        assignedChallengerUserIds: assignedChallengerUserIds.filter((userId) => userId !== actor.id),
        flowStatus: objectiveLifecycleTransitions.acceptChallenge.to,
        stage: objectiveLifecycleTransitions.acceptChallenge.stage,
        acceptedAt: objective.acceptedAt ?? acceptedAt,
        confirmationDueAt: objective.confirmationDueAt ?? nextConfirmationDueAt,
        challengeApplications: applications.map((application) =>
          (application.applicantUserId ?? null) === actor.id && application.status === "approved" ? { ...application, applicant: actor.name, applicantUserId: actor.id, decidedAt: application.decidedAt ?? acceptedAt } : application,
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
        challenger: actor.name,
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

  const data = await getOrfStateSnapshot({ scope: acceptedResult.scope });
  const accepted = data.objectives.find((item) => item.id === objectiveId);
  return accepted ? { status: "accepted", objective: accepted } : { status: "notFound" };
}

export type ApplyObjectiveChallengeOutcome =
  | { status: "applied"; objective: Objective }
  | { status: "alreadyApplied" }
  | { status: "alreadyAccepted"; challengers: string[] }
  | { status: "alreadyRecruited" }
  | { status: "forbidden" }
  | { status: "invalidReason" }
  | { status: "closed" }
  | { status: "notFound" };

export async function applyForObjectiveChallenge(objectiveId: string, applicant: string, actorUserId: string | null | undefined, reason: string): Promise<ApplyObjectiveChallengeOutcome> {
  const nextApplicant = applicant.trim();
  if (!nextApplicant && !actorUserId) {
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

    const actor = actorUserId
      ? (await getActiveChallengerRowsByIdsInScope(tx, objective.teamId, [actorUserId]))[0] ?? null
      : await resolveActiveChallengerByName(tx, objective.teamId, nextApplicant);
    if (!actor) {
      return { status: "forbidden" as const };
    }

    const challengerUserIds = await challengerUserIdsForRow(tx, objective.teamId, objective.challengerUserIds ?? [], objective.challengers ?? []);
    const challengers = uniqueParticipantNames(objective.challengers ?? []);
    if (isObjectiveChallenger({ challengerUserIds }, actor.id)) {
      return { status: "alreadyAccepted" as const, challengers };
    }
    const assignedChallengerUserIds = await assignedChallengerUserIdsForRow(tx, objective.teamId, objective.assignedChallengerUserIds ?? [], objective.assignedChallengers ?? []);
    if (isObjectiveAssignedChallenger({ assignedChallengerUserIds, challengerUserIds }, actor.id)) {
      return { status: "alreadyRecruited" as const };
    }
    if (objectiveClosedForChallengeEntry(objective) || !canApplyForObjectiveChallenge(objective)) {
      return { status: "closed" as const };
    }

    const applications = objective.challengeApplications ?? [];
    if (applications.some((application) => (application.applicantUserId ?? null) === actor.id && application.status === "pending")) {
      return { status: "alreadyApplied" as const };
    }

    const application: ChallengeApplication = {
      id: makeId("challenge-application"),
      applicant: actor.name,
      applicantUserId: actor.id,
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
        applicant: actor.name,
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

  const data = await getOrfStateSnapshot({ scope: appliedResult.scope });
  const applied = data.objectives.find((item) => item.id === objectiveId);
  return applied ? { status: "applied", objective: applied } : { status: "notFound" };
}

export type ObjectiveMutationInvalidReason = ObjectiveFreezeBlockReason;

export type ObjectiveFlowMutationOutcome =
  | { status: "ok"; objective: Objective }
  | { status: "invalid"; reason?: ObjectiveMutationInvalidReason }
  | { status: "notFound" };

export type ObjectiveAlignmentMutationOutcome =
  | { status: "ok"; request: ObjectiveAlignmentRequest }
  | { status: "invalid"; reason?: ObjectiveMutationInvalidReason }
  | { status: "notFound" }
  | { status: "forbidden" }
  | { status: "duplicate" }
  | { status: "closed" };

async function objectiveOutcome(objectiveId: string, scope?: RuntimeScope | null): Promise<ObjectiveFlowMutationOutcome> {
  const data = await getOrfStateSnapshot({ scope });
  const objective = data.objectives.find((item) => item.id === objectiveId);
  return objective ? { status: "ok", objective } : { status: "notFound" };
}

async function objectiveAlignmentOutcome(requestId: string, scope?: RuntimeScope | null): Promise<ObjectiveAlignmentMutationOutcome> {
  const data = await getOrfStateSnapshot({ scope });
  const request = data.objectiveAlignmentRequests.find((item) => item.id === requestId);
  return request ? { status: "ok", request } : { status: "notFound" };
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
    const applicant = application.applicantUserId
      ? (await getActiveChallengerRowsByIdsInScope(tx, objective.teamId, [application.applicantUserId]))[0] ?? null
      : await resolveActiveChallengerByName(tx, objective.teamId, application.applicant);
    if (!applicant) return { status: "invalid" as const };

    const challengerUserIds = await challengerUserIdsForRow(tx, objective.teamId, objective.challengerUserIds ?? [], objective.challengers ?? []);
    const challengers = uniqueParticipantNames([...(objective.challengers ?? []), applicant.name]);
    await tx
      .update(objectives)
      .set({
        challengers,
        challengerUserIds: uniqueParticipantUserIds([...challengerUserIds, applicant.id]),
        flowStatus: objectiveLifecycleTransitions.acceptChallenge.to,
        stage: objectiveLifecycleTransitions.acceptChallenge.stage,
        acceptedAt: objective.acceptedAt ?? acceptedAt,
        confirmationDueAt: objective.confirmationDueAt ?? nextConfirmationDueAt,
        challengeApplications: applications.map((item) =>
          item.id === applicationId ? { ...item, applicant: applicant.name, applicantUserId: applicant.id, status: "approved", decidedAt: acceptedAt, decidedBy: actorId } : item,
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
        applicant: applicant.name,
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
    const assignedChallengerUserIds = await assignedChallengerUserIdsForRow(tx, objective.teamId, objective.assignedChallengerUserIds ?? [], objective.assignedChallengers ?? []);
    const challengerUserIds = await challengerUserIdsForRow(tx, objective.teamId, objective.challengerUserIds ?? [], objective.challengers ?? []);
    await tx
      .update(objectives)
      .set({
        challengeApplications: nextApplications,
        flowStatus: objectiveFlowStatusAfterChallengeApplicationReview({
          hasAcceptedChallengers: objectiveHasChallengers({ challengerUserIds }),
          hasAssignedChallengers: assignedChallengerUserIds.length > 0,
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
    const currentChallengerUserIds = await challengerUserIdsForRow(tx, objective.teamId, objective.challengerUserIds ?? [], objective.challengers ?? []);
    const recruitMemberRows = await getActiveChallengerRowsByNamesInScope(tx, objective.teamId, members);
    const recruitMembers = uniqueParticipantNames(members);
    if (recruitMembers.some((member) => !recruitMemberRows.some((row) => row.name === member))) return { status: "invalid" as const };
    const recruitCandidates = recruitMembers
      .map((member) => recruitMemberRows.find((row) => row.name === member))
      .filter((member): member is ScopedMemberIdentity => Boolean(member))
      .filter((member) => !currentChallengerUserIds.includes(member.id));
    if (recruitMembers.length === 0) return { status: "invalid" as const };
    if (recruitCandidates.length === 0) return { status: "invalid" as const };
    const currentAssignedUserIds = await assignedChallengerUserIdsForRow(tx, objective.teamId, objective.assignedChallengerUserIds ?? [], objective.assignedChallengers ?? []);
    const currentAssignedRows = await getActiveChallengerRowsByIdsInScope(tx, objective.teamId, currentAssignedUserIds);
    const assignedChallengerUserIds = uniqueParticipantUserIds([...currentAssignedUserIds, ...recruitCandidates.map((member) => member.id)]).filter((userId) => !currentChallengerUserIds.includes(userId));
    if (assignedChallengerUserIds.length === 0) return { status: "invalid" as const };
    const assignedNameById = new Map([...currentAssignedRows, ...recruitMemberRows, ...recruitCandidates].map((member) => [member.id, member.name]));
    const assignedChallengers = assignedChallengerUserIds.map((userId) => assignedNameById.get(userId)).filter((name): name is string => Boolean(name));
    await tx
      .update(objectives)
      .set({
        assignedChallengers,
        assignedChallengerUserIds,
        flowStatus: objectiveFlowStatusAfterRecruitment({
          currentFlowStatus: objective.flowStatus,
          hasAcceptedChallengers: currentChallengerUserIds.length > 0,
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
        memberNames: recruitCandidates.map((member) => member.name),
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

    const objectiveResults = await tx
      .select({ objectiveId: results.objectiveId, uncertaintyLevel: results.uncertaintyLevel, uncertaintyScore: results.uncertaintyScore })
      .from(results)
      .where(eq(results.objectiveId, objectiveId));
    const freezeReadiness = objectiveFreezeReadinessAfterReestimate(objective, objectiveResults);
    if (freezeReadiness.status === "blocked") {
      return { status: "invalid" as const, reason: freezeReadiness.reason };
    }

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
        assignedChallengerUserIds: [],
        challengeApplications,
        flowStatus: objectiveLifecycleTransitions.freezeAfterReestimate.to,
        stage: objectiveLifecycleTransitions.freezeAfterReestimate.stage,
        confirmedAt: decidedAt,
        updatedAt: today(),
        updatedBy: actorId,
      })
      .where(eq(objectives.id, objectiveId));

    await tx
      .update(objectiveAlignmentRequests)
      .set({
        status: "completed",
        commanderFeedback: "重估对齐完成，目标已冻结。",
        reviewedBy: actorId,
        reviewedByUserId: actorId,
        reviewedAt: decidedAt,
      })
      .where(
        and(
          eq(objectiveAlignmentRequests.objectiveId, objectiveId),
          eq(objectiveAlignmentRequests.kind, "reestimateCompletion"),
          inArray(objectiveAlignmentRequests.status, ["requested", "scheduled"]),
        ),
      );

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

export interface CreateObjectiveAlignmentRequestInput {
  kind: ObjectiveAlignmentRequestKind;
  scheduledAt?: string | null;
  meetingRoom?: string | null;
  note?: string | null;
}

export interface ReviewObjectiveAlignmentRequestInput {
  status: Extract<ObjectiveAlignmentRequestStatus, "scheduled" | "completed" | "needsWork" | "cancelled">;
  scheduledAt?: string | null;
  meetingRoom?: string | null;
  commanderFeedback?: string | null;
}

function objectiveAcceptsAlignmentRequest(objective: Pick<Objective, "flowStatus">, kind: ObjectiveAlignmentRequestKind) {
  if (kind === "reestimateCompletion") return objective.flowStatus === "reestimating";
  return objective.flowStatus === "submitted";
}

export async function createObjectiveAlignmentRequest(
  objectiveId: string,
  input: CreateObjectiveAlignmentRequestInput,
  actor: Pick<CommentActor, "id" | "name" | "role">,
): Promise<ObjectiveAlignmentMutationOutcome> {
  const requestId = makeId("alignment");
  const proposedAt = nowIso();
  const requested = await db.transaction(async (tx) => {
    const [objective] = await tx.select().from(objectives).where(eq(objectives.id, objectiveId)).limit(1).for("update");
    if (!objective) return { status: "notFound" as const };
    if (!objectiveAcceptsAlignmentRequest(objective, input.kind)) return { status: "closed" as const };
    const challengerUserIds = await challengerUserIdsForRow(tx, objective.teamId, objective.challengerUserIds ?? [], objective.challengers ?? []);
    if (actor.role !== "member" || !isObjectiveChallenger({ challengerUserIds }, actor.id)) {
      return { status: "forbidden" as const };
    }

    const openRequests = await tx
      .select({ id: objectiveAlignmentRequests.id })
      .from(objectiveAlignmentRequests)
      .where(
        and(
          eq(objectiveAlignmentRequests.objectiveId, objectiveId),
          eq(objectiveAlignmentRequests.kind, input.kind),
          inArray(objectiveAlignmentRequests.status, ["requested", "scheduled"]),
        ),
      )
      .limit(1);
    if (openRequests.length > 0) return { status: "duplicate" as const };

    await tx.insert(objectiveAlignmentRequests).values({
      id: requestId,
      teamId: objective.teamId,
      objectiveId: objective.id,
      kind: input.kind,
      requestedBy: actor.name,
      requestedByUserId: actor.id,
      status: input.scheduledAt || input.meetingRoom ? "scheduled" : "requested",
      proposedAt,
      scheduledAt: input.scheduledAt?.trim() || null,
      meetingRoom: input.meetingRoom?.trim() || null,
      note: input.note?.trim() || null,
      commanderFeedback: null,
      reviewedBy: null,
      reviewedByUserId: null,
      reviewedAt: null,
    });

    await tx.update(objectives).set({ updatedAt: today(), updatedBy: actor.id }).where(eq(objectives.id, objectiveId));

    return {
      status: "created" as const,
      notification: {
        kind: input.kind,
        meetingRoom: input.meetingRoom?.trim() || null,
        objectiveId: objective.id,
        objectiveTitle: objective.title,
        requestId,
        scheduledAt: input.scheduledAt?.trim() || null,
        teamId: objective.teamId,
      },
      scope: runtimeScope(objective.teamId),
    };
  });

  if (requested.status === "notFound") return { status: "notFound" };
  if (requested.status === "closed") return { status: "closed" };
  if (requested.status === "forbidden") return { status: "forbidden" };
  if (requested.status === "duplicate") return { status: "duplicate" };

  await notifyAdminsOfObjectiveAlignmentRequest({
    actorName: actor.name,
    actorUserId: actor.id,
    ...requested.notification,
  });
  publishObjectiveInvalidation({
    actorUserId: actor.id,
    reason: "objective.alignment.changed",
    objectiveId,
    teamId: runtimeScopeStorageId(requested.scope),
  });

  return objectiveAlignmentOutcome(requestId, requested.scope);
}

export async function reviewObjectiveAlignmentRequest(
  objectiveId: string,
  requestId: string,
  input: ReviewObjectiveAlignmentRequestInput,
  actorId: string,
): Promise<ObjectiveAlignmentMutationOutcome> {
  const existing = await db
    .select({
      id: objectiveAlignmentRequests.id,
      kind: objectiveAlignmentRequests.kind,
      objectiveId: objectiveAlignmentRequests.objectiveId,
      requestedBy: objectiveAlignmentRequests.requestedBy,
      requestedByUserId: objectiveAlignmentRequests.requestedByUserId,
      status: objectiveAlignmentRequests.status,
      teamId: objectiveAlignmentRequests.teamId,
      objectiveTitle: objectives.title,
    })
    .from(objectiveAlignmentRequests)
    .innerJoin(objectives, eq(objectiveAlignmentRequests.objectiveId, objectives.id))
    .where(and(eq(objectiveAlignmentRequests.id, requestId), eq(objectiveAlignmentRequests.objectiveId, objectiveId)))
    .limit(1);
  const request = existing[0];
  if (!request) return { status: "notFound" };
  if (!["requested", "scheduled"].includes(request.status)) return { status: "closed" };

  if (input.status === "completed") {
    if (request.kind !== "reestimateCompletion") return { status: "invalid" };
    const frozen = await freezeObjectiveAfterReestimate(objectiveId, actorId);
    if (frozen.status !== "ok") return frozen.status === "notFound" ? { status: "notFound" } : { status: "invalid", reason: frozen.reason };

    const completed = await objectiveAlignmentOutcome(requestId, runtimeScope(request.teamId));
    if (completed.status === "ok") {
      await notifyMemberOfObjectiveAlignmentReview({
        actorUserId: actorId,
        commanderFeedback: completed.request.commanderFeedback,
        kind: completed.request.kind,
        objectiveId,
        objectiveTitle: request.objectiveTitle,
        requestedBy: completed.request.requestedBy,
        status: completed.request.status,
        teamId: request.teamId,
      });
    }
    return completed;
  }

  const reviewedAt = nowIso();
  const feedback = input.commanderFeedback?.trim() || (input.status === "needsWork" ? "请补充后重新对齐。" : null);
  const updated = await db.transaction(async (tx) => {
    const rows = await tx
      .update(objectiveAlignmentRequests)
      .set({
        status: input.status,
        scheduledAt: input.scheduledAt?.trim() || null,
        meetingRoom: input.meetingRoom?.trim() || null,
        commanderFeedback: feedback,
        reviewedBy: actorId,
        reviewedByUserId: actorId,
        reviewedAt,
      })
      .where(
        and(
          eq(objectiveAlignmentRequests.id, requestId),
          eq(objectiveAlignmentRequests.objectiveId, objectiveId),
          inArray(objectiveAlignmentRequests.status, ["requested", "scheduled"]),
        ),
      )
      .returning({ id: objectiveAlignmentRequests.id });
    if (rows.length === 0) return false;
    await tx.update(objectives).set({ updatedAt: today(), updatedBy: actorId }).where(eq(objectives.id, objectiveId));
    return true;
  });
  if (!updated) return { status: "closed" };

  publishObjectiveInvalidation({
    actorUserId: actorId,
    reason: "objective.alignment.changed",
    objectiveId,
    teamId: request.teamId,
  });

  const outcome = await objectiveAlignmentOutcome(requestId, runtimeScope(request.teamId));
  if (outcome.status === "ok") {
    await notifyMemberOfObjectiveAlignmentReview({
      actorUserId: actorId,
      commanderFeedback: outcome.request.commanderFeedback,
      kind: outcome.request.kind,
      objectiveId,
      objectiveTitle: request.objectiveTitle,
      requestedBy: outcome.request.requestedBy,
      status: outcome.request.status,
      teamId: request.teamId,
    });
  }
  return outcome;
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

export async function canEditObjectiveResultsDuringReestimate(objectiveId: string, memberUserId: string, scope?: RuntimeScope | null): Promise<boolean> {
  const actorUserId = memberUserId.trim();
  if (!actorUserId) return false;
  const storageScopeId = scope ? runtimeScopeStorageId(scope) : "";

  const [objective] = await db
    .select({
      flowStatus: objectives.flowStatus,
      challengerUserIds: objectives.challengerUserIds,
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
    (objective.challengerUserIds ?? []).includes(actorUserId)
  );
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
      .set({ uncertaintyLevel, uncertaintyScore: uncertaintyScoreFor(uncertaintyLevel), updatedAt: today(), updatedBy: actorId })
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
  input: { resultId: string; title: string; reason: string },
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

type CommentTarget =
  | {
      kind: "workItem";
      objectiveId: string;
      storageScopeId: string;
      title: string;
    }
  | {
      feedbackId: string;
      kind: "feedback";
      storageScopeId: string;
      title: string;
    };

type ObjectiveWorkItemMutationOutcome = "allowed" | "forbidden" | "notFound";

async function canMutateObjectiveComment(
  actor: CommentActor,
  objectiveId: string,
): Promise<ObjectiveWorkItemMutationOutcome> {
  const storageScopeId = actor.scope ? runtimeScopeStorageId(actor.scope) : "";
  const [objective] = await db
    .select({ challengerUserIds: objectives.challengerUserIds, flowStatus: objectives.flowStatus, teamId: objectives.teamId })
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

  const actorUserId = actor.id.trim();
  return actorUserId &&
    canMutateObjectiveCommentsAsChallengerByFlow(objective) &&
    (objective.challengerUserIds ?? []).includes(actorUserId)
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
      assignedChallengerUserIds: objectives.assignedChallengerUserIds,
      challengerUserIds: objectives.challengerUserIds,
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

  const actorUserId = actor.id.trim();
  return actorUserId && (isObjectiveChallenger(objective, actorUserId) || isObjectiveAssignedChallenger(objective, actorUserId)) ? "allowed" : "forbidden";
}

function actorCanUseScopedTeamTarget(actor: CommentActor, storageScopeId: string) {
  const actorStorageScopeId = actor.scope ? runtimeScopeStorageId(actor.scope) : "";
  return Boolean(storageScopeId) && (!actorStorageScopeId || actorStorageScopeId === storageScopeId);
}

async function canMutateCommentTarget(actor: CommentActor, target: CommentTarget): Promise<ObjectiveWorkItemMutationOutcome> {
  if (target.kind === "workItem") {
    return canMutateObjectiveComment(actor, target.objectiveId);
  }

  return actorCanUseScopedTeamTarget(actor, target.storageScopeId) ? "allowed" : "notFound";
}

async function canReadCommentTarget(actor: CommentActor, target: CommentTarget): Promise<ObjectiveWorkItemMutationOutcome> {
  if (target.kind === "workItem") {
    return canReadObjectiveComment(actor, target.objectiveId);
  }

  return actorCanUseScopedTeamTarget(actor, target.storageScopeId) ? "allowed" : "notFound";
}

async function resolveCommentTarget(targetType: CommentTargetType, targetId: string): Promise<CommentTarget | null> {
  if (targetType === "objective") {
    const [target] = await db
      .select({ objectiveId: objectives.id, teamId: objectives.teamId, title: objectives.title })
      .from(objectives)
      .where(eq(objectives.id, targetId))
      .limit(1);
    return target ? { kind: "workItem", objectiveId: target.objectiveId, storageScopeId: target.teamId, title: target.title } : null;
  }

  if (targetType === "result") {
    const [target] = await db
      .select({ objectiveId: results.objectiveId, teamId: results.teamId, title: results.title })
      .from(results)
      .where(eq(results.id, targetId))
      .limit(1);
    return target ? { kind: "workItem", objectiveId: target.objectiveId, storageScopeId: target.teamId, title: target.title } : null;
  }

  if (targetType === "task") {
    const [target] = await db
      .select({ objectiveId: tasks.linkedObjectiveId, teamId: tasks.teamId, title: tasks.title })
      .from(tasks)
      .where(eq(tasks.id, targetId))
      .limit(1);
    return target ? { kind: "workItem", objectiveId: target.objectiveId, storageScopeId: target.teamId, title: target.title } : null;
  }

  if (targetType === "feedback") {
    const [target] = await db
      .select({ feedbackId: feedback.id, teamId: feedback.teamId, title: feedback.phenomenon })
      .from(feedback)
      .where(eq(feedback.id, targetId))
      .limit(1);
    return target ? { feedbackId: target.feedbackId, kind: "feedback", storageScopeId: target.teamId, title: target.title } : null;
  }

  const [target] = await db
    .select({ objectiveId: tasks.linkedObjectiveId, teamId: tasks.teamId, title: taskChecklistItems.label })
    .from(taskChecklistItems)
    .innerJoin(tasks, eq(tasks.id, taskChecklistItems.taskId))
    .where(eq(taskChecklistItems.id, targetId))
    .limit(1);
  return target ? { kind: "workItem", objectiveId: target.objectiveId, storageScopeId: target.teamId, title: target.title } : null;
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

  const access = await canMutateCommentTarget(actor, target);
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
  await deleteExpiredPendingCommentAttachments().catch(() => 0);

  const target = await resolveCommentTarget(input.targetType, input.targetId);
  if (!target) {
    return { status: "notFound" };
  }
  const access = await canMutateCommentTarget(actor, target);
  if (access !== "allowed") {
    return { status: access === "notFound" ? "notFound" : "forbidden" };
  }

  const createdAt = nowIso();
  const prepared = await prepareCommentAttachment({
    body: input.body,
    createdAt,
    createdBy: actor.id,
    fileName: input.fileName,
    messageId: null,
    mimeType: input.mimeType,
    storageScopeId: target.storageScopeId,
    targetId: input.targetId,
    targetType: input.targetType,
  });
  if (prepared.status !== "ok") {
    return { status: prepared.status };
  }

  try {
    const [row] = await db.insert(commentAttachments).values(prepared.prepared.row).returning();

    return {
      status: "ok",
      attachment: commentAttachmentDto(row),
      markdown: prepared.prepared.markdown,
    };
  } catch (error) {
    await deleteStoredCommentAttachmentObjects([prepared.prepared.row]);
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
  const access = await canReadCommentTarget(actor, target);
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
  const access = await canMutateCommentTarget(actor, target);
  if (access === "notFound") {
    return { status: "notFound" };
  }
  if (access === "forbidden") {
    return { status: "forbidden" };
  }

  const targetTitle = target.title;
  const createdAt = nowIso();
  const attachmentIds = extractCommentAttachmentIds(body);
  const mentionedUserIds = extractCommentMentionUserIds(body);
  const createdComment = await db.transaction(async (tx) => {
    if (target.kind === "workItem") {
      const [lockedObjective] = await tx
        .select({ id: objectives.id })
        .from(objectives)
        .where(eq(objectives.id, target.objectiveId))
        .limit(1)
        .for("update");
      if (!lockedObjective) {
        return null;
      }
    } else {
      const [lockedFeedback] = await tx
        .select({ id: feedback.id })
        .from(feedback)
        .where(eq(feedback.id, target.feedbackId))
        .limit(1)
        .for("update");
      if (!lockedFeedback) {
        return null;
      }
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
    mentionedUserIds,
    targetId: input.targetId,
    targetTitle,
    targetType: input.targetType,
    teamId: target.storageScopeId,
  });

  if (input.targetType === "feedback") {
    await notifyFeedbackParticipantsOfComment({
      actorName: actor.name,
      actorUserId: actor.id,
      commentMessageId: createdComment.messageId,
      commentThreadId: createdComment.threadId,
      mentionedUserIds,
      targetId: input.targetId,
      targetTitle,
      teamId: target.storageScopeId,
    });
  }

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
  const access = await canMutateCommentTarget(actor, target);
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
  const access = await canMutateCommentTarget(actor, target);
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
  const access = await canMutateCommentTarget(actor, target);
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

  if (actor.role !== "member" || !(objective.challengerUserIds ?? []).includes(actor.id)) {
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
      submittedByUserId: actor.id,
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

  const data = await getOrfStateSnapshot({ scope: runtimeScope(objective.teamId) });
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

  if (actor.role !== "member" || !(objective.challengerUserIds ?? []).includes(actor.id)) {
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
      requestedByUserId: actor.id,
      body,
      resultClaims: resultClaims.resultClaims,
      selfTestReportBody: input.selfTestReportBody?.trim() || null,
      status: "requested",
      commanderFeedback: null,
      reviewedBy: null,
      reviewedByUserId: null,
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

  const data = await getOrfStateSnapshot({ scope: runtimeScope(created.teamId) });
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
        reviewedByUserId: actorId,
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

  const data = await getOrfStateSnapshot({ scope: runtimeScope(reviewed.teamId) });
  const trialReview = data.objectiveTrialReviews.find((item) => item.id === trialReviewId);
  return trialReview ? { status: "ok", trialReview } : { status: "notFound" };
}

export interface ReviewObjectiveLootInput {
  lootId?: string;
  acceptedResult?: ObjectiveAcceptedResult;
  resultReviews?: Array<{ resultId: string; acceptedResult: ResultAcceptedResult }>;
  contributionResolution?: { ratios: ContributionAllocation[]; reason: string };
  contributionRatios?: ContributionAllocation[];
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
  const challengerRows = await getMemberRowsByIdsInScope(db, objective.teamId, objective.challengerUserIds ?? []);
  const challengerNameById = new Map(challengerRows.map((member) => [member.id, member.name]));
  const challengerUserIds = objectiveChallengerUserIds(objective);
  const challengerUserIdSet = new Set(challengerUserIds);
  const allChallengerTargets = challengerUserIds
    .map((userId) => ({ member: challengerNameById.get(userId) ?? userId, memberUserId: userId }))
    .filter((target) => Boolean(target.member));
  const participantTargets = input.contributionResolution
    ? settlementParticipantTargetsForResolution(input.contributionResolution.ratios, allChallengerTargets)
    : allChallengerTargets;
  if (!participantTargets) return { status: "invalid" };
  const participantUserIds = participantTargets.map((target) => target.memberUserId);
  const challengers = participantTargets.map((target) => target.member);
  const settlementPlan = planObjectiveSettlement({
    objective: { ...objective, challengers, challengerUserIds: participantUserIds },
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
  const userIdByName = new Map(challengerRows.map((user) => [user.name, user.id]));
  const contributionRatios = settlementPlan.contributionRatios.map((item) => {
    const userId = item.memberUserId?.trim() || userIdByName.get(item.member) || "";
    return {
      ...item,
      memberName: userId ? challengerNameById.get(userId) ?? item.member : item.member,
      userId,
    };
  });
  if (contributionRatios.some((item) => !item.userId || !challengerUserIdSet.has(item.userId))) {
    return { status: "invalid" };
  }
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
        assignedChallengerUserIds: [],
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
    if (contributionRatios.length > 0) {
      await tx.insert(pointLedger).values(
        contributionRatios.map((item) => ({
          id: makeId("points"),
          teamId: objective.teamId,
          objectiveId: objective.id,
          userId: item.userId,
          memberName: item.memberName,
          points: Number((settlementPlan.settlementPoints * item.ratio).toFixed(2)),
          reason,
          createdAt,
        })),
      );
    }
    await tx
      .update(objectiveAlignmentRequests)
      .set({
        status: "completed",
        commanderFeedback: "验收对齐完成，目标已结算。",
        reviewedBy: actorId,
        reviewedByUserId: actorId,
        reviewedAt: createdAt,
      })
      .where(
        and(
          eq(objectiveAlignmentRequests.objectiveId, objectiveId),
          eq(objectiveAlignmentRequests.kind, "acceptance"),
          inArray(objectiveAlignmentRequests.status, ["requested", "scheduled"]),
        ),
      );
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

function settlementParticipantTargetsForResolution(
  ratios: ContributionAllocation[],
  targets: Array<{ member: string; memberUserId: string }>,
) {
  const targetByUserId = new Map(targets.map((target) => [target.memberUserId, target]));
  const targetByName = new Map(targets.map((target) => [target.member, target]));
  const selected = new Map<string, { member: string; memberUserId: string }>();

  for (const ratio of ratios) {
    const target = (ratio.memberUserId ? targetByUserId.get(ratio.memberUserId) : undefined) ?? targetByName.get(ratio.member);
    if (!target || selected.has(target.memberUserId)) return null;
    selected.set(target.memberUserId, target);
  }

  return selected.size > 0 ? Array.from(selected.values()) : null;
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

    const siblingRows = await tx.select({ sortOrder: tasks.sortOrder }).from(tasks).where(eq(tasks.linkedObjectiveId, objective.id));
    const sortOrder = siblingRows.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;
    const id = makeId("ORF");
    const now = today();
    const assigneeName = input.assignee.trim();
    const assigneeUser = assigneeName ? await resolveActiveMemberByName(objective.teamId, assigneeName) : null;
    if (assigneeName && !assigneeUser) {
      return null;
    }

    await tx.insert(tasks).values({
      id,
      teamId: objective.teamId,
      title,
      description: input.description?.trim() || "执行支撑目标的下一步技术任务。",
      status: "Todo",
      priority: input.priority ?? "Medium",
      assignee: assigneeUser?.name ?? "",
      assigneeUserId: assigneeUser?.id ?? null,
      linkedObjectiveId: objective.id,
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

  const data = await getOrfStateSnapshot({ scope: created.scope });
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

export async function updateObjectiveProject(
  objectiveId: string,
  input: { projectId?: string | null },
  context: { scope: RuntimeScope; userId: string },
): Promise<ObjectiveDetailsMutationOutcome> {
  const storageScopeId = runtimeScopeStorageId(context.scope);
  const nextProjectId = nullableTrimmedText(input.projectId);

  const updatedObjective = await db.transaction(async (tx) => {
    const [objective] = await tx.select().from(objectives).where(eq(objectives.id, objectiveId)).limit(1).for("update");
    if (!objective || objective.teamId !== storageScopeId) return { status: "notFound" as const };

    if (nextProjectId) {
      const [project] = await tx.select({ id: projects.id }).from(projects).where(and(eq(projects.id, nextProjectId), eq(projects.teamId, storageScopeId))).limit(1);
      if (!project) return { status: "invalid" as const };
    }

    const [updated] = await tx
      .update(objectives)
      .set({
        projectId: nextProjectId,
        updatedAt: today(),
        updatedBy: context.userId,
      })
      .where(eq(objectives.id, objectiveId))
      .returning({ id: objectives.id, teamId: objectives.teamId });

    if (!updated) return { status: "notFound" as const };
    return { status: "updated" as const, teamId: updated.teamId };
  });

  if (updatedObjective.status === "notFound") return { status: "notFound" };
  if (updatedObjective.status === "invalid") return { status: "invalid" };

  publishObjectiveInvalidation({
    actorUserId: context.userId,
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

export async function updateResultDetails(
  resultId: string,
  detail: string | null | undefined,
  actorId?: string | null,
): Promise<boolean> {
  const nextDetail = detail?.trim() ?? "";
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
      .set({ detail: nextDetail, updatedAt: today(), updatedBy: actorId ?? null })
      .where(eq(results.id, resultId))
      .returning({ id: results.id });
    return updated.length > 0 ? { teamId: target.teamId } : null;
  });

  if (!updatedResult) {
    return false;
  }

  publishOrfDataInvalidation({
    actorUserId: actorId ?? undefined,
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
