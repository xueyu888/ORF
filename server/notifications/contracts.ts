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

export type NotificationAction = {
  href: string;
  label: string;
} | null;

export type NotificationPresentationActionInput = {
  body: string;
  kind: NotificationKind;
  metadata?: Record<string, string> | null;
  targetHref: string;
  targetType: NotificationTargetType;
  title: string;
};

export interface NotificationPresentationProvider {
  readonly namespace: string;
  readonly kinds: readonly NotificationKind[];
  policy(kind: NotificationKind): NotificationPolicyDescriptor;
  action(input: NotificationPresentationActionInput): NotificationAction;
}
