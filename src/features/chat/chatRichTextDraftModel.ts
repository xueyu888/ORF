import type { ChatUser } from "../../types/orf";
import type { OrfRichTextMentionUser } from "../rich-text/OrfRichTextEditor";
import { type ChatDraft, draftFromStoredBody, serializeDraft } from "./chatModels";

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

export function chatDraftToRichTextMarkdown(draft: ChatDraft) {
  return serializeDraft(draft);
}

export function chatRichTextMarkdownToDraft(markdown: string, usersById: Map<string, ChatUser>) {
  return draftFromStoredBody(markdown, usersById);
}

export function chatRichTextMentionableUsers(mentionableUsers: ChatUser[]): OrfRichTextMentionUser[] {
  return [chatBroadcastMentionOption, ...mentionableUsers];
}
