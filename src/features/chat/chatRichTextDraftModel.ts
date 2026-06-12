import type { ChatUser } from "../../types/orf";
import type { OrfRichTextMentionUser } from "../rich-text/OrfRichTextEditor";

export const chatBroadcastMentionUserId = "__orf_broadcast_mention_all__";

const chatBroadcastMentionOption: OrfRichTextMentionUser = {
  id: chatBroadcastMentionUserId,
  name: "所有人",
  email: "通知当前频道所有成员",
  avatarUrl: null,
  searchText: "所有人 全体 全体成员 all channel here",
  status: "active",
};

export const chatMentionPlainTextUserIds = new Set([chatBroadcastMentionUserId]);

export function chatRichTextMentionableUsers(mentionableUsers: ChatUser[]): OrfRichTextMentionUser[] {
  return [chatBroadcastMentionOption, ...mentionableUsers];
}
