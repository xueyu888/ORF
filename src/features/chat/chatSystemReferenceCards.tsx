import type { ReactNode } from "react";
import type { ChatMessage } from "../../types/orf";
import {
  renderChatReferenceCardFromRegistrations,
  renderChatSystemMessageBodyFromRegistrations,
} from "./chatReferenceCardProvider";
import { registeredChatReferenceCardRegistrations } from "../../config/chatReferenceCardRegistry";

export type ChatReferenceCardRenderer = (message: ChatMessage) => ReactNode;

export function renderChatSystemReferenceCard(message: ChatMessage): ReactNode {
  return renderChatReferenceCardFromRegistrations(message, registeredChatReferenceCardRegistrations);
}

export function renderChatSystemMessageBody(message: ChatMessage): string | null | undefined {
  return renderChatSystemMessageBodyFromRegistrations(message, registeredChatReferenceCardRegistrations);
}
