import type { AppNotification, ChatChannel, ChatMessage, NotificationKind } from "./orf";

export type RealtimeEventKind =
  | "notification.created"
  | "system.broadcast"
  | "orf.read-model.invalidated"
  | "chat.event"
  | "client.update.available";

export type SystemBroadcastTone = "bounty" | "clientUpdate";
export type OrfReadModel = "taskManagement" | "bountyHall" | "users" | "permissions" | "notifications" | "settings";
export type OrfReadModelInvalidationReason =
  | "objective.created"
  | "objective.changed"
  | "objective.lifecycle.changed"
  | "objective.challenge.application.changed"
  | "objective.challenge.recruitment.changed"
  | "objective.alignment.changed"
  | "objective.loot.changed"
  | "objective.trialReview.changed"
  | "result.changed"
  | "task.changed"
  | "feedback.changed"
  | "comment.changed"
  | "project.changed"
  | "user.changed"
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
  channel?: ChatChannel;
  message?: ChatMessage;
  messageId?: string;
  rootMessageId?: string | null;
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

export type RealtimeEvent =
  | NotificationRealtimeEvent
  | SystemBroadcastRealtimeEvent
  | OrfReadModelInvalidatedRealtimeEvent
  | ChatRealtimeEvent
  | ClientUpdateAvailableRealtimeEvent;
