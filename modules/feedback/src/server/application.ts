import type { Readable } from "node:stream";
import type { OrfUnitOfWorkToken } from "@orf/module-protocol";
import {
  buildFeedbackIssueListProjection,
  defaultFeedbackIssueListFilters,
  type FeedbackCommandResult,
  type FeedbackFollowUpInput,
  type FeedbackImpact,
  type FeedbackIssueReadModelData,
  type FeedbackPriority,
  type FeedbackReferenceSummary,
  type FeedbackRelationType,
  type FeedbackResolution,
  type FeedbackStage,
  type FeedbackSubscriptionMutationMode,
  type FeedbackTransitionInput,
  type FeedbackWebCommentThread,
  type FeedbackWebProject,
  type FeedbackWebUser,
} from "../contracts";
import {
  createFeedbackDraft,
  createFeedbackIssue,
  commitFeedbackFollowUp,
  addFeedbackIssueRelation,
  removeFeedbackIssueRelation,
  transitionFeedbackIssue,
  updateFeedbackIssueAssignee,
  updateFeedbackIssueMetadata,
  updateFeedbackIssueReport,
} from "./writeModel";
import {
  getFeedbackDashboardSummary,
  getFeedbackReadModelIssue,
  getFeedbackReadModelIssues,
  getFeedbackReadModelListPage,
} from "./readModel";
import type { FeedbackReadModelViewer } from "./readModelProtocol";
import {
  buildFeedbackAssigneeChangedNotificationDispatch,
  buildFeedbackCommentCreatedNotificationDispatch,
  buildFeedbackCreatedNotificationDispatch,
  buildFeedbackFollowUpNotificationDispatch,
  buildFeedbackLifecycleChangedNotificationDispatch,
} from "./notificationDispatchPlans";
import {
  getFeedbackAssignmentNotificationDispatchRecipients,
  getFeedbackLifecycleNotificationDispatchRecipients,
  getFeedbackOrdinaryNotificationDispatchRecipients,
  getFeedbackSubscriptionMode,
  setFeedbackSubscriptionMode,
} from "./subscriptions";
import {
  getFeedbackCommentNotificationFacts,
  getFeedbackReferences as getFeedbackReferenceSummaries,
  listFeedbackReferences as listFeedbackReferenceSummaries,
  lockFeedbackCommentTarget,
  resolveFeedbackCommentTarget,
  searchFeedbackReferences as searchFeedbackReferenceSummaries,
} from "./references";
import {
  feedbackReportAttachmentResponseContentType,
  getFeedbackReportAttachmentContentFacts,
} from "./reportAttachmentContent";
import { insertFeedbackNotificationDispatch, mergeFeedbackNotificationDispatchRecipients } from "./notificationDispatch";
import {
  commitFeedbackImportBatch,
  preflightFeedbackImport,
  type FeedbackImportReferenceMappings,
} from "./transfer";
import {
  markFeedbackViewed as markFeedbackViewedInModule,
  recordFeedbackCommentCreatedActivity,
} from "./activity";
import type {
  FeedbackPreparedReportAttachment,
  FeedbackReadModelScope,
  FeedbackReferencePort,
  FeedbackScope,
  FeedbackServerApplicationPorts,
} from "./applicationPorts";
import type {
  FeedbackNotificationDispatchDraft,
  FeedbackNotificationRecipientDirectory,
} from "./notificationProtocol";

export type FeedbackApplicationCreateAttachmentInput = {
  readonly body: Readable;
  readonly clientId: string;
  readonly fileName: string;
  readonly mimeType: string;
};

export type FeedbackApplicationCreateInput = {
  readonly assigneeUserId?: string | null;
  readonly attachments?: readonly FeedbackApplicationCreateAttachmentInput[];
  readonly causeCategories: readonly string[];
  readonly description: string;
  readonly impact: FeedbackImpact;
  readonly priority?: FeedbackPriority | null;
  readonly projectId?: string | null;
  readonly title: string;
};

export type FeedbackApplicationActor = {
  readonly id: string;
  readonly name: string;
  readonly role: "admin" | "member";
  readonly status: "active" | "disabled" | "pending" | "rejected";
  readonly scope: FeedbackScope;
};

export type FeedbackApplicationCreateOutcome =
  | { readonly status: "ok"; readonly feedbackId: string }
  | { readonly status: "notFound" }
  | { readonly status: "invalid" }
  | { readonly status: "invalidAssignee" }
  | { readonly status: "invalidProject" }
  | { readonly status: "tooLarge" };

export type FeedbackApplicationUpdateMetadataInput = {
  readonly causeCategories?: readonly string[];
  readonly expectedVersion: number;
  readonly impact?: FeedbackImpact;
  readonly priority?: FeedbackPriority | null;
  readonly projectId?: string | null;
  readonly title?: string;
};

export type FeedbackApplicationUpdateReportInput = {
  readonly description: string;
  readonly expectedVersion: number;
};

