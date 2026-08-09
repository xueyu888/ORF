import { feedbackCommentPath, feedbackIssuePath } from "../contracts";
import type { FeedbackServerApplication } from "./application";

export type FeedbackCommentTargetAccess = "allowed" | "forbidden" | "notFound";
export type FeedbackCommentTargetDatabase = {
  insert: unknown;
  select: unknown;
  update: unknown;
  delete?: unknown;
};

export type FeedbackCommentTargetActor = {
  readonly id: string;
  readonly name: string;
  readonly role: "admin" | "member";
  readonly scope?: { readonly storageScopeId: string } | null;
};

export type FeedbackCommentTargetSnapshot = {
  readonly storageScopeId: string;
  readonly targetId: string;
  readonly targetType: "feedback";
  readonly title: string;
};

export type FeedbackCommentAttachment = {
  readonly fileName: string;
  readonly id: string;
  readonly mimeType: string;
  readonly previewKind?: string | null;
};

export type FeedbackCommentMessageCommittedEvent = {
  readonly actor: FeedbackCommentTargetActor;
  readonly attachments: readonly FeedbackCommentAttachment[];
  readonly body: string;
  readonly commentMessageId: string;
  readonly commentThreadId: string;
  readonly createdAt: string;
  readonly mentionedUserIds: readonly string[];
  readonly replyRecipientUserId?: string | null;
  readonly replyToMessageId?: string | null;
  readonly target: FeedbackCommentTargetSnapshot;
};

export type FeedbackCommentTargetCommitResult = {
  readonly feedbackActivityEventId?: string | null;
};

export interface FeedbackCommentTargetAdapterContribution {
  readonly invalidationModel: "feedback";
  readonly protocolVersion: 1;
  readonly type: "feedback";
  canComment(actor: FeedbackCommentTargetActor, target: FeedbackCommentTargetSnapshot): Promise<FeedbackCommentTargetAccess>;
  canRead(actor: FeedbackCommentTargetActor, target: FeedbackCommentTargetSnapshot): Promise<FeedbackCommentTargetAccess>;
  href(targetId: string, commentId?: string | null): string;
  lockForComment(database: FeedbackCommentTargetDatabase, target: FeedbackCommentTargetSnapshot): Promise<boolean>;
  resolve(targetId: string): Promise<FeedbackCommentTargetSnapshot | null>;
  afterMessageCommitted?(event: FeedbackCommentMessageCommittedEvent, result?: FeedbackCommentTargetCommitResult): Promise<void>;
  onMessageCommitted?(event: FeedbackCommentMessageCommittedEvent, database: FeedbackCommentTargetDatabase): Promise<FeedbackCommentTargetCommitResult | void>;
}

export function createFeedbackCommentTargetAdapter(application: FeedbackServerApplication): FeedbackCommentTargetAdapterContribution {
  return {
    protocolVersion: 1,
    type: "feedback",
    invalidationModel: "feedback",
    async resolve(targetId) {
      const target = await application.resolveCommentTarget(targetId);
      return target
        ? {
            storageScopeId: target.storageScopeId,
            targetId: target.feedbackId,
            targetType: "feedback",
            title: target.title,
          }
        : null;
    },
    async canComment(actor, target) {
      return actorCanUseScopedFeedbackTarget(actor, target.storageScopeId) ? "allowed" : "notFound";
    },
    async canRead(actor, target) {
      return actorCanUseScopedFeedbackTarget(actor, target.storageScopeId) ? "allowed" : "notFound";
    },
    href(targetId, commentId) {
      const feedbackId = targetId.trim();
      return commentId?.trim()
        ? feedbackCommentPath({ commentMessageId: commentId.trim(), feedbackId })
        : feedbackIssuePath(feedbackId);
    },
    lockForComment(database, target) {
      return application.lockCommentTarget(database as Parameters<FeedbackServerApplication["lockCommentTarget"]>[0], target.targetId);
    },
    async onMessageCommitted(event, database) {
      const result = await application.recordCommentCreated({
        actorUserId: event.actor.id,
        commentMessageId: event.commentMessageId,
        database: database as Parameters<FeedbackServerApplication["recordCommentCreated"]>[0]["database"],
        feedbackId: event.target.targetId,
        teamId: event.target.storageScopeId,
      });
      return { feedbackActivityEventId: result.activityEventId };
    },
    afterMessageCommitted(event, result) {
      const activityEventId = result?.feedbackActivityEventId?.trim();
      if (!activityEventId) return Promise.resolve();
      return application.notifyCommentCreated({
        activityEventId,
        actorName: event.actor.name,
        actorUserId: event.actor.id,
        attachments: event.attachments,
        body: event.body,
        commentMessageId: event.commentMessageId,
        commentThreadId: event.commentThreadId,
        excludedUserIds: [
          event.actor.id,
          ...event.mentionedUserIds,
          event.replyRecipientUserId ?? null,
        ].filter((userId): userId is string => Boolean(userId)),
        feedbackId: event.target.targetId,
        teamId: event.target.storageScopeId,
        title: event.target.title,
      });
    },
  };
}

function actorCanUseScopedFeedbackTarget(actor: FeedbackCommentTargetActor, storageScopeId: string) {
  const actorStorageScopeId = actor.scope?.storageScopeId.trim() ?? "";
  return Boolean(storageScopeId) && (!actorStorageScopeId || actorStorageScopeId === storageScopeId);
}
