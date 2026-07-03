import {
  BarChart3,
  CheckSquare,
  Flag,
  HardDrive,
  Inbox,
  MessagesSquare,
  NotebookPen,
  ShieldCheck,
  Settings,
  Trophy,
  UsersRound,
} from "lucide-react";
import type { PermissionKey } from "./permissions";

export const navItems = [
  { label: "悬赏大厅", path: "/bounties", icon: Trophy },
  { label: "我的挑战", path: "/tasks", icon: CheckSquare },
  { label: "工作日志", path: "/work-logs", icon: NotebookPen },
  { label: "聊天", path: "/chat", icon: MessagesSquare },
  { label: "资源", path: "/resources", icon: HardDrive },
  { label: "反馈", path: "/feedback", icon: Inbox },
  { label: "统计", path: "/reports", icon: BarChart3 },
  { label: "系统管理", path: "/system", icon: Settings },
];

export const systemManagementPages = [
  { label: "成员管理", path: "/system/members", icon: UsersRound },
  { label: "权限管理", path: "/system/permissions", icon: ShieldCheck },
  { label: "系统设置", path: "/system/settings", icon: Settings },
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
