import type { ChatPollSelectionMode, ChatPollVisibility } from "../../src/types/orf";
import { CHAT_POLL_INPUT_CONTRACT } from "../../src/domain/chatPollContract";

export type NormalizedChatPollDraft = {
  options: string[];
  selectionMode: ChatPollSelectionMode;
  visibility: ChatPollVisibility;
};

const pollSelectionModes = new Set<ChatPollSelectionMode>(["single", "multiple"]);
const pollVisibilities = new Set<ChatPollVisibility>(["named", "anonymous"]);

export function normalizeChatPollDraft(input: {
  options: readonly string[];
  selectionMode: ChatPollSelectionMode;
  visibility: ChatPollVisibility;
}): NormalizedChatPollDraft | null {
  if (!pollSelectionModes.has(input.selectionMode) || !pollVisibilities.has(input.visibility)) return null;
  if (
    input.options.length < CHAT_POLL_INPUT_CONTRACT.minimumOptionCount
    || input.options.length > CHAT_POLL_INPUT_CONTRACT.maximumOptionCount
  ) return null;
  const options = input.options.map((option) => option.trim());
  if (options.some((option) => !option || option.length > CHAT_POLL_INPUT_CONTRACT.maximumOptionLabelLength)) return null;
  const normalizedLabels = options.map((option) => option.toLocaleLowerCase());
  if (new Set(normalizedLabels).size !== normalizedLabels.length) return null;
  return { options, selectionMode: input.selectionMode, visibility: input.visibility };
}

export function normalizeChatPollVote(optionIds: readonly string[], selectionMode: ChatPollSelectionMode) {
  const uniqueOptionIds = Array.from(new Set(optionIds.map((optionId) => optionId.trim()).filter(Boolean)));
  if (uniqueOptionIds.length === 0 || uniqueOptionIds.length > CHAT_POLL_INPUT_CONTRACT.maximumOptionCount) return null;
  if (selectionMode === "single" && uniqueOptionIds.length !== 1) return null;
  return uniqueOptionIds;
}

export function chatPollProjectionPolicy(input: { closedAt: string | null; visibility: ChatPollVisibility }) {
  const resultsVisible = Boolean(input.closedAt);
  return {
    includeParticipantIdentities: resultsVisible && input.visibility === "named",
    resultsVisible,
  } as const;
}
