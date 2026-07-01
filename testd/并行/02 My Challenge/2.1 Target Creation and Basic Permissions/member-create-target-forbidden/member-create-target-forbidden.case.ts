import { STATE_CASE_MODEL, type StateCaseSpec } from "../../../../_framework/types";
import type { MemberCreateTargetForbiddenCaseData } from "./_support/member-create-target-forbidden.context";

export const memberCreateTargetForbiddenCase = {
  id: "target.member-create-target-forbidden",
  title: "普通用户不允许新建目标",
  model: STATE_CASE_MODEL,
  tags: ["target", "create", "member", "permission", "forbidden"],

  data: {
    memberEmail: "orf-member-create-target-forbidden-e2e@orf.local",
    memberPassword: "OrfMemberCreateTargetForbiddenE2E!2026",
    memberName: "ORF Member Create Target Forbidden E2E",
    memberRole: "member",
    memberStatus: "active",
    objectiveTitle: "E2E-TARGET-MEMBER-CREATE-FORBIDDEN",
    createObjectivePermissionKey: "objective.create",
  },

  B: {
    description: "系统服务可用，浏览器处于未登录基准状态",
    assertions: [
      { source: { caseStepId: "B-1", method: "api" }, id: "frontend.ready", title: "前端服务 应可用", object: "frontend.service", operator: "available" },
      { source: { caseStepId: "B-2", method: "api" }, id: "backend.ready", title: "后端服务 应可用", object: "api.health", operator: "ok" },
      { source: { caseStepId: "B-3", method: "prisma" }, id: "db.ready", title: "ORF 数据库 应可连接", object: "db", operator: "ready" },
      { source: { caseStepId: "B-4", method: "api" }, id: "session.unauthenticated", title: "当前会话 应为 未登录", object: "auth.session", operator: "unauthenticated" },
      { source: { caseStepId: "B-5", method: "playwright" }, id: "storage.empty", title: "当前浏览器 应不保留本地登录态", object: "browser.auth_storage", operator: "empty" },
    ],
  },

  Setup: {
    description: "准备无新建目标权限的普通用户并登录 ORF",
    steps: [
      { source: { caseStepId: "Setup-1", method: "prisma" }, id: "db.objective.delete_residue", title: "删除 本用例残留的目标 `E2E-TARGET-MEMBER-CREATE-FORBIDDEN` 及其派生数据", object: "db.objective", operator: "delete_by_title", params: { titleFrom: "data.objectiveTitle" } },
      { source: { caseStepId: "Setup-2", method: "api" }, id: "permissions.member.record", title: "记录 成员角色的当前权限配置", object: "api.permissions", operator: "record_member", params: { saveAs: "memberPermissionSnapshot" } },
      { source: { caseStepId: "Setup-3", method: "api" }, id: "permissions.member.remove_create", title: "设置 成员角色权限不包含 `objective.create`", object: "api.permissions", operator: "update_member", params: { withoutPermissionFrom: "data.createObjectivePermissionKey" } },
      { source: { caseStepId: "Setup-4", method: "api" }, id: "ory.member_identity.upsert", title: "准备邮箱为 `orf-member-create-target-forbidden-e2e@orf.local`、使用固定测试密码的普通用户登录身份", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.memberEmail", nameFrom: "data.memberName", passwordFrom: "data.memberPassword", saveAs: "memberIdentity" } },
      { source: { caseStepId: "Setup-5", method: "prisma" }, id: "db.member_user.upsert", title: "准备 角色为 `member`、状态为 `active` 的本用例普通用户", object: "db.user", operator: "upsert", params: { emailFrom: "data.memberEmail", nameFrom: "data.memberName", roleFrom: "data.memberRole", statusFrom: "data.memberStatus", identityIdFrom: "runtime.memberIdentity.id", saveAs: "memberUser" } },
      { source: { caseStepId: "Setup-6", method: "playwright" }, id: "auth.login.member", title: "使用 本用例普通用户账号 登录 ORF", object: "page.auth", operator: "login", params: { emailFrom: "data.memberEmail", passwordFrom: "data.memberPassword" } },
    ],
  },

  S0: {
    description: "普通用户已登录且没有新建目标权限",
    assertions: [
      { source: { caseStepId: "S0-1", method: "api" }, id: "session.authenticated", title: "当前会话 应为 已登录", object: "auth.session", operator: "authenticated" },
      { source: { caseStepId: "S0-2", method: "api" }, id: "session.email", title: "当前会话用户邮箱 应为 `orf-member-create-target-forbidden-e2e@orf.local`", object: "auth.session.user_email", operator: "equals", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "S0-3", method: "api" }, id: "session.role", title: "当前会话用户角色 应为 `member`", object: "auth.session.user_role", operator: "equals", params: { roleFrom: "data.memberRole" } },
      { source: { caseStepId: "S0-4", method: "api" }, id: "permission.create.denied", title: "当前普通用户的新建目标权限 应为 未授权", object: "api.permissions", operator: "member_denied", params: { permissionKeyFrom: "data.createObjectivePermissionKey" } },
      { source: { caseStepId: "S0-5", method: "prisma" }, id: "db.objective.absent", title: "应不存在 标题为 `E2E-TARGET-MEMBER-CREATE-FORBIDDEN` 的目标", object: "db.objective", operator: "absent", params: { titleFrom: "data.objectiveTitle" } },
    ],
  },

  Action: {
    description: "普通用户进入我的挑战",
    steps: [
      { source: { caseStepId: "Action-1", method: "playwright" }, id: "member.open_my_challenges", title: "普通用户打开 我的挑战", object: "page.challenge", operator: "open_my_challenges" },
    ],
  },

  S1: {
    description: "我的挑战不提供新建目标入口且未创建目标",
    assertions: [
      { source: { caseStepId: "S1-1", method: "playwright" }, id: "challenge.page.url", title: "页面 应进入 我的挑战", object: "page.challenge", operator: "url" },
      { source: { caseStepId: "S1-2", method: "playwright" }, id: "scope.mine.selected", title: "\"我的挑战\" 视图 应处于选中状态", object: "page.challenge_scope", operator: "selected", params: { label: "我的挑战" } },
      { source: { caseStepId: "S1-3", method: "playwright" }, id: "topbar.create_objective.hidden", title: "页面顶部的 \"新建目标\" 操作 应不可见", object: "page.create_objective_action", operator: "hidden" },
      { source: { caseStepId: "S1-4", method: "playwright" }, id: "project.create_objective.hidden", title: "我的挑战项目区的新增目标操作 应不可见", object: "page.project_create_objective_action", operator: "hidden" },
      { source: { caseStepId: "S1-5", method: "playwright" }, id: "draft_title.hidden", title: "新建目标标题输入框 应不可见", object: "page.objective_draft_title", operator: "hidden" },
      { source: { caseStepId: "S1-6", method: "api" }, id: "permission.create.still_denied", title: "当前普通用户的新建目标权限 应仍为 未授权", object: "api.permissions", operator: "member_denied", params: { permissionKeyFrom: "data.createObjectivePermissionKey" } },
      { source: { caseStepId: "S1-7", method: "prisma" }, id: "db.objective.still_absent", title: "应仍不存在 标题为 `E2E-TARGET-MEMBER-CREATE-FORBIDDEN` 的目标", object: "db.objective", operator: "absent", params: { titleFrom: "data.objectiveTitle" } },
    ],
  },

  Clean: {
    description: "删除本用例目标、普通用户身份，恢复成员权限并清空登录态",
    steps: [
      { source: { caseStepId: "Clean-1", method: "prisma" }, id: "db.objective.delete_created", title: "删除 本用例创建的目标 `E2E-TARGET-MEMBER-CREATE-FORBIDDEN` 及其派生数据", object: "db.objective", operator: "delete", params: { titleFrom: "data.objectiveTitle" } },
      { source: { caseStepId: "Clean-2", method: "api" }, id: "auth.logout", title: "注销当前普通用户登录会话", object: "auth", operator: "logout" },
      { source: { caseStepId: "Clean-3", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Clean-4", method: "api" }, id: "ory.member_identity.delete", title: "删除 本用例普通用户登录身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-5", method: "prisma" }, id: "db.member_user.delete", title: "删除 本用例普通用户", object: "db.user", operator: "delete", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-6", method: "api" }, id: "permissions.member.restore", title: "恢复 成员角色为 Setup 前记录的权限配置", object: "api.permissions", operator: "restore_member", params: { snapshotFrom: "runtime.memberPermissionSnapshot" } },
      { source: { caseStepId: "Clean-7", method: "prisma" }, id: "db.objective.absent", title: "应不存在 标题为 `E2E-TARGET-MEMBER-CREATE-FORBIDDEN` 的目标", object: "db.objective", operator: "absent", params: { titleFrom: "data.objectiveTitle" } },
      { source: { caseStepId: "Clean-8", method: "api" }, id: "ory.member_identity.absent", title: "邮箱为 `orf-member-create-target-forbidden-e2e@orf.local` 的普通用户登录身份 应不存在", object: "ory.identity", operator: "absent", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-9", method: "prisma" }, id: "db.member_user.absent", title: "邮箱为 `orf-member-create-target-forbidden-e2e@orf.local` 的普通用户 应不存在", object: "db.user", operator: "absent", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-10", method: "api" }, id: "session.unauthenticated", title: "当前会话 应为 未登录", object: "auth.session", operator: "unauthenticated" },
    ],
  },
} satisfies StateCaseSpec<MemberCreateTargetForbiddenCaseData>;
