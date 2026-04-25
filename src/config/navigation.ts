import {
  BarChart3,
  Bot,
  CheckSquare,
  Flag,
  GitFork,
  Home,
  Inbox,
  Settings,
  Target,
  TimerReset,
} from "lucide-react";

export const navItems = [
  { label: "仪表盘", path: "/dashboard", icon: Home },
  { label: "目标", path: "/objectives", icon: Target },
  { label: "任务", path: "/tasks", icon: CheckSquare },
  { label: "反馈", path: "/feedback", icon: Inbox },
  { label: "周复盘", path: "/review", icon: TimerReset },
  { label: "策略地图", path: "/strategy-map", icon: GitFork },
  { label: "AI 评估", path: "/ai-evaluation", icon: Bot },
  { label: "汇报", path: "/reports", icon: BarChart3 },
  { label: "设置", path: "/settings", icon: Settings },
];

export const quickPages = [
  ...navItems,
  { label: "新建目标", path: "/objectives", icon: Flag },
];
