import {
  STATE_CASE_MODEL,
  type StateCaseSpec,
  type StepExecutionMethod,
  type StepSpec,
} from "../../_framework/types";
import type { RegisterExistingEmailCaseData } from "./_support/register-existing-email.context";

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

export const registerExistingEmailCase = {
  id: "auth.register.existing-email",
  title: "06-用户使用已注册邮箱注册失败",
  model: STATE_CASE_MODEL,
  tags: ["auth", "registration", "duplicate-email", "negative"],

  data: {
    existingEmail: "orf-register-existing-e2e@orf.local",
    existingPassword: "OrfRegisterExistingE2E!2026",
    existingName: "ORF Register Existing E2E",
    duplicateName: "ORF Register Existing E2E Again",
    role: "member",
    validPassword: "OrfRegisterExistingAgainE2E!2026",
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
    description: "准备已注册邮箱测试账号并进入注册页",
    steps: [
      step("Setup-1", "api", "ory.existing_sessions.revoke.setup", "撤销邮箱为 `orf-register-existing-e2e@orf.local` 的已注册邮箱测试认证身份的残留登录会话", "ory.sessions", "revoke_by_email", { emailFrom: "data.existingEmail" }),
      step("Setup-2", "api", "ory.existing_identity.delete.setup", "删除邮箱为 `orf-register-existing-e2e@orf.local` 的已注册邮箱测试认证身份", "ory.identity", "delete_by_email", { emailFrom: "data.existingEmail" }),
      step("Setup-3", "prisma", "db.existing_user.memberships.delete.setup", "删除邮箱为 `orf-register-existing-e2e@orf.local` 的已注册邮箱测试用户的默认团队成员关系", "db.user", "delete_memberships", { emailFrom: "data.existingEmail" }),
      step("Setup-4", "prisma", "db.existing_user.delete.setup", "删除邮箱为 `orf-register-existing-e2e@orf.local` 的已注册邮箱测试用户", "db.user", "delete", { emailFrom: "data.existingEmail" }),
      step("Setup-5", "api", "ory.existing_identity.upsert", "准备邮箱为 `orf-register-existing-e2e@orf.local`、使用固定测试密码的已注册邮箱测试认证身份", "ory.identity", "upsert_password", { emailFrom: "data.existingEmail", passwordFrom: "data.existingPassword", nameFrom: "data.existingName", saveAs: "existingIdentity" }),
      step("Setup-6", "prisma", "db.existing_user.upsert", "准备邮箱为 `orf-register-existing-e2e@orf.local`、角色为 `member`、状态为 `active` 的已注册邮箱测试用户", "db.user", "upsert", { emailFrom: "data.existingEmail", nameFrom: "data.existingName", roleFrom: "data.role", status: "active", identityIdFrom: "runtime.existingIdentity.id", saveAs: "existingUser" }),
      step("Setup-7", "api", "ory.existing_sessions.revoke", "撤销邮箱为 `orf-register-existing-e2e@orf.local` 的已注册邮箱测试认证身份的残留登录会话", "ory.sessions", "revoke_by_email", { emailFrom: "data.existingEmail" }),
      step("Setup-8", "playwright", "browser.clear", "移除当前浏览器中的残留登录态", "browser", "clear_state"),
      step("Setup-9", "playwright", "page.goto.auth", "打开 ORF 登录页", "page", "goto", { path: "/auth" }),
      step("Setup-10", "playwright", "switch.register", "点击登录页的 \"Register\" 操作", "page", "click", { role: "button", name: "Register" }),
    ],
  },

  S0: {
    description: "注册页可用，已注册邮箱测试账号存在，当前浏览器未登录",
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
      step("S0-12", "api", "ory.existing_identity.exists", "认证系统中 应存在 邮箱为 `orf-register-existing-e2e@orf.local` 的已注册邮箱测试认证身份", "ory.identity", "exists", { emailFrom: "data.existingEmail" }),
      step("S0-13", "api", "ory.existing_identity.password_available", "邮箱为 `orf-register-existing-e2e@orf.local` 的已注册邮箱测试认证身份的密码凭据 应可用", "ory.identity", "password_available", { emailFrom: "data.existingEmail" }),
      step("S0-14", "prisma", "db.existing_user.exists", "ORF 业务系统中 应存在 邮箱为 `orf-register-existing-e2e@orf.local` 的已注册邮箱测试用户", "db.user", "matches", { emailFrom: "data.existingEmail" }),
      step("S0-15", "prisma", "db.existing_user.status_active", "已注册邮箱测试用户的状态 应为 `active`", "db.user", "matches", { emailFrom: "data.existingEmail", status: "active" }),
      step("S0-16", "prisma", "db.existing_user.role_member", "已注册邮箱测试用户的团队角色 应为 `member`", "db.user", "matches", { emailFrom: "data.existingEmail", roleFrom: "data.role" }),
    ],
  },

  Action: {
    description: "使用已注册邮箱提交注册表单",
    steps: [
      step("Action-1", "playwright", "fill.name", "在姓名输入框输入 `ORF Register Existing E2E Again`", "page", "fill", { label: "Name", valueFrom: "data.duplicateName" }),
      step("Action-2", "playwright", "fill.email", "在邮箱输入框输入已注册邮箱 `orf-register-existing-e2e@orf.local`", "page", "fill", { label: "Email", valueFrom: "data.existingEmail" }),
      step("Action-3", "playwright", "fill.password", "在密码输入框输入满足规则的固定测试密码", "page", "fill", { label: "Password", exact: true, valueFrom: "data.validPassword" }),
      step("Action-4", "playwright", "click.create_account", "点击 \"Create Account\" 注册操作", "page.registration_form", "submit", { saveAs: "registrationResponse" }),
      step("Action-5", "api", "registration_response.rejected", "注册结果 应被拒绝", "api.registration_response", "rejected", { responseFrom: "runtime.registrationResponse" }),
    ],
  },

  S1: {
    description: "注册被阻止，已注册邮箱测试账号不被重复创建或覆盖",
    assertions: [
      step("S1-1", "playwright", "url.auth.after_duplicate", "当前页面 应仍为 注册页", "page.url", "match", { pattern: "/auth$" }),
      step("S1-2", "playwright", "error.email_exists.visible", "注册页错误提示 \"邮箱已存在\" 应可见", "page", "visible", { text: "邮箱已存在", exact: true }),
      step("S1-3", "api", "session.unauthenticated.after_duplicate", "当前会话 应仍为 未登录", "auth.session", "unauthenticated"),
      step("S1-4", "playwright", "cookie.absent.after_duplicate", "当前浏览器 应不存在 Ory 登录会话 cookie", "browser.cookie", "absent"),
      step("S1-5", "playwright", "storage.empty.after_duplicate", "当前浏览器 应不保留本地登录态", "browser.auth_storage", "empty"),
      step("S1-6", "playwright", "approval_pending.absent", "注册提交后 \"等待注册审核\" 提示 应不可见", "page", "count", { role: "heading", name: "等待注册审核", count: 0 }),
      step("S1-7", "api", "ory.existing_identity.single", "认证系统中 邮箱为 `orf-register-existing-e2e@orf.local` 的已注册邮箱测试认证身份 应仍只有一个", "ory.identity", "single", { emailFrom: "data.existingEmail" }),
      step("S1-8", "api", "ory.existing_identity.password_available", "邮箱为 `orf-register-existing-e2e@orf.local` 的已注册邮箱测试认证身份的密码凭据 应仍可用", "ory.identity", "password_available", { emailFrom: "data.existingEmail" }),
      step("S1-9", "prisma", "db.existing_user.single", "ORF 业务系统中 邮箱为 `orf-register-existing-e2e@orf.local` 的已注册邮箱测试用户 应仍只有一个", "db.user", "single", { emailFrom: "data.existingEmail" }),
      step("S1-10", "prisma", "db.existing_user.status_active", "已注册邮箱测试用户的状态 应仍为 `active`", "db.user", "matches", { emailFrom: "data.existingEmail", status: "active" }),
      step("S1-11", "prisma", "db.existing_user.role_member", "已注册邮箱测试用户的团队角色 应仍为 `member`", "db.user", "matches", { emailFrom: "data.existingEmail", roleFrom: "data.role" }),
    ],
  },

  Clean: {
    description: "删除已注册邮箱测试账号并恢复未登录基准状态",
    steps: [
      step("Clean-1", "api", "auth.logout", "注销当前登录会话", "auth", "logout"),
      step("Clean-2", "playwright", "page.runtime.stop", "离开当前 ORF 前端页面", "page.runtime", "stop"),
      step("Clean-3", "playwright", "browser.clear", "移除当前浏览器中的残留登录态", "browser", "clear_state"),
      step("Clean-4", "api", "ory.existing_sessions.revoke", "撤销邮箱为 `orf-register-existing-e2e@orf.local` 的已注册邮箱测试认证身份的残留登录会话", "ory.sessions", "revoke_by_email", { emailFrom: "data.existingEmail" }),
      step("Clean-5", "api", "ory.existing_identity.delete", "删除邮箱为 `orf-register-existing-e2e@orf.local` 的已注册邮箱测试认证身份", "ory.identity", "delete_by_email", { emailFrom: "data.existingEmail" }),
      step("Clean-6", "prisma", "db.existing_user.memberships.delete", "删除邮箱为 `orf-register-existing-e2e@orf.local` 的已注册邮箱测试用户的默认团队成员关系", "db.user", "delete_memberships", { emailFrom: "data.existingEmail" }),
      step("Clean-7", "prisma", "db.existing_user.delete", "删除邮箱为 `orf-register-existing-e2e@orf.local` 的已注册邮箱测试用户", "db.user", "delete", { emailFrom: "data.existingEmail" }),
      step("Clean-8", "api", "ory.existing_identity.absent", "邮箱为 `orf-register-existing-e2e@orf.local` 的已注册邮箱测试认证身份 应不存在", "ory.identity", "absent", { emailFrom: "data.existingEmail" }),
      step("Clean-9", "prisma", "db.existing_user.absent", "邮箱为 `orf-register-existing-e2e@orf.local` 的已注册邮箱测试用户 应不存在", "db.user", "absent", { emailFrom: "data.existingEmail" }),
    ],
  },
} satisfies StateCaseSpec<RegisterExistingEmailCaseData>;
