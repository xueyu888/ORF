import {
  STATE_CASE_MODEL,
  type StateCaseSpec,
  type StepExecutionMethod,
  type StepSpec,
} from "../../_framework/types";
import type {
  LoginInvalidCredentialsCaseData,
  LoginInvalidCredentialsRole,
} from "./_support/login-invalid-credentials.context";

type LoginInvalidCredentialsDefinition = {
  id: string;
  title: string;
  role: LoginInvalidCredentialsRole;
  roleLabel: string;
  data: LoginInvalidCredentialsCaseData;
};

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

function createLoginInvalidCredentialsCase(
  definition: LoginInvalidCredentialsDefinition,
) {
  const { data, roleLabel } = definition;
  const roleKey = data.role;
  const roleIdentity = `${roleKey}Identity`;
  const roleUser = `${roleKey}User`;

  return {
    id: definition.id,
    title: definition.title,
    model: STATE_CASE_MODEL,
    tags: ["auth", "login", roleKey, "authentication", "negative"],

    data,

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
      description: `准备${roleLabel}测试账号，保证未注册账号场景干净，并进入登录页`,
      steps: [
        step(
          "Setup-1",
          "api",
          "ory.valid_sessions.revoke.setup",
          `撤销邮箱为 \`${data.email}\` 的${roleLabel}登录身份的残留登录会话`,
          "ory.sessions",
          "revoke_by_email",
          { emailFrom: "data.email" },
        ),
        step(
          "Setup-2",
          "api",
          "ory.missing_identity.delete.setup",
          `删除邮箱为 \`${data.nonexistentEmail}\` 的不存在账号测试登录身份`,
          "ory.identity",
          "delete_by_email",
          { emailFrom: "data.nonexistentEmail" },
        ),
        step(
          "Setup-3",
          "prisma",
          "db.missing_user.delete.setup",
          `删除邮箱为 \`${data.nonexistentEmail}\` 的不存在账号测试用户默认团队成员关系和用户`,
          "db.user",
          "delete",
          { emailFrom: "data.nonexistentEmail" },
        ),
        step(
          "Setup-4",
          "api",
          "ory.valid_identity.upsert",
          `准备邮箱为 \`${data.email}\`、使用固定测试密码的${roleLabel}登录身份`,
          "ory.identity",
          "upsert_password",
          {
            emailFrom: "data.email",
            nameFrom: "data.name",
            passwordFrom: "data.password",
            saveAs: roleIdentity,
          },
        ),
        step(
          "Setup-5",
          "prisma",
          "db.valid_user.upsert",
          `准备邮箱为 \`${data.email}\`、角色为 \`${data.role}\`、状态为 \`active\` 的${roleLabel}用户和默认团队成员关系`,
          "db.user",
          "upsert",
          {
            emailFrom: "data.email",
            nameFrom: "data.name",
            roleFrom: "data.role",
            status: "active",
            identityIdFrom: `runtime.${roleIdentity}.id`,
            saveAs: roleUser,
          },
        ),
        step(
          "Setup-6",
          "api",
          "ory.valid_sessions.revoke",
          `撤销邮箱为 \`${data.email}\` 的${roleLabel}登录身份的残留登录会话`,
          "ory.sessions",
          "revoke_by_email",
          { emailFrom: "data.email" },
        ),
        step("Setup-7", "playwright", "browser.clear", "移除当前浏览器中的残留登录态", "browser", "clear_state"),
        step("Setup-8", "playwright", "page.goto.auth", "打开 ORF 登录页", "page", "goto", { path: "/auth" }),
      ],
    },

    S0: {
      description: "登录页可用，已注册账号存在，未注册账号场景干净，当前浏览器仍未登录",
      assertions: [
        step("S0-1", "playwright", "url.auth", "当前页面 应为 登录页", "page.url", "match", { pattern: "/auth$" }),
        step("S0-2", "playwright", "input.email.visible", "邮箱输入框 应可见", "page", "visible", { label: "Email" }),
        step("S0-3", "playwright", "input.email.empty", "邮箱输入框的值 应为空", "input", "value", { label: "Email", value: "" }),
        step("S0-4", "playwright", "input.password.visible", "密码输入框 应可见", "page", "visible", { label: "Password", exact: true }),
        step("S0-5", "playwright", "input.password.empty", "密码输入框的值 应为空", "input", "value", { label: "Password", exact: true, value: "" }),
        step("S0-6", "playwright", "button.sign_in.visible", "登录页的 \"Sign In\" 登录操作 应可见", "page", "visible", { role: "button", name: "Sign In" }),
        step("S0-7", "playwright", "button.sign_in.enabled", "登录页的 \"Sign In\" 登录操作 应可点击", "page", "enabled", { role: "button", name: "Sign In" }),
        step("S0-8", "api", "session.unauthenticated", "当前会话 应为 未登录", "auth.session", "unauthenticated"),
        step("S0-9", "playwright", "cookie.absent", "当前浏览器 应不存在 Ory 登录会话 cookie", "browser.cookie", "absent"),
        step("S0-10", "playwright", "storage.empty", "当前浏览器 应不保留本地登录态", "browser.auth_storage", "empty"),
        step("S0-11", "api", "ory.valid_identity.exists", `认证系统中 应存在 邮箱为 \`${data.email}\` 的${roleLabel}登录身份`, "ory.identity", "exists", { emailFrom: "data.email" }),
        step("S0-12", "api", "ory.valid_identity.password_available", `邮箱为 \`${data.email}\` 的${roleLabel}登录身份的密码凭据 应可用`, "ory.identity", "password_available", { emailFrom: "data.email" }),
        step("S0-13", "prisma", "db.valid_user.matches", `ORF 业务系统中 应存在 邮箱为 \`${data.email}\`、角色为 \`${data.role}\`、状态为 \`active\` 的${roleLabel}用户`, "db.user", "matches", { emailFrom: "data.email", roleFrom: "data.role", status: "active" }),
        step("S0-14", "api", "ory.missing_identity.absent", `认证系统中 应不存在 邮箱为 \`${data.nonexistentEmail}\` 的登录身份`, "ory.identity", "absent", { emailFrom: "data.nonexistentEmail" }),
        step("S0-15", "prisma", "db.missing_user.absent", `ORF 业务系统中 应不存在 邮箱为 \`${data.nonexistentEmail}\` 的用户`, "db.user", "absent", { emailFrom: "data.nonexistentEmail" }),
      ],
    },

    Action: {
      description: "提交未注册邮箱和邮箱密码不匹配两类认证失败登录表单",
      steps: [
        step("Action-1", "playwright", "clear.email.missing_account", "清空邮箱输入框", "page", "fill", { label: "Email", value: "" }),
        step("Action-2", "playwright", "clear.password.missing_account", "清空密码输入框", "page", "fill", { label: "Password", exact: true, value: "" }),
        step("Action-3", "playwright", "fill.email.missing_account", `在邮箱输入框输入未注册${roleLabel}测试邮箱 \`${data.nonexistentEmail}\``, "page", "fill", { label: "Email", valueFrom: "data.nonexistentEmail" }),
        step("Action-4", "playwright", "fill.password.missing_account", `在密码输入框输入${roleLabel}固定测试密码`, "page", "fill", { label: "Password", exact: true, valueFrom: "data.password" }),
        step("Action-5", "playwright", "click.sign_in.missing_account", "点击 \"Sign In\" 登录操作", "page.login_form", "submit", { saveAs: "missingAccountLoginResponse" }),
        step("Action-6", "api", "login_response.missing_account.rejected", "登录结果 应被拒绝", "api.response", "rejected", { responseFrom: "runtime.missingAccountLoginResponse", status: 401 }),
        step("Action-7", "playwright", "error.invalid_credentials.missing_account.visible", "验证登录页错误提示 \"账号或密码不正确\" 应可见", "page", "visible", { text: "账号或密码不正确", exact: true }),
        step("Action-8", "playwright", "clear.email.wrong_password", "清空邮箱输入框", "page", "fill", { label: "Email", value: "" }),
        step("Action-9", "playwright", "clear.password.wrong_password", "清空密码输入框", "page", "fill", { label: "Password", exact: true, value: "" }),
        step("Action-10", "playwright", "fill.email.wrong_password", `在邮箱输入框输入已注册${roleLabel}测试邮箱`, "page", "fill", { label: "Email", valueFrom: "data.email" }),
        step("Action-11", "playwright", "fill.password.wrong_password", `在密码输入框输入${roleLabel}错误测试密码`, "page", "fill", { label: "Password", exact: true, valueFrom: "data.wrongPassword" }),
        step("Action-12", "playwright", "click.sign_in.wrong_password", "点击 \"Sign In\" 登录操作", "page.login_form", "submit", { saveAs: "wrongPasswordLoginResponse" }),
        step("Action-13", "api", "login_response.wrong_password.rejected", "登录结果 应被拒绝", "api.response", "rejected", { responseFrom: "runtime.wrongPasswordLoginResponse", status: 401 }),
        step("Action-14", "playwright", "error.invalid_credentials.wrong_password.visible", "验证登录页错误提示 \"账号或密码不正确\" 应可见", "page", "visible", { text: "账号或密码不正确", exact: true }),
      ],
    },

    S1: {
      description: "非法登录尝试全部被阻拦，不产生登录态，也不破坏既有账号",
      assertions: [
        step("S1-1", "playwright", "url.auth.after_invalid_attempts", "当前页面 应仍为 登录页", "page.url", "match", { pattern: "/auth$" }),
        step("S1-2", "api", "session.unauthenticated.after_invalid_attempts", "当前会话 应仍为 未登录", "auth.session", "unauthenticated"),
        step("S1-3", "playwright", "cookie.absent.after_invalid_attempts", "当前浏览器 应不存在 Ory 登录会话 cookie", "browser.cookie", "absent"),
        step("S1-4", "playwright", "storage.empty.after_invalid_attempts", "当前浏览器 应不保留本地登录态", "browser.auth_storage", "empty"),
        step("S1-5", "playwright", "button.sign_in.visible.after_invalid_attempts", "登录页的 \"Sign In\" 登录操作 应仍可见", "page", "visible", { role: "button", name: "Sign In" }),
        step("S1-6", "playwright", "nav.absent.after_invalid_attempts", "登录后主导航 应不可见", "page", "count", { label: "主导航", count: 0 }),
        step("S1-7", "playwright", "logout.absent.after_invalid_attempts", "登录后的 \"退出登录\" 操作 应不可见", "page", "count", { role: "button", name: "退出登录", count: 0 }),
        step("S1-8", "api", "ory.valid_identity.exists.after_invalid_attempts", `认证系统中 应仍存在 邮箱为 \`${data.email}\` 的${roleLabel}登录身份`, "ory.identity", "exists", { emailFrom: "data.email" }),
        step("S1-9", "api", "ory.valid_identity.password_available.after_invalid_attempts", `邮箱为 \`${data.email}\` 的${roleLabel}登录身份的密码凭据 应仍可用`, "ory.identity", "password_available", { emailFrom: "data.email" }),
        step("S1-10", "prisma", "db.valid_user.matches.after_invalid_attempts", `ORF 业务系统中 应仍存在 邮箱为 \`${data.email}\`、角色为 \`${data.role}\`、状态为 \`active\` 的${roleLabel}用户`, "db.user", "matches", { emailFrom: "data.email", roleFrom: "data.role", status: "active" }),
        step("S1-11", "api", "ory.missing_identity.absent.after_invalid_attempts", `认证系统中 应不存在 邮箱为 \`${data.nonexistentEmail}\` 的登录身份`, "ory.identity", "absent", { emailFrom: "data.nonexistentEmail" }),
        step("S1-12", "prisma", "db.missing_user.absent.after_invalid_attempts", `ORF 业务系统中 应不存在 邮箱为 \`${data.nonexistentEmail}\` 的用户`, "db.user", "absent", { emailFrom: "data.nonexistentEmail" }),
      ],
    },

    Clean: {
      description: `清理${roleLabel}登录反向测试账号，并恢复未登录基准状态`,
      steps: [
        step("Clean-1", "api", "auth.logout", "注销当前登录会话", "auth", "logout"),
        step("Clean-2", "playwright", "page.runtime.stop", "离开当前 ORF 前端页面", "page.runtime", "stop"),
        step("Clean-3", "playwright", "browser.clear", "移除当前浏览器中的残留登录态", "browser", "clear_state"),
        step("Clean-4", "api", "ory.valid_sessions.revoke", `撤销邮箱为 \`${data.email}\` 的${roleLabel}登录身份的残留登录会话`, "ory.sessions", "revoke_by_email", { emailFrom: "data.email" }),
        step("Clean-5", "api", "ory.valid_identity.delete", `删除邮箱为 \`${data.email}\` 的${roleLabel}登录身份`, "ory.identity", "delete_by_email", { emailFrom: "data.email" }),
        step("Clean-6", "prisma", "db.valid_user.memberships.delete", `删除邮箱为 \`${data.email}\` 的${roleLabel}用户的默认团队成员关系`, "db.user", "delete_memberships", { emailFrom: "data.email" }),
        step("Clean-7", "prisma", "db.valid_user.delete", `删除邮箱为 \`${data.email}\` 的${roleLabel}用户`, "db.user", "delete", { emailFrom: "data.email" }),
        step("Clean-8", "api", "ory.missing_identity.delete", `删除邮箱为 \`${data.nonexistentEmail}\` 的不存在账号测试登录身份`, "ory.identity", "delete_by_email", { emailFrom: "data.nonexistentEmail" }),
        step("Clean-9", "prisma", "db.missing_user.delete", `删除邮箱为 \`${data.nonexistentEmail}\` 的不存在账号测试用户默认团队成员关系和用户`, "db.user", "delete", { emailFrom: "data.nonexistentEmail" }),
        step("Clean-10", "api", "ory.valid_identity.absent", `邮箱为 \`${data.email}\` 的${roleLabel}登录身份 应不存在`, "ory.identity", "absent", { emailFrom: "data.email" }),
        step("Clean-11", "prisma", "db.valid_user.absent", `邮箱为 \`${data.email}\` 的${roleLabel}用户 应不存在`, "db.user", "absent", { emailFrom: "data.email" }),
        step("Clean-12", "api", "ory.missing_identity.absent", `邮箱为 \`${data.nonexistentEmail}\` 的登录身份 应不存在`, "ory.identity", "absent", { emailFrom: "data.nonexistentEmail" }),
        step("Clean-13", "prisma", "db.missing_user.absent", `邮箱为 \`${data.nonexistentEmail}\` 的用户 应不存在`, "db.user", "absent", { emailFrom: "data.nonexistentEmail" }),
      ],
    },
  } satisfies StateCaseSpec<LoginInvalidCredentialsCaseData>;
}