export type FeedbackApplicationUpdateAssigneeInput = {
  readonly assigneeUserId: string | null;
  readonly expectedVersion: number;
};

export type FeedbackApplicationRelationInput = {
  readonly expectedVersion: number;
  readonly targetFeedbackId: string;
  readonly type: FeedbackRelationType;
};

export type FeedbackApplicationRemoveRelationInput = {
  readonly expectedVersion: number;
};

export type FeedbackApplicationViewedInput = {
  readonly seenThroughSequence: number;
};

export type FeedbackReportAttachmentContentOutcome =
  | {
      readonly status: "ok";
      readonly body: Readable;
      readonly contentDisposition: "attachment" | "inline";
      readonly contentLength?: number;
      readonly contentType: string;
      readonly fileName: string;
    }
  | { readonly status: "notFound" }
  | { readonly status: "forbidden" };

export type FeedbackApplicationImportUpload = {
  readonly body: Buffer;
  readonly fileName: string;
  readonly mimeType?: string;
  readonly referenceMappings?: FeedbackImportReferenceMappings;
};

export function createFeedbackServerApplication(ports: FeedbackServerApplicationPorts) {
  return new FeedbackServerApplication(ports);
}

export class FeedbackServerApplication implements FeedbackReferencePort {
  constructor(private readonly ports: FeedbackServerApplicationPorts) {}

  get actor() {
    return this.ports.actor;
  }

  get uploadMaxBytes() {
    return this.ports.limits.uploadMaxBytes;
  }

  getReportAttachmentMaxBytes() {
    return this.ports.limits.readReportAttachmentMaxBytes();
  }

  async getIssueList(scope: FeedbackReadModelScope): Promise<FeedbackIssueReadModelData> {
    const storageScopeId = storageScopeIdFor(scope.scope);
    const [projects, users] = await Promise.all([
      this.ports.projectDirectory.list(scope.scope),
      this.ports.userDirectory.listScopedUsers(scope.scope),
    ]);
    const filters = scope.filters ?? defaultFeedbackIssueListFilters;
    const listPage = await getFeedbackReadModelListPage(this.ports.database, {
      filters,
      pagination: scope.pagination ?? null,
      teamId: storageScopeId,
      viewer: feedbackReadModelViewer(users, scope.viewerUserId),
    });
    const commentSummaries = await this.ports.discussion.getCommentSummaries(
      scope.scope,
      listPage.issues.map((item) => item.id),
    );
    const list = buildFeedbackIssueListProjection({
      commentSummaries,
      feedback: listPage.issues,
      filters,
      projectionFacts: {
        assigneeOptions: feedbackListUserOptions(listPage.facts.optionFacts.assigneeUserIds, users),
        authorOptions: feedbackListUserOptions(listPage.facts.optionFacts.authorUserIds, users),
        counts: listPage.facts.counts,
        labelOptions: listPage.facts.optionFacts.labelOptions,
        matchedCount: listPage.facts.matchedCount,
        pageInfo: listPage.facts.pageInfo,
        totalCount: listPage.facts.totalCount,
      },
      projects,
      users,
    });

    return {
      comments: [],
      feedback: list.items.map((item) => item.feedback),
      list,
      projects: [...projects],
      users: [...users],
    };
  }

  async getDashboardSummary(scope: FeedbackScope) {
    return getFeedbackDashboardSummary(this.ports.database, {
      teamId: storageScopeIdFor(scope),
    });
  }

  async getAllIssueData(scope: FeedbackScope): Promise<FeedbackIssueReadModelData> {
    const [projects, users] = await Promise.all([
      this.ports.projectDirectory.list(scope),
      this.ports.userDirectory.listScopedUsers(scope),
    ]);
    const feedback = await getFeedbackReadModelIssues(this.ports.database, {
      teamId: storageScopeIdFor(scope),
      viewer: null,
    });
    const comments = await this.ports.discussion.getThreads(scope, feedback.map((item) => item.id));
    return {
      comments: [...comments],
      feedback,
      projects: [...projects],
      users: [...users],
    };
  }

  async getIssueDetail(feedbackId: string, scope: FeedbackReadModelScope): Promise<FeedbackIssueReadModelData | null> {
    const [projects, users] = await Promise.all([
      this.ports.projectDirectory.list(scope.scope),
      this.ports.userDirectory.listScopedUsers(scope.scope),
    ]);
    const feedback = await getFeedbackReadModelIssue(this.ports.database, {
      feedbackId,
      teamId: storageScopeIdFor(scope.scope),
      viewer: feedbackReadModelViewer(users, scope.viewerUserId),
    });
    if (!feedback) return null;

    const comments = await this.ports.discussion.getThreads(scope.scope, [feedbackId]);
    return {
      comments: [...comments],
      feedback: [feedback],
      projects: [...projects],
      users: [...users],
    };
  }

