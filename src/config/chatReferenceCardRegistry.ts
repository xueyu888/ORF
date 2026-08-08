import {
  defineChatReferenceCardRegistration,
  type AnyChatReferenceCardRegistration,
  type RegisteredChatReferenceCardRegistration,
} from "../features/chat/chatReferenceCardProvider";
import { workLogChatReferenceCardRegistration } from "../features/work-logs/WorkLogChatReferenceCard";
import { registeredWebModuleChatReferenceCards } from "./webModuleRegistry";

const chatReferenceCardRegistrationContributions: readonly AnyChatReferenceCardRegistration[] = [
  workLogChatReferenceCardRegistration,
  ...registeredWebModuleChatReferenceCards,
];

export const registeredChatReferenceCardRegistrations = chatReferenceCardRegistrationContributions
  .map((registration) => defineChatReferenceCardRegistration(registration)) satisfies readonly RegisteredChatReferenceCardRegistration[];
