import { and, eq, or } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type {
  FeedbackActivityType,
  FeedbackActorRole,
  FeedbackActorStatus,
  FeedbackImpact,
  FeedbackPriority,
  FeedbackRelationType,
  FeedbackResolution,
  FeedbackStage,
  FeedbackTransitionInput,
} from "../contracts";
import {
  applyFeedbackTransition,
  canonicalizeFeedbackRelation,
  deriveFeedbackCapabilities,
  type FeedbackDomainErrorCode,
} from "../domain";
import {
  feedback,
  feedbackActivityEvents,
  feedbackCauseCategories,
  feedbackRelations,
  feedbackReportAttachments,
} from "../infrastructure/database/schema";
import {
  feedbackNowIso,
  makeFeedbackActivityId,
  makeFeedbackId,
  makeFeedbackRelationId,
} from "./ids";
import {
  insertFeedbackNotificationDispatch,
  type FeedbackNotificationDispatchDraft,
} from "./notificationDispatch";
import { upsertFeedbackParticipants } from "./participants";
import type { FeedbackCommandResult } from "./commandResult";

export type FeedbackWriteClient = Pick<NodePgDatabase<any>, "delete" | "insert" | "select" | "update">;
export type FeedbackWriteDatabase = Pick<NodePgDatabase<any>, "transaction">;

export type FeedbackWriteActor = {
  readonly id: string;
  readonly role: FeedbackActorRole;
  readonly status: FeedbackActorStatus;
  readonly teamId: string;
};

export type FeedbackCreateDraft = {
  readonly id: string;
  readonly createdAt: string;
};

export type FeedbackCreateReportAttachmentInput = {
  readonly id: string;
  readonly objectKey: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly fileSize: number;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly sourceCommentAttachmentId?: string | null;
};

export type CreateFeedbackIssueWriteInput = {
  readonly assigneeUserId?: string | null;
  readonly causeCategories: readonly string[];
  readonly description: string;
  readonly draft: FeedbackCreateDraft;
  readonly impact: FeedbackImpact;
  readonly notificationDispatch?: FeedbackNotificationDispatchDraft | null;
  readonly priority?: FeedbackPriority | null;
  readonly projectId?: string | null;
  readonly reportAttachments?: readonly FeedbackCreateReportAttachmentInput[];
  readonly title: string;
};

export type CreateFeedbackIssueWriteResult =
  | { status: "ok"; feedbackId: string; assigneeUserId?: string | null; notificationDispatchId?: string | null; projectId?: string | null; title: string }
  | { status: "notFound" }
  | { status: "invalid" };

type FeedbackCommandFailure = Exclude<FeedbackCommandResult, { status: "ok" }>;

export type UpdateFeedbackMetadataWriteInput = {
  readonly causeCategories?: readonly string[];
  readonly description?: string;
  readonly expectedVersion: number;
  readonly feedbackId: string;
  readonly impact?: FeedbackImpact;
  readonly priority?: FeedbackPriority | null;
  readonly projectId?: string | null;
  readonly title?: string;
};

export type UpdateFeedbackAssigneeWriteInput = {
  readonly assigneeUserId?: string | null;
  readonly expectedVersion: number;
  readonly feedbackId: string;
  readonly notificationDispatch?: FeedbackNotificationDispatchDraft | null;
};

export type UpdateFeedbackAssigneeWriteResult =
  | FeedbackCommandFailure
  | { status: "ok"; changed: false }
  | {
      status: "ok";
      changed: true;
      nextAssigneeUserId?: string | null;
      notificationDispatchId?: string | null;
      previousAssigneeUserId?: string | null;
      createdBy?: string | null;
      title: string;
    };

export type TransitionFeedbackIssueWriteInput = {
  readonly command: FeedbackTransitionInput;
  readonly feedbackId: string;
  readonly notificationDispatch?: FeedbackTransitionNotificationDispatchFactory | null;
};

