import {
  BarChart3,
  CheckSquare,
  Flag,
  Inbox,
  Settings,
  TimerReset,
} from "lucide-react";

export const navItems = [
  { label: "计划", path: "/tasks", icon: CheckSquare },
  { label: "反馈", path: "/feedback", icon: Inbox },
  { label: "周复盘", path: "/review", icon: TimerReset },
  { label: "统计", path: "/reports", icon: BarChart3 },
  { label: "设置", path: "/settings", icon: Settings },
];

export const quickPages = [
  ...navItems,
  { label: "新建目标", path: "/objectives", icon: Flag },
];