  async listAssigneeOptions(scope: FeedbackScope) {
    const users = await this.ports.userDirectory.listScopedUsers(scope);
    return users
      .filter((user) => user.status === "active")
      .map((user) => ({
        avatarUrl: user.avatarUrl ?? null,
        id: user.id,
        name: user.name,
      }));
  }

  getReferences(scope: FeedbackScope, feedbackIds: readonly string[]): Promise<readonly FeedbackReferenceSummary[]> {
    return getFeedbackReferenceSummaries(this.ports.database, {
      feedbackIds,
      teamId: storageScopeIdFor(scope),
    });
  }

  listReferences(scope: FeedbackScope, limit = 20): Promise<readonly FeedbackReferenceSummary[]> {
    return listFeedbackReferenceSummaries(this.ports.database, {
      limit,
      teamId: storageScopeIdFor(scope),
    });
  }

  searchReferences(scope: FeedbackScope, query: string, limit = 20): Promise<readonly FeedbackReferenceSummary[]> {
    return searchFeedbackReferenceSummaries(this.ports.database, {
      limit,
      query,
      teamId: storageScopeIdFor(scope),
    });
  }

  async createFeedback(
    input: FeedbackApplicationCreateInput,
    actor: FeedbackApplicationActor,
  ): Promise<FeedbackApplicationCreateOutcome> {
    const teamId = storageScopeIdFor(actor.scope);
    if (!teamId) return { status: "notFound" };

    const assigneeUser = input.assigneeUserId
      ? await this.ports.userDirectory.getActiveMemberById(actor.scope, input.assigneeUserId)
      : null;
    if (input.assigneeUserId && !assigneeUser) return { status: "invalidAssignee" };

    const projectId = input.projectId?.trim() || null;
    const project = projectId ? await this.ports.projectDirectory.getById(actor.scope, projectId) : null;
    if (projectId && !project) return { status: "invalidProject" };

    const draft = createFeedbackDraft();
    const uploadMaxBytes = await this.getReportAttachmentMaxBytes();
    const report = await this.ports.reportAttachments.prepareReport({
      actorUserId: actor.id,
      attachments: input.attachments ?? [],
      createdAt: draft.createdAt,
      description: input.description.trim(),
      feedbackId: draft.id,
      uploadMaxBytes,
      scope: actor.scope,
    });
    if (report.status !== "ok") return { status: report.status };

    let committed = false;
    try {
      const notificationDispatch = await this.prepareFeedbackCreatedNotificationDispatch({
        actorName: actor.name,
        actorUserId: actor.id,
        assigneeName: assigneeUser?.name ?? null,
        assigneeUserId: assigneeUser?.id ?? null,
        feedbackId: draft.id,
        project,
        teamId,
        title: input.title.trim(),
      });

      const created = await createFeedbackIssue(this.ports.database, {
        assigneeUserId: assigneeUser?.id ?? null,
        causeCategories: input.causeCategories,
        description: report.report.description,
        draft,
        impact: input.impact,
        notificationDispatch,
        priority: input.priority ?? null,
        projectId,
        reportAttachments: reportAttachmentsForWrite(report.report.attachments),
        title: input.title,
      }, feedbackWriteActor(actor));
      if (created.status !== "ok") {
        await this.deletePreparedReportAttachments(report.report.attachments);
        return created;
      }

      committed = true;
      await this.publishFeedbackChangedAfterCommit({
        actorUserId: actor.id,
        feedbackId: created.feedbackId,
        scope: actor.scope,
      });
      return { status: "ok", feedbackId: created.feedbackId };
    } catch (error) {
      if (!committed) {
        await this.deletePreparedReportAttachments(report.report.attachments);
      }
      throw error;
    }
  }

  async updateMetadata(
    feedbackId: string,
    input: FeedbackApplicationUpdateMetadataInput,
    actor: FeedbackApplicationActor,
  ): Promise<FeedbackCommandResult> {
    const nextProjectId = input.projectId === undefined ? undefined : input.projectId?.trim() || null;
    if (nextProjectId && !(await this.ports.projectDirectory.getById(actor.scope, nextProjectId))) {
      return { status: "invalidProject" };
    }

    const result = await updateFeedbackIssueMetadata(this.ports.database, {
      causeCategories: input.causeCategories,
      expectedVersion: input.expectedVersion,
      feedbackId,
      impact: input.impact,
      priority: input.priority,
      projectId: nextProjectId,
      title: input.title,
    }, feedbackWriteActor(actor), {
      syncFeedbackTargetTitle: (database, titleInput) => this.ports.discussion.syncTargetTitle({
        feedbackId: titleInput.feedbackId,
        scope: { storageScopeId: titleInput.teamId },
        title: titleInput.title,
        updatedAt: titleInput.updatedAt,
      }, database),
    });

    if (result.status === "ok" && result.changed) {
      await this.publishFeedbackChangedAfterCommit({ actorUserId: actor.id, feedbackId, scope: actor.scope });
    }
    return result;
  }

