import type { FeedbackWebUser, FeedbackWebUserSummary } from "../types";

export type FeedbackAssigneeOption = Pick<FeedbackWebUserSummary, "avatarUrl" | "id" | "name">;

export function feedbackAssigneeOptionsFromUsers(users: readonly FeedbackWebUser[]): FeedbackAssigneeOption[] {
  return users
    .filter((user) => user.status === "active")
    .map((user) => ({
      avatarUrl: user.avatarUrl ?? null,
      id: user.id,
      name: user.name,
    }));
}

export function mergeFeedbackAssigneeOptions(
  ...sources: readonly (readonly FeedbackAssigneeOption[])[]
): FeedbackAssigneeOption[] {
  const optionsById = new Map<string, FeedbackAssigneeOption>();
  for (const source of sources) {
    for (const option of source) {
      const id = option.id.trim();
      const name = option.name.trim();
      if (!id || !name || optionsById.has(id)) continue;
      optionsById.set(id, {
        avatarUrl: option.avatarUrl ?? null,
        id,
        name,
      });
    }
  }

  return [...optionsById.values()].sort(compareFeedbackAssigneeOptions);
}

export function ensureFeedbackAssigneeOption(
  options: readonly FeedbackAssigneeOption[],
  selected: FeedbackAssigneeOption | null,
): FeedbackAssigneeOption[] {
  if (!selected) return [...options];
  return mergeFeedbackAssigneeOptions(options, [selected]);
}

function compareFeedbackAssigneeOptions(left: FeedbackAssigneeOption, right: FeedbackAssigneeOption) {
  return left.name.localeCompare(right.name, "zh-Hans-CN") || left.id.localeCompare(right.id);
}
