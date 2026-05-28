import { STATE_CASE_MODEL, type StateCaseSpec } from "../../_framework/types";
import type { ObjectiveCreateForbiddenCaseData } from "./_support/objective-create-forbidden.context";

export const objectiveCreateForbiddenCase = {
  id: "objectives.publish.member-forbidden",
  title: "管理员新增并发布目标-普通成员不可新增目标",
  model: STATE_CASE_MODEL,
  tags: ["objectives", "create", "member", "permission"],

  data: {
    email: "orf-member-objective-create-forbidden-e2e@orf.local",
    password: "OrfMemberObjectiveCreateForbiddenE2E!2026",
    name: "ORF Member Objective Create Forbidden E2E",
    role: "member",
    objectiveTitle: "E2E-OBJECTIVE-CREATE-FORBIDDEN: 普通成员不可新增目标",
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
    description: "准备普通成员账号，登录普通成员并进入挑战工作台",
    steps: [
      { source: { caseStepId: "Setup-1", method: "prisma" }, id: "db.objective.delete_residue", title: "删除可能残留的本用例测试目标及其派生数据", object: "db.objective", operator: "delete_by_title", params: { titleFrom: "data.objectiveTitle" } },
      { source: { caseStepId: "Setup-2", method: "api" }, id: "ory.member_identity.upsert", title: "准备邮箱为 `orf-member-objective-create-forbidden-e2e@orf.local`、使用固定测试密码的普通成员登录身份", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.email", nameFrom: "data.name", passwordFrom: "data.password", saveAs: "memberIdentity" } },
      { source: { caseStepId: "Setup-3", method: "prisma" }, id: "db.member_user_record.upsert", title: "准备邮箱为 `orf-member-objective-create-forbidden-e2e@orf.local`、状态为 `active` 的普通成员用户记录", object: "db.user_record", operator: "upsert", params: { emailFrom: "data.email", nameFrom: "data.name", status: "active", identityIdFrom: "runtime.memberIdentity.id", saveAs: "memberUserRecord" } },
      { source: { caseStepId: "Setup-4", method: "prisma" }, id: "db.member_membership.upsert", title: "准备邮箱为 `orf-member-objective-create-forbidden-e2e@orf.local` 的普通成员用户默认团队成员关系，角色为 `member`", object: "db.default_team_membership", operator: "upsert", params: { emailFrom: "data.email", roleFrom: "data.role", saveAs: "memberUser" } },
      { source: { caseStepId: "Setup-5", method: "api" }, id: "ory.member_sessions.revoke", title: "撤销普通成员登录身份可能残留的登录会话", object: "ory.sessions", operator: "revoke_by_email", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Setup-6", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Setup-7", method: "playwright" }, id: "page.goto.auth", title: "打开 ORF 登录页", object: "page", operator: "goto", params: { path: "/auth" } },
      { source: { caseStepId: "Setup-8", method: "playwright" }, id: "fill.email", title: "在邮箱输入框输入普通成员固定测试邮箱", object: "page", operator: "fill", params: { label: "Email", valueFrom: "data.email" } },
      { source: { caseStepId: "Setup-9", method: "playwright" }, id: "fill.password", title: "在密码输入框输入普通成员固定测试密码", object: "page", operator: "fill", params: { label: "Password", exact: true, valueFrom: "data.password" } },
      { source: { caseStepId: "Setup-10", method: "playwright" }, id: "click.sign_in", title: "点击 \"Sign In\" 登录操作", object: "page", operator: "click", params: { role: "button", name: "Sign In" } },
      { source: { caseStepId: "Setup-11", method: "api" }, id: "session.authenticated", title: "当前会话 应为 已登录", object: "auth.session", operator: "authenticated" },
      { source: { caseStepId: "Setup-12", method: "api" }, id: "session.email", title: "当前会话用户邮箱 应为 `orf-member-objective-create-forbidden-e2e@orf.local`", object: "auth.session.user_email", operator: "equals", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Setup-13", method: "api" }, id: "session.role", title: "当前会话用户角色 应为 `member`", object: "auth.session.user_role", operator: "equals", params: { roleFrom: "data.role" } },
      { source: { caseStepId: "Setup-14", method: "api" }, id: "session.status", title: "当前会话用户状态 应为 `active`", object: "auth.session.user_status", operator: "equals", params: { status: "active" } },
      { source: { caseStepId: "Setup-15", method: "playwright" }, id: "page.goto.tasks", title: "打开 挑战工作台", object: "page", operator: "goto", params: { path: "/tasks" } },
      { source: { caseStepId: "Setup-16", method: "api" }, id: "api.workbench.read", title: "读取 普通成员挑战工作台数据", object: "api.my_challenges", operator: "read_mine", params: { saveAs: "workbenchDataBefore" } },
    ],
  },

  S0: {
    description: "普通成员已登录并位于挑战工作台，但不能新增目标",
    assertions: [
      { source: { caseStepId: "S0-1", method: "api" }, id: "session.authenticated", title: "当前会话 应为 已登录", object: "auth.session", operator: "authenticated" },
      { source: { caseStepId: "S0-2", method: "api" }, id: "session.email", title: "当前会话用户邮箱 应为 `orf-member-objective-create-forbidden-e2e@orf.local`", object: "auth.session.user_email", operator: "equals", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "S0-3", method: "api" }, id: "session.role", title: "当前会话用户角色 应为 `member`", object: "auth.session.user_role", operator: "equals", params: { roleFrom: "data.role" } },
      { source: { caseStepId: "S0-4", method: "api" }, id: "session.status", title: "当前会话用户状态 应为 `active`", object: "auth.session.user_status", operator: "equals", params: { status: "active" } },
      { source: { caseStepId: "S0-5", method: "playwright" }, id: "url.tasks", title: "当前页面 应为 挑战工作台", object: "page.url", operator: "match", params: { pattern: "/tasks$" } },
      { source: { caseStepId: "S0-6", method: "playwright" }, id: "scope.mine.enabled", title: "\"我的挑战\" 视图 应可用", object: "page", operator: "enabled", params: { role: "button", name: "我的挑战" } },
      { source: { caseStepId: "S0-7", method: "playwright" }, id: "new_objective.absent", title: "\"新建目标\" 操作 应不可见", object: "page", operator: "count", params: { role: "button", name: "新建目标", count: 0 } },
      { source: { caseStepId: "S0-8", method: "api" }, id: "api.workbench.objective_absent", title: "普通成员挑战工作台数据 应不包含 标题为 `E2E-OBJECTIVE-CREATE-FORBIDDEN: 普通成员不可新增目标` 的测试目标", object: "api.my_challenges", operator: "objective_absent", params: { titleFrom: "data.objectiveTitle" } },
      { source: { caseStepId: "S0-9", method: "prisma" }, id: "db.objective.absent", title: "应不存在 标题为 `E2E-OBJECTIVE-CREATE-FORBIDDEN: 普通成员不可新增目标` 的测试目标", object: "db.objective", operator: "absent", params: { titleFrom: "data.objectiveTitle" } },
    ],
  },

  Action: {
    description: "普通成员直接尝试调用目标创建接口",
    steps: [
      { source: { caseStepId: "Action-1", method: "api" }, id: "api.objective_create.attempt", title: "当前普通成员尝试创建标题为 `E2E-OBJECTIVE-CREATE-FORBIDDEN: 普通成员不可新增目标` 的测试目标", object: "api.objective_create", operator: "attempt", params: { titleFrom: "data.objectiveTitle", saveAs: "createObjectiveAttempt" } },
      { source: { caseStepId: "Action-2", method: "api" }, id: "api.workbench.read_after", title: "读取 普通成员挑战工作台数据", object: "api.my_challenges", operator: "read_mine", params: { saveAs: "workbenchDataAfter" } },
    ],
  },

  S1: {
    description: "普通成员创建目标被拒绝，系统中没有产生测试目标",
    assertions: [
      { source: { caseStepId: "S1-1", method: "api" }, id: "api.objective_create.forbidden", title: "创建目标结果状态码 应为 403 或等价权限错误", object: "api.objective_create", operator: "forbidden", params: { resultFrom: "runtime.createObjectiveAttempt" } },
      { source: { caseStepId: "S1-2", method: "api" }, id: "api.workbench.objective_absent", title: "普通成员挑战工作台数据 应不包含 标题为 `E2E-OBJECTIVE-CREATE-FORBIDDEN: 普通成员不可新增目标` 的测试目标", object: "api.my_challenges", operator: "objective_absent", params: { titleFrom: "data.objectiveTitle" } },
      { source: { caseStepId: "S1-3", method: "prisma" }, id: "db.objective.absent", title: "应不存在 标题为 `E2E-OBJECTIVE-CREATE-FORBIDDEN: 普通成员不可新增目标` 的测试目标", object: "db.objective", operator: "absent", params: { titleFrom: "data.objectiveTitle" } },
      { source: { caseStepId: "S1-4", method: "playwright" }, id: "url.tasks", title: "当前页面 应为 挑战工作台", object: "page.url", operator: "match", params: { pattern: "/tasks$" } },
      { source: { caseStepId: "S1-5", method: "playwright" }, id: "new_objective.absent", title: "\"新建目标\" 操作 应不可见", object: "page", operator: "count", params: { role: "button", name: "新建目标", count: 0 } },
      { source: { caseStepId: "S1-6", method: "api" }, id: "session.authenticated", title: "当前会话 应为 已登录", object: "auth.session", operator: "authenticated" },
      { source: { caseStepId: "S1-7", method: "api" }, id: "session.email", title: "当前会话用户邮箱 应为 `orf-member-objective-create-forbidden-e2e@orf.local`", object: "auth.session.user_email", operator: "equals", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "S1-8", method: "api" }, id: "session.role", title: "当前会话用户角色 应为 `member`", object: "auth.session.user_role", operator: "equals", params: { roleFrom: "data.role" } },
      { source: { caseStepId: "S1-9", method: "api" }, id: "session.status", title: "当前会话用户状态 应为 `active`", object: "auth.session.user_status", operator: "equals", params: { status: "active" } },
    ],
  },

  Clean: {
    description: "删除可能残留的目标、普通成员账号和页面会话状态",
    steps: [
      { source: { caseStepId: "Clean-1", method: "prisma" }, id: "db.objective.delete_by_title", title: "删除 本用例创建的目标及其派生数据", object: "db.objective", operator: "delete_by_title", params: { titleFrom: "data.objectiveTitle" } },
      { source: { caseStepId: "Clean-2", method: "api" }, id: "auth.logout", title: "注销当前登录会话", object: "auth", operator: "logout" },
      { source: { caseStepId: "Clean-3", method: "playwright" }, id: "page.runtime.stop", title: "离开当前 ORF 前端页面", object: "page.runtime", operator: "stop" },
      { source: { caseStepId: "Clean-4", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Clean-5", method: "api" }, id: "ory.member_sessions.revoke", title: "撤销普通成员登录身份的残留登录会话", object: "ory.sessions", operator: "revoke_by_email", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-6", method: "api" }, id: "ory.member_identity.delete", title: "删除邮箱为 `orf-member-objective-create-forbidden-e2e@orf.local` 的普通成员登录身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-7", method: "prisma" }, id: "db.member.memberships.delete", title: "删除邮箱为 `orf-member-objective-create-forbidden-e2e@orf.local` 的普通成员用户默认团队成员关系", object: "db.user", operator: "delete_memberships", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-8", method: "prisma" }, id: "db.member.delete", title: "删除邮箱为 `orf-member-objective-create-forbidden-e2e@orf.local` 的普通成员用户", object: "db.user", operator: "delete", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-9", method: "prisma" }, id: "db.objective.absent", title: "应不存在 标题为 `E2E-OBJECTIVE-CREATE-FORBIDDEN: 普通成员不可新增目标` 的测试目标", object: "db.objective", operator: "absent", params: { titleFrom: "data.objectiveTitle" } },
      { source: { caseStepId: "Clean-10", method: "api" }, id: "ory.member_identity.absent", title: "邮箱为 `orf-member-objective-create-forbidden-e2e@orf.local` 的普通成员登录身份 应不存在", object: "ory.identity", operator: "absent", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-11", method: "prisma" }, id: "db.member.absent", title: "邮箱为 `orf-member-objective-create-forbidden-e2e@orf.local` 的普通成员用户 应不存在", object: "db.user", operator: "absent", params: { emailFrom: "data.email" } },
    ],
  },
} satisfies StateCaseSpec<ObjectiveCreateForbiddenCaseData>;
