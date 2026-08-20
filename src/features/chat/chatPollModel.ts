import type { ChatPollSelectionMode, ChatPollVisibility } from "../../types/orf";
import { CHAT_POLL_INPUT_CONTRACT } from "../../domain/chatPollContract";

export type ChatPollDraftOption = {
  id: string;
  label: string;
};

export type ChatPollDraft = {
  options: ChatPollDraftOption[];
  question: string;
  selectionMode: ChatPollSelectionMode;
  visibility: ChatPollVisibility;
};

export type ChatPollCreateInput = {
  options: string[];
  question: string;
  selectionMode: ChatPollSelectionMode;
  visibility: ChatPollVisibility;
};

let draftOptionSequence = 0;

function makeDraftOption(label = ""): ChatPollDraftOption {
  draftOptionSequence += 1;
  return { id: `poll-draft-option-${draftOptionSequence}`, label };
}

export function createInitialChatPollDraft(): ChatPollDraft {
  return {
    options: [makeDraftOption(), makeDraftOption()],
    question: "",
    selectionMode: "single",
    visibility: "named",
  };
}

export function addChatPollDraftOption(draft: ChatPollDraft) {
  if (draft.options.length >= CHAT_POLL_INPUT_CONTRACT.maximumOptionCount) return draft;
  return { ...draft, options: [...draft.options, makeDraftOption()] };
}

export function removeChatPollDraftOption(draft: ChatPollDraft, optionId: string) {
  if (draft.options.length <= CHAT_POLL_INPUT_CONTRACT.minimumOptionCount) return draft;
  return { ...draft, options: draft.options.filter((option) => option.id !== optionId) };
}

export function updateChatPollDraftOption(draft: ChatPollDraft, optionId: string, label: string) {
  return {
    ...draft,
    options: draft.options.map((option) => option.id === optionId ? { ...option, label } : option),
  };
}

export function chatPollDraftValidationMessage(draft: ChatPollDraft) {
  const question = draft.question.trim();
  if (!question) return "请输入投票问题";
  if (question.length > CHAT_POLL_INPUT_CONTRACT.maximumQuestionLength) {
    return `投票问题不能超过 ${CHAT_POLL_INPUT_CONTRACT.maximumQuestionLength} 个字`;
  }
  if (draft.options.length < CHAT_POLL_INPUT_CONTRACT.minimumOptionCount) return "至少需要两个选项";
  if (draft.options.length > CHAT_POLL_INPUT_CONTRACT.maximumOptionCount) {
    return `最多只能添加 ${CHAT_POLL_INPUT_CONTRACT.maximumOptionCount} 个选项`;
  }
  const labels = draft.options.map((option) => option.label.trim());
  if (labels.some((label) => !label)) return "请填写完整的选项内容";
  if (labels.some((label) => label.length > CHAT_POLL_INPUT_CONTRACT.maximumOptionLabelLength)) {
    return `每个选项不能超过 ${CHAT_POLL_INPUT_CONTRACT.maximumOptionLabelLength} 个字`;
  }
  const normalizedLabels = labels.map((label) => label.toLocaleLowerCase());
  if (new Set(normalizedLabels).size !== normalizedLabels.length) return "投票选项不能重复";
  return null;
}

export function toChatPollCreateInput(draft: ChatPollDraft): ChatPollCreateInput | null {
  if (chatPollDraftValidationMessage(draft)) return null;
  return {
    options: draft.options.map((option) => option.label.trim()),
    question: draft.question.trim(),
    selectionMode: draft.selectionMode,
    visibility: draft.visibility,
  };
}

export function toggleChatPollSelection(
  mode: ChatPollSelectionMode,
  selection: ReadonlySet<string>,
  optionId: string,
) {
  if (mode === "single") return new Set([optionId]);
  const nextSelection = new Set(selection);
  if (nextSelection.has(optionId)) nextSelection.delete(optionId);
  else nextSelection.add(optionId);
  return nextSelection;
}

export function sameChatPollSelection(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  if (left.size !== right.size) return false;
  for (const item of left) {
    if (!right.has(item)) return false;
  }
  return true;
}

export function chatPollSelectionModeLabel(mode: ChatPollSelectionMode) {
  return mode === "single" ? "单选" : "多选";
}

export function chatPollVisibilityLabel(visibility: ChatPollVisibility) {
  return visibility === "anonymous" ? "匿名" : "非匿名";
}
