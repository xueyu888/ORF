import type { ReactNode } from "react";
import { WorkLogChatReferenceCard, isWorkLogSubmittedChatMessage } from "../work-logs/WorkLogChatReferenceCard";
import type { ChatMessage } from "../../types/orf";

export type ChatReferenceCardRenderer = (message: ChatMessage) => ReactNode;

export function renderChatSystemReferenceCard(message: ChatMessage): ReactNode {
  if (isWorkLogSubmittedChatMessage(message)) {
    return <WorkLogChatReferenceCard message={message} />;
  }
  return null;
}

function workLogSubmittedActorName(message: ChatMessage) {
  return (
    message.system?.metadata?.authorName?.trim() ||
    message.system?.actorName?.trim() ||
    "成员"
  );
}

export function renderChatSystemMessageBody(message: ChatMessage): string | null | undefined {
  if (isWorkLogSubmittedChatMessage(message)) {
    return `${workLogSubmittedActorName(message)}发布了新的工作日志`;
  }
  return undefined;
}
