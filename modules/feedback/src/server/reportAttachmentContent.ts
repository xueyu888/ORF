import { and, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  canPreviewFeedbackReportAttachment,
  feedbackReportAttachmentPreviewKind,
  type FeedbackReportAttachmentPreviewKind,
} from "../contracts";
import { feedbackReportAttachments } from "../infrastructure/database/schema";
import type { FeedbackReportAttachmentObjectRef } from "./reportAttachmentProtocol";

export type FeedbackReportAttachmentContentDatabase = Pick<NodePgDatabase<any>, "select">;

export type FeedbackReportAttachmentContentDisposition = "attachment" | "inline";

export type FeedbackReportAttachmentContentFacts = {
  readonly canPreview: boolean;
  readonly contentDisposition: FeedbackReportAttachmentContentDisposition;
  readonly fileName: string;
  readonly mimeType: string;
  readonly objectKey: string;
  readonly previewKind: FeedbackReportAttachmentPreviewKind;
};

export type FeedbackReportAttachmentContentFactsOutcome =
  | { status: "ok"; facts: FeedbackReportAttachmentContentFacts }
  | { status: "notFound" }
  | { status: "forbidden" };

export async function listFeedbackReportAttachmentObjectRefs(
  database: FeedbackReportAttachmentContentDatabase,
  input: {
    readonly attachmentIds: readonly string[];
    readonly teamId: string;
  },
): Promise<FeedbackReportAttachmentObjectRef[]> {
  const teamId = input.teamId.trim();
  const attachmentIds = [...new Set(input.attachmentIds.map((id) => id.trim()).filter(Boolean))];
  if (!teamId || attachmentIds.length === 0) return [];

  const rows = await database
    .select()
    .from(feedbackReportAttachments)
    .where(and(
      eq(feedbackReportAttachments.teamId, teamId),
      inArray(feedbackReportAttachments.id, attachmentIds),
    ));

  return rows.map((row) => ({
    feedbackId: row.feedbackId,
    fileName: row.fileName,
    fileSize: row.fileSize,
    id: row.id,
    mimeType: row.mimeType,
    objectKey: row.objectKey,
    sortOrder: row.sortOrder,
  }));
}

export async function getFeedbackReportAttachmentContentFacts(
  database: FeedbackReportAttachmentContentDatabase,
  input: {
    readonly actorStatus: "active" | "inactive";
    readonly attachmentId: string;
    readonly disposition?: FeedbackReportAttachmentContentDisposition;
    readonly teamId: string;
  },
): Promise<FeedbackReportAttachmentContentFactsOutcome> {
  const teamId = input.teamId.trim();
  if (!teamId) return { status: "notFound" };

  const [attachment] = await database
    .select()
    .from(feedbackReportAttachments)
    .where(eq(feedbackReportAttachments.id, input.attachmentId))
    .limit(1);
  if (!attachment || attachment.teamId !== teamId) {
    return { status: "notFound" };
  }
  if (input.actorStatus !== "active") {
    return { status: "forbidden" };
  }

  const canPreview = canPreviewFeedbackReportAttachment(attachment);
  return {
    status: "ok",
    facts: {
      canPreview,
      contentDisposition: input.disposition === "attachment" ? "attachment" : canPreview ? "inline" : "attachment",
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      objectKey: attachment.objectKey,
      previewKind: feedbackReportAttachmentPreviewKind(attachment),
    },
  };
}

export function feedbackReportAttachmentResponseContentType(
  facts: FeedbackReportAttachmentContentFacts,
  input: { readonly storedContentType?: string | null } = {},
) {
  if (facts.contentDisposition === "inline") {
    return facts.previewKind === "markdown" || facts.previewKind === "text"
      ? "text/plain; charset=utf-8"
      : facts.mimeType;
  }

  return facts.canPreview
    ? (input.storedContentType ?? facts.mimeType)
    : "application/octet-stream";
}
