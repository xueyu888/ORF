import type { OrfUser, UserRole } from "../types/orf";

export const userRoleLabel: Record<UserRole, string> = {
  admin: "管理员",
  member: "成员",
};

export const userStatusLabel: Record<OrfUser["status"], string> = {
  pending: "待审核",
  active: "启用",
  rejected: "已拒绝",
  disabled: "已停用",
};
