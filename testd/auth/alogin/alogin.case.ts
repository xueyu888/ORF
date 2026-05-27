import { STATE_CASE_MODEL, type StateCaseSpec } from "../../_framework/types";
import type { ALoginCaseData } from "./_support/alogin.context";

export const aloginSuccessCase = {
  id: "auth.admin_login.success",
  title: "管理员可以使用正确邮箱和密码登录 ORF",
  model: STATE_CASE_MODEL,
  tags: ["auth", "login", "admin", "happy-path"],

  data: {
    email: "zrx831@gmail.com",
    password: "123123123",
    role: "admin",
  },

  B: {
    description: "系统服务可用，预置管理员账号可用，浏览器处于未登录基准状态",
    assertions: [
      { id: "backend.ready", title: "后端服务可用", object: "api.health", operator: "ok" },
      { id: "db.ready", title: "数据库可连接", object: "db", operator: "ready" },
      { id: "ory.ready", title: "Ory Admin API 可用", object: "ory.admin", operator: "ready" },
      {
        id: "ory.admin_identity.exists",
        title: "管理员 Ory 身份存在",
        object: "ory.identity",
        operator: "exists",
        params: { emailFrom: "data.email" },
      },
      {
        id: "db.admin.active",
        title: "预置管理员账号可用",
        object: "db.admin",
        operator: "active",
        params: { emailFrom: "data.email" },
      },
      {
        id: "protected.redirects_to_auth",
        title: "受保护页面会回到登录页",
        object: "page.protected",
        operator: "redirects_to_auth",
        params: { path: "/tasks", pattern: "/auth$" },
      },
      { id: "session.unauthenticated", title: "后端 session 未登录", object: "auth.session", operator: "unauthenticated" },
      { id: "cookie.absent", title: "浏览器不存在登录 cookie", object: "browser.cookie", operator: "absent" },
      { id: "storage.empty", title: "浏览器 storage 不含登录态", object: "browser.auth_storage", operator: "empty" },
    ],
  },

  Setup: {
    description: "记录管理员登录前状态、清理会话并进入登录页",
    steps: [
      {
        id: "db.admin.record",
        title: "记录管理员登录前状态",
        object: "db.admin",
        operator: "record",
        params: { emailFrom: "data.email", saveAs: "adminAccountBeforeLogin" },
      },
      {
        id: "ory.sessions.revoke",
        title: "清理管理员已有 Ory session",
        object: "ory.sessions",
        operator: "revoke_by_email",
        params: { emailFrom: "data.email" },
      },
      { id: "browser.clear", title: "清理浏览器状态", object: "browser", operator: "clear_state" },
      { id: "page.goto.auth", title: "打开登录页", object: "page", operator: "goto", params: { path: "/auth" } },
    ],
  },

  S0: {
    description: "登录页可用，管理员账号存在，当前浏览器仍未登录",
    assertions: [
      { id: "url.auth", title: "当前页面是登录页", object: "page.url", operator: "match", params: { pattern: "/auth$" } },
      {
        id: "heading.sign_in.visible",
        title: "登录页标题可见",
        object: "page",
        operator: "visible",
        params: { role: "heading", name: "Sign in" },
      },
      { id: "input.email.empty", title: "邮箱输入框为空", object: "input", operator: "value", params: { label: "Email", value: "" } },
      {
        id: "input.password.empty",
        title: "密码输入框为空",
        object: "input",
        operator: "value",
        params: { label: "Password", exact: true, value: "" },
      },
      {
        id: "button.sign_in.enabled",
        title: "登录按钮可点击",
        object: "page",
        operator: "enabled",
        params: { role: "button", name: "Sign In" },
      },
      { id: "session.unauthenticated", title: "后端 session 未登录", object: "auth.session", operator: "unauthenticated" },
      { id: "cookie.absent", title: "浏览器不存在登录 cookie", object: "browser.cookie", operator: "absent" },
      {
        id: "ory.admin_identity.exists",
        title: "管理员 Ory 身份存在",
        object: "ory.identity",
        operator: "exists",
        params: { emailFrom: "data.email" },
      },
      {
        id: "db.admin.matches",
        title: "ORF 管理员关系存在",
        object: "db.admin",
        operator: "matches",
        params: { emailFrom: "data.email" },
      },
    ],
  },

  Action: {
    description: "输入管理员正确邮箱和密码并提交登录表单",
    steps: [
      { id: "fill.email", title: "输入管理员邮箱", object: "page", operator: "fill", params: { label: "Email", valueFrom: "data.email" } },
      {
        id: "fill.password",
        title: "输入管理员密码",
        object: "page",
        operator: "fill",
        params: { label: "Password", exact: true, valueFrom: "data.password" },
      },
      {
        id: "capture.login_response",
        title: "登录接口响应捕获",
        object: "api",
        operator: "capture_response",
        params: { urlEndsWith: "/api/auth/login", method: "POST", saveAs: "loginResponse" },
      },
      { id: "click.sign_in", title: "点击登录按钮", object: "page", operator: "click", params: { role: "button", name: "Sign In" } },
    ],
  },

  S1: {
    description: "页面进入管理员登录后状态，后端 session 有效",
    assertions: [
      {
        id: "login_response.ok",
        title: "登录接口响应成功",
        object: "api.response",
        operator: "ok",
        params: { responseFrom: "runtime.loginResponse", status: 200 },
      },
      { id: "url.bounties", title: "进入登录后默认页", object: "page.url", operator: "match", params: { pattern: "/bounties$" } },
      { id: "cookie.present", title: "浏览器存在登录 cookie", object: "browser.cookie", operator: "present" },
      {
        id: "session.authenticated",
        title: "后端 session 已登录",
        object: "auth.session",
        operator: "authenticated",
        params: { emailFrom: "data.email", roleFrom: "data.role", status: "active" },
      },
      { id: "nav.visible", title: "主导航可见", object: "page", operator: "visible", params: { label: "主导航" } },
      { id: "current_user.visible", title: "当前用户入口可见", object: "page", operator: "visible", params: { label: "当前用户" } },
      { id: "logout.visible", title: "退出登录按钮可见", object: "page", operator: "visible", params: { role: "button", name: "退出登录" } },
      { id: "members.nav.visible", title: "成员管理入口可见", object: "page", operator: "visible", params: { label: "成员管理" } },
      { id: "permissions.nav.visible", title: "权限管理入口可见", object: "page", operator: "visible", params: { label: "权限管理" } },
      { id: "sign_in.absent", title: "登录按钮不再出现", object: "page", operator: "count", params: { role: "button", name: "Sign In", count: 0 } },
      {
        id: "db.admin.matches",
        title: "ORF 管理员关系仍然存在",
        object: "db.admin",
        operator: "matches",
        params: { emailFrom: "data.email" },
      },
    ],
  },

  Clean: {
    description: "登出并恢复测试前基准状态",
    steps: [
      { id: "auth.logout", title: "退出当前登录态", object: "auth", operator: "logout" },
      { id: "browser.clear", title: "清理浏览器状态", object: "browser", operator: "clear_state" },
      {
        id: "db.restore_last_online_at",
        title: "恢复管理员 last_online_at",
        object: "db.admin",
        operator: "restore_last_online_at",
        params: { accountFrom: "runtime.adminAccountBeforeLogin" },
      },
      {
        id: "ory.sessions.revoke",
        title: "撤销管理员 Ory session",
        object: "ory.sessions",
        operator: "revoke_by_email",
        params: { emailFrom: "data.email" },
      },
      {
        id: "ory.admin_identity.exists",
        title: "管理员 Ory 身份仍然存在",
        object: "ory.identity",
        operator: "exists",
        params: { emailFrom: "data.email" },
      },
      {
        id: "db.admin.active",
        title: "预置管理员账号仍然可用",
        object: "db.admin",
        operator: "active",
        params: { emailFrom: "data.email" },
      },
    ],
  },
} satisfies StateCaseSpec<ALoginCaseData>;
