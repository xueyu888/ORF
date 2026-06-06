import { Hash, Lock, MessageSquare } from "lucide-react";
import type { ChatChannel } from "../../types/orf";

export function channelIcon(channel: ChatChannel) {
  if (channel.type === "public") return Hash;
  if (channel.type === "private") return Lock;
  return MessageSquare;
}
