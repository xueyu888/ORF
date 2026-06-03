import {
  Archive,
  BarChart3,
  Bell,
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
  { label: "消息", path: "/notifications", icon: Bell },
  { label: "统计", path: "/reports", icon: BarChart3 },
  { label: "系统管理", path: "/system", icon: Settings },
];

export const systemManagementPages = [
  { label: "成员管理", path: "/system/members", icon: UsersRound },
  { label: "权限管理", path: "/system/permissions", icon: ShieldCheck },
  { label: "系统设置", path: "/system/settings", icon: Settings },
  { label: "聊天归档", path: "/system/mattermost-archive", icon: Archive },
];

export const quickPages = [
  ...navItems,
  ...systemManagementPages,
];

export const quickActions = [
  { label: "新建目标", action: "createObjective" as const, icon: Flag, permission: "objective.create" satisfies PermissionKey },
];

export const quickCommands = [
  ...quickPages.map((item) => ({ ...item, kind: "page" as const })),
  ...quickActions.map((item) => ({ ...item, kind: "action" as const })),
];