  async updateReport(
    feedbackId: string,
    input: FeedbackApplicationUpdateReportInput,
    actor: FeedbackApplicationActor,
  ): Promise<FeedbackCommandResult> {
    const result = await updateFeedbackIssueReport(this.ports.database, {
      description: input.description,
      expectedVersion: input.expectedVersion,
      feedbackId,
    }, feedbackWriteActor(actor));
    if (result.status === "ok" && result.changed) {
      await this.publishFeedbackChangedAfterCommit({ actorUserId: actor.id, feedbackId, scope: actor.scope });
    }
    return result;
  }

  async updateAssignee(
    feedbackId: string,
    input: FeedbackApplicationUpdateAssigneeInput,
    actor: FeedbackApplicationActor,
  ): Promise<FeedbackCommandResult> {
    const nextAssignee = input.assigneeUserId
      ? await this.ports.userDirectory.getActiveMemberById(actor.scope, input.assigneeUserId)
      : null;
    if (input.assigneeUserId && !nextAssignee) return { status: "invalidAssignee" };

    const currentFacts = await getFeedbackCommentNotificationFacts(this.ports.database, feedbackId);
    const previousAssignee = currentFacts?.assigneeUserId
      ? await this.ports.userDirectory.getActiveMemberById(actor.scope, currentFacts.assigneeUserId)
      : null;
    const notificationDispatch = currentFacts && currentFacts.teamId === storageScopeIdFor(actor.scope)
      ? await this.prepareFeedbackAssignedNotificationDispatch({
          actorName: actor.name,
          actorUserId: actor.id,
          createdBy: currentFacts.createdBy,
          feedbackId,
          nextAssigneeName: nextAssignee?.name ?? null,
          nextAssigneeUserId: nextAssignee?.id ?? null,
          previousAssigneeName: previousAssignee?.name ?? null,
          previousAssigneeUserId: currentFacts.assigneeUserId ?? null,
          teamId: storageScopeIdFor(actor.scope),
          title: currentFacts.title,
        })
      : null;

    const result = await updateFeedbackIssueAssignee(this.ports.database, {
      assigneeUserId: nextAssignee?.id ?? null,
      expectedVersion: input.expectedVersion,
      feedbackId,
      notificationDispatch,
    }, feedbackWriteActor(actor));

    if (result.status !== "ok") return result;
    if (result.changed) {
      await this.publishFeedbackChangedAfterCommit({ actorUserId: actor.id, feedbackId, scope: actor.scope });
    }
    return { status: "ok", changed: result.changed };
  }

