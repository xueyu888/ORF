export type ChatPollSelectionMode = "single" | "multiple";
export type ChatPollVisibility = "named" | "anonymous";

export type ChatPollDraftOption = {
  id: string;
  label: string;
};

export type ChatPollDraft = {
  mode: ChatPollSelectionMode;
  options: ChatPollDraftOption[];
  question: string;
  visibility: ChatPollVisibility;
};

export type ChatPollPreviewOption = ChatPollDraftOption;

export type ChatPollPreviewParticipant = {
  avatarLabel: string;
  id: string;
  isCurrentUser?: boolean;
  name: string;
  optionIds: string[];
};

export const chatPollMinimumOptionCount = 2;
export const chatPollMaximumOptionCount = 8;

const initialOptionLabels = ["围炉火锅", "炭火烤肉", "日式料理", "轻食自助"];
const previewParticipantNames = [
  "林晓", "周宁", "陈墨", "苏禾", "顾言", "叶然", "程屿", "江澄", "沈砚",
  "唐棠", "许知", "陆川", "温岚", "夏予", "方遥", "韩序", "罗一", "白露",
];
const previewSingleSelectionIndexes = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 3, 3];
const previewMultipleSelectionIndexes = [
  [0, 1], [0], [0, 2], [1, 3], [1], [0, 1], [2, 3], [0, 3], [1, 2],
  [0], [2], [3], [0, 2], [1], [0, 1, 2], [3], [0], [1, 3],
];

export function createInitialChatPollDraft(): ChatPollDraft {
  return {
    mode: "single",
    options: initialOptionLabels.map((label, index) => ({
      id: `poll-option-${index + 1}`,
      label,
    })),
    question: "本周五团队活动，你更想选哪一个？",
    visibility: "named",
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
  return options.map((option) => ({
    ...option,
    label: option.label.trim(),
  }));
}

export function createChatPollPreviewParticipants(
  options: readonly ChatPollPreviewOption[],
  mode: ChatPollSelectionMode,
): ChatPollPreviewParticipant[] {
  return previewParticipantNames.map((name, participantIndex) => {
    const requestedIndexes = mode === "single"
      ? [previewSingleSelectionIndexes[participantIndex] ?? participantIndex]
      : previewMultipleSelectionIndexes[participantIndex] ?? [participantIndex];
    const optionIds = Array.from(new Set(requestedIndexes
      .map((optionIndex) => options[optionIndex]?.id)
      .filter((optionId): optionId is string => Boolean(optionId))));
    const fallbackOptionId = options[participantIndex % options.length]?.id;
    return {
      avatarLabel: name.slice(0, 1),
      id: `preview-participant-${participantIndex + 1}`,
      name,
      optionIds: optionIds.length > 0 ? optionIds : fallbackOptionId ? [fallbackOptionId] : [],
    };
  });
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

export function chatPollVisibilityLabel(visibility: ChatPollVisibility) {
  return visibility === "anonymous" ? "匿名" : "非匿名";
}
