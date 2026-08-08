import { and, desc, eq, inArray, or } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  feedbackReportAttachmentDto,
  type FeedbackActivityType,
  type FeedbackActorRole,
  type FeedbackActorSnapshot,
  type FeedbackActorStatus,
  type FeedbackCapabilities,
  type FeedbackImpact,
  type FeedbackPriority,
  type FeedbackRelationType,
  type FeedbackResolution,
  type FeedbackStage,
} from "../contracts";
import { deriveFeedbackCapabilities } from "../domain";
import {
  feedback,
  feedbackActivityEvents,
  feedbackCauseCategories,
  feedbackRelations,
  feedbackReportAttachments,
  feedbackUserViews,
} from "../infrastructure/database/schema";

export type FeedbackReadModelDatabase = Pick<NodePgDatabase<any>, "select">;

export type FeedbackReadModelViewer = {
  readonly id: string;
  readonly role: FeedbackActorRole;
  readonly status: FeedbackActorStatus;
};

export type FeedbackReadModelActivityItem = {
  readonly id: string;
  readonly actorUserId?: string | null;
  readonly activityType: FeedbackActivityType;
  readonly payload: Record<string, unknown>;
  readonly sequence: number;
  readonly at: string;
};

export type FeedbackReadModelRelation = {
  readonly id: string;
  readonly type: FeedbackRelationType;
  readonly sourceFeedbackId: string;
  readonly targetFeedbackId: string;
  readonly createdBy?: string | null;
  readonly createdAt: string;
};

export type FeedbackReadModelReportAttachment = ReturnType<typeof feedbackReportAttachmentDto>;

export type FeedbackReadModelIssue = {
  readonly id: string;
  readonly capabilities: FeedbackCapabilities;
  readonly projectId?: string | null;
  readonly title: string;
  readonly description: string;
  readonly reportAttachments: FeedbackReadModelReportAttachment[];
  readonly causeCategories: string[];
  readonly impact: FeedbackImpact;
  readonly priority: FeedbackPriority | null;
  readonly stage: FeedbackStage;
  readonly resolution: FeedbackResolution | null;
  readonly assigneeUserId?: string | null;
  readonly createdBy: string;
  readonly updatedBy?: string | null;
  readonly version: number;
  readonly closedAt?: string | null;
  readonly closedByUserId?: string | null;
  readonly lastActivityByUserId?: string | null;
  readonly lastActivitySequence: number;
  readonly lastSeenSequence: number;
  readonly requiresAction: boolean;
  readonly unread: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly activity: FeedbackReadModelActivityItem[];
  readonly relations: FeedbackReadModelRelation[];
};

type FeedbackRow = typeof feedback.$inferSelect;
type FeedbackCauseRow = typeof feedbackCauseCategories.$inferSelect;
type FeedbackActivityRow = typeof feedbackActivityEvents.$inferSelect;
type FeedbackRelationRow = typeof feedbackRelations.$inferSelect;
type FeedbackReportAttachmentRow = typeof feedbackReportAttachments.$inferSelect;
type FeedbackUserViewRow = {
  feedbackId: string;
  lastSeenSequence: number;
};

export async function getFeedbackReadModelIssues(
  database: FeedbackReadModelDatabase,
  input: { readonly teamId: string; readonly viewer?: FeedbackReadModelViewer | null },
): Promise<FeedbackReadModelIssue[]> {
  const feedbackRows = await getFeedbackRows(database, input.teamId);
  return getFeedbackReadModelIssuesFromRows(database, {
    feedbackRows,
    teamId: input.teamId,
    viewer: input.viewer ?? null,
  });
}

export async function getFeedbackReadModelIssue(
  database: FeedbackReadModelDatabase,
  input: { readonly feedbackId: string; readonly teamId: string; readonly viewer?: FeedbackReadModelViewer | null },
): Promise<FeedbackReadModelIssue | null> {
  const feedbackId = input.feedbackId.trim();
  if (!feedbackId) return null;
  const feedbackRows = await getFeedbackRowsByIds(database, input.teamId, [feedbackId]);
  const [issue] = await getFeedbackReadModelIssuesFromRows(database, {
    feedbackRows,
    teamId: input.teamId,
    viewer: input.viewer ?? null,
  });
  return issue ?? null;
}

async function getFeedbackReadModelIssuesFromRows(
  database: FeedbackReadModelDatabase,
  input: {
    readonly feedbackRows: readonly FeedbackRow[];
    readonly teamId: string;
    readonly viewer: FeedbackReadModelViewer | null;
  },
): Promise<FeedbackReadModelIssue[]> {
  const feedbackRows = input.feedbackRows;
  const feedbackIds = feedbackRows.map((item) => item.id);
  const [causeRows, activityRows, relationRows, reportAttachmentRows, userViewRows] = await Promise.all([
    getFeedbackCauseRows(database, feedbackIds),
    getFeedbackActivityRows(database, feedbackIds),
    getFeedbackRelationRows(database, feedbackIds),
    getFeedbackReportAttachmentRows(database, feedbackIds),
    getFeedbackUserViewRows(database, input.teamId, feedbackIds, input.viewer?.id),
  ]);

  return mapFeedbackIssueRows({
    activityRows,
    causeRows,
    feedbackRows,
    relationRows,
    reportAttachmentRows,
    userViewRows,
    viewer: input.viewer,
  });
}

