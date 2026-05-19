const titleMap: Record<string, string> = {
  dashboard: "ORF 仪表盘",
  bounties: "悬赏大厅",
  objectives: "目标",
  tasks: "挑战",
  "fantasy-ui": "Fantasy UI",
  "genshin-ui-kit": "Genshin UI Kit",
  feedback: "反馈",
  "strategy-map": "策略地图",
  "ai-evaluation": "AI 评估",
  reports: "统计",
  members: "成员管理",
  permissions: "权限管理",
  settings: "设置",
};

export function breadcrumb(pathname: string) {
  if (/^\/objectives\/[^/]+\/loot\/?$/.test(pathname)) {
    return "目标战利品";
  }

  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) {
    return "仪表盘";
  }

  return parts.map((part) => titleMap[part] ?? part).join(" / ");
}
