import {
  STATE_CASE_MODEL,
  type StateCaseSpec,
  type StepExecutionMethod,
  type StepSpec,
} from "../../_framework/types";
import type { RegisterCaseData } from "./_support/register.context";

function step(
  caseStepId: string,
  method: StepExecutionMethod,
  id: string,
  title: string,
  object: string,
  operator: string,
  params?: Record<string, unknown>,
): StepSpec {
  return {
    source: { caseStepId, method },
    id,
    title,
    object,
    operator,
    ...(params ? { params } : {}),
  };
}

export const registerApprovalLoginCase = {
  id: "auth.register.approve-login",
  title: "05-用户输入姓名邮箱和密码注册成功",
  model: STATE_CASE_MODEL,
  tags: ["auth", "registration", "member", "happy-path"],

  data: {
    email: "orf-register-e2e@orf.local",
    password: "OrfRegisterE2E!2026",
    name: "ORF Register E2E",
    role: "member",
  },

  B: {
    description: "系统服务可用，浏览器处于未登录基准状态",
    assertions: [
      step("B-1", "api", "frontend.ready", "前端服务 应可用", "frontend.service", "available"),
      step("B-2", "api", "backend.ready", "后端服务 应可用", "api.health", "ok"),
      step("B-3", "api", "frontend.login_entry.accessible", "前端登录页入口 应可访问", "frontend.login_entry", "accessible"),
      step("B-4", "api", "session.endpoint.accessible", "当前会话查询能力 应可用", "auth.session", "accessible"),
      step("B-5", "prisma", "db.ready", "ORF 数据库 应可连接", "db", "ready"),
      step("B-6", "prisma", "db.schema.current", "ORF 数据库 schema 应为 当前测试版本", "db.schema", "current"),
      step("B-7", "api", "ory.admin_public.ready", "Ory/Kratos 认证服务的管理和公共访问能力 应可用", "ory.admin_public", "ready"),
      step("B-8", "api", "session.unauthenticated", "当前会话 应为 未登录", "auth.session", "unauthenticated"),
      step("B-9", "playwright", "cookie.absent", "当前浏览器 应不存在 Ory 登录会话 cookie", "browser.cookie", "absent"),
      step("B-10", "playwright", "storage.empty", "当前浏览器 应不保留本地登录态", "browser.auth_storage", "empty"),
    ],
  },

  Setup: {
    description: "清理注册测试账号残留并进入注册页",
    steps: [
      step("Setup-1", "api", "ory.sessions.revoke.registered_user.setup", "撤销邮箱为 `orf-register-e2e@orf.local` 的注册测试认证身份的残留登录会话", "ory.sessions", "revoke_by_email", { emailFrom: "data.email" }),
      step("Setup-2", "api", "ory.register_identity.delete.setup", "删除邮箱为 `orf-register-e2e@orf.local` 的注册测试认证身份", "ory.identity", "delete_by_email", { emailFrom: "data.email" }),
      step("Setup-3", "prisma", "db.registered_user.memberships.delete.setup", "删除邮箱为 `orf-register-e2e@orf.local` 的注册测试用户的默认团队成员关系", "db.registered_user", "delete_memberships", { emailFrom: "data.email" }),
      step("Setup-4", "prisma", "db.registered_user.delete.setup", "删除邮箱为 `orf-register-e2e@orf.local` 的注册测试用户", "db.registered_user", "delete", { emailFrom: "data.email" }),
      step("Setup-5", "playwright", "browser.clear", "移除当前浏览器中的残留登录态", "browser", "clear_state"),
      step("Setup-6", "playwright", "page.goto.auth", "打开 ORF 登录页", "page", "goto", { path: "/auth" }),
      step("Setup-7", "playwright", "switch.register", "点击登录页的 \"Register\" 操作", "page", "click", { role: "button", name: "Register" }),
    ],
  },

  S0: {
    description: "注册页可用，注册测试账号不存在，当前浏览器未登录",
    assertions: [
      step("S0-1", "playwright", "url.auth.register", "当前页面 应为 注册页", "page.url", "match", { pattern: "/auth$" }),
      step("S0-2", "playwright", "input.name.visible", "姓名输入框 应可见", "page", "visible", { label: "Name" }),
      step("S0-3", "playwright", "input.name.empty", "姓名输入框的值 应为空", "input", "value", { label: "Name", value: "" }),
      step("S0-4", "playwright", "input.email.visible", "邮箱输入框 应可见", "page", "visible", { label: "Email" }),
      step("S0-5", "playwright", "input.email.empty", "邮箱输入框的值 应为空", "input", "value", { label: "Email", value: "" }),
      step("S0-6", "playwright", "input.password.visible", "密码输入框 应可见", "page", "visible", { label: "Password", exact: true }),
      step("S0-7", "playwright", "input.password.empty", "密码输入框的值 应为空", "input", "value", { label: "Password", exact: true, value: "" }),
      step("S0-8", "playwright", "button.create_account.visible", "\"Create Account\" 注册操作 应可见", "page", "visible", { role: "button", name: "Create Account" }),
      step("S0-9", "playwright", "button.create_account.enabled", "\"Create Account\" 注册操作 应可点击", "page", "enabled", { role: "button", name: "Create Account" }),
      step("S0-10", "api", "session.unauthenticated", "当前会话 应为 未登录", "auth.session", "unauthenticated"),
      step("S0-11", "playwright", "cookie.absent", "当前浏览器 应不存在 Ory 登录会话 cookie", "browser.cookie", "absent"),
      step("S0-12", "api", "ory.register_identity.absent", "认证系统中 应不存在 邮箱为 `orf-register-e2e@orf.local` 的注册测试认证身份", "ory.identity", "absent", { emailFrom: "data.email" }),
      step("S0-13", "prisma", "db.registered_user.absent", "ORF 业务系统中 应不存在 邮箱为 `orf-register-e2e@orf.local` 的注册测试用户", "db.registered_user", "absent", { emailFrom: "data.email" }),
    ],
  },

  Action: {
    description: "提交姓名、未注册邮箱和满足规则密码的注册表单",
    steps: [
      step("Action-1", "playwright", "fill.name", "在姓名输入框输入 `ORF Register E2E`", "page", "fill", { label: "Name", valueFrom: "data.name" }),
      step("Action-2", "playwright", "fill.email", "在邮箱输入框输入未注册邮箱 `orf-register-e2e@orf.local`", "page", "fill", { label: "Email", valueFrom: "data.email" }),
      step("Action-3", "playwright", "fill.password", "在密码输入框输入满足规则的固定测试密码", "page", "fill", { label: "Password", exact: true, valueFrom: "data.password" }),
      step("Action-4", "playwright", "click.create_account", "点击 \"Create Account\" 注册操作", "page.registration_form", "submit", { saveAs: "registrationResponse" }),
    ],
  },

  S1: {
    description: "注册成功，注册测试用户进入待审核状态",
    assertions: [
      step("S1-1", "api", "registration_response.ok", "注册申请结果 应成功", "api.registration_response", "ok", { responseFrom: "runtime.registrationResponse" }),
      step("S1-2", "api", "registration_response.email_matches", "注册申请结果中的用户邮箱 应为 `orf-register-e2e@orf.local`", "api.registration_response", "email_matches", { responseFrom: "runtime.registrationResponse", emailFrom: "data.email" }),
      step("S1-3", "api", "registration_response.status_pending", "注册申请结果中的用户状态 应为 `pending`", "api.registration_response", "status", { responseFrom: "runtime.registrationResponse", status: "pending" }),
      step("S1-4", "api", "registration_response.role_member", "注册申请结果中的用户角色 应为 `member`", "api.registration_response", "role", { responseFrom: "runtime.registrationResponse", roleFrom: "data.role" }),
      step("S1-5", "playwright", "approval_pending.visible", "注册提交后 \"等待注册审核\" 提示 应可见", "page.approval_pending", "visible"),
      step("S1-6", "api", "ory.register_identity.exists", "认证系统中 应存在 邮箱为 `orf-register-e2e@orf.local` 的注册测试认证身份", "ory.identity", "exists", { emailFrom: "data.email" }),
      step("S1-7", "api", "ory.register_identity.password_available", "邮箱为 `orf-register-e2e@orf.local` 的注册测试认证身份的密码凭据 应可用", "ory.identity", "password_available", { emailFrom: "data.email" }),
      step("S1-8", "prisma", "db.registered_user.exists", "ORF 业务系统中 应存在 邮箱为 `orf-register-e2e@orf.local` 的注册测试用户", "db.registered_user", "exists", { emailFrom: "data.email" }),
      step("S1-9", "prisma", "db.registered_user.pending", "注册测试用户的状态 应为 `pending`", "db.registered_user", "status", { emailFrom: "data.email", status: "pending" }),
      step("S1-10", "prisma", "db.registered_user.role", "注册测试用户的团队角色 应为 `member`", "db.registered_user", "role", { emailFrom: "data.email", roleFrom: "data.role" }),
      step("S1-11", "api", "session.authenticated.pending_member", "当前会话 应为 邮箱为 `orf-register-e2e@orf.local`、角色为 `member`、状态为 `pending` 的已登录会话", "auth.session", "authenticated", { emailFrom: "data.email", roleFrom: "data.role", status: "pending" }),
      step("S1-12", "playwright", "cookie.present.after_register", "当前浏览器 应存在 Ory 登录会话 cookie", "browser.cookie", "present"),
    ],
  },

  Clean: {
    description: "删除注册测试数据并恢复未登录基准状态",
    steps: [
      step("Clean-1", "api", "auth.logout", "注销当前登录会话", "auth", "logout"),
      step("Clean-2", "playwright", "page.runtime.stop", "离开当前 ORF 前端页面", "page.runtime", "stop"),
      step("Clean-3", "playwright", "browser.clear", "移除当前浏览器中的残留登录态", "browser", "clear_state"),
      step("Clean-4", "api", "ory.sessions.revoke.registered_user", "撤销邮箱为 `orf-register-e2e@orf.local` 的注册测试认证身份的残留登录会话", "ory.sessions", "revoke_by_email", { emailFrom: "data.email" }),
      step("Clean-5", "api", "ory.register_identity.delete", "删除邮箱为 `orf-register-e2e@orf.local` 的注册测试认证身份", "ory.identity", "delete_by_email", { emailFrom: "data.email" }),
      step("Clean-6", "prisma", "db.registered_user.memberships.delete", "删除邮箱为 `orf-register-e2e@orf.local` 的注册测试用户的默认团队成员关系", "db.registered_user", "delete_memberships", { emailFrom: "data.email" }),
      step("Clean-7", "prisma", "db.registered_user.delete", "删除邮箱为 `orf-register-e2e@orf.local` 的注册测试用户", "db.registered_user", "delete", { emailFrom: "data.email" }),
      step("Clean-8", "api", "ory.register_identity.absent", "邮箱为 `orf-register-e2e@orf.local` 的注册测试认证身份 应不存在", "ory.identity", "absent", { emailFrom: "data.email" }),
      step("Clean-9", "prisma", "db.registered_user.absent", "邮箱为 `orf-register-e2e@orf.local` 的注册测试用户 应不存在", "db.registered_user", "absent", { emailFrom: "data.email" }),
    ],
  },
} satisfies StateCaseSpec<RegisterCaseData>;
