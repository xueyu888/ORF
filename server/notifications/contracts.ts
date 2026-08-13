import type {
  CommentTargetType,
  NotificationDeliveryClass,
  NotificationKind,
  NotificationReceiptAttentionLevel,
  NotificationStream,
  NotificationTargetType,
} from "../../src/types/orf";
import type { ZodType } from "zod";

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

export type NotificationPresentationRecipient = {
  readonly attentionLevel: NotificationReceiptAttentionLevel;
  readonly deliveryClass: NotificationDeliveryClass;
  readonly reasons: readonly string[];
  readonly userId: string;
};

export type NotificationPresentation = {
  readonly actorName: string;
  readonly actorUserId?: string | null;
  readonly action: NotificationAction;
  readonly body: string;
  readonly kind: NotificationKind;
  readonly metadata: Record<string, string>;
  readonly recipient: NotificationPresentationRecipient;
  readonly replyTarget: NotificationReplyTarget;
  readonly stream: NotificationStream;
  readonly target: NotificationTarget;
  readonly title: string;
};

export interface NotificationPresentationProvider<TPayload = unknown> {
  readonly namespace: string;
  readonly kinds: readonly NotificationKind[];
  readonly payloadSchema: ZodType<TPayload>;
  policy(kind: NotificationKind): NotificationPolicyDescriptor;
  action(input: NotificationPresentationActionInput): NotificationAction;
  present(payload: TPayload, recipient: NotificationPresentationRecipient): NotificationPresentation;
}
