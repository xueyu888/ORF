export const defaultTeamFeedbackCauseCategories = ["技术问题", "管理问题", "流程问题", "权限问题", "体验问题"] as const;

export function teamFeedbackCauseOptions(stateCategories: readonly string[]) {
  return Array.from(new Set([...defaultTeamFeedbackCauseCategories, ...stateCategories].map((item) => item.trim()).filter(Boolean)));
}
