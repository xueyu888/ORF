import type { ChatMessage } from "../../src/types/orf";
import { chatNotificationPreviewText } from "../../src/domain/chatNotificationPresentation";
import { chatMessageTargetPath } from "../../src/domain/chatNavigation";
import { displayChatReactionEmoji, labelChatReactionEmoji } from "../../src/features/chat/chatReactions";
import { publishNotificationEvent } from "../messageSystem/notificationPublisher";

type ChatReactionNotificationMessage = Pick<
  ChatMessage,
  "attachments" | "authorUserId" | "body" | "channelId" | "id" | "rootMessageId" | "source" | "system"
>;

export type ChatReactionNotificationPlan = {
  actorName: string;
  actorUserId: string;
  body: string;
  emojiName: string;
  recipientUserId: string;
  targetHref: string;
  targetId: string;
  teamId: string;
  title: string;
};

function chatReactionRecipientUserId(message: ChatReactionNotificationMessage) {
  return message.source === "system"
    ? message.system?.actorUserId?.trim() || null
    : message.authorUserId.trim() || null;
}

export function buildChatReactionNotificationPlan(input: {
  actorName: string;
  actorUserId: string;
  emojiName: string;
  message: ChatReactionNotificationMessage;
  reacting: boolean;
  reactionChanged: boolean;
  teamId: string;
}): ChatReactionNotificationPlan | null {
  if (!input.reacting || !input.reactionChanged) return null;
  const recipientUserId = chatReactionRecipientUserId(input.message);
  if (!recipientUserId || recipientUserId === input.actorUserId) return null;

  const emojiName = input.emojiName.trim();
  const symbol = displayChatReactionEmoji(emojiName);
  const label = labelChatReactionEmoji(emojiName);
  const reaction = symbol === label ? symbol : `${symbol} ${label}`;
  return {
    actorName: input.actorName,
    actorUserId: input.actorUserId,
    body: `${reaction} · ${chatNotificationPreviewText(input.message)}`,
    emojiName,
    recipientUserId,
    targetHref: chatMessageTargetPath({
      channelId: input.message.channelId,
      messageId: input.message.id,
      threadRootMessageId: input.message.rootMessageId,
    }),
    targetId: input.message.id,
    teamId: input.teamId,
    title: `${input.actorName} 回应了你的消息`,
  };
}

export async function publishChatReactionNotification(plan: ChatReactionNotificationPlan) {
  return publishNotificationEvent({
    actorName: plan.actorName,
    actorUserId: plan.actorUserId,
    body: plan.body,
    kind: "chat.reaction.created",
    metadata: {
      emojiName: plan.emojiName,
    },
    recipientFacts: [{
      attentionLevel: "normal",
      deliveryClass: "ordinary",
      reasons: ["message_reaction"],
      userId: plan.recipientUserId,
    }],
    recipientUserIds: [plan.recipientUserId],
    targetHref: plan.targetHref,
    targetId: plan.targetId,
    targetType: "chatMessage",
    teamId: plan.teamId,
    title: plan.title,
  });
}