  async followUp(
    feedbackId: string,
    input: FeedbackFollowUpInput,
    actor: FeedbackApplicationActor,
  ): Promise<FeedbackCommandResult> {
    const teamId = storageScopeIdFor(actor.scope);
    const current = await getFeedbackCommentNotificationFacts(this.ports.database, feedbackId);
    if (!current || current.teamId !== teamId) return { status: "notFound" };

    const hasAssigneeCommand = input.assigneeUserId !== undefined;
    const nextAssignee = hasAssigneeCommand && input.assigneeUserId
      ? await this.ports.userDirectory.getActiveMemberById(actor.scope, input.assigneeUserId)
      : null;
    if (input.assigneeUserId && !nextAssignee) return { status: "invalidAssignee" };
    const nextAssigneeUserId = hasAssigneeCommand ? nextAssignee?.id ?? null : current.assigneeUserId ?? null;
    const assigneeChanged = hasAssigneeCommand && nextAssigneeUserId !== (current.assigneeUserId ?? null);
    const previousAssignee = current.assigneeUserId
      ? await this.ports.userDirectory.getActiveMemberById(actor.scope, current.assigneeUserId)
      : null;
    const transition = input.transition
      ? { ...input.transition, expectedVersion: input.expectedVersion } as FeedbackTransitionInput
      : undefined;
    const project = current.projectId ? await this.ports.projectDirectory.getById(actor.scope, current.projectId) : null;

    const recipientGroups = await Promise.all([
      getFeedbackOrdinaryNotificationDispatchRecipients(this.ports.database, this.recipientDirectory(), {
        assigneeUserId: nextAssigneeUserId,
        createdBy: current.createdBy,
        feedbackId,
        includeCommentParticipants: true,
        teamId,
      }),
      assigneeChanged
        ? getFeedbackAssignmentNotificationDispatchRecipients(this.ports.database, this.recipientDirectory(), {
            createdBy: current.createdBy,
            feedbackId,
            nextAssigneeUserId,
            previousAssigneeUserId: current.assigneeUserId,
            teamId,
          })
        : Promise.resolve([]),
      transition
        ? getFeedbackLifecycleNotificationDispatchRecipients(this.ports.database, this.recipientDirectory(), {
            actionRequiredUserIds: uniqueUserIds([feedbackLifecycleActionRequiredUserId(transition, {
              assigneeUserId: nextAssigneeUserId,
              createdBy: current.createdBy,
            })]),
            assigneeUserId: nextAssigneeUserId,
            createdBy: current.createdBy,
            feedbackId,
            teamId,
          })
        : Promise.resolve([]),
    ]);
    const recipients = mergeFeedbackNotificationDispatchRecipients(recipientGroups.flat());

    return this.ports.discussion.commitFollowUp({
      actor: { id: actor.id, name: actor.name, role: actor.role, scope: actor.scope },
      body: input.comment?.body,
      feedbackId,
      parentMessageId: input.comment?.parentMessageId,
      replyToMessageId: input.comment?.replyToMessageId,
      title: current.title,
    }, ({ comment, unitOfWork }) => this.ports.unitOfWork.use(unitOfWork, (database) => {
      const excludedUserIds = new Set([
        actor.id,
        ...(comment?.mentionedUserIds ?? []),
        comment?.replyRecipientUserId ?? "",
      ].filter(Boolean));
      const filteredRecipients = recipients.filter((recipient) => !excludedUserIds.has(recipient.userId));
      const changedLabels = [transition ? "生命周期" : "", assigneeChanged ? "处理人" : ""].filter(Boolean);
      const content = comment
        ? this.ports.notificationContent.buildCommentContent({
            attachments: comment.attachments,
            commentBody: comment.body,
            summary: `${actor.name} 跟进了反馈「${current.title}」${changedLabels.length ? `，同时更新了${changedLabels.join("和")}` : ""}：`,
          })
        : {
            body: `${actor.name} 跟进了反馈「${current.title}」，更新了${changedLabels.join("和")}。`,
            metadata: {},
          };

      return commitFeedbackFollowUp(database, {
        ...(hasAssigneeCommand ? { assigneeUserId: nextAssigneeUserId } : {}),
        comment: comment ? { messageId: comment.commentMessageId, threadId: comment.commentThreadId } : undefined,
        expectedVersion: input.expectedVersion,
        feedbackId,
        notificationDispatch: (context) => buildFeedbackFollowUpNotificationDispatch({
          actorName: actor.name,
          actorUserId: actor.id,
          assignee: assigneeChanged ? {
            nextName: nextAssignee?.name ?? null,
            previousName: previousAssignee?.name ?? null,
          } : undefined,
          body: content.body,
          comment: context.commentMessageId && context.commentThreadId ? {
            messageId: context.commentMessageId,
            metadata: content.metadata,
            threadId: context.commentThreadId,
          } : undefined,
          feedbackId,
          lifecycle: transition ? { resolution: context.resolution, stage: context.stage } : undefined,
          project,
          recipients: filteredRecipients,
          teamId,
          title: current.title,
        }),
        transition,
      }, feedbackWriteActor(actor));
    }));
  }

  async transitionFeedback(
    feedbackId: string,
    command: FeedbackTransitionInput,
    actor: FeedbackApplicationActor,
  ): Promise<FeedbackCommandResult> {
    const teamId = storageScopeIdFor(actor.scope);
    const currentFacts = await getFeedbackCommentNotificationFacts(this.ports.database, feedbackId);
    const project = currentFacts?.projectId ? await this.ports.projectDirectory.getById(actor.scope, currentFacts.projectId) : null;
    const notificationDispatch = currentFacts && currentFacts.teamId === teamId
      ? await this.prepareFeedbackLifecycleNotificationDispatchFactory({
          actorName: actor.name,
          actorUserId: actor.id,
          assigneeUserId: currentFacts.assigneeUserId ?? null,
          command,
          createdBy: currentFacts.createdBy ?? null,
          feedbackId,
          project,
          teamId,
          title: currentFacts.title,
        })
      : null;

    const result = await transitionFeedbackIssue(this.ports.database, {
      command,
      feedbackId,
      notificationDispatch,
    }, feedbackWriteActor(actor));

    if (result.status !== "ok") return result;
    if (result.changed) {
      await this.publishFeedbackChangedAfterCommit({ actorUserId: actor.id, feedbackId, scope: actor.scope });
    }
    return { status: "ok", changed: result.changed };
  }

  async addRelation(
    feedbackId: string,
    input: FeedbackApplicationRelationInput,
    actor: FeedbackApplicationActor,
  ): Promise<FeedbackCommandResult> {
    const result = await addFeedbackIssueRelation(this.ports.database, {
      expectedVersion: input.expectedVersion,
      feedbackId,
      targetFeedbackId: input.targetFeedbackId,
      type: input.type,
    }, feedbackWriteActor(actor));

    if (result.status === "ok" && result.changed) {
      await this.publishFeedbackChangedAfterCommit({ actorUserId: actor.id, feedbackId, scope: actor.scope });
    }
    return result;
  }