export const memberLoginInvalidCredentialsCase = createLoginInvalidCredentialsCase({
  id: "auth.member.login.invalid-credentials",
  title: "普通成员登录账号认证失败",
  role: "member",
  roleLabel: "普通成员",
  data: {
    email: "orf-member-login-invalid-e2e@orf.local",
    password: "OrfMemberLoginInvalidE2E!2026",
    wrongPassword: "WrongMemberLoginInvalidE2E!2026",
    blankPassword: "        ",
    shortPassword: "1234567",
    name: "ORF Member Login Invalid E2E",
    role: "member",
    invalidAccountNoAt: "orf-member-login-invalid-account",
    invalidAccountMissingDomain: "orf-member-login-invalid@",
    invalidAccountMissingTopLevelDomain: "orf-member-login-invalid@orf",
    invalidAccountWithSpace: "orf member login invalid@orf.local",
    nonexistentEmail: "orf-member-login-missing-e2e@orf.local",
  },
});

const adminLoginFormValidationData: LoginInvalidCredentialsCaseData = {
  email: "orf-admin-login-form-validation-e2e@orf.local",
  password: "OrfAdminLoginFormValidationE2E!2026",
  wrongPassword: "WrongAdminLoginInvalidE2E!2026",
  blankPassword: "        ",
  shortPassword: "1234567",
  name: "ORF Admin Login Form Validation E2E",
  role: "admin",
  invalidAccountNoAt: "orf-admin-login-invalid-account",
  invalidAccountMissingDomain: "orf-admin-login-invalid@",
  invalidAccountMissingTopLevelDomain: "orf-admin-login-invalid@orf",
  invalidAccountWithSpace: "orf admin login invalid@orf.local",
  nonexistentEmail: "orf-admin-login-missing-e2e@orf.local",
};

