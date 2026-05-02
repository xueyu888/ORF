import {
  BarChart3,
  CheckSquare,
  Flag,
  Inbox,
  ShieldCheck,
  Settings,
  TimerReset,
  UserRound,
} from "lucide-react";

export const navItems = [
  { label: "计划", path: "/tasks", icon: CheckSquare },
  { label: "反馈", path: "/feedback", icon: Inbox },
  { label: "周复盘", path: "/review", icon: TimerReset },
  { label: "统计", path: "/reports", icon: BarChart3 },
  { label: "用户权限", path: "/permissions", icon: ShieldCheck },
  { label: "设置", path: "/settings", icon: Settings },
];

export const quickPages = [
  ...navItems,
  { label: "注册登录", path: "/auth", icon: UserRound },
  { label: "新建目标", path: "/objectives", icon: Flag },
];