async function getFeedbackRows(database: FeedbackReadModelDatabase, storageScopeId: string) {
  return database
    .select()
    .from(feedback)
    .where(eq(feedback.teamId, storageScopeId))
    .orderBy(desc(feedback.updatedAt), desc(feedback.createdAt), desc(feedback.id));
}

async function getFeedbackRowsByIds(database: FeedbackReadModelDatabase, storageScopeId: string, feedbackIssueIds: readonly string[]) {
  if (feedbackIssueIds.length === 0) return [];
  return database
    .select()
    .from(feedback)
    .where(and(eq(feedback.teamId, storageScopeId), inArray(feedback.id, [...feedbackIssueIds])))
    .orderBy(desc(feedback.updatedAt), desc(feedback.createdAt), desc(feedback.id));
}

async function getFeedbackCauseRows(database: FeedbackReadModelDatabase, feedbackIssueIds: string[]) {
  if (feedbackIssueIds.length === 0) return [];
  return database.select().from(feedbackCauseCategories).where(inArray(feedbackCauseCategories.feedbackId, feedbackIssueIds));
}

async function getFeedbackActivityRows(database: FeedbackReadModelDatabase, feedbackIssueIds: string[]) {
  if (feedbackIssueIds.length === 0) return [];
  return database.select().from(feedbackActivityEvents).where(inArray(feedbackActivityEvents.feedbackId, feedbackIssueIds));
}

async function getFeedbackReportAttachmentRows(database: FeedbackReadModelDatabase, feedbackIssueIds: string[]) {
  if (feedbackIssueIds.length === 0) return [];
  return database.select().from(feedbackReportAttachments).where(inArray(feedbackReportAttachments.feedbackId, feedbackIssueIds));
}

async function getFeedbackRelationRows(database: FeedbackReadModelDatabase, feedbackIssueIds: string[]) {
  if (feedbackIssueIds.length === 0) return [];
  return database
    .select()
    .from(feedbackRelations)
    .where(or(inArray(feedbackRelations.sourceFeedbackId, feedbackIssueIds), inArray(feedbackRelations.targetFeedbackId, feedbackIssueIds)));
}

async function getFeedbackUserViewRows(
  database: FeedbackReadModelDatabase,
  teamId: string,
  feedbackIssueIds: string[],
  viewerUserId: string | null | undefined,
) {
  const normalizedViewerUserId = viewerUserId?.trim();
  if (!normalizedViewerUserId || feedbackIssueIds.length === 0) return [];
  return database
    .select({
      feedbackId: feedbackUserViews.feedbackId,
      lastSeenSequence: feedbackUserViews.lastSeenSequence,
    })
    .from(feedbackUserViews)
    .where(
      and(
        eq(feedbackUserViews.teamId, teamId),
        eq(feedbackUserViews.userId, normalizedViewerUserId),
        inArray(feedbackUserViews.feedbackId, feedbackIssueIds),
      ),
    );
}