export type FeedbackTransitionNotificationDispatchContext = {
  readonly assigneeUserId?: string | null;
  readonly createdBy?: string | null;
  readonly feedbackId: string;
  readonly projectId?: string | null;
  readonly resolution?: FeedbackResolution | null;
  readonly stage: FeedbackStage;
  readonly teamId: string;
  readonly title: string;
};

export type FeedbackTransitionNotificationDispatchFactory = (
  context: FeedbackTransitionNotificationDispatchContext,
) => FeedbackNotificationDispatchDraft | null;

export type TransitionFeedbackIssueWriteResult =
  | FeedbackCommandFailure
  | {
      status: "ok";
      changed: true;
      assigneeUserId?: string | null;
      createdBy?: string | null;
      notificationDispatchId?: string | null;
      projectId?: string | null;
      resolution?: FeedbackResolution | null;
      stage: FeedbackStage;
      title: string;
    };

export type AddFeedbackRelationWriteInput = {
  readonly expectedVersion: number;
  readonly feedbackId: string;
  readonly targetFeedbackId: string;
  readonly type: FeedbackRelationType;
};

export type RemoveFeedbackRelationWriteInput = {
  readonly expectedVersion: number;
  readonly feedbackId: string;
  readonly relationId: string;
};

export type FeedbackTargetTitleSync = (
  database: FeedbackWriteClient,
  input: {
    readonly feedbackId: string;
    readonly teamId: string;
    readonly title: string;
    readonly updatedAt: string;
  },
) => Promise<void>;

export type FeedbackWriteHost = {
  readonly syncFeedbackTargetTitle?: FeedbackTargetTitleSync;
};

type FeedbackRow = typeof feedback.$inferSelect;

export function createFeedbackDraft(): FeedbackCreateDraft {
  return {
    id: makeFeedbackId(),
    createdAt: feedbackNowIso(),
  };
}

function normalizeTeamId(actor: FeedbackWriteActor) {
  return actor.teamId.trim();
}

function actorSnapshot(actor: FeedbackWriteActor, teamId: string) {
  return {
    id: actor.id,
    role: actor.role,
    status: actor.status,
    teamId,
  };
}

function entitySnapshot(row: FeedbackRow) {
  return {
    id: row.id,
    assigneeUserId: row.assigneeUserId,
    closedAt: row.closedAt,
    closedByUserId: row.closedByUserId,
    createdByUserId: row.createdBy,
    impact: row.impact,
    priority: row.priority,
    projectId: row.projectId,
    resolution: row.resolution,
    stage: row.stage,
    teamId: row.teamId,
    version: row.version,
  };
}

