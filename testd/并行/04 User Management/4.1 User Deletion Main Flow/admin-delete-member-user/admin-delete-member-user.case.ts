import { STATE_CASE_MODEL, type StateCaseSpec } from "../../../../_framework/types";
import type { AdminDeleteMemberUserCaseData } from "./_support/admin-delete-member-user.context";

export const adminDeleteMemberUserCase = {
  id: "user-management.admin-delete-member-user",
  title: "管理员可以删除有聊天成员关系的普通用户",
  model: STATE_CASE_MODEL,
  tags: ["user-management", "user-deletion", "admin", "chat-membership", "happy-path"],

  data: {
    adminEmail: "orf-admin-delete-member-user-e2e@orf.local",
    adminName: "ORF Admin Delete Member User E2E",
    adminPassword: "OrfAdminDeleteMemberUserE2E!2026",
    memberEmail: "orf-member-delete-by-admin-e2e@orf.local",
    memberName: "ORF Member Delete By Admin E2E",
    memberPassword: "OrfMemberDeleteByAdminE2E!2026",
  },

  B: {
    description: "系统服务可用，浏览器处于未登录基准状态",
    assertions: [
      { source: { caseStepId: "B-1", method: "api" }, id: "frontend.ready", title: "前端服务 应可用", object: "frontend.service", operator: "available" },
      { source: { caseStepId: "B-2", method: "api" }, id: "backend.ready", title: "后端服务 应可用", object: "api.health", operator: "ok" },
      { source: { caseStepId: "B-3", method: "prisma" }, id: "db.ready", title: "ORF 数据库 应可连接", object: "db", operator: "ready" },
      { source: { caseStepId: "B-4", method: "api" }, id: "ory.ready", title: "Ory 管理服务 应可用", object: "ory.admin", operator: "ready" },
      { source: { caseStepId: "B-5", method: "api" }, id: "session.unauthenticated", title: "当前会话 应为 未登录", object: "auth.session", operator: "unauthenticated" },
      { source: { caseStepId: "B-6", method: "playwright" }, id: "storage.empty", title: "当前浏览器 应不保留本地登录态", object: "browser.auth_storage", operator: "empty" },
    ],
  },

  Setup: {
    description: "准备独占管理员、普通成员和公共聊天成员关系，并进入成员管理页",
    steps: [
      { source: { caseStepId: "Setup-1", method: "prisma" }, id: "db.admin.delete_residue", title: "删除 本用例管理员的残留用户数据", object: "db.user", operator: "delete", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Setup-2", method: "prisma" }, id: "db.member.delete_residue", title: "删除 本用例普通成员的残留用户数据", object: "db.user", operator: "delete", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Setup-3", method: "api" }, id: "ory.admin.delete_residue", title: "删除 本用例管理员的残留登录身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Setup-4", method: "api" }, id: "ory.member.delete_residue", title: "删除 本用例普通成员的残留登录身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Setup-5", method: "api" }, id: "ory.admin.upsert", title: "准备 使用固定测试密码的本用例管理员登录身份", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.adminEmail", nameFrom: "data.adminName", passwordFrom: "data.adminPassword", saveAs: "adminIdentity" } },
      { source: { caseStepId: "Setup-6", method: "prisma" }, id: "db.admin.upsert", title: "准备 角色为 `admin`、状态为 `active` 的本用例管理员用户", object: "db.user", operator: "upsert", params: { emailFrom: "data.adminEmail", nameFrom: "data.adminName", role: "admin", status: "active", identityIdFrom: "runtime.adminIdentity.id", saveAs: "adminUser" } },
      { source: { caseStepId: "Setup-7", method: "api" }, id: "ory.member.upsert", title: "准备 使用固定测试密码的本用例普通成员登录身份", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.memberEmail", nameFrom: "data.memberName", passwordFrom: "data.memberPassword", saveAs: "memberIdentity" } },
      { source: { caseStepId: "Setup-8", method: "prisma" }, id: "db.member.upsert", title: "准备 角色为 `member`、状态为 `active` 的本用例普通成员用户", object: "db.user", operator: "upsert", params: { emailFrom: "data.memberEmail", nameFrom: "data.memberName", role: "member", status: "active", identityIdFrom: "runtime.memberIdentity.id", saveAs: "memberUser" } },
      { source: { caseStepId: "Setup-9", method: "playwright" }, id: "auth.login.admin", title: "使用 本用例管理员账号 登录 ORF", object: "page.auth", operator: "login", params: { emailFrom: "data.adminEmail", passwordFrom: "data.adminPassword" } },
      { source: { caseStepId: "Setup-10", method: "api" }, id: "chat.bootstrap", title: "通过聊天服务准备活跃成员的公共聊天成员关系", object: "api.chat_bootstrap", operator: "prepare_public_memberships" },
      { source: { caseStepId: "Setup-11", method: "playwright" }, id: "page.members.goto", title: "打开 成员管理页", object: "page", operator: "goto", params: { path: "/system/members" } },
    ],
  },

  S0: {
    description: "管理员已登录，普通成员及其聊天成员关系存在且删除入口可用",
    assertions: [
      { source: { caseStepId: "S0-1", method: "api" }, id: "session.authenticated", title: "当前会话 应为 已登录", object: "auth.session", operator: "authenticated" },
      { source: { caseStepId: "S0-2", method: "api" }, id: "session.role", title: "当前会话用户角色 应为 `admin`", object: "auth.session.user_role", operator: "equals", params: { role: "admin" } },
      { source: { caseStepId: "S0-3", method: "prisma" }, id: "db.member.matches", title: "应存在 本用例普通成员用户", object: "db.user", operator: "matches", params: { emailFrom: "data.memberEmail", role: "member", status: "active" } },
      { source: { caseStepId: "S0-4", method: "api" }, id: "ory.member.exists", title: "应存在 本用例普通成员的 Ory 登录身份", object: "ory.identity", operator: "exists", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "S0-5", method: "prisma" }, id: "db.member.chat_membership", title: "应存在 本用例普通成员的活跃公共聊天成员关系", object: "db.user_chat_membership", operator: "exists", params: { userIdFrom: "runtime.memberUser.userId" } },
      { source: { caseStepId: "S0-6", method: "playwright" }, id: "page.members.url", title: "当前页面 应为 成员管理页", object: "page.url", operator: "match", params: { pattern: "/system/members$" } },
      { source: { caseStepId: "S0-7", method: "playwright" }, id: "page.member.visible", title: "成员管理页 应显示 本用例普通成员", object: "page.member_user", operator: "visible", params: { nameFrom: "data.memberName" } },
      { source: { caseStepId: "S0-8", method: "playwright" }, id: "page.member.delete_visible", title: "本用例普通成员的 \"删除用户\" 操作 应可见", object: "page.member_user", operator: "delete_visible", params: { nameFrom: "data.memberName" } },
      { source: { caseStepId: "S0-9", method: "playwright" }, id: "page.member.delete_enabled", title: "本用例普通成员的 \"删除用户\" 操作 应可点击", object: "page.member_user", operator: "delete_enabled", params: { nameFrom: "data.memberName" } },
    ],
  },

  Action: {
    description: "管理员从成员管理页确认删除普通成员",
    steps: [
      { source: { caseStepId: "Action-1", method: "playwright" }, id: "page.member.delete", title: "在成员管理页确认删除 本用例普通成员", object: "page.member_user", operator: "delete", params: { nameFrom: "data.memberName", userIdFrom: "runtime.memberUser.userId", saveAs: "deleteUserResponse" } },
      { source: { caseStepId: "Action-2", method: "api" }, id: "api.user.delete.ok", title: "删除用户结果 应成功", object: "api.response", operator: "ok", params: { responseFrom: "runtime.deleteUserResponse", status: 200 } },
    ],
  },

  S1: {
    description: "普通成员、身份和聊天成员关系均已删除，删除同步事件不再引用该用户",
    assertions: [
      { source: { caseStepId: "S1-1", method: "playwright" }, id: "page.member.absent", title: "成员管理页 应不显示 本用例普通成员", object: "page.member_user", operator: "absent", params: { nameFrom: "data.memberName" } },
      { source: { caseStepId: "S1-2", method: "prisma" }, id: "db.member.absent", title: "应不存在 本用例普通成员用户", object: "db.user", operator: "absent", params: { emailFrom: "data.memberEmail", userIdFrom: "runtime.memberUser.userId" } },
      { source: { caseStepId: "S1-3", method: "api" }, id: "ory.member.absent", title: "应不存在 本用例普通成员的 Ory 登录身份", object: "ory.identity", operator: "absent", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "S1-4", method: "prisma" }, id: "db.member.chat_membership_absent", title: "应不存在 本用例普通成员的公共聊天成员关系", object: "db.user_chat_membership", operator: "absent", params: { userIdFrom: "runtime.memberUser.userId" } },
      { source: { caseStepId: "S1-5", method: "prisma" }, id: "db.member.chat_removal_event", title: "应存在 不再引用已删除普通成员的聊天成员移除同步事件", object: "db.user_chat_removal_event", operator: "exists_without_deleted_actor", params: { userIdFrom: "runtime.memberUser.userId" } },
    ],
  },

  Clean: {
    description: "清理浏览器状态、独占身份、用户和聊天同步事件",
    steps: [
      { source: { caseStepId: "Clean-1", method: "api" }, id: "auth.logout", title: "注销当前登录会话", object: "auth", operator: "logout" },
      { source: { caseStepId: "Clean-2", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Clean-3", method: "api" }, id: "ory.member.delete", title: "删除 本用例普通成员的残留登录身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-4", method: "prisma" }, id: "db.member.delete", title: "删除 本用例普通成员的残留用户数据和聊天同步事件", object: "db.user", operator: "delete", params: { emailFrom: "data.memberEmail", userIdFrom: "runtime.memberUser.userId" } },
      { source: { caseStepId: "Clean-5", method: "api" }, id: "ory.admin.delete", title: "删除 本用例管理员登录身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-6", method: "prisma" }, id: "db.admin.delete", title: "删除 本用例管理员用户", object: "db.user", operator: "delete", params: { emailFrom: "data.adminEmail", userIdFrom: "runtime.adminUser.userId" } },
    ],
  },
} satisfies StateCaseSpec<AdminDeleteMemberUserCaseData>;
