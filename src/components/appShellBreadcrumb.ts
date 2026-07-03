const titleMap: Record<string, string> = {
  dashboard: "ORF 仪表盘",
  bounties: "悬赏大厅",
  tasks: "我的挑战",
  "work-logs": "工作日志",
  drive: "资源",
  resources: "资源",
  chat: "聊天",
  "fantasy-ui": "Fantasy UI",
  "genshin-ui-kit": "Genshin UI Kit",
  feedback: "反馈",
  notifications: "聊天",
  "strategy-map": "策略地图",
  "ai-evaluation": "AI 评估",
  reports: "统计",
  system: "系统管理",
  members: "成员管理",
  permissions: "权限管理",
  settings: "系统设置",
};

export function breadcrumb(pathname: string) {
  if (/^\/chat(?:\/.*)?\/?$/.test(pathname)) {
    return "聊天";
  }

  if (/^\/feedback\/new\/?$/.test(pathname)) {
    return "反馈 / 新建反馈";
  }

  if (/^\/feedback\/[^/]+\/?$/.test(pathname)) {
    return "反馈 / Issue";
  }

  if (/^\/resources\/[^/]+\/preview\/?$/.test(pathname)) {
    return "资源 / 预览";
  }

  if (/^\/resources\/[^/]+\/?$/.test(pathname)) {
    return "资源 / 详情";
  }

  if (/^\/tasks\/objectives\/[^/]+\/loot\/?$/.test(pathname)) {
    return "目标战利品";
  }

  if (/^\/settings\/?$/.test(pathname)) {
    return "个人设置";
  }

  if (/^\/settings\/system\/?$/.test(pathname)) {
    return "系统管理 / 系统设置";
  }

  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) {
    return "仪表盘";
  }

  return parts.map((part) => titleMap[part] ?? part).join(" / ");
}
