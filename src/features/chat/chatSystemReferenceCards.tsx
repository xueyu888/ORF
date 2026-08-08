import type { ReactNode } from "react";
import type { ChatMessage } from "../../types/orf";
import {
  defineChatReferenceCardRegistration,
  renderChatReferenceCardFromRegistrations,
  renderChatSystemMessageBodyFromRegistrations,
} from "./chatReferenceCardProvider";
import { workLogChatReferenceCardRegistration } from "../work-logs/WorkLogChatReferenceCard";
import { feedbackChatReferenceCardRegistration } from "../../feedback/feedbackChatReferenceCardProvider";

export type ChatReferenceCardRenderer = (message: ChatMessage) => ReactNode;

const chatReferenceCardRegistrations = [
  defineChatReferenceCardRegistration(workLogChatReferenceCardRegistration),
  defineChatReferenceCardRegistration(feedbackChatReferenceCardRegistration),
];

export function renderChatSystemReferenceCard(message: ChatMessage): ReactNode {
  return renderChatReferenceCardFromRegistrations(message, chatReferenceCardRegistrations);
}

export function renderChatSystemMessageBody(message: ChatMessage): string | null | undefined {
  return renderChatSystemMessageBodyFromRegistrations(message, chatReferenceCardRegistrations);
}
