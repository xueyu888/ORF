import type { ReactNode } from "react";
import type { ChatMessage } from "../../types/orf";
import {
  defineChatReferenceCardRegistration,
  renderChatReferenceCardFromRegistrations,
  renderChatSystemMessageBodyFromRegistrations,
} from "./chatReferenceCardProvider";
import { workLogChatReferenceCardRegistration } from "../work-logs/WorkLogChatReferenceCard";

export type ChatReferenceCardRenderer = (message: ChatMessage) => ReactNode;

const chatReferenceCardRegistrations = [
  defineChatReferenceCardRegistration(workLogChatReferenceCardRegistration),
];

export function renderChatSystemReferenceCard(message: ChatMessage): ReactNode {
  return renderChatReferenceCardFromRegistrations(message, chatReferenceCardRegistrations);
}

export function renderChatSystemMessageBody(message: ChatMessage): string | null | undefined {
  return renderChatSystemMessageBodyFromRegistrations(message, chatReferenceCardRegistrations);
}
