import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { CommentAttachment, CommentTargetType } from "../../src/types/orf";
import type { RuntimeScope } from "../repositories/runtimeScope";

export type CommentTargetAccess = "allowed" | "forbidden" | "notFound";
export type CommentTargetInvalidationModel = "feedback" | "taskManagement";
export type CommentTargetDatabase = Pick<NodePgDatabase<any>, "delete" | "insert" | "select" | "update">;

export type CommentTargetActor = {
  readonly canManageAllComments?: boolean;
  readonly id: string;
  readonly name: string;
  readonly role: "admin" | "member";
  readonly scope?: RuntimeScope | null;
};

export type CommentTargetSnapshot = {
  readonly targetId: string;
  readonly targetType: CommentTargetType;
  readonly storageScopeId: string;
  readonly title: string;
};

export type CommentMessageCommittedEvent = {
  readonly actor: CommentTargetActor;
  readonly attachments: readonly CommentAttachment[];
  readonly body: string;
  readonly commentMessageId: string;
  readonly commentThreadId: string;
  readonly createdAt: string;
  readonly mentionedUserIds: readonly string[];
  readonly replyRecipientUserId?: string | null;
  readonly replyToMessageId?: string | null;
  readonly target: CommentTargetSnapshot;
};

export interface CommentTargetAdapter {
  readonly invalidationModel: CommentTargetInvalidationModel;
  readonly protocolVersion: 1;
  readonly type: CommentTargetType;
  canComment(actor: CommentTargetActor, target: CommentTargetSnapshot): Promise<CommentTargetAccess>;
  canRead(actor: CommentTargetActor, target: CommentTargetSnapshot): Promise<CommentTargetAccess>;
  href(targetId: string, commentId?: string | null): string;
  lockForComment(database: CommentTargetDatabase, target: CommentTargetSnapshot): Promise<boolean>;
  resolve(targetId: string): Promise<CommentTargetSnapshot | null>;
  afterMessageCommitted?(event: CommentMessageCommittedEvent): Promise<void>;
  onMessageCommitted?(event: CommentMessageCommittedEvent, database: CommentTargetDatabase): Promise<void>;
}

const commentTargetAdapters = new Map<CommentTargetType, CommentTargetAdapter>();

export function registerCommentTargetAdapter(adapter: CommentTargetAdapter) {
  if (adapter.protocolVersion !== 1) {
    throw new Error(`Unsupported comment target adapter protocol for ${adapter.type}.`);
  }
  if (commentTargetAdapters.has(adapter.type)) {
    throw new Error(`Comment target adapter already registered for ${adapter.type}.`);
  }
  commentTargetAdapters.set(adapter.type, adapter);
}

export function getCommentTargetAdapter(type: CommentTargetType) {
  return commentTargetAdapters.get(type) ?? null;
}
