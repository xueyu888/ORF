export type FeedbackImportActor = {
  readonly id: string;
  readonly role: "admin" | "member";
  readonly status: "active" | "inactive";
  readonly teamId: string;
};

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
