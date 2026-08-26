import type { Readable } from "node:stream";
import type { ByteRangeSegment, OrfUnitOfWorkToken } from "@orf/module-protocol";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type {
  FeedbackCommandResult,
  FeedbackIssueListCommentSummary,
  FeedbackIssueListFilters,
  FeedbackIssueListPagination,
  FeedbackReferenceSummary,
  FeedbackWebCommentThread,
  FeedbackWebProject,
  FeedbackWebUser,
} from "../contracts";
import type { FeedbackWriteClient } from "./commandPorts";
import type { FeedbackWriteDatabase } from "./writeModel";
import type { FeedbackReferenceDatabase } from "./references";
import type { FeedbackReadModelDatabase } from "./readModel";
import type { FeedbackActivityDatabase } from "./activity";
import type { FeedbackSubscriptionDatabase } from "./subscriptions";
import type { FeedbackReportAttachmentContentDatabase } from "./reportAttachmentContent";
import type { FeedbackNotificationDispatchDatabase } from "./notificationDispatch";
import type { FeedbackDailyDigestRuntime } from "./dailyDigestScheduler";

export type FeedbackApplicationDatabase =
  & NodePgDatabase<any>
  & FeedbackWriteDatabase
  & FeedbackReferenceDatabase
  & FeedbackReadModelDatabase
  & FeedbackActivityDatabase
  & FeedbackSubscriptionDatabase
  & FeedbackReportAttachmentContentDatabase
  & FeedbackNotificationDispatchDatabase
  & FeedbackDailyDigestRuntime["database"];

export type FeedbackScope = {
  readonly storageScopeId: string;
};

export type FeedbackAuthenticatedUser = {
  readonly avatarUrl?: string | null;
  readonly email?: string;
  readonly id: string;
  readonly name: string;
  readonly role: "admin" | "member";
  readonly status: "active" | "disabled" | "pending" | "rejected";
};

export type FeedbackRequestContext = {
  readonly scope: FeedbackScope;
  readonly user: FeedbackAuthenticatedUser;
};

export type FeedbackActorPort = {
  requireUserScopeContext(request: unknown, reply: unknown): Promise<FeedbackRequestContext | null>;
};

export type FeedbackUserDirectoryPort = {
  getActiveAdminUserIds(scope: FeedbackScope): Promise<readonly string[]>;
  getActiveMemberById(scope: FeedbackScope, userId: string): Promise<{ readonly id: string; readonly name: string } | null>;
  getActiveMemberUserIdsByIds(scope: FeedbackScope, userIds: readonly string[]): Promise<readonly string[]>;
  listScopedUsers(scope: FeedbackScope): Promise<readonly FeedbackWebUser[]>;
};

export type FeedbackProjectDirectoryPort = {
  getById(scope: FeedbackScope, projectId: string): Promise<{ readonly id: string; readonly name: string } | null>;
  list(scope: FeedbackScope): Promise<readonly FeedbackWebProject[]>;
};

export type FeedbackDiscussionPort = {
  commitFollowUp(input: {
    readonly actor: {
      readonly id: string;
      readonly name: string;
      readonly role: "admin" | "member";
      readonly scope: FeedbackScope;
    };
    readonly body?: string;
    readonly feedbackId: string;
    readonly parentMessageId?: string;
    readonly replyToMessageId?: string;
    readonly title: string;
  }, commit: (input: {
    readonly comment: {
      readonly attachments: readonly {
        readonly fileName: string;
        readonly id: string;
        readonly mimeType: string;
        readonly previewKind?: string | null;
      }[];
      readonly body: string;
      readonly commentMessageId: string;
      readonly commentThreadId: string;
      readonly createdAt: string;
      readonly mentionedUserIds: readonly string[];
      readonly replyRecipientUserId?: string | null;
      readonly replyToMessageId?: string | null;
    } | null;
    readonly unitOfWork: OrfUnitOfWorkToken;
  }) => Promise<FeedbackCommandResult>): Promise<FeedbackCommandResult>;
  getCommentSummaries(scope: FeedbackScope, feedbackIds: readonly string[]): Promise<readonly FeedbackIssueListCommentSummary[]>;
  getThreads(scope: FeedbackScope, feedbackIds: readonly string[]): Promise<readonly FeedbackWebCommentThread[]>;
  syncTargetTitle(input: {
    readonly feedbackId: string;
    readonly scope: FeedbackScope;
    readonly title: string;
    readonly updatedAt: string;
  }, database: unknown): Promise<void>;
};