export const adminLoginInvalidCredentialsCase = {
  id: "auth.admin.login.invalid-credentials",
  title: "管理员登录表单输入校验失败",
  model: STATE_CASE_MODEL,
  tags: ["auth", "login", "admin", "form-validation", "negative"],

  data: adminLoginFormValidationData,

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
    description: "清理浏览器状态并打开登录页",
    steps: [
      step("Setup-1", "playwright", "browser.clear", "移除当前浏览器中的残留登录态", "browser", "clear_state"),
      step("Setup-2", "playwright", "page.goto.auth", "打开 ORF 登录页", "page", "goto", { path: "/auth" }),
    ],
  },

  S0: {
    description: "登录页可用，登录表单处于空值状态，当前浏览器未登录",
    assertions: [
      step("S0-1", "playwright", "url.auth", "当前页面 应为 登录页", "page.url", "match", { pattern: "/auth$" }),
      step("S0-2", "playwright", "input.email.visible", "邮箱输入框 应可见", "page", "visible", { label: "Email" }),
      step("S0-3", "playwright", "input.email.empty", "邮箱输入框的值 应为空", "input", "value", { label: "Email", value: "" }),
      step("S0-4", "playwright", "input.password.visible", "密码输入框 应可见", "page", "visible", { label: "Password", exact: true }),
      step("S0-5", "playwright", "input.password.empty", "密码输入框的值 应为空", "input", "value", { label: "Password", exact: true, value: "" }),
      step("S0-6", "playwright", "button.sign_in.visible", "登录页的 \"Sign In\" 登录操作 应可见", "page", "visible", { role: "button", name: "Sign In" }),
      step("S0-7", "playwright", "button.sign_in.enabled", "登录页的 \"Sign In\" 登录操作 应可点击", "page", "enabled", { role: "button", name: "Sign In" }),
      step("S0-8", "api", "session.unauthenticated", "当前会话 应为 未登录", "auth.session", "unauthenticated"),
      step("S0-9", "playwright", "cookie.absent", "当前浏览器 应不存在 Ory 登录会话 cookie", "browser.cookie", "absent"),
      step("S0-10", "playwright", "storage.empty", "当前浏览器 应不保留本地登录态", "browser.auth_storage", "empty"),
    ],
  },

  Action: {
    description: "逐一提交登录表单输入校验失败场景",
    steps: [
      step("Action-1", "playwright", "clear.email.empty_email", "清空邮箱输入框", "page", "fill", { label: "Email", value: "" }),
      step("Action-2", "playwright", "clear.password.empty_email", "清空密码输入框", "page", "fill", { label: "Password", exact: true, value: "" }),
      step("Action-3", "playwright", "fill.password.empty_email", "在密码输入框输入满足规则的管理员测试密码", "page", "fill", { label: "Password", exact: true, valueFrom: "data.password" }),
      step("Action-4", "playwright", "click.sign_in.empty_email", "点击 \"Sign In\" 登录操作", "page", "click", { role: "button", name: "Sign In" }),
      step("Action-5", "playwright", "error.email_required.visible", "登录页错误提示 \"请输入邮箱\" 应可见", "page", "visible", { text: "请输入邮箱", exact: true }),

      step("Action-6", "playwright", "clear.email.invalid_email", "清空邮箱输入框", "page", "fill", { label: "Email", value: "" }),
      step("Action-7", "playwright", "clear.password.invalid_email", "清空密码输入框", "page", "fill", { label: "Password", exact: true, value: "" }),
      step("Action-8", "playwright", "fill.email.invalid_email", "在邮箱输入框输入 `orf-admin-login-invalid-account`", "page", "fill", { label: "Email", valueFrom: "data.invalidAccountNoAt" }),
      step("Action-9", "playwright", "fill.password.invalid_email", "在密码输入框输入满足规则的管理员测试密码", "page", "fill", { label: "Password", exact: true, valueFrom: "data.password" }),
      step("Action-10", "playwright", "click.sign_in.invalid_email", "点击 \"Sign In\" 登录操作", "page", "click", { role: "button", name: "Sign In" }),
      step("Action-11", "playwright", "error.invalid_email.visible", "登录页错误提示 \"邮箱格式不正确\" 应可见", "page", "visible", { text: "邮箱格式不正确", exact: true }),

      step("Action-12", "playwright", "clear.email.empty_password", "清空邮箱输入框", "page", "fill", { label: "Email", value: "" }),
      step("Action-13", "playwright", "clear.password.empty_password", "清空密码输入框", "page", "fill", { label: "Password", exact: true, value: "" }),
      step("Action-14", "playwright", "fill.email.empty_password", "在邮箱输入框输入 `orf-admin-login-form-validation-e2e@orf.local`", "page", "fill", { label: "Email", valueFrom: "data.email" }),
      step("Action-15", "playwright", "click.sign_in.empty_password", "点击 \"Sign In\" 登录操作", "page", "click", { role: "button", name: "Sign In" }),
      step("Action-16", "playwright", "error.password_required.visible", "登录页错误提示 \"请输入密码\" 应可见", "page", "visible", { text: "请输入密码", exact: true }),

      step("Action-17", "playwright", "clear.email.short_password", "清空邮箱输入框", "page", "fill", { label: "Email", value: "" }),
      step("Action-18", "playwright", "clear.password.short_password", "清空密码输入框", "page", "fill", { label: "Password", exact: true, value: "" }),
      step("Action-19", "playwright", "fill.email.short_password", "在邮箱输入框输入 `orf-admin-login-form-validation-e2e@orf.local`", "page", "fill", { label: "Email", valueFrom: "data.email" }),
      step("Action-20", "playwright", "fill.password.short_password", "在密码输入框输入不满足规则的短密码", "page", "fill", { label: "Password", exact: true, valueFrom: "data.shortPassword" }),
      step("Action-21", "playwright", "click.sign_in.short_password", "点击 \"Sign In\" 登录操作", "page", "click", { role: "button", name: "Sign In" }),
      step("Action-22", "playwright", "error.password_too_short.visible", "登录页错误提示 \"密码至少 8 位\" 应可见", "page", "visible", { text: "密码至少 8 位", exact: true }),
    ],
  },

  S1: {
    description: "登录表单校验失败后仍停留登录页且不产生登录态",
    assertions: [
      step("S1-1", "playwright", "url.auth.after_validation", "当前页面 应仍为 登录页", "page.url", "match", { pattern: "/auth$" }),
      step("S1-2", "api", "session.unauthenticated.after_validation", "当前会话 应仍为 未登录", "auth.session", "unauthenticated"),
      step("S1-3", "playwright", "cookie.absent.after_validation", "当前浏览器 应不存在 Ory 登录会话 cookie", "browser.cookie", "absent"),
      step("S1-4", "playwright", "storage.empty.after_validation", "当前浏览器 应不保留本地登录态", "browser.auth_storage", "empty"),
      step("S1-5", "playwright", "button.sign_in.visible.after_validation", "登录页的 \"Sign In\" 登录操作 应仍可见", "page", "visible", { role: "button", name: "Sign In" }),
      step("S1-6", "playwright", "nav.absent.after_validation", "登录后主导航 应不可见", "page", "count", { label: "主导航", count: 0 }),
      step("S1-7", "playwright", "logout.absent.after_validation", "登录后的 \"退出登录\" 操作 应不可见", "page", "count", { role: "button", name: "退出登录", count: 0 }),
      step("S1-8", "playwright", "error.password_too_short.still_visible", "登录页错误提示 \"密码至少 8 位\" 应仍可见", "page", "visible", { text: "密码至少 8 位", exact: true }),
    ],
  },

  Clean: {
    description: "清理登录态和页面运行态",
    steps: [
      step("Clean-1", "api", "auth.logout", "注销当前登录会话", "auth", "logout"),
      step("Clean-2", "playwright", "page.runtime.stop", "离开当前 ORF 前端页面", "page.runtime", "stop"),
      step("Clean-3", "playwright", "browser.clear", "移除当前浏览器中的残留登录态", "browser", "clear_state"),
    ],
  },
} satisfies StateCaseSpec<LoginInvalidCredentialsCaseData>;
