import {
  BarChart3,
  CheckSquare,
  Flag,
  Inbox,
  ShieldCheck,
  Settings,
  Trophy,
  UsersRound,
} from "lucide-react";

export const navItems = [
  { label: "悬赏大厅", path: "/bounties", icon: Trophy },
  { label: "计划", path: "/tasks", icon: CheckSquare },
  { label: "反馈", path: "/feedback", icon: Inbox },
  { label: "统计", path: "/reports", icon: BarChart3 },
  { label: "成员管理", path: "/members", icon: UsersRound },
  { label: "权限管理", path: "/permissions", icon: ShieldCheck },
  { label: "设置", path: "/settings", icon: Settings },
];

export const quickPages = [
  ...navItems,
  { label: "新建目标", path: "/objectives", icon: Flag },
];