export type FeedbackUnitOfWorkPort = {
  use<T>(token: OrfUnitOfWorkToken, operation: (client: FeedbackWriteClient) => Promise<T>): Promise<T>;
};

export type FeedbackReportAttachmentUpload = {
  readonly body: Readable;
  readonly clientId: string;
  readonly fileName: string;
  readonly mimeType: string;
};

export type FeedbackPreparedReportAttachment = {
  readonly fileName: string;
  readonly fileSize: number;
  readonly height?: number | null;
  readonly id: string;
  readonly markdown: string;
  readonly mimeType: string;
  readonly objectKey: string;
  readonly width?: number | null;
};

export type FeedbackPreparedReport = {
  readonly attachments: readonly FeedbackPreparedReportAttachment[];
  readonly description: string;
};

export type FeedbackReportAttachmentPort = {
  deletePrepared(attachments: readonly FeedbackPreparedReportAttachment[]): Promise<void>;
  prepareReport(input: {
    readonly actorUserId: string;
    readonly attachments: readonly FeedbackReportAttachmentUpload[];
    readonly createdAt: string;
    readonly description: string;
    readonly feedbackId: string;
    readonly uploadMaxBytes: number;
    readonly scope: FeedbackScope;
  }): Promise<
    | { readonly status: "ok"; readonly report: FeedbackPreparedReport }
    | { readonly status: "invalid" }
    | { readonly status: "tooLarge" }
  >;
};

export type FeedbackStoredObject = {
  readonly body: Readable;
  readonly contentLength?: number;
  readonly contentType?: string | null;
};

export type FeedbackObjectStoragePort = {
  getObject(objectKey: string, options?: { readonly byteRange?: ByteRangeSegment }): Promise<FeedbackStoredObject | null>;
};

export type FeedbackRealtimePort = {
  publishFeedbackChanged(input: {
    readonly actorUserId?: string | null;
    readonly feedbackId?: string | null;
    readonly scope: FeedbackScope;
  }): void | Promise<void>;
};

export type FeedbackApplicationLogPort = {
  warn(data: Record<string, unknown>, message: string): void;
};

export type FeedbackNotificationContentPort = {
  buildCommentContent(input: {
    readonly attachments: readonly {
      readonly fileName: string;
      readonly id: string;
      readonly mimeType: string;
      readonly previewKind?: string | null;
    }[];
    readonly commentBody: string;
    readonly summary: string;
  }): { readonly body: string; readonly metadata: Record<string, string> };
};

export type FeedbackReferenceQuery = {
  readonly ids: readonly string[];
  readonly limit: number;
  readonly q: string;
};

export type FeedbackReadModelScope = {
  readonly filters?: FeedbackIssueListFilters;
  readonly pagination?: FeedbackIssueListPagination | null;
  readonly scope: FeedbackScope;
  readonly viewerUserId?: string | null;
};

export type FeedbackServerApplicationPorts = {
  readonly actor: FeedbackActorPort;
  readonly database: FeedbackApplicationDatabase;
  readonly discussion: FeedbackDiscussionPort;
  readonly limits: {
    readReportAttachmentMaxBytes(): Promise<number>;
    readonly uploadMaxBytes: number;
  };
  readonly log: FeedbackApplicationLogPort;
  readonly notificationContent: FeedbackNotificationContentPort;
  readonly objectStorage: FeedbackObjectStoragePort;
  readonly projectDirectory: FeedbackProjectDirectoryPort;
  readonly realtime: FeedbackRealtimePort;
  readonly reportAttachments: FeedbackReportAttachmentPort;
  readonly unitOfWork: FeedbackUnitOfWorkPort;
  readonly userDirectory: FeedbackUserDirectoryPort;
};

export type FeedbackReferencePort = {
  getReferences(scope: FeedbackScope, feedbackIds: readonly string[]): Promise<readonly FeedbackReferenceSummary[]>;
  listReferences(scope: FeedbackScope, limit?: number): Promise<readonly FeedbackReferenceSummary[]>;
  searchReferences(scope: FeedbackScope, query: string, limit?: number): Promise<readonly FeedbackReferenceSummary[]>;
};
