import { STATE_CASE_MODEL, type StateCaseSpec } from "../../_framework/types";
import type { AdminDeleteMemberReferencedForbiddenCaseData } from "./_support/admin-delete-member-referenced-forbidden.context";

export const adminDeleteMemberReferencedForbiddenCase = {
  id: "members.admin-delete.referenced-forbidden",
  title: "管理员删除成员-被 ORF 业务记录引用成员不可删除",
  model: STATE_CASE_MODEL,
  tags: ["members", "delete", "referenced-record", "negative-path"],

  data: {
    adminEmail: "orf-admin-delete-referenced-member-e2e@orf.local",
    adminPassword: "OrfAdminDeleteReferencedMemberE2E!2026",
    adminName: "ORF Admin Delete Referenced Member E2E",
    adminRole: "admin",
    targetUserId: "00000000-0000-4000-8000-000000000105",
    targetName: "ORF Member Delete Referenced Target E2E",
    targetEmail: "orf-member-delete-referenced-target-e2e@orf.local",
    targetRole: "member",
    targetStatus: "active",
    objectiveId: "obj-testd-delete-referenced-member-forbidden",
    objectiveTitle: "E2E-DELETE-REFERENCED-MEMBER-FORBIDDEN: 引用成员的目标",
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
    description: "准备管理员、被引用成员、引用目标，并以管理员身份进入成员管理页面",
    steps: [
      { source: { caseStepId: "Setup-1", method: "prisma" }, id: "db.objective.delete_residue", title: "删除本用例残留的引用目标及其派生数据", object: "db.objective", operator: "delete", params: { idFrom: "data.objectiveId", titleFrom: "data.objectiveTitle" } },
      { source: { caseStepId: "Setup-2", method: "prisma" }, id: "db.target.delete_residue", title: "删除本用例残留的被引用成员", object: "db.user", operator: "delete", params: { userIdFrom: "data.targetUserId", emailFrom: "data.targetEmail" } },
      { source: { caseStepId: "Setup-3", method: "api" }, id: "ory.admin_identity.upsert", title: "准备管理员认证身份，邮箱为 `orf-admin-delete-referenced-member-e2e@orf.local`，密码为固定测试密码", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.adminEmail", nameFrom: "data.adminName", passwordFrom: "data.adminPassword", saveAs: "adminIdentity" } },
      { source: { caseStepId: "Setup-4", method: "prisma" }, id: "db.admin.upsert", title: "准备管理员用户和默认团队成员关系，邮箱为 `orf-admin-delete-referenced-member-e2e@orf.local`、角色为 `admin`、状态为 `active`", object: "db.user", operator: "upsert", params: { emailFrom: "data.adminEmail", nameFrom: "data.adminName", roleFrom: "data.adminRole", status: "active", identityIdFrom: "runtime.adminIdentity.id", saveAs: "adminUser" } },
      { source: { caseStepId: "Setup-5", method: "prisma" }, id: "db.target.upsert", title: "准备被引用成员，邮箱为 `orf-member-delete-referenced-target-e2e@orf.local`、角色为 `member`、状态为 `active`", object: "db.user", operator: "upsert", params: { userIdFrom: "data.targetUserId", emailFrom: "data.targetEmail", nameFrom: "data.targetName", roleFrom: "data.targetRole", statusFrom: "data.targetStatus", saveAs: "targetUser" } },
      { source: { caseStepId: "Setup-6", method: "prisma" }, id: "db.objective.upsert", title: "创建标题为 `E2E-DELETE-REFERENCED-MEMBER-FORBIDDEN: 引用成员的目标`、流转状态为 `open`、阶段为 `resultClaiming` 且挑战成员包含被引用成员的目标", object: "db.objective", operator: "upsert", params: { idFrom: "data.objectiveId", teamIdFrom: "runtime.adminUser.teamId", titleFrom: "data.objectiveTitle", stage: "resultClaiming", flowStatus: "open", status: "On Track", challengers: ["ORF Member Delete Referenced Target E2E"], createdByFrom: "runtime.adminUser.userId", updatedByFrom: "runtime.adminUser.userId", saveAs: "referencedObjective" } },
      { source: { caseStepId: "Setup-7", method: "api" }, id: "ory.admin_sessions.revoke", title: "撤销管理员认证身份的残留登录会话", object: "ory.sessions", operator: "revoke_by_email", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Setup-8", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Setup-9", method: "playwright" }, id: "page.goto.auth", title: "打开 ORF 登录页", object: "page", operator: "goto", params: { path: "/auth" } },
      { source: { caseStepId: "Setup-10", method: "playwright" }, id: "fill.admin_email", title: "在邮箱输入框输入管理员固定测试邮箱", object: "page", operator: "fill", params: { label: "Email", valueFrom: "data.adminEmail" } },
      { source: { caseStepId: "Setup-11", method: "playwright" }, id: "fill.admin_password", title: "在密码输入框输入管理员固定测试密码", object: "page", operator: "fill", params: { label: "Password", exact: true, valueFrom: "data.adminPassword" } },
      { source: { caseStepId: "Setup-12", method: "playwright" }, id: "click.sign_in", title: "点击 \"Sign In\" 登录操作", object: "page.admin_delete_referenced_member_login", operator: "submit_admin" },
      { source: { caseStepId: "Setup-13", method: "playwright" }, id: "page.goto.members", title: "打开成员管理页面", object: "page", operator: "goto", params: { path: "/system/members" } },
    ],
  },

  S0: {
    description: "管理员位于成员管理页面，被引用成员存在，引用目标挑战成员列表包含该成员",
    assertions: [
      { source: { caseStepId: "S0-1", method: "api" }, id: "session.admin.authenticated", title: "当前会话 应为 邮箱为 `orf-admin-delete-referenced-member-e2e@orf.local`、角色为 `admin`、状态为 `active` 的已登录会话", object: "auth.session", operator: "authenticated", params: { emailFrom: "data.adminEmail", roleFrom: "data.adminRole", status: "active" } },
      { source: { caseStepId: "S0-2", method: "playwright" }, id: "url.members", title: "当前页面 应为 成员管理页面", object: "page.url", operator: "match", params: { pattern: "/system/members$" } },
      { source: { caseStepId: "S0-3", method: "playwright" }, id: "page.target.visible", title: "成员管理列表 应显示 被引用成员", object: "page.member_row", operator: "visible", params: { textFrom: "data.targetEmail" } },
      { source: { caseStepId: "S0-4", method: "playwright" }, id: "page.target.delete_visible", title: "被引用成员 的 \"删除\" 操作 应可见", object: "page.member_row", operator: "delete_visible", params: { textFrom: "data.targetEmail" } },
      { source: { caseStepId: "S0-5", method: "prisma" }, id: "db.target.membership", title: "被引用成员 的默认团队成员关系 应存在，角色为 `member`", object: "db.default_team_membership", operator: "matches", params: { userIdFrom: "data.targetUserId", roleFrom: "data.targetRole" } },
      { source: { caseStepId: "S0-6", method: "prisma" }, id: "db.objective.references_member", title: "本用例引用目标 的挑战成员列表 应包含 被引用成员", object: "db.referenced_member_objective", operator: "references_member", params: { objectiveIdFrom: "data.objectiveId", memberNameFrom: "data.targetName" } },
    ],
  },

  Action: {
    description: "管理员删除被引用成员",
    steps: [
      { source: { caseStepId: "Action-1", method: "playwright" }, id: "page.target.delete", title: "点击 被引用成员 的 \"删除\" 操作并确认删除", object: "page.member_row", operator: "delete", params: { textFrom: "data.targetEmail", userIdFrom: "data.targetUserId", saveAs: "deleteUserResponse" } },
    ],
  },

  S1: {
    description: "删除提交被后端拒绝，被引用成员和引用目标保持不变",
    assertions: [
      { source: { caseStepId: "S1-1", method: "api" }, id: "api.delete_member.rejected", title: "删除成员结果 应被拒绝，HTTP 状态码应为 409", object: "api.response", operator: "rejected", params: { responseFrom: "runtime.deleteUserResponse", status: 409 } },
      { source: { caseStepId: "S1-2", method: "playwright" }, id: "page.target.still_visible", title: "成员管理列表 应仍显示 被引用成员", object: "page.member_row", operator: "visible", params: { textFrom: "data.targetEmail" } },
      { source: { caseStepId: "S1-3", method: "prisma" }, id: "db.target.membership_still_present", title: "被引用成员 的默认团队成员关系 应仍存在，角色为 `member`", object: "db.default_team_membership", operator: "matches", params: { userIdFrom: "data.targetUserId", roleFrom: "data.targetRole" } },
      { source: { caseStepId: "S1-4", method: "prisma" }, id: "db.target.status_unchanged", title: "被引用成员 的状态 应仍为 `active`", object: "db.user", operator: "matches", params: { userIdFrom: "data.targetUserId", statusFrom: "data.targetStatus" } },
      { source: { caseStepId: "S1-5", method: "prisma" }, id: "db.objective.still_references_member", title: "本用例引用目标 的挑战成员列表 应仍包含 被引用成员", object: "db.referenced_member_objective", operator: "references_member", params: { objectiveIdFrom: "data.objectiveId", memberNameFrom: "data.targetName" } },
      { source: { caseStepId: "S1-6", method: "api" }, id: "session.admin.still_authenticated", title: "当前会话 应仍为 邮箱为 `orf-admin-delete-referenced-member-e2e@orf.local`、角色为 `admin`、状态为 `active` 的已登录会话", object: "auth.session", operator: "authenticated", params: { emailFrom: "data.adminEmail", roleFrom: "data.adminRole", status: "active" } },
    ],
  },

  Clean: {
    description: "删除引用目标、被引用成员、管理员账号和页面运行态",
    steps: [
      { source: { caseStepId: "Clean-1", method: "prisma" }, id: "db.objective.delete", title: "删除本用例引用目标及其派生数据", object: "db.objective", operator: "delete", params: { idFrom: "data.objectiveId", titleFrom: "data.objectiveTitle" } },
      { source: { caseStepId: "Clean-2", method: "prisma" }, id: "db.target.delete", title: "删除本用例被引用成员", object: "db.user", operator: "delete", params: { userIdFrom: "data.targetUserId", emailFrom: "data.targetEmail" } },
      { source: { caseStepId: "Clean-3", method: "api" }, id: "auth.logout", title: "注销当前登录会话", object: "auth", operator: "logout" },
      { source: { caseStepId: "Clean-4", method: "playwright" }, id: "page.runtime.stop", title: "离开当前 ORF 前端页面", object: "page.runtime", operator: "stop" },
      { source: { caseStepId: "Clean-5", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Clean-6", method: "api" }, id: "ory.admin_sessions.revoke", title: "撤销管理员认证身份的残留登录会话", object: "ory.sessions", operator: "revoke_by_email", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-7", method: "api" }, id: "ory.admin_identity.delete", title: "删除邮箱为 `orf-admin-delete-referenced-member-e2e@orf.local` 的管理员认证身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-8", method: "prisma" }, id: "db.admin.memberships.delete", title: "删除管理员用户的默认团队成员关系", object: "db.user", operator: "delete_memberships", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-9", method: "prisma" }, id: "db.admin.delete", title: "删除邮箱为 `orf-admin-delete-referenced-member-e2e@orf.local` 的管理员用户", object: "db.user", operator: "delete", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-10", method: "prisma" }, id: "db.objective.absent", title: "本用例引用目标 应不存在", object: "db.objective", operator: "absent", params: { idFrom: "data.objectiveId", titleFrom: "data.objectiveTitle" } },
      { source: { caseStepId: "Clean-11", method: "prisma" }, id: "db.target.absent", title: "本用例被引用成员 应不存在", object: "db.user", operator: "absent", params: { userIdFrom: "data.targetUserId", emailFrom: "data.targetEmail" } },
      { source: { caseStepId: "Clean-12", method: "api" }, id: "ory.admin_identity.absent", title: "邮箱为 `orf-admin-delete-referenced-member-e2e@orf.local` 的管理员认证身份 应不存在", object: "ory.identity", operator: "absent", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-13", method: "prisma" }, id: "db.admin.absent", title: "邮箱为 `orf-admin-delete-referenced-member-e2e@orf.local` 的管理员用户 应不存在", object: "db.user", operator: "absent", params: { emailFrom: "data.adminEmail" } },
    ],
  },
} satisfies StateCaseSpec<AdminDeleteMemberReferencedForbiddenCaseData>;
