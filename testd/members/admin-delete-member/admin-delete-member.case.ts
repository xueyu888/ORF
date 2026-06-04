import { STATE_CASE_MODEL, type StateCaseSpec } from "../../_framework/types";
import type { AdminDeleteMemberCaseData } from "./_support/admin-delete-member.context";

export const adminDeleteMemberCase = {
  id: "members.admin-delete",
  title: "管理员删除成员",
  model: STATE_CASE_MODEL,
  tags: ["members", "admin", "delete", "happy-path"],

  data: {
    adminEmail: "orf-admin-delete-member-e2e@orf.local",
    adminPassword: "OrfAdminDeleteMemberE2E!2026",
    adminName: "ORF Admin Delete Member E2E",
    adminRole: "admin",
    memberUserId: "user-testd-admin-delete-member",
    memberName: "ORF Member Delete Target E2E",
    memberEmail: "orf-member-delete-target-e2e@orf.local",
    memberRole: "member",
  },

  B: {
    description: "系统服务可用，浏览器处于未登录基准状态",
    assertions: [
      { source: { caseStepId: "B-1", method: "api" }, id: "frontend.ready", title: "前端服务 应可用", object: "frontend.service", operator: "available" },
      { source: { caseStepId: "B-2", method: "api" }, id: "backend.ready", title: "后端服务 应可用", object: "api.health", operator: "ok" },
      { source: { caseStepId: "B-3", method: "api" }, id: "frontend.login_entry.accessible", title: "前端登录页入口 应可访问", object: "frontend.login_entry", operator: "accessible" },
      { source: { caseStepId: "B-4", method: "api" }, id: "session.endpoint.accessible", title: "当前会话查询能力 应可用", object: "auth.session", operator: "accessible" },
      { source: { caseStepId: "B-5", method: "prisma" }, id: "db.ready", title: "ORF 数据库 应可连接", object: "db", operator: "ready" },
      { source: { caseStepId: "B-6", method: "prisma" }, id: "db.schema.current", title: "ORF 数据库 schema 应为 当前测试版本", object: "db.schema", operator: "current" },
      { source: { caseStepId: "B-7", method: "api" }, id: "ory.admin_public.ready", title: "Ory/Kratos 认证服务的管理和公共访问能力 应可用", object: "ory.admin_public", operator: "ready" },
      { source: { caseStepId: "B-8", method: "api" }, id: "session.unauthenticated", title: "当前会话 应为 未登录", object: "auth.session", operator: "unauthenticated" },
      { source: { caseStepId: "B-9", method: "playwright" }, id: "cookie.absent", title: "当前浏览器 应不存在 Ory 登录会话 cookie", object: "browser.cookie", operator: "absent" },
      { source: { caseStepId: "B-10", method: "playwright" }, id: "storage.empty", title: "当前浏览器 应不保留本地登录态", object: "browser.auth_storage", operator: "empty" },
    ],
  },

  Setup: {
    description: "准备管理员和可删除成员，登录管理员并打开成员管理页",
    steps: [
      { source: { caseStepId: "Setup-1", method: "prisma" }, id: "db.delete_member.delete_residue", title: "删除本用例残留的可删除成员", object: "db.user", operator: "delete", params: { userIdFrom: "data.memberUserId", emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Setup-2", method: "api" }, id: "ory.admin_identity.upsert", title: "准备管理员认证身份，邮箱为 `orf-admin-delete-member-e2e@orf.local`，密码为固定测试密码", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.adminEmail", nameFrom: "data.adminName", passwordFrom: "data.adminPassword", saveAs: "adminIdentity" } },
      { source: { caseStepId: "Setup-3", method: "prisma" }, id: "db.admin.upsert", title: "准备管理员用户和默认团队成员关系，邮箱为 `orf-admin-delete-member-e2e@orf.local`、角色为 `admin`、状态为 `active`", object: "db.user", operator: "upsert", params: { emailFrom: "data.adminEmail", nameFrom: "data.adminName", roleFrom: "data.adminRole", status: "active", identityIdFrom: "runtime.adminIdentity.id", saveAs: "adminUser" } },
      { source: { caseStepId: "Setup-4", method: "prisma" }, id: "db.delete_member.upsert", title: "准备可删除成员，邮箱为 `orf-member-delete-target-e2e@orf.local`、角色为 `member`、状态为 `active`", object: "db.user", operator: "upsert", params: { userIdFrom: "data.memberUserId", emailFrom: "data.memberEmail", nameFrom: "data.memberName", roleFrom: "data.memberRole", status: "active", saveAs: "deleteMember" } },
      { source: { caseStepId: "Setup-5", method: "api" }, id: "ory.admin_sessions.revoke", title: "撤销管理员认证身份的残留登录会话", object: "ory.sessions", operator: "revoke_by_email", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Setup-6", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Setup-7", method: "playwright" }, id: "page.goto.auth", title: "打开 ORF 登录页", object: "page", operator: "goto", params: { path: "/auth" } },
      { source: { caseStepId: "Setup-8", method: "playwright" }, id: "fill.admin_email", title: "在邮箱输入框输入管理员固定测试邮箱", object: "page", operator: "fill", params: { label: "Email", valueFrom: "data.adminEmail" } },
      { source: { caseStepId: "Setup-9", method: "playwright" }, id: "fill.admin_password", title: "在密码输入框输入管理员固定测试密码", object: "page", operator: "fill", params: { label: "Password", exact: true, valueFrom: "data.adminPassword" } },
      { source: { caseStepId: "Setup-10", method: "playwright" }, id: "click.sign_in", title: "点击 \"Sign In\" 登录操作", object: "page.admin_delete_member_login", operator: "submit_admin" },
      { source: { caseStepId: "Setup-11", method: "playwright" }, id: "page.goto.members", title: "打开成员管理页面", object: "page", operator: "goto", params: { path: "/system/members" } },
    ],
  },

  S0: {
    description: "管理员已登录，成员管理页显示可删除成员且删除操作可见",
    assertions: [
      { source: { caseStepId: "S0-1", method: "api" }, id: "session.admin.authenticated", title: "当前会话 应为 邮箱为 `orf-admin-delete-member-e2e@orf.local`、角色为 `admin`、状态为 `active` 的已登录会话", object: "auth.session", operator: "authenticated", params: { emailFrom: "data.adminEmail", roleFrom: "data.adminRole", status: "active" } },
      { source: { caseStepId: "S0-2", method: "playwright" }, id: "url.members", title: "当前页面 应为 成员管理页面", object: "page.url", operator: "match", params: { pattern: "/system/members$" } },
      { source: { caseStepId: "S0-3", method: "playwright" }, id: "page.delete_member.visible", title: "成员管理列表 应显示 可删除成员", object: "page.member_row", operator: "visible", params: { textFrom: "data.memberEmail" } },
      { source: { caseStepId: "S0-4", method: "playwright" }, id: "page.delete_member.action_visible", title: "可删除成员 的 \"删除\" 操作 应可见", object: "page.member_row", operator: "delete_visible", params: { textFrom: "data.memberEmail" } },
      { source: { caseStepId: "S0-5", method: "prisma" }, id: "db.delete_member.active", title: "可删除成员 的默认团队成员关系 应存在，角色为 `member`", object: "db.user", operator: "matches", params: { userIdFrom: "data.memberUserId", emailFrom: "data.memberEmail", roleFrom: "data.memberRole", status: "active" } },
      { source: { caseStepId: "S0-6", method: "prisma" }, id: "db.delete_member.references_absent", title: "可删除成员 应未被 ORF 业务记录引用", object: "db.delete_member_references", operator: "absent", params: { teamIdFrom: "runtime.adminUser.teamId", memberNameFrom: "data.memberName" } },
    ],
  },

  Action: {
    description: "管理员删除可删除成员",
    steps: [
      { source: { caseStepId: "Action-1", method: "playwright" }, id: "page.delete_member.delete", title: "点击 可删除成员 的 \"删除\" 操作并确认删除", object: "page.member_row", operator: "delete", params: { textFrom: "data.memberEmail", userIdFrom: "data.memberUserId", saveAs: "deleteUserResponse" } },
    ],
  },

  S1: {
    description: "删除接口成功，成员管理页和默认团队成员关系中均不存在可删除成员",
    assertions: [
      { source: { caseStepId: "S1-1", method: "api" }, id: "api.delete_member.response_ok", title: "删除成员结果 应成功", object: "api.response", operator: "ok", params: { responseFrom: "runtime.deleteUserResponse", status: 200 } },
      { source: { caseStepId: "S1-2", method: "playwright" }, id: "page.delete_member.absent", title: "成员管理列表 应不显示 可删除成员", object: "page.member_row", operator: "absent", params: { textFrom: "data.memberEmail" } },
      { source: { caseStepId: "S1-3", method: "prisma" }, id: "db.delete_member.membership_absent", title: "可删除成员 的默认团队成员关系 应不存在", object: "db.user", operator: "absent", params: { userIdFrom: "data.memberUserId", emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "S1-4", method: "api" }, id: "session.admin.still_authenticated", title: "当前会话 应仍为 邮箱为 `orf-admin-delete-member-e2e@orf.local`、角色为 `admin`、状态为 `active` 的已登录会话", object: "auth.session", operator: "authenticated", params: { emailFrom: "data.adminEmail", roleFrom: "data.adminRole", status: "active" } },
    ],
  },

  Clean: {
    description: "删除可删除成员用户记录并删除管理员删除成员测试独占 fixture",
    steps: [
      { source: { caseStepId: "Clean-1", method: "prisma" }, id: "db.delete_member.delete", title: "删除本用例可删除成员用户记录", object: "db.user", operator: "delete", params: { userIdFrom: "data.memberUserId", emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-2", method: "prisma" }, id: "db.delete_member.absent", title: "本用例可删除成员 应不存在", object: "db.user", operator: "absent", params: { userIdFrom: "data.memberUserId", emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-3", method: "api" }, id: "auth.logout", title: "注销当前登录会话", object: "auth", operator: "logout" },
      { source: { caseStepId: "Clean-4", method: "playwright" }, id: "page.runtime.stop", title: "离开当前 ORF 前端页面", object: "page.runtime", operator: "stop" },
      { source: { caseStepId: "Clean-5", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Clean-6", method: "api" }, id: "ory.admin_sessions.revoke", title: "撤销管理员认证身份的残留登录会话", object: "ory.sessions", operator: "revoke_by_email", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-7", method: "api" }, id: "ory.admin_identity.delete", title: "删除邮箱为 `orf-admin-delete-member-e2e@orf.local` 的管理员认证身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-8", method: "prisma" }, id: "db.admin.memberships.delete", title: "删除管理员用户的默认团队成员关系", object: "db.user", operator: "delete_memberships", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-9", method: "prisma" }, id: "db.admin.delete", title: "删除邮箱为 `orf-admin-delete-member-e2e@orf.local` 的管理员用户", object: "db.user", operator: "delete", params: { emailFrom: "data.adminEmail" } },
    ],
  },
} satisfies StateCaseSpec<AdminDeleteMemberCaseData>;
