export type FeedbackBackupAttachmentKind = "comment" | "report";

export type FeedbackBackupAttachmentFile = {
  readonly attachmentId: string;
  readonly content: Buffer;
  readonly feedbackId: string;
  readonly fileName: string;
  readonly fileSize: number;
  readonly kind: FeedbackBackupAttachmentKind;
  readonly messageId?: string | null;
  readonly mimeType: string;
  readonly threadId?: string | null;
};
