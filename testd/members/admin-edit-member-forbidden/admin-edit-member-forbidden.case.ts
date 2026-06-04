import { STATE_CASE_MODEL, type StateCaseSpec } from "../../_framework/types";
import type { MemberManagementForbiddenCaseData } from "../_support/member-management-forbidden.context";

export const adminEditMemberForbiddenCase = {
  id: "members.admin-edit.member-forbidden",
  title: "管理员编辑成员-普通成员不可编辑成员",
  model: STATE_CASE_MODEL,
  tags: ["members", "edit", "member", "permission", "negative-path"],

  data: {
    memberEmail: "orf-member-edit-forbidden-e2e@orf.local",
    memberPassword: "OrfMemberEditForbiddenE2E!2026",
    memberName: "ORF Member Edit Forbidden E2E",
    memberRole: "member",
    targetUserId: "user-member-edit-forbidden-target-e2e",
    targetName: "ORF Member Edit Forbidden Target E2E",
    targetEmail: "orf-member-edit-forbidden-target-e2e@orf.local",
    targetRole: "member",
    targetStatus: "active",
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
    description: "准备普通成员、被管理成员，并以普通成员身份完成登录",
    steps: [
      { source: { caseStepId: "Setup-1", method: "prisma" }, id: "db.target.delete_residue", title: "删除本用例残留的被管理成员", object: "db.user", operator: "delete", params: { userIdFrom: "data.targetUserId", emailFrom: "data.targetEmail" } },
      { source: { caseStepId: "Setup-2", method: "api" }, id: "ory.member_identity.upsert", title: "准备普通成员认证身份，邮箱为 `orf-member-edit-forbidden-e2e@orf.local`，密码为固定测试密码", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.memberEmail", nameFrom: "data.memberName", passwordFrom: "data.memberPassword", saveAs: "memberIdentity" } },
      { source: { caseStepId: "Setup-3", method: "prisma" }, id: "db.member.upsert", title: "准备普通成员用户和默认团队成员关系，邮箱为 `orf-member-edit-forbidden-e2e@orf.local`、角色为 `member`、状态为 `active`", object: "db.user", operator: "upsert", params: { emailFrom: "data.memberEmail", nameFrom: "data.memberName", roleFrom: "data.memberRole", status: "active", identityIdFrom: "runtime.memberIdentity.id", saveAs: "memberUser" } },
      { source: { caseStepId: "Setup-4", method: "prisma" }, id: "db.target.upsert", title: "准备被管理成员，邮箱为 `orf-member-edit-forbidden-target-e2e@orf.local`、角色为 `member`、状态为 `active`", object: "db.user", operator: "upsert", params: { userIdFrom: "data.targetUserId", emailFrom: "data.targetEmail", nameFrom: "data.targetName", roleFrom: "data.targetRole", statusFrom: "data.targetStatus", saveAs: "targetUser" } },
      { source: { caseStepId: "Setup-5", method: "api" }, id: "ory.member_sessions.revoke", title: "撤销普通成员认证身份的残留登录会话", object: "ory.sessions", operator: "revoke_by_email", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Setup-6", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Setup-7", method: "playwright" }, id: "page.goto.auth", title: "打开 ORF 登录页", object: "page", operator: "goto", params: { path: "/auth" } },
      { source: { caseStepId: "Setup-8", method: "playwright" }, id: "fill.member_email", title: "在邮箱输入框输入普通成员固定测试邮箱", object: "page", operator: "fill", params: { label: "Email", valueFrom: "data.memberEmail" } },
      { source: { caseStepId: "Setup-9", method: "playwright" }, id: "fill.member_password", title: "在密码输入框输入普通成员固定测试密码", object: "page", operator: "fill", params: { label: "Password", exact: true, valueFrom: "data.memberPassword" } },
      { source: { caseStepId: "Setup-10", method: "playwright" }, id: "click.sign_in", title: "点击 \"Sign In\" 登录操作", object: "page.member_management_forbidden_login", operator: "submit_member" },
    ],
  },

  S0: {
    description: "普通成员已登录，被管理成员资料为原始值",
    assertions: [
      { source: { caseStepId: "S0-1", method: "api" }, id: "session.member.authenticated", title: "当前会话 应为 邮箱为 `orf-member-edit-forbidden-e2e@orf.local`、角色为 `member`、状态为 `active` 的已登录会话", object: "auth.session", operator: "authenticated", params: { emailFrom: "data.memberEmail", roleFrom: "data.memberRole", status: "active" } },
      { source: { caseStepId: "S0-2", method: "playwright" }, id: "nav.system.absent", title: "\"系统管理\" 导航入口 应不可见", object: "page", operator: "count", params: { role: "link", name: "系统管理", count: 0 } },
      { source: { caseStepId: "S0-3", method: "prisma" }, id: "db.target.name", title: "被管理成员 的姓名 应为 \"ORF Member Edit Forbidden Target E2E\"", object: "db.user", operator: "matches", params: { userIdFrom: "data.targetUserId", nameFrom: "data.targetName" } },
      { source: { caseStepId: "S0-4", method: "prisma" }, id: "db.target.email", title: "被管理成员 的邮箱 应为 \"orf-member-edit-forbidden-target-e2e@orf.local\"", object: "db.user", operator: "matches", params: { userIdFrom: "data.targetUserId", emailFrom: "data.targetEmail" } },
      { source: { caseStepId: "S0-5", method: "prisma" }, id: "db.target.role", title: "被管理成员 的角色 应为 member", object: "db.user", operator: "matches", params: { userIdFrom: "data.targetUserId", roleFrom: "data.targetRole" } },
      { source: { caseStepId: "S0-6", method: "prisma" }, id: "db.target.status", title: "被管理成员 的状态 应为 `active`", object: "db.user", operator: "matches", params: { userIdFrom: "data.targetUserId", statusFrom: "data.targetStatus" } },
    ],
  },

  Action: {
    description: "普通成员打开悬赏大厅页面",
    steps: [
      { source: { caseStepId: "Action-1", method: "playwright" }, id: "page.goto.bounties", title: "普通成员打开悬赏大厅页面", object: "page", operator: "goto", params: { path: "/bounties" } },
    ],
  },

  S1: {
    description: "普通成员位于悬赏大厅，系统管理入口和成员编辑入口不存在，被管理成员资料保持不变",
    assertions: [
      { source: { caseStepId: "S1-1", method: "playwright" }, id: "url.bounties", title: "当前页面 应为 悬赏大厅", object: "page.url", operator: "match", params: { pattern: "/bounties$" } },
      { source: { caseStepId: "S1-2", method: "playwright" }, id: "nav.system.still_absent", title: "\"系统管理\" 导航入口 应不可见", object: "page", operator: "count", params: { role: "link", name: "系统管理", count: 0 } },
      { source: { caseStepId: "S1-3", method: "playwright" }, id: "page.members.absent", title: "成员管理表格 应不可见", object: "page.member_management", operator: "absent" },
      { source: { caseStepId: "S1-4", method: "playwright" }, id: "page.edit_action.absent", title: "成员编辑入口 应不可见", object: "page.member_management", operator: "edit_action_absent" },
      { source: { caseStepId: "S1-5", method: "prisma" }, id: "db.target.name_unchanged", title: "被管理成员 的姓名 应仍为 \"ORF Member Edit Forbidden Target E2E\"", object: "db.user", operator: "matches", params: { userIdFrom: "data.targetUserId", nameFrom: "data.targetName" } },
      { source: { caseStepId: "S1-6", method: "prisma" }, id: "db.target.email_unchanged", title: "被管理成员 的邮箱 应仍为 \"orf-member-edit-forbidden-target-e2e@orf.local\"", object: "db.user", operator: "matches", params: { userIdFrom: "data.targetUserId", emailFrom: "data.targetEmail" } },
      { source: { caseStepId: "S1-7", method: "prisma" }, id: "db.target.role_unchanged", title: "被管理成员 的角色 应仍为 member", object: "db.user", operator: "matches", params: { userIdFrom: "data.targetUserId", roleFrom: "data.targetRole" } },
      { source: { caseStepId: "S1-8", method: "prisma" }, id: "db.target.status_unchanged", title: "被管理成员 的状态 应仍为 `active`", object: "db.user", operator: "matches", params: { userIdFrom: "data.targetUserId", statusFrom: "data.targetStatus" } },
      { source: { caseStepId: "S1-9", method: "api" }, id: "session.member.still_authenticated", title: "当前会话 应仍为 邮箱为 `orf-member-edit-forbidden-e2e@orf.local`、角色为 `member`、状态为 `active` 的已登录会话", object: "auth.session", operator: "authenticated", params: { emailFrom: "data.memberEmail", roleFrom: "data.memberRole", status: "active" } },
    ],
  },

  Clean: {
    description: "删除被管理成员、普通成员账号和页面运行态",
    steps: [
      { source: { caseStepId: "Clean-1", method: "prisma" }, id: "db.target.delete", title: "删除本用例被管理成员", object: "db.user", operator: "delete", params: { userIdFrom: "data.targetUserId", emailFrom: "data.targetEmail" } },
      { source: { caseStepId: "Clean-2", method: "api" }, id: "auth.logout", title: "注销当前登录会话", object: "auth", operator: "logout" },
      { source: { caseStepId: "Clean-3", method: "playwright" }, id: "page.runtime.stop", title: "离开当前 ORF 前端页面", object: "page.runtime", operator: "stop" },
      { source: { caseStepId: "Clean-4", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Clean-5", method: "api" }, id: "ory.member_sessions.revoke", title: "撤销普通成员认证身份的残留登录会话", object: "ory.sessions", operator: "revoke_by_email", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-6", method: "api" }, id: "ory.member_identity.delete", title: "删除邮箱为 `orf-member-edit-forbidden-e2e@orf.local` 的普通成员认证身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-7", method: "prisma" }, id: "db.member.memberships.delete", title: "删除普通成员用户的默认团队成员关系", object: "db.user", operator: "delete_memberships", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-8", method: "prisma" }, id: "db.member.delete", title: "删除邮箱为 `orf-member-edit-forbidden-e2e@orf.local` 的普通成员用户", object: "db.user", operator: "delete", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-9", method: "prisma" }, id: "db.target.absent", title: "本用例被管理成员 应不存在", object: "db.user", operator: "absent", params: { userIdFrom: "data.targetUserId", emailFrom: "data.targetEmail" } },
      { source: { caseStepId: "Clean-10", method: "api" }, id: "ory.member_identity.absent", title: "邮箱为 `orf-member-edit-forbidden-e2e@orf.local` 的普通成员认证身份 应不存在", object: "ory.identity", operator: "absent", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-11", method: "prisma" }, id: "db.member.absent", title: "邮箱为 `orf-member-edit-forbidden-e2e@orf.local` 的普通成员用户 应不存在", object: "db.user", operator: "absent", params: { emailFrom: "data.memberEmail" } },
    ],
  },
} satisfies StateCaseSpec<MemberManagementForbiddenCaseData>;