  async removeRelation(
    feedbackId: string,
    relationId: string,
    input: FeedbackApplicationRemoveRelationInput,
    actor: FeedbackApplicationActor,
  ): Promise<FeedbackCommandResult> {
    const result = await removeFeedbackIssueRelation(this.ports.database, {
      expectedVersion: input.expectedVersion,
      feedbackId,
      relationId,
    }, feedbackWriteActor(actor));

    if (result.status === "ok" && result.changed) {
      await this.publishFeedbackChangedAfterCommit({ actorUserId: actor.id, feedbackId, scope: actor.scope });
    }
    return result;
  }

  async markViewed(
    feedbackId: string,
    input: FeedbackApplicationViewedInput,
    actor: FeedbackApplicationActor,
  ): Promise<FeedbackCommandResult> {
    const result = await markFeedbackViewedInModule(this.ports.database, {
      actorStatus: actor.status === "active" ? "active" : "inactive",
      actorUserId: actor.id,
      feedbackId,
      seenThroughSequence: input.seenThroughSequence,
      teamId: storageScopeIdFor(actor.scope),
    });
    if (result.status === "ok" && result.changed) {
      await this.publishFeedbackChangedAfterCommit({ actorUserId: actor.id, feedbackId, scope: actor.scope });
    }
    return result;
  }

  getSubscription(feedbackId: string, actor: FeedbackApplicationActor) {
    return getFeedbackSubscriptionMode(this.ports.database, feedbackId, {
      id: actor.id,
      teamId: storageScopeIdFor(actor.scope),
    });
  }

  setSubscription(feedbackId: string, mode: FeedbackSubscriptionMutationMode, actor: FeedbackApplicationActor) {
    return setFeedbackSubscriptionMode(this.ports.database, feedbackId, mode, {
      id: actor.id,
      teamId: storageScopeIdFor(actor.scope),
    });
  }

  async getReportAttachmentContent(
    attachmentId: string,
    actor: FeedbackApplicationActor,
    options: { readonly disposition?: "attachment" | "inline" } = {},
  ): Promise<FeedbackReportAttachmentContentOutcome> {
    const outcome = await getFeedbackReportAttachmentContentFacts(this.ports.database, {
      actorStatus: actor.status === "active" ? "active" : "inactive",
      attachmentId,
      disposition: options.disposition,
      teamId: storageScopeIdFor(actor.scope),
    });
    if (outcome.status !== "ok") return outcome;

    const stored = await this.ports.objectStorage.getObject(outcome.facts.objectKey);
    if (!stored) return { status: "notFound" };

    return {
      status: "ok",
      body: stored.body,
      contentDisposition: outcome.facts.contentDisposition,
      contentLength: stored.contentLength,
      contentType: feedbackReportAttachmentResponseContentType(outcome.facts, { storedContentType: stored.contentType }),
      fileName: outcome.facts.fileName,
    };
  }

  async preflightImport(input: FeedbackApplicationImportUpload, actor: FeedbackApplicationActor) {
    const [users, projects] = await Promise.all([
      this.ports.userDirectory.listScopedUsers(actor.scope),
      this.ports.projectDirectory.list(actor.scope),
    ]);
    return preflightFeedbackImport(this.ports.database, {
      actor: feedbackImportActor(actor),
      body: input.body,
      fileName: input.fileName,
      knownAssigneeUserIds: new Set(users.filter((user) => user.status === "active").map((user) => user.id)),
      knownProjectIds: new Set(projects.map((project) => project.id)),
      mimeType: input.mimeType,
      referenceMappings: input.referenceMappings,
    });
  }

  async commitImport(batchId: string, actor: FeedbackApplicationActor) {
    const result = await commitFeedbackImportBatch(this.ports.database, {
      actor: feedbackImportActor(actor),
      batchId,
    });
    if (result.status === "ok" && result.createdFeedbackIds.length > 0) {
      await this.publishFeedbackChangedAfterCommit({ actorUserId: actor.id, scope: actor.scope });
    }
    return result;
  }

  async recordCommentCreated(input: {
    readonly actorUserId: string;
    readonly commentMessageId: string;
    readonly feedbackId: string;
    readonly teamId: string;
    readonly unitOfWork: OrfUnitOfWorkToken;
  }) {
    return this.ports.unitOfWork.use(input.unitOfWork, (database) =>
      recordFeedbackCommentCreatedActivity(database, {
        actorUserId: input.actorUserId,
        commentMessageId: input.commentMessageId,
        feedbackId: input.feedbackId,
        teamId: input.teamId,
      }));
  }

  resolveCommentTarget(feedbackId: string) {
    return resolveFeedbackCommentTarget(this.ports.database, feedbackId);
  }

  lockCommentTarget(unitOfWork: OrfUnitOfWorkToken, feedbackId: string) {
    return this.ports.unitOfWork.use(unitOfWork, (database) => lockFeedbackCommentTarget(database, feedbackId));
  }

