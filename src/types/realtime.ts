import type { AppNotification, ChatUnreadTargetReason, NotificationKind, WorkLogReminderState } from "./orf";

export type RealtimeEventKind =
  | "notification.created"
  | "system.broadcast"
  | "orf.read-model.invalidated"
  | "chat.event"
  | "client.update.available"
  | "worklog.reminder.required"
  | "worklog.reminder.resolved";

export type SystemBroadcastTone = "bounty" | "clientUpdate";
export type OrfReadModel = "taskManagement" | "bountyHall" | "users" | "permissions" | "notifications" | "settings" | "workLogs";
export type OrfReadModelInvalidationReason =
  | "objective.created"
  | "objective.changed"
  | "objective.lifecycle.changed"
  | "objective.challenge.application.changed"
  | "objective.challenge.recruitment.changed"
  | "objective.challenge.reinforcement.changed"
  | "objective.alignment.changed"
  | "objective.loot.changed"
  | "objective.trialReview.changed"
  | "result.changed"
  | "task.changed"
  | "feedback.changed"
  | "comment.changed"
  | "workLog.changed"
  | "project.changed"
  | "user.changed"
  | "user.presence.changed"
  | "permission.changed"
  | "notification.changed"
  | "setting.changed";
export type OrfReadModelInvalidationTargetType =
  | "objective"
  | "result"
  | "task"
  | "subtask"
  | "feedback"
  | "comment"
  | "workLog"
  | "project"
  | "user"
  | "permission"
  | "notification"
  | "setting";

export type ChatRealtimeEventType =
  | "channel.created"
  | "channel.updated"
  | "channel.archived"
  | "member.changed"
  | "message.created"
  | "message.updated"
  | "message.deleted"
  | "reaction.changed"
  | "read.changed"
  | "typing";

export interface SystemBroadcast {
  id: string;
  body: string;
  createdAt: string;
  notificationKind?: NotificationKind;
  sticky?: boolean;
  targetHref: string;
  title: string;
  tone: SystemBroadcastTone;
}

export interface OrfReadModelInvalidation {
  id: string;
  actorUserId?: string | null;
  createdAt: string;
  models: OrfReadModel[];
  reason: OrfReadModelInvalidationReason;
  target?: {
    id: string;
    type: OrfReadModelInvalidationTargetType;
  };
}

export interface NotificationRealtimeEvent {
  id: string;
  kind: "notification.created";
  createdAt: string;
  notification: AppNotification;
}

export interface SystemBroadcastRealtimeEvent {
  id: string;
  kind: "system.broadcast";
  createdAt: string;
  broadcast: SystemBroadcast;
}

export interface OrfReadModelInvalidatedRealtimeEvent {
  id: string;
  kind: "orf.read-model.invalidated";
  createdAt: string;
  invalidation: OrfReadModelInvalidation;
}

export interface ChatRealtimeEvent {
  id: string;
  kind: "chat.event";
  createdAt: string;
  eventType: ChatRealtimeEventType;
  channelId: string;
  actorUserId?: string | null;
  messageId?: string;
  rootMessageId?: string | null;
  attention?: {
    reason: Extract<ChatUnreadTargetReason, "direct" | "mention_all" | "mention_me">;
    targetPath: string;
  };
  notification?: {
    body: string;
    sender?: {
      avatarUrl?: string | null;
      name: string;
      userId: string;
    };
    targetPath: string;
    title: string;
  };
  typing?: {
    userId: string;
    userName: string;
    expiresAt: string;
  };
}

export interface ClientUpdateAvailable {
  id: string;
  body: string;
  createdAt: string;
  htmlUrl: string;
  releaseTag: string;
  releaseVersion: string;
  title: string;
}

export interface ClientUpdateAvailableRealtimeEvent {
  id: string;
  kind: "client.update.available";
  createdAt: string;
  update: ClientUpdateAvailable;
}

export interface WorkLogReminderRequiredRealtimeEvent {
  id: string;
  kind: "worklog.reminder.required";
  createdAt: string;
  reminder: WorkLogReminderState;
}

export interface WorkLogReminderResolvedRealtimeEvent {
  id: string;
  kind: "worklog.reminder.resolved";
  createdAt: string;
  reminder: WorkLogReminderState;
}

export type RealtimeEvent =
  | NotificationRealtimeEvent
  | SystemBroadcastRealtimeEvent
  | OrfReadModelInvalidatedRealtimeEvent
  | ChatRealtimeEvent
  | ClientUpdateAvailableRealtimeEvent
  | WorkLogReminderRequiredRealtimeEvent
  | WorkLogReminderResolvedRealtimeEvent;
