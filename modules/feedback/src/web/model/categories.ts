export const defaultTeamFeedbackCauseCategories = ["技术问题", "管理问题", "流程问题", "权限问题", "体验问题"] as const;

export type TeamFeedbackCauseCategory = (typeof defaultTeamFeedbackCauseCategories)[number];

const feedbackCauseCategoryAliasEntries = [
  ["技术问题", "技术问题"],
  ["Prompt 问题", "技术问题"],
  ["Prompt问题", "技术问题"],
  ["检索问题", "技术问题"],
  ["重排问题", "技术问题"],
  ["知识缺口", "技术问题"],
  ["模型能力边界", "技术问题"],
  ["工具调用失败", "技术问题"],
  ["时延问题", "技术问题"],
  ["评估缺口", "技术问题"],
  ["管理问题", "管理问题"],
  ["成本问题", "管理问题"],
  ["流程问题", "流程问题"],
  ["需求缺口", "流程问题"],
  ["权限问题", "权限问题"],
  ["体验问题", "体验问题"],
] as const satisfies readonly (readonly [string, TeamFeedbackCauseCategory])[];

const feedbackCauseCategoryAliases = new Map<string, TeamFeedbackCauseCategory>(
  feedbackCauseCategoryAliasEntries.map(([from, to]) => [feedbackCauseCategoryKey(from), to]),
);

export function teamFeedbackCauseOptions() {
  return [...defaultTeamFeedbackCauseCategories];
}

export function feedbackCauseGroupForCategory(category: string): TeamFeedbackCauseCategory | null {
  return feedbackCauseCategoryAliases.get(feedbackCauseCategoryKey(category)) ?? null;
}

export function feedbackCauseGroupsForCategories(categories: readonly string[]) {
  const groups = categories
    .map(feedbackCauseGroupForCategory)
    .filter((category): category is TeamFeedbackCauseCategory => category !== null);
  return Array.from(new Set(groups));
}

export function feedbackMatchesCauseGroup(categories: readonly string[], group: string) {
  return feedbackCauseGroupsForCategories(categories).includes(group as TeamFeedbackCauseCategory);
}

function feedbackCauseCategoryKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}