  async notifyCommentCreated(input: {
    readonly activityEventId: string;
    readonly actorName: string;
    readonly actorUserId: string;
    readonly attachments: readonly {
      readonly fileName: string;
      readonly id: string;
      readonly mimeType: string;
      readonly previewKind?: string | null;
    }[];
    readonly body: string;
    readonly commentMessageId: string;
    readonly commentThreadId: string;
    readonly excludedUserIds: readonly string[];
    readonly feedbackId: string;
    readonly teamId: string;
    readonly title: string;
  }) {
    const target = await getFeedbackCommentNotificationFacts(this.ports.database, input.feedbackId);
    if (!target || target.teamId !== input.teamId) return;
    const project = target.projectId ? await this.ports.projectDirectory.getById({ storageScopeId: input.teamId }, target.projectId) : null;
    const excludedUserIds = new Set(uniqueUserIds(input.excludedUserIds));
    const recipients = await getFeedbackOrdinaryNotificationDispatchRecipients(this.ports.database, this.recipientDirectory(), {
      assigneeUserId: target.assigneeUserId,
      createdBy: target.createdBy,
      feedbackId: input.feedbackId,
      includeCommentParticipants: true,
      teamId: input.teamId,
    });
    const filteredRecipients = recipients.filter((recipient) => !excludedUserIds.has(recipient.userId));
    if (filteredRecipients.length === 0) return;

    const content = this.ports.notificationContent.buildCommentContent({
      attachments: input.attachments,
      commentBody: input.body,
      summary: `${input.actorName} 回复了反馈「${input.title}」：`,
    });
    const dispatch = buildFeedbackCommentCreatedNotificationDispatch({
      actorName: input.actorName,
      actorUserId: input.actorUserId,
      body: content.body,
      commentMessageId: input.commentMessageId,
      commentMetadata: content.metadata,
      commentThreadId: input.commentThreadId,
      feedbackId: input.feedbackId,
      project,
      recipients: filteredRecipients,
      targetTitle: input.title,
      teamId: input.teamId,
    });
    await insertFeedbackNotificationDispatch(this.ports.database, {
      activityEventId: input.activityEventId,
      dispatch,
    });
  }

  private async prepareFeedbackCreatedNotificationDispatch(input: {
    readonly actorName: string;
    readonly actorUserId: string;
    readonly assigneeName?: string | null;
    readonly assigneeUserId?: string | null;
    readonly feedbackId: string;
    readonly project: { readonly id: string; readonly name: string } | null;
    readonly teamId: string;
    readonly title: string;
  }): Promise<FeedbackNotificationDispatchDraft | null> {
    const recipients = await getFeedbackOrdinaryNotificationDispatchRecipients(this.ports.database, this.recipientDirectory(), {
      assigneeUserId: input.assigneeUserId,
      createdBy: input.actorUserId,
      feedbackId: input.feedbackId,
      includeCommentParticipants: false,
      teamId: input.teamId,
    });

    return buildFeedbackCreatedNotificationDispatch({
      actorName: input.actorName,
      actorUserId: input.actorUserId,
      assigneeName: input.assigneeName,
      feedbackId: input.feedbackId,
      project: input.project,
      recipients,
      teamId: input.teamId,
      title: input.title,
    });
  }

  private async prepareFeedbackAssignedNotificationDispatch(input: {
    readonly actorName: string;
    readonly actorUserId: string;
    readonly createdBy?: string | null;
    readonly feedbackId: string;
    readonly nextAssigneeName?: string | null;
    readonly nextAssigneeUserId?: string | null;
    readonly previousAssigneeName?: string | null;
    readonly previousAssigneeUserId?: string | null;
    readonly teamId: string;
    readonly title: string;
  }): Promise<FeedbackNotificationDispatchDraft | null> {
    const recipients = await getFeedbackAssignmentNotificationDispatchRecipients(this.ports.database, this.recipientDirectory(), {
      createdBy: input.createdBy,
      feedbackId: input.feedbackId,
      nextAssigneeUserId: input.nextAssigneeUserId,
      previousAssigneeUserId: input.previousAssigneeUserId,
      teamId: input.teamId,
    });

    return buildFeedbackAssigneeChangedNotificationDispatch({
      actorName: input.actorName,
      actorUserId: input.actorUserId,
      feedbackId: input.feedbackId,
      nextAssigneeName: input.nextAssigneeName,
      previousAssigneeName: input.previousAssigneeName,
      recipients,
      teamId: input.teamId,
      title: input.title,
    });
  }

