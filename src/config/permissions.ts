import type { OrfUser, PermissionRule, UserRole } from "../types/orf";

export const permissionDefinitions = [
  { key: "objective.create", label: "新建目标", category: "目标", location: "悬赏大厅、顶部栏和命令菜单进入挑战页创建入口" },
  { key: "objective.delete", label: "删除目标", category: "目标", location: "挑战页目标行" },
  { key: "result.create", label: "新增指标", category: "指标", location: "挑战页目标行" },
  { key: "result.edit", label: "编辑指标口径", category: "指标", location: "挑战页指标行" },
  { key: "result.delete", label: "删除指标", category: "指标", location: "挑战页指标行" },
  { key: "result.reviewCandidate", label: "采纳或拒绝候选指标", category: "指标", location: "候选指标处理" },
  { key: "challenge.assign", label: "指定挑战者", category: "挑战", location: "挑战分配" },
  { key: "challengeApplication.review", label: "处理挑战申请", category: "挑战", location: "挑战申请确认" },
  { key: "settlement.review", label: "验收或结算", category: "结算", location: "奖励结算" },
  { key: "comment.manage", label: "管理所有评论", category: "评论", location: "评论组件" },
  { key: "chat.read", label: "查看聊天", category: "聊天", location: "聊天中心" },
  { key: "chat.write", label: "发送聊天消息", category: "聊天", location: "聊天中心消息输入框" },
  { key: "chat.channel.create", label: "创建私有频道", category: "聊天", location: "聊天中心频道创建入口" },
  { key: "chat.channel.manage", label: "管理聊天频道", category: "聊天", location: "聊天中心频道设置和归档入口" },
  { key: "chat.member.manage", label: "管理聊天成员", category: "聊天", location: "聊天中心成员面板" },
] as const;

export type PermissionKey = (typeof permissionDefinitions)[number]["key"];

export const permissionKeys = permissionDefinitions.map((item) => item.key) as [PermissionKey, ...PermissionKey[]];

export function normalizePermissionKeys(keys: readonly string[]): PermissionKey[] {
  return permissionKeys.filter((key) => keys.includes(key));
}

export function rolePermissionKeys(rules: readonly PermissionRule[], role: UserRole): PermissionKey[] {
  return normalizePermissionKeys(rules.find((rule) => rule.role === role)?.permissions ?? []);
}

export function hasRolePermission(role: UserRole | undefined, rules: readonly PermissionRule[], key: PermissionKey) {
  if (role === "admin") {
    return true;
  }

  if (role !== "member") {
    return false;
  }

  return rolePermissionKeys(rules, role).includes(key);
}

export function hasPermission(user: OrfUser | null | undefined, rules: readonly PermissionRule[], key: PermissionKey) {
  return hasRolePermission(user?.role, rules, key);
}
