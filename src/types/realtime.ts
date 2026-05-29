import type { AppNotification, NotificationKind } from "./orf";

export type RealtimeEventKind = "notification.created" | "system.broadcast";

export type SystemBroadcastTone = "bounty";

export interface SystemBroadcast {
  id: string;
  body: string;
  createdAt: string;
  notificationKind?: NotificationKind;
  targetHref: string;
  title: string;
  tone: SystemBroadcastTone;
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

export type RealtimeEvent = NotificationRealtimeEvent | SystemBroadcastRealtimeEvent;
