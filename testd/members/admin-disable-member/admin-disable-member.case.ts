import { STATE_CASE_MODEL, type StateCaseSpec } from "../../_framework/types";
import type { AdminDisableMemberCaseData } from "./_support/admin-disable-member.context";

export const adminDisableMemberCase = {
  id: "members.admin-disable",
  title: "管理员停用成员",
  model: STATE_CASE_MODEL,
  tags: ["members", "admin", "disable", "happy-path"],

  data: {
    adminEmail: "orf-admin-disable-member-e2e@orf.local",
    adminPassword: "OrfAdminDisableMemberE2E!2026",
    adminName: "ORF Admin Disable Member E2E",
    adminRole: "admin",
    memberUserId: "00000000-0000-4000-8000-000000000104",
    memberName: "ORF Member Disable Target E2E",
    memberEmail: "orf-member-disable-target-e2e@orf.local",
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
    description: "准备管理员和可停用成员，登录管理员并打开成员管理页",
    steps: [
      { source: { caseStepId: "Setup-1", method: "prisma" }, id: "db.disable_member.delete_residue", title: "删除本用例残留的可停用成员", object: "db.user", operator: "delete", params: { userIdFrom: "data.memberUserId", emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Setup-2", method: "api" }, id: "ory.admin_identity.upsert", title: "准备管理员认证身份，邮箱为 `orf-admin-disable-member-e2e@orf.local`，密码为固定测试密码", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.adminEmail", nameFrom: "data.adminName", passwordFrom: "data.adminPassword", saveAs: "adminIdentity" } },
      { source: { caseStepId: "Setup-3", method: "prisma" }, id: "db.admin.upsert", title: "准备管理员用户和默认团队成员关系，邮箱为 `orf-admin-disable-member-e2e@orf.local`、角色为 `admin`、状态为 `active`", object: "db.user", operator: "upsert", params: { emailFrom: "data.adminEmail", nameFrom: "data.adminName", roleFrom: "data.adminRole", status: "active", identityIdFrom: "runtime.adminIdentity.id", saveAs: "adminUser" } },
      { source: { caseStepId: "Setup-4", method: "prisma" }, id: "db.disable_member.upsert", title: "准备可停用成员，邮箱为 `orf-member-disable-target-e2e@orf.local`、角色为 `member`、状态为 `active`", object: "db.user", operator: "upsert", params: { userIdFrom: "data.memberUserId", emailFrom: "data.memberEmail", nameFrom: "data.memberName", roleFrom: "data.memberRole", status: "active", saveAs: "disableMember" } },
      { source: { caseStepId: "Setup-5", method: "api" }, id: "ory.admin_sessions.revoke", title: "撤销管理员认证身份的残留登录会话", object: "ory.sessions", operator: "revoke_by_email", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Setup-6", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Setup-7", method: "playwright" }, id: "page.goto.auth", title: "打开 ORF 登录页", object: "page", operator: "goto", params: { path: "/auth" } },
      { source: { caseStepId: "Setup-8", method: "playwright" }, id: "fill.admin_email", title: "在邮箱输入框输入管理员固定测试邮箱", object: "page", operator: "fill", params: { label: "Email", valueFrom: "data.adminEmail" } },
      { source: { caseStepId: "Setup-9", method: "playwright" }, id: "fill.admin_password", title: "在密码输入框输入管理员固定测试密码", object: "page", operator: "fill", params: { label: "Password", exact: true, valueFrom: "data.adminPassword" } },
      { source: { caseStepId: "Setup-10", method: "playwright" }, id: "click.sign_in", title: "点击 \"Sign In\" 登录操作", object: "page.admin_disable_member_login", operator: "submit_admin" },
      { source: { caseStepId: "Setup-11", method: "playwright" }, id: "page.goto.members", title: "打开成员管理页面", object: "page", operator: "goto", params: { path: "/system/members" } },
    ],
  },

  S0: {
    description: "管理员已登录，成员管理页显示可停用成员且停用操作可见",
    assertions: [
      { source: { caseStepId: "S0-1", method: "api" }, id: "session.admin.authenticated", title: "当前会话 应为 邮箱为 `orf-admin-disable-member-e2e@orf.local`、角色为 `admin`、状态为 `active` 的已登录会话", object: "auth.session", operator: "authenticated", params: { emailFrom: "data.adminEmail", roleFrom: "data.adminRole", status: "active" } },
      { source: { caseStepId: "S0-2", method: "playwright" }, id: "url.members", title: "当前页面 应为 成员管理页面", object: "page.url", operator: "match", params: { pattern: "/system/members$" } },
      { source: { caseStepId: "S0-3", method: "playwright" }, id: "page.disable_member.visible", title: "成员管理列表 应显示 可停用成员", object: "page.member_row", operator: "visible", params: { textFrom: "data.memberEmail" } },
      { source: { caseStepId: "S0-4", method: "playwright" }, id: "page.disable_member.status_active", title: "可停用成员 的状态 应显示为 `启用`", object: "page.member_row", operator: "status_visible", params: { textFrom: "data.memberEmail", statusText: "启用" } },
      { source: { caseStepId: "S0-5", method: "playwright" }, id: "page.disable_member.action_visible", title: "可停用成员 的 \"停用\" 操作 应可见", object: "page.member_row", operator: "disable_visible", params: { textFrom: "data.memberEmail" } },
      { source: { caseStepId: "S0-6", method: "prisma" }, id: "db.disable_member.active", title: "可停用成员 的状态 应为 `active`", object: "db.user", operator: "matches", params: { userIdFrom: "data.memberUserId", emailFrom: "data.memberEmail", roleFrom: "data.memberRole", status: "active" } },
    ],
  },

  Action: {
    description: "管理员停用可停用成员",
    steps: [
      { source: { caseStepId: "Action-1", method: "playwright" }, id: "page.disable_member.disable", title: "点击 可停用成员 的 \"停用\" 操作并确认停用", object: "page.member_row", operator: "disable", params: { textFrom: "data.memberEmail", userIdFrom: "data.memberUserId", saveAs: "disableUserResponse" } },
    ],
  },

  S1: {
    description: "停用接口成功，数据库和成员管理页显示成员已停用",
    assertions: [
      { source: { caseStepId: "S1-1", method: "api" }, id: "api.disable_member.response_ok", title: "停用成员结果 应成功", object: "api.response", operator: "ok", params: { responseFrom: "runtime.disableUserResponse", status: 200 } },
      { source: { caseStepId: "S1-2", method: "prisma" }, id: "db.disable_member.disabled", title: "可停用成员 的状态 应为 `disabled`", object: "db.user", operator: "matches", params: { userIdFrom: "data.memberUserId", emailFrom: "data.memberEmail", roleFrom: "data.memberRole", status: "disabled" } },
      { source: { caseStepId: "S1-3", method: "playwright" }, id: "page.disable_member.visible", title: "成员管理列表 应仍显示 可停用成员", object: "page.member_row", operator: "visible", params: { textFrom: "data.memberEmail" } },
      { source: { caseStepId: "S1-4", method: "playwright" }, id: "page.disable_member.status_disabled", title: "可停用成员 的状态 应显示为 `已停用`", object: "page.member_row", operator: "status_visible", params: { textFrom: "data.memberEmail", statusText: "已停用" } },
      { source: { caseStepId: "S1-5", method: "api" }, id: "session.admin.still_authenticated", title: "当前会话 应仍为 邮箱为 `orf-admin-disable-member-e2e@orf.local`、角色为 `admin`、状态为 `active` 的已登录会话", object: "auth.session", operator: "authenticated", params: { emailFrom: "data.adminEmail", roleFrom: "data.adminRole", status: "active" } },
    ],
  },

  Clean: {
    description: "删除可停用成员并删除管理员停用成员测试独占 fixture",
    steps: [
      { source: { caseStepId: "Clean-1", method: "prisma" }, id: "db.disable_member.delete", title: "删除本用例可停用成员", object: "db.user", operator: "delete", params: { userIdFrom: "data.memberUserId", emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-2", method: "prisma" }, id: "db.disable_member.absent", title: "本用例可停用成员 应不存在", object: "db.user", operator: "absent", params: { userIdFrom: "data.memberUserId", emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-3", method: "api" }, id: "auth.logout", title: "注销当前登录会话", object: "auth", operator: "logout" },
      { source: { caseStepId: "Clean-4", method: "playwright" }, id: "page.runtime.stop", title: "离开当前 ORF 前端页面", object: "page.runtime", operator: "stop" },
      { source: { caseStepId: "Clean-5", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Clean-6", method: "api" }, id: "ory.admin_sessions.revoke", title: "撤销管理员认证身份的残留登录会话", object: "ory.sessions", operator: "revoke_by_email", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-7", method: "api" }, id: "ory.admin_identity.delete", title: "删除邮箱为 `orf-admin-disable-member-e2e@orf.local` 的管理员认证身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-8", method: "prisma" }, id: "db.admin.memberships.delete", title: "删除管理员用户的默认团队成员关系", object: "db.user", operator: "delete_memberships", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-9", method: "prisma" }, id: "db.admin.delete", title: "删除邮箱为 `orf-admin-disable-member-e2e@orf.local` 的管理员用户", object: "db.user", operator: "delete", params: { emailFrom: "data.adminEmail" } },
    ],
  },
} satisfies StateCaseSpec<AdminDisableMemberCaseData>;