function mapFeedbackIssueRows(input: {
  activityRows: readonly FeedbackActivityRow[];
  causeRows: readonly FeedbackCauseRow[];
  feedbackRows: readonly FeedbackRow[];
  relationRows: readonly FeedbackRelationRow[];
  reportAttachmentRows: readonly FeedbackReportAttachmentRow[];
  userViewRows: readonly FeedbackUserViewRow[];
  viewer: FeedbackReadModelViewer | null;
}): FeedbackReadModelIssue[] {
  const causeCategoriesByFeedback = new Map<string, string[]>();
  for (const item of [...input.causeRows].sort((left, right) => left.sortOrder - right.sortOrder)) {
    const list = causeCategoriesByFeedback.get(item.feedbackId) ?? [];
    list.push(item.category);
    causeCategoriesByFeedback.set(item.feedbackId, list);
  }

  const activityByFeedback = new Map<string, FeedbackReadModelIssue["activity"]>();
  const lastActivitySequenceByFeedback = new Map<string, number>();
  const lastActivityActorByFeedback = new Map<string, string | null>();
  const lastOtherActivitySequenceByFeedback = new Map<string, number>();
  const viewerUserId = input.viewer?.id.trim() || null;
  for (const item of [...input.activityRows].sort((left, right) => left.sequence - right.sequence || left.createdAt.localeCompare(right.createdAt))) {
    const list = activityByFeedback.get(item.feedbackId) ?? [];
    list.push({
      id: item.id,
      actorUserId: item.actorUserId,
      activityType: item.activityType,
      payload: normalizeActivityPayload(item.payload),
      sequence: item.sequence,
      at: item.createdAt,
    });
    activityByFeedback.set(item.feedbackId, list);
    const currentLastSequence = lastActivitySequenceByFeedback.get(item.feedbackId) ?? 0;
    if (item.sequence >= currentLastSequence) {
      lastActivitySequenceByFeedback.set(item.feedbackId, item.sequence);
      lastActivityActorByFeedback.set(item.feedbackId, item.actorUserId ?? null);
    }
    if (viewerUserId && item.actorUserId !== viewerUserId) {
      lastOtherActivitySequenceByFeedback.set(
        item.feedbackId,
        Math.max(lastOtherActivitySequenceByFeedback.get(item.feedbackId) ?? 0, item.sequence),
      );
    }
  }

  const lastSeenSequenceByFeedback = new Map(input.userViewRows.map((row) => [row.feedbackId, row.lastSeenSequence]));
  const reportAttachmentsByFeedback = new Map<string, FeedbackReadModelIssue["reportAttachments"]>();
  for (const item of [...input.reportAttachmentRows].sort((left, right) => left.sortOrder - right.sortOrder || left.createdAt.localeCompare(right.createdAt))) {
    const list = reportAttachmentsByFeedback.get(item.feedbackId) ?? [];
    list.push(feedbackReportAttachmentDto(item));
    reportAttachmentsByFeedback.set(item.feedbackId, list);
  }

  const relationsByFeedback = new Map<string, FeedbackReadModelIssue["relations"]>();
  for (const item of [...input.relationRows].sort((left, right) => left.createdAt.localeCompare(right.createdAt))) {
    const relation = {
      id: item.id,
      type: item.type,
      sourceFeedbackId: item.sourceFeedbackId,
      targetFeedbackId: item.targetFeedbackId,
      createdBy: optional(item.createdBy),
      createdAt: item.createdAt,
    };
    for (const feedbackId of [item.sourceFeedbackId, item.targetFeedbackId]) {
      const list = relationsByFeedback.get(feedbackId) ?? [];
      list.push(relation);
      relationsByFeedback.set(feedbackId, list);
    }
  }

  return input.feedbackRows.map((item) => ({
    id: item.id,
    capabilities: deriveReadModelFeedbackCapabilities(item, input.viewer),
    projectId: item.projectId,
    title: item.title,
    description: item.description,
    reportAttachments: reportAttachmentsByFeedback.get(item.id) ?? [],
    causeCategories: causeCategoriesByFeedback.get(item.id) ?? [],
    impact: item.impact,
    priority: item.priority,
    stage: item.stage,
    resolution: item.resolution,
    assigneeUserId: item.assigneeUserId,
    createdBy: item.createdBy,
    updatedBy: item.updatedBy,
    version: item.version,
    closedAt: item.closedAt,
    closedByUserId: item.closedByUserId,
    lastActivityByUserId: lastActivityActorByFeedback.get(item.id) ?? null,
    lastActivitySequence: lastActivitySequenceByFeedback.get(item.id) ?? 0,
    lastSeenSequence: lastSeenSequenceByFeedback.get(item.id) ?? 0,
    requiresAction: feedbackRequiresAction(item, viewerUserId),
    unread: viewerUserId ? (lastOtherActivitySequenceByFeedback.get(item.id) ?? 0) > (lastSeenSequenceByFeedback.get(item.id) ?? 0) : false,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    activity: activityByFeedback.get(item.id) ?? [],
    relations: relationsByFeedback.get(item.id) ?? [],
  }));
}

function feedbackRequiresAction(item: FeedbackRow, viewerUserId: string | null) {
  if (!viewerUserId) return false;
  if ((item.stage === "open" || item.stage === "in_progress") && item.assigneeUserId === viewerUserId) return true;
  if (item.stage === "pending_verification" && item.createdBy === viewerUserId) return true;
  return false;
}

function deriveReadModelFeedbackCapabilities(item: FeedbackRow, viewer: FeedbackReadModelViewer | null): FeedbackCapabilities {
  if (!viewer) return emptyFeedbackCapabilities();
  return deriveFeedbackCapabilities({
    actor: feedbackReadModelActor(viewer, item.teamId),
    feedback: {
      id: item.id,
      assigneeUserId: item.assigneeUserId,
      closedAt: item.closedAt,
      closedByUserId: item.closedByUserId,
      createdByUserId: item.createdBy,
      impact: item.impact,
      priority: item.priority,
      projectId: item.projectId,
      resolution: item.resolution,
      stage: item.stage,
      teamId: item.teamId,
      version: item.version,
    },
  });
}

function feedbackReadModelActor(viewer: FeedbackReadModelViewer, teamId: string): FeedbackActorSnapshot {
  return {
    id: viewer.id,
    role: viewer.role,
    status: viewer.status,
    teamId,
  };
}

function emptyFeedbackCapabilities(): FeedbackCapabilities {
  return {
    canAcceptVerification: false,
    canChangeAssignee: false,
    canEditReport: false,
    canImportExport: false,
    canRejectVerification: false,
    canReopen: false,
    canSetPriority: false,
    canStart: false,
    canSubmitVerification: false,
    canView: false,
    canWithdraw: false,
  };
}

function optional<T>(value: T | null | undefined): T | undefined {
  return value ?? undefined;
}

function normalizeActivityPayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  return payload as Record<string, unknown>;
}