  private async prepareFeedbackLifecycleNotificationDispatchFactory(input: {
    readonly actorName: string;
    readonly actorUserId: string;
    readonly assigneeUserId?: string | null;
    readonly command: FeedbackTransitionInput;
    readonly createdBy?: string | null;
    readonly feedbackId: string;
    readonly project: { readonly id: string; readonly name: string } | null;
    readonly teamId: string;
    readonly title: string;
  }) {
    const recipients = await getFeedbackLifecycleNotificationDispatchRecipients(this.ports.database, this.recipientDirectory(), {
      actionRequiredUserIds: uniqueUserIds([feedbackLifecycleActionRequiredUserId(input.command, {
        assigneeUserId: input.assigneeUserId,
        createdBy: input.createdBy,
      })]),
      assigneeUserId: input.assigneeUserId,
      createdBy: input.createdBy,
      feedbackId: input.feedbackId,
      teamId: input.teamId,
    });

    return (context: { readonly resolution?: FeedbackResolution | null; readonly stage: FeedbackStage }) => buildFeedbackLifecycleChangedNotificationDispatch({
      actorName: input.actorName,
      actorUserId: input.actorUserId,
      feedbackId: input.feedbackId,
      project: input.project,
      recipients,
      resolution: context.resolution,
      stage: context.stage,
      teamId: input.teamId,
      title: input.title,
    });
  }

  private async deletePreparedReportAttachments(attachments: readonly FeedbackPreparedReportAttachment[]) {
    try {
      await this.ports.reportAttachments.deletePrepared(attachments);
    } catch (error) {
      this.warn({ error: applicationErrorText(error) }, "Failed to delete uncommitted feedback report attachments.");
    }
  }

  private async publishFeedbackChangedAfterCommit(input: {
    readonly actorUserId?: string | null;
    readonly feedbackId?: string | null;
    readonly scope: FeedbackScope;
  }) {
    try {
      await this.ports.realtime.publishFeedbackChanged(input);
    } catch (error) {
      this.warn({
        error: applicationErrorText(error),
        feedbackId: input.feedbackId ?? null,
        storageScopeId: input.scope.storageScopeId,
      }, "Failed to publish feedback read-model invalidation after commit.");
    }
  }

  private warn(data: Record<string, unknown>, message: string) {
    try {
      this.ports.log.warn(data, message);
    } catch {
      // Logging is observational and must not change an already committed command outcome.
    }
  }

  private recipientDirectory(): FeedbackNotificationRecipientDirectory {
    return {
      getActiveAdminUserIds: (teamId) => this.ports.userDirectory.getActiveAdminUserIds({ storageScopeId: teamId }).then((ids) => [...ids]),
      getActiveMemberUserIdsByIds: (teamId, userIds) => this.ports.userDirectory.getActiveMemberUserIdsByIds({ storageScopeId: teamId }, userIds).then((ids) => [...ids]),
    };
  }
}

function storageScopeIdFor(scope: FeedbackScope) {
  return scope.storageScopeId.trim();
}

function feedbackWriteActor(actor: FeedbackApplicationActor, teamId = storageScopeIdFor(actor.scope)) {
  return {
    id: actor.id,
    role: actor.role,
    status: actor.status === "active" ? "active" as const : "inactive" as const,
    teamId,
  };
}

function feedbackImportActor(actor: FeedbackApplicationActor) {
  return {
    id: actor.id,
    role: actor.role,
    status: actor.status === "active" ? "active" as const : "inactive" as const,
    teamId: storageScopeIdFor(actor.scope),
  };
}

function feedbackReadModelViewer(users: readonly FeedbackWebUser[], viewerUserId: string | null | undefined): FeedbackReadModelViewer | null {
  const normalizedViewerUserId = viewerUserId?.trim();
  if (!normalizedViewerUserId) return null;
  const user = users.find((item) => item.id === normalizedViewerUserId);
  return user ? {
    id: user.id,
    role: user.role,
    status: user.status === "active" ? "active" : "inactive",
  } : null;
}

function feedbackListUserOptions(userIds: readonly string[], users: readonly FeedbackWebUser[]) {
  const userById = new Map(users.map((user) => [user.id, user]));
  return userIds
    .map((userId) => ({
      label: userById.get(userId)?.name ?? userId,
      value: userId,
    }))
    .sort((left, right) => left.label.localeCompare(right.label, "zh-Hans-CN"));
}

function reportAttachmentsForWrite(attachments: readonly FeedbackPreparedReportAttachment[]) {
  return attachments.map((attachment) => ({
    id: attachment.id,
    objectKey: attachment.objectKey,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    fileSize: attachment.fileSize,
    width: attachment.width ?? null,
    height: attachment.height ?? null,
    sourceCommentAttachmentId: null,
  }));
}

function feedbackLifecycleActionRequiredUserId(
  command: FeedbackTransitionInput,
  input: { readonly assigneeUserId?: string | null; readonly createdBy?: string | null },
) {
  if (command.type === "submit_verification") return input.createdBy ?? null;
  if (command.type === "reject_verification" || command.type === "reopen") return input.assigneeUserId ?? null;
  return null;
}

function uniqueUserIds(userIds: ReadonlyArray<string | null | undefined>) {
  return Array.from(new Set(userIds.map((userId) => userId?.trim()).filter((userId): userId is string => Boolean(userId))));
}

function applicationErrorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
