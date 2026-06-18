import type { CommentTargetType, NotificationKind, NotificationStream, NotificationTargetType } from "../../src/types/orf";

export type NotificationReplyTarget = {
  targetId: string;
  targetType: CommentTargetType;
} | null;

export type NotificationTarget = {
  href: string;
  id: string;
  type: NotificationTargetType;
};

export type NotificationPolicyDescriptor = {
  kind: NotificationKind;
  replyTarget: "notification-target" | "metadata-comment-target" | "none";
  stream: NotificationStream;
};
