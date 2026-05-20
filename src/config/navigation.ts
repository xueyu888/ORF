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
import type { PermissionKey } from "./permissions";

export const navItems = [
  { label: "悬赏大厅", path: "/bounties", icon: Trophy },
  { label: "我的挑战", path: "/tasks", icon: CheckSquare },
  { label: "反馈", path: "/feedback", icon: Inbox },
  { label: "统计", path: "/reports", icon: BarChart3 },
  { label: "成员管理", path: "/members", icon: UsersRound },
  { label: "权限管理", path: "/permissions", icon: ShieldCheck },
  { label: "设置", path: "/settings", icon: Settings },
];

export const quickPages = [
  ...navItems,
];

export const quickActions = [
  { label: "新建目标", action: "newObjective" as const, icon: Flag, permission: "objective.create" satisfies PermissionKey },
];

export const quickCommands = [
  ...quickPages.map((item) => ({ ...item, kind: "page" as const })),
  ...quickActions.map((item) => ({ ...item, kind: "action" as const })),
];
