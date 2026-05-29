import type { AppNotification, NotificationKind } from "./orf";

export type RealtimeEventKind = "notification.created" | "system.broadcast" | "orf.read-model.invalidated";

export type SystemBroadcastTone = "bounty";
export type OrfReadModel = "taskManagement" | "bountyHall" | "users" | "permissions" | "notifications" | "settings";
export type OrfReadModelInvalidationReason =
  | "objective.created"
  | "objective.changed"
  | "objective.lifecycle.changed"
  | "objective.challenge.application.changed"
  | "objective.challenge.recruitment.changed"
  | "objective.loot.changed"
  | "objective.trialReview.changed"
  | "result.changed"
  | "task.changed"
  | "feedback.changed"
  | "comment.changed"
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
  | "user"
  | "permission"
  | "notification"
  | "setting";

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

export type RealtimeEvent = NotificationRealtimeEvent | SystemBroadcastRealtimeEvent | OrfReadModelInvalidatedRealtimeEvent;
