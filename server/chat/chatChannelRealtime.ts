import type { ChatRealtimeEventType } from "../../src/types/realtime";
import { publishRealtimeChatEvent } from "../realtime/realtimeEventBus";

type ChannelStateRealtimeEventType = Extract<
  ChatRealtimeEventType,
  "channel.archived" | "channel.created" | "channel.updated" | "member.changed" | "read.changed"
>;

export function publishChatChannelRealtime(input: {
  actorUserId: string;
  channelId: string;
  eventType: ChannelStateRealtimeEventType;
  recipientUserIds: string[];
  teamId: string;
}) {
  publishRealtimeChatEvent(input.teamId, Array.from(new Set(input.recipientUserIds)), {
    actorUserId: input.actorUserId,
    channelId: input.channelId,
    eventType: input.eventType,
  });
}