function uniqueStrings(values: readonly string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalizeCauseCategories(categories: readonly string[] | undefined) {
  if (!categories) return undefined;
  return uniqueStrings(categories);
}

function sameStringList(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function domainErrorToCommandStatus(code: FeedbackDomainErrorCode): FeedbackCommandResult["status"] {
  if (code === "expected_version_mismatch") return "conflict";
  if (code === "forbidden" || code === "actor_inactive" || code === "actor_out_of_scope" || code === "administrative_takeover_reason_required") {
    return "forbidden";
  }
  return "invalid";
}

function invalidReportAttachment(input: FeedbackCreateReportAttachmentInput) {
  return !input.id.trim() ||
    !input.objectKey.trim() ||
    !input.fileName.trim() ||
    !input.mimeType.trim() ||
    !Number.isFinite(input.fileSize) ||
    input.fileSize < 0;
}

export async function createFeedbackIssue(
  database: FeedbackWriteDatabase,
  input: CreateFeedbackIssueWriteInput,
  actor: FeedbackWriteActor,
): Promise<CreateFeedbackIssueWriteResult> {
  const teamId = normalizeTeamId(actor);
  if (!teamId) return { status: "notFound" };

  const id = input.draft.id.trim();
  const createdAt = input.draft.createdAt.trim();
  const title = input.title.trim();
  const description = input.description.trim();
  const causeCategories = normalizeCauseCategories(input.causeCategories);
  const assigneeUserId = input.assigneeUserId?.trim() || null;
  const projectId = input.projectId?.trim() || null;
  const reportAttachments = input.reportAttachments ?? [];

  if (!id || !createdAt || !title || !description || !causeCategories?.length || reportAttachments.some(invalidReportAttachment)) {
    return { status: "invalid" };
  }

  let notificationDispatchId: string | null = null;
  await database.transaction(async (tx) => {
    await tx.insert(feedback).values({
      id,
      teamId,
      projectId,
      title,
      description,
      stage: "open",
      resolution: null,
      impact: input.impact,
      priority: input.priority ?? null,
      assigneeUserId,
      createdBy: actor.id,
      updatedBy: actor.id,
      version: 0,
      createdAt,
      updatedAt: createdAt,
      closedAt: null,
      closedByUserId: null,
    });

    await tx.insert(feedbackCauseCategories).values(
      causeCategories.map((category, index) => ({
        teamId,
        feedbackId: id,
        category,
        sortOrder: index,
      })),
    );

    if (reportAttachments.length > 0) {
      await tx.insert(feedbackReportAttachments).values(
        reportAttachments.map((attachment, index) => ({
          id: attachment.id,
          teamId,
          feedbackId: id,
          objectKey: attachment.objectKey,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          fileSize: attachment.fileSize,
          width: attachment.width ?? null,
          height: attachment.height ?? null,
          sortOrder: index,
          createdBy: actor.id,
          createdAt,
          sourceCommentAttachmentId: attachment.sourceCommentAttachmentId ?? null,
        })),
      );
    }

    await upsertFeedbackParticipants(tx, {
      teamId,
      feedbackId: id,
      userIds: [actor.id],
      participatedAt: createdAt,
    });

    const activityEventId = makeFeedbackActivityId();
    await tx.insert(feedbackActivityEvents).values({
      id: activityEventId,
      teamId,
      feedbackId: id,
      actorUserId: actor.id,
      activityType: "feedback.created",
      payload: { title, assigneeUserId, projectId, priority: input.priority ?? null },
      createdAt,
    });
    notificationDispatchId = await insertFeedbackNotificationDispatch(tx, {
      activityEventId,
      dispatch: input.notificationDispatch,
    });
  });

  return { status: "ok", feedbackId: id, assigneeUserId, notificationDispatchId, projectId, title };
}

export async function updateFeedbackIssueMetadata(
  database: FeedbackWriteDatabase,
  input: UpdateFeedbackMetadataWriteInput,
  actor: FeedbackWriteActor,
  host: FeedbackWriteHost = {},
): Promise<FeedbackCommandResult> {
  const teamId = normalizeTeamId(actor);
  if (!teamId) return { status: "notFound" };

  const nextTitle = input.title === undefined ? undefined : input.title.trim();
  const nextDescription = input.description === undefined ? undefined : input.description.trim();
  const nextCauseCategories = normalizeCauseCategories(input.causeCategories);
  if (nextTitle === "" || nextDescription === "" || (nextCauseCategories && nextCauseCategories.length === 0)) {
    return { status: "invalid" };
  }
  const nextProjectId = input.projectId === undefined ? undefined : input.projectId?.trim() || null;

  return database.transaction(async (tx): Promise<FeedbackCommandResult> => {
    const [target] = await tx.select().from(feedback).where(eq(feedback.id, input.feedbackId)).limit(1).for("update");
    if (!target || target.teamId !== teamId) return { status: "notFound" };
    if (target.version !== input.expectedVersion) return { status: "conflict" };

    const capabilities = deriveFeedbackCapabilities({
      actor: actorSnapshot(actor, teamId),
      feedback: entitySnapshot(target),
    });
    if (!capabilities.canEditReport) return { status: "forbidden" };

    const causeRows = await tx
      .select({ category: feedbackCauseCategories.category, sortOrder: feedbackCauseCategories.sortOrder })
      .from(feedbackCauseCategories)
      .where(eq(feedbackCauseCategories.feedbackId, input.feedbackId));
    const currentCauseCategories = causeRows
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((row) => row.category);
    const changedFields: string[] = [];
    const patch: Partial<typeof feedback.$inferInsert> = {};
    const payload: Record<string, unknown> = {};

    if (nextTitle !== undefined && nextTitle !== target.title) {
      patch.title = nextTitle;
      changedFields.push("title");
      payload.previousTitle = target.title;
      payload.nextTitle = nextTitle;
    }
    if (nextDescription !== undefined && nextDescription !== target.description) {
      patch.description = nextDescription;
      changedFields.push("description");
    }
    if (input.impact !== undefined && input.impact !== target.impact) {
      patch.impact = input.impact;
      changedFields.push("impact");
      payload.previousImpact = target.impact;
      payload.nextImpact = input.impact;
    }
    if (input.priority !== undefined && input.priority !== target.priority) {
      patch.priority = input.priority;
      changedFields.push("priority");
      payload.previousPriority = target.priority;
      payload.nextPriority = input.priority;
    }
    if (nextProjectId !== undefined && nextProjectId !== (target.projectId ?? null)) {
      patch.projectId = nextProjectId;
      changedFields.push("projectId");
      payload.previousProjectId = target.projectId ?? null;
      payload.nextProjectId = nextProjectId;
    }

    const causeCategoriesChanged = Boolean(nextCauseCategories && !sameStringList(currentCauseCategories, nextCauseCategories));
    if (causeCategoriesChanged && nextCauseCategories) {
      changedFields.push("causeCategories");
      payload.previousCauseCategories = currentCauseCategories;
      payload.nextCauseCategories = nextCauseCategories;
      await tx.delete(feedbackCauseCategories).where(eq(feedbackCauseCategories.feedbackId, input.feedbackId));
      await tx.insert(feedbackCauseCategories).values(
        nextCauseCategories.map((category, index) => ({
          teamId,
          feedbackId: input.feedbackId,
          category,
          sortOrder: index,
        })),
      );
    }

    if (changedFields.length === 0) {
      return { status: "ok", changed: false };
    }

    const updatedAt = feedbackNowIso();
    await tx
      .update(feedback)
      .set({
        ...patch,
        updatedAt,
        updatedBy: actor.id,
        version: target.version + 1,
      })
      .where(and(eq(feedback.id, input.feedbackId), eq(feedback.teamId, teamId), eq(feedback.version, input.expectedVersion)));

    if (nextTitle !== undefined) {
      await host.syncFeedbackTargetTitle?.(tx, {
        feedbackId: input.feedbackId,
        teamId,
        title: nextTitle,
        updatedAt,
      });
    }

    const activityType: FeedbackActivityType = changedFields.some((field) => field === "title" || field === "description")
      ? "feedback.report.changed"
      : "feedback.metadata.changed";
    await tx.insert(feedbackActivityEvents).values({
      id: makeFeedbackActivityId(),
      teamId,
      feedbackId: input.feedbackId,
      actorUserId: actor.id,
      activityType,
      payload: { ...payload, changedFields },
      createdAt: updatedAt,
    });
    return { status: "ok", changed: true };
  });
}

export async function updateFeedbackIssueAssignee(
  database: FeedbackWriteDatabase,
  input: UpdateFeedbackAssigneeWriteInput,
  actor: FeedbackWriteActor,
): Promise<UpdateFeedbackAssigneeWriteResult> {
  const teamId = normalizeTeamId(actor);
  if (!teamId) return { status: "notFound" };
  const nextAssigneeUserId = input.assigneeUserId?.trim() || null;

  return database.transaction(async (tx): Promise<UpdateFeedbackAssigneeWriteResult> => {
    const [target] = await tx.select().from(feedback).where(eq(feedback.id, input.feedbackId)).limit(1).for("update");
    if (!target || target.teamId !== teamId) return { status: "notFound" };
    if (target.version !== input.expectedVersion) return { status: "conflict" };

    const capabilities = deriveFeedbackCapabilities({
      actor: actorSnapshot(actor, teamId),
      feedback: entitySnapshot(target),
    });
    if (!capabilities.canChangeAssignee) return { status: "forbidden" };
    if ((target.assigneeUserId ?? null) === nextAssigneeUserId) return { status: "ok", changed: false };

    const updatedAt = feedbackNowIso();
    await tx
      .update(feedback)
      .set({
        assigneeUserId: nextAssigneeUserId,
        updatedAt,
        updatedBy: actor.id,
        version: target.version + 1,
      })
      .where(and(eq(feedback.id, input.feedbackId), eq(feedback.teamId, teamId), eq(feedback.version, input.expectedVersion)));
    const activityEventId = makeFeedbackActivityId();
    await tx.insert(feedbackActivityEvents).values({
      id: activityEventId,
      teamId,
      feedbackId: input.feedbackId,
      actorUserId: actor.id,
      activityType: "feedback.assignee.changed",
      payload: {
        previousAssigneeUserId: target.assigneeUserId,
        nextAssigneeUserId,
      },
      createdAt: updatedAt,
    });
    const notificationDispatchId = await insertFeedbackNotificationDispatch(tx, {
      activityEventId,
      dispatch: input.notificationDispatch,
    });

    return {
      status: "ok",
      changed: true,
      createdBy: target.createdBy,
      nextAssigneeUserId,
      notificationDispatchId,
      previousAssigneeUserId: target.assigneeUserId,
      title: target.title,
    };
  });
}

async function duplicateTargetFeedbackIds(database: FeedbackWriteClient, teamId: string, feedbackId: string) {
  const rows = await database
    .select({ targetFeedbackId: feedbackRelations.targetFeedbackId })
    .from(feedbackRelations)
    .where(
      and(
        eq(feedbackRelations.teamId, teamId),
        eq(feedbackRelations.sourceFeedbackId, feedbackId),
        eq(feedbackRelations.type, "duplicates"),
      ),
    );
  return rows.map((row) => row.targetFeedbackId);
}

export async function transitionFeedbackIssue(
  database: FeedbackWriteDatabase,
  input: TransitionFeedbackIssueWriteInput,
  actor: FeedbackWriteActor,
): Promise<TransitionFeedbackIssueWriteResult> {
  const teamId = normalizeTeamId(actor);
  if (!teamId) return { status: "notFound" };

  return database.transaction(async (tx): Promise<TransitionFeedbackIssueWriteResult> => {
    const [target] = await tx.select().from(feedback).where(eq(feedback.id, input.feedbackId)).limit(1).for("update");
    if (!target || target.teamId !== teamId) return { status: "notFound" };

    const duplicateIds = await duplicateTargetFeedbackIds(tx, teamId, input.feedbackId);
    const occurredAt = feedbackNowIso();
    const outcome = applyFeedbackTransition({
      actor: actorSnapshot(actor, teamId),
      command: input.command,
      duplicateRelations: { duplicateTargetFeedbackIds: duplicateIds },
      feedback: entitySnapshot(target),
      occurredAt,
    });
    if (!outcome.ok) {
      const status = domainErrorToCommandStatus(outcome.error.code);
      if (status === "conflict") return { status: "conflict" };
      if (status === "forbidden") return { status: "forbidden" };
      return { status: "invalid" };
    }

    await tx
      .update(feedback)
      .set({
        stage: outcome.value.feedback.stage,
        resolution: outcome.value.feedback.resolution,
        closedAt: outcome.value.feedback.closedAt ?? null,
        closedByUserId: outcome.value.feedback.closedByUserId ?? null,
        updatedAt: occurredAt,
        updatedBy: actor.id,
        version: outcome.value.feedback.version,
      })
      .where(and(eq(feedback.id, input.feedbackId), eq(feedback.teamId, teamId), eq(feedback.version, input.command.expectedVersion)));
    const activityEventId = makeFeedbackActivityId();
    await tx.insert(feedbackActivityEvents).values({
      id: activityEventId,
      teamId,
      feedbackId: input.feedbackId,
      actorUserId: actor.id,
      activityType: outcome.value.activityType,
      payload: {
        command: input.command,
        previousStage: target.stage,
        previousResolution: target.resolution,
        nextStage: outcome.value.feedback.stage,
        nextResolution: outcome.value.feedback.resolution,
      },
      createdAt: occurredAt,
    });
    const notificationDispatchId = await insertFeedbackNotificationDispatch(tx, {
      activityEventId,
      dispatch: input.notificationDispatch?.({
        assigneeUserId: target.assigneeUserId,
        createdBy: target.createdBy,
        feedbackId: input.feedbackId,
        projectId: target.projectId,
        resolution: outcome.value.feedback.resolution,
        stage: outcome.value.feedback.stage,
        teamId,
        title: target.title,
      }) ?? null,
    });

    return {
      status: "ok",
      changed: true,
      assigneeUserId: target.assigneeUserId,
      createdBy: target.createdBy,
      notificationDispatchId,
      projectId: target.projectId,
      stage: outcome.value.feedback.stage,
      resolution: outcome.value.feedback.resolution,
      title: target.title,
    };
  });
}

export async function addFeedbackIssueRelation(
  database: FeedbackWriteDatabase,
  input: AddFeedbackRelationWriteInput,
  actor: FeedbackWriteActor,
): Promise<FeedbackCommandResult> {
  const teamId = normalizeTeamId(actor);
  if (!teamId) return { status: "notFound" };

  const targetFeedbackId = input.targetFeedbackId.trim();
  if (!targetFeedbackId || targetFeedbackId === input.feedbackId) {
    return { status: "invalid" };
  }

  return database.transaction(async (tx): Promise<FeedbackCommandResult> => {
    const [source] = await tx.select().from(feedback).where(eq(feedback.id, input.feedbackId)).limit(1).for("update");
    if (!source || source.teamId !== teamId) return { status: "notFound" };
    if (source.version !== input.expectedVersion) return { status: "conflict" };

    const capabilities = deriveFeedbackCapabilities({
      actor: actorSnapshot(actor, teamId),
      feedback: entitySnapshot(source),
    });
    if (!capabilities.canEditReport) return { status: "forbidden" };

    const [target] = await tx
      .select({ id: feedback.id, teamId: feedback.teamId })
      .from(feedback)
      .where(eq(feedback.id, targetFeedbackId))
      .limit(1);
    if (!target || target.teamId !== teamId) return { status: "notFound" };

    const canonical = canonicalizeFeedbackRelation({
      sourceFeedbackId: input.feedbackId,
      targetFeedbackId,
      type: input.type,
    });
    if (!canonical.ok) return { status: "invalid" };

    const relationId = makeFeedbackRelationId();
    const occurredAt = feedbackNowIso();
    const inserted = await tx
      .insert(feedbackRelations)
      .values({
        id: relationId,
        teamId,
        sourceFeedbackId: canonical.value.sourceFeedbackId,
        targetFeedbackId: canonical.value.targetFeedbackId,
        type: canonical.value.type,
        createdBy: actor.id,
        createdAt: occurredAt,
      })
      .onConflictDoNothing({
        target: [
          feedbackRelations.teamId,
          feedbackRelations.type,
          feedbackRelations.sourceFeedbackId,
          feedbackRelations.targetFeedbackId,
        ],
      })
      .returning({ id: feedbackRelations.id });

    if (inserted.length === 0) {
      return { status: "ok", changed: false };
    }

    await tx
      .update(feedback)
      .set({
        updatedAt: occurredAt,
        updatedBy: actor.id,
        version: source.version + 1,
      })
      .where(and(eq(feedback.id, input.feedbackId), eq(feedback.teamId, teamId), eq(feedback.version, input.expectedVersion)));

    await tx.insert(feedbackActivityEvents).values({
      id: makeFeedbackActivityId(),
      teamId,
      feedbackId: input.feedbackId,
      actorUserId: actor.id,
      activityType: "feedback.relation.added",
      payload: {
        relationId,
        type: canonical.value.type,
        sourceFeedbackId: canonical.value.sourceFeedbackId,
        targetFeedbackId: canonical.value.targetFeedbackId,
      },
      createdAt: occurredAt,
    });

    return { status: "ok", changed: true };
  });
}

export async function removeFeedbackIssueRelation(
  database: FeedbackWriteDatabase,
  input: RemoveFeedbackRelationWriteInput,
  actor: FeedbackWriteActor,
): Promise<FeedbackCommandResult> {
  const teamId = normalizeTeamId(actor);
  if (!teamId) return { status: "notFound" };

  const normalizedRelationId = input.relationId.trim();
  if (!normalizedRelationId) return { status: "invalid" };

  return database.transaction(async (tx): Promise<FeedbackCommandResult> => {
    const [targetFeedback] = await tx.select().from(feedback).where(eq(feedback.id, input.feedbackId)).limit(1).for("update");
    if (!targetFeedback || targetFeedback.teamId !== teamId) return { status: "notFound" };
    if (targetFeedback.version !== input.expectedVersion) return { status: "conflict" };

    const capabilities = deriveFeedbackCapabilities({
      actor: actorSnapshot(actor, teamId),
      feedback: entitySnapshot(targetFeedback),
    });
    if (!capabilities.canEditReport) return { status: "forbidden" };

    const [relation] = await tx
      .select()
      .from(feedbackRelations)
      .where(
        and(
          eq(feedbackRelations.id, normalizedRelationId),
          eq(feedbackRelations.teamId, teamId),
          or(eq(feedbackRelations.sourceFeedbackId, input.feedbackId), eq(feedbackRelations.targetFeedbackId, input.feedbackId)),
        ),
      )
      .limit(1);
    if (!relation) return { status: "notFound" };

    if (relation.type === "duplicates") {
      const [duplicateSource] = await tx
        .select({
          id: feedback.id,
          resolution: feedback.resolution,
          stage: feedback.stage,
          teamId: feedback.teamId,
        })
        .from(feedback)
        .where(eq(feedback.id, relation.sourceFeedbackId))
        .limit(1)
        .for("update");
      if (
        duplicateSource?.teamId === teamId &&
        duplicateSource.resolution === "duplicate" &&
        (duplicateSource.stage === "pending_verification" || duplicateSource.stage === "closed")
      ) {
        return { status: "invalid" };
      }
    }

    const occurredAt = feedbackNowIso();
    await tx.delete(feedbackRelations).where(and(eq(feedbackRelations.id, normalizedRelationId), eq(feedbackRelations.teamId, teamId)));
    await tx
      .update(feedback)
      .set({
        updatedAt: occurredAt,
        updatedBy: actor.id,
        version: targetFeedback.version + 1,
      })
      .where(and(eq(feedback.id, input.feedbackId), eq(feedback.teamId, teamId), eq(feedback.version, input.expectedVersion)));
    await tx.insert(feedbackActivityEvents).values({
      id: makeFeedbackActivityId(),
      teamId,
      feedbackId: input.feedbackId,
      actorUserId: actor.id,
      activityType: "feedback.relation.removed",
      payload: {
        relationId: relation.id,
        type: relation.type,
        sourceFeedbackId: relation.sourceFeedbackId,
        targetFeedbackId: relation.targetFeedbackId,
      },
      createdAt: occurredAt,
    });

    return { status: "ok", changed: true };
  });
}
