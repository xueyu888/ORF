export type ChatPollSelectionMode = "single" | "multiple";

export type ChatPollDraftOption = {
  id: string;
  label: string;
};

export type ChatPollDraft = {
  mode: ChatPollSelectionMode;
  options: ChatPollDraftOption[];
  question: string;
};

export type ChatPollPreviewOption = ChatPollDraftOption & {
  baseVoteCount: number;
};

export const chatPollMinimumOptionCount = 2;
export const chatPollMaximumOptionCount = 8;

const initialOptionLabels = ["围炉火锅", "炭火烤肉", "日式料理", "轻食自助"];
const previewVoteCounts = [8, 5, 3, 2, 1, 1, 0, 0];

export function createInitialChatPollDraft(): ChatPollDraft {
  return {
    mode: "single",
    options: initialOptionLabels.map((label, index) => ({
      id: `poll-option-${index + 1}`,
      label,
    })),
    question: "本周五团队活动，你更想选哪一个？",
  };
}

export function chatPollDraftValidationMessage(draft: ChatPollDraft) {
  if (!draft.question.trim()) return "请输入投票问题";
  if (draft.options.length < chatPollMinimumOptionCount) return "至少需要两个选项";
  if (draft.options.some((option) => !option.label.trim())) return "请填写完整的选项内容";
  const normalizedLabels = draft.options.map((option) => option.label.trim().toLocaleLowerCase());
  if (new Set(normalizedLabels).size !== normalizedLabels.length) return "投票选项不能重复";
  return null;
}

export function toChatPollPreviewOptions(options: readonly ChatPollDraftOption[]): ChatPollPreviewOption[] {
  return options.map((option, index) => ({
    ...option,
    label: option.label.trim(),
    baseVoteCount: previewVoteCounts[index] ?? 0,
  }));
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

export function chatPollSelectionModeLabel(mode: ChatPollSelectionMode) {
  return mode === "single" ? "单选" : "多选";
}
