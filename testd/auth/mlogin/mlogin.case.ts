import { STATE_CASE_MODEL, type StateCaseSpec } from "../../_framework/types";
import type { MloginCaseData } from "./_support/mlogin.context";

export const mloginSuccessCase = {
  id: "auth.login.success",
  title: "普通成员可以使用正确邮箱和密码登录 ORF",
  model: STATE_CASE_MODEL,
  tags: ["auth", "login", "member", "happy-path"],

  data: {
    email: "orf-member-login-e2e@orf.local",
    password: "OrfMemberLoginE2E!2026",
    name: "ORF Member Login E2E",
    role: "member",
  },

  B: {
    description: "系统服务可用，浏览器处于未登录基准状态",
    assertions: [
      {
        id: "frontend.ready",
        title: "前端服务 应可用",
        object: "frontend.service",
        operator: "available",
      },
      {
        id: "backend.ready",
        title: "后端服务 应可用",
        object: "api.health",
        operator: "ok",
      },
      {
        id: "frontend.login_entry.accessible",
        title: "前端登录页入口 应可访问",
        object: "frontend.login_entry",
        operator: "accessible",
      },
      {
        id: "session.endpoint.accessible",
        title: "当前会话查询接口 应可访问",
        object: "auth.session",
        operator: "accessible",
      },
      {
        id: "db.ready",
        title: "ORF 数据库 应可连接",
        object: "db",
        operator: "ready",
      },
      {
        id: "db.schema.current",
        title: "ORF 数据库 schema 应为 当前测试版本",
        object: "db.schema",
        operator: "current",
      },
      {
        id: "ory.admin_public.ready",
        title: "Ory/Kratos Admin/Public API 应可访问",
        object: "ory.admin_public",
        operator: "ready",
      },
      {
        id: "session.unauthenticated",
        title: "当前会话 应为 未登录",
        object: "auth.session",
        operator: "unauthenticated",
      },
      {
        id: "cookie.absent",
        title: "当前浏览器 应不存在 Ory session cookie",
        object: "browser.cookie",
        operator: "absent",
      },
      {
        id: "storage.empty",
        title: "当前浏览器 storage 应不包含 登录态",
        object: "browser.auth_storage",
        operator: "empty",
      },
      {
        id: "protected.redirects_to_auth",
        title: "受保护入口 `/bounties` 应重定向到 `/auth`",
        object: "page.protected",
        operator: "redirects_to_auth",
        params: {
          path: "/bounties",
          pattern: "/auth$",
        },
      },
    ],
  },

  Setup: {
    description: "准备普通成员测试账号、清理会话并进入登录页",
    steps: [
      {
        id: "ory.member_identity.upsert",
        title:
          "准备邮箱为 `orf-member-login-e2e@orf.local` 的普通成员登录身份，并设置固定测试密码",
        object: "ory.identity",
        operator: "upsert_password",
        params: { saveAs: "memberIdentity" },
      },
      {
        id: "db.member.upsert",
        title:
          "准备邮箱为 `orf-member-login-e2e@orf.local`、角色为 `member`、状态为 `active` 的普通成员用户",
        object: "db.member",
        operator: "upsert",
        params: {
          identityIdFrom: "runtime.memberIdentity.id",
          saveAs: "memberUser",
        },
      },
      {
        id: "ory.sessions.revoke",
        title: "撤销普通成员登录身份可能残留的 Ory session",
        object: "ory.sessions",
        operator: "revoke_by_email",
        params: { emailFrom: "data.email" },
      },
      {
        id: "browser.clear",
        title: "清理浏览器状态",
        object: "browser",
        operator: "clear_state",
      },
      {
        id: "page.goto.auth",
        title: "打开 登录页",
        object: "page",
        operator: "goto",
        params: { path: "/auth" },
      },
    ],
  },

  S0: {
    description: "登录页可用，普通成员账号存在，当前浏览器仍未登录",
    assertions: [
      {
        id: "url.auth",
        title: "当前页面 应为 登录页",
        object: "page.url",
        operator: "match",
        params: { pattern: "/auth$" },
      },
      {
        id: "heading.sign_in.visible",
        title: '登录页标题 "Sign in" 应可见',
        object: "page",
        operator: "visible",
        params: { role: "heading", name: "Sign in" },
      },
      {
        id: "input.email.visible",
        title: "邮箱输入框 应可见",
        object: "page",
        operator: "visible",
        params: { label: "Email" },
      },
      {
        id: "input.email.empty",
        title: "邮箱输入框的值 应为空",
        object: "input",
        operator: "value",
        params: { label: "Email", value: "" },
      },
      {
        id: "input.password.visible",
        title: "密码输入框 应可见",
        object: "page",
        operator: "visible",
        params: { label: "Password", exact: true },
      },
      {
        id: "input.password.empty",
        title: "密码输入框的值 应为空",
        object: "input",
        operator: "value",
        params: { label: "Password", exact: true, value: "" },
      },
      {
        id: "button.sign_in.visible",
        title: '"Sign In" 登录操作 应可见',
        object: "page",
        operator: "visible",
        params: { role: "button", name: "Sign In" },
      },
      {
        id: "button.sign_in.enabled",
        title: '"Sign In" 登录操作 应可点击',
        object: "page",
        operator: "enabled",
        params: { role: "button", name: "Sign In" },
      },
      {
        id: "session.unauthenticated",
        title: "当前会话 应为 未登录",
        object: "auth.session",
        operator: "unauthenticated",
      },
      {
        id: "cookie.absent",
        title: "浏览器上下文 cookies 应不包含 `orf_ory_session`",
        object: "browser.cookie",
        operator: "absent",
      },
      {
        id: "ory.member_identity.exists",
        title:
          "认证系统中 应存在 邮箱为 `orf-member-login-e2e@orf.local` 的普通成员登录身份",
        object: "ory.identity",
        operator: "exists",
        params: { emailFrom: "data.email" },
      },
      {
        id: "ory.member_identity.password_available",
        title: "普通成员登录身份 的密码凭据 应可用",
        object: "ory.identity",
        operator: "password_available",
        params: { emailFrom: "data.email" },
      },
      {
        id: "db.member.matches",
        title:
          "ORF 业务系统中 应存在 邮箱为 `orf-member-login-e2e@orf.local`、角色为 `member`、状态为 `active` 的普通成员用户",
        object: "db.member",
        operator: "matches",
        params: { emailFrom: "data.email" },
      },
    ],
  },

  Action: {
    description: "输入普通成员测试邮箱和密码并提交登录表单",
    steps: [
      {
        id: "fill.email",
        title: "在邮箱输入框输入普通成员测试邮箱",
        object: "page",
        operator: "fill",
        params: {
          label: "Email",
          valueFrom: "data.email",
        },
      },
      {
        id: "fill.password",
        title: "在密码输入框输入普通成员测试密码",
        object: "page",
        operator: "fill",
        params: {
          label: "Password",
          exact: true,
          valueFrom: "data.password",
        },
      },
      {
        id: "capture.login_response",
        title: '在点击 "Sign In" 登录操作前注册登录接口响应捕获',
        object: "api",
        operator: "capture_response",
        params: {
          urlEndsWith: "/api/auth/login",
          method: "POST",
          saveAs: "loginResponse",
        },
      },
      {
        id: "click.sign_in",
        title: '点击 "Sign In" 登录操作',
        object: "page",
        operator: "click",
        params: {
          role: "button",
          name: "Sign In",
        },
      },
    ],
  },

  S1: {
    description: "页面进入普通成员登录后状态，后端 session 有效",
    assertions: [
      {
        id: "login_response.ok",
        title: "登录接口响应 应成功",
        object: "api.response",
        operator: "ok",
        params: {
          responseFrom: "runtime.loginResponse",
          status: 200,
        },
      },
      {
        id: "url.bounties",
        title: "当前页面 应为 悬赏大厅",
        object: "page.url",
        operator: "match",
        params: { pattern: "/bounties$" },
      },
      {
        id: "cookie.present",
        title: "浏览器上下文 cookies 应包含 `orf_ory_session`",
        object: "browser.cookie",
        operator: "present",
      },
      {
        id: "session.authenticated",
        title:
          "当前会话 应为 邮箱为 `orf-member-login-e2e@orf.local`、角色为 `member`、状态为 `active` 的已登录会话",
        object: "auth.session",
        operator: "authenticated",
        params: {
          emailFrom: "data.email",
          roleFrom: "data.role",
          status: "active",
        },
      },
      {
        id: "nav.visible",
        title: "主导航 应可见",
        object: "page",
        operator: "visible",
        params: { label: "主导航" },
      },
      {
        id: "current_user.visible",
        title: "当前用户入口 应可见",
        object: "page",
        operator: "visible",
        params: { label: "当前用户" },
      },
      {
        id: "logout.visible",
        title: '"退出登录" 操作 应可见',
        object: "page",
        operator: "visible",
        params: {
          role: "button",
          name: "退出登录",
        },
      },
      {
        id: "sign_in.absent",
        title: '"Sign In" 登录操作 应不再作为当前页面主要操作出现',
        object: "page",
        operator: "count",
        params: {
          role: "button",
          name: "Sign In",
          count: 0,
        },
      },
      {
        id: "db.member.matches",
        title: "ORF 普通成员用户和 `member` 成员关系 应仍存在",
        object: "db.member",
        operator: "matches",
        params: { emailFrom: "data.email" },
      },
    ],
  },

  Clean: {
    description: "登出并恢复普通成员登录测试前基准状态",
    steps: [
      {
        id: "auth.logout",
        title: "调用退出登录接口撤销本次登录产生的 Ory session",
        object: "auth",
        operator: "logout",
      },
      {
        id: "page.runtime.stop",
        title: "当前页面离开 ORF 前端应用",
        object: "page.runtime",
        operator: "stop",
      },
      {
        id: "browser.clear",
        title: "清理浏览器状态",
        object: "browser",
        operator: "clear_state",
      },
      {
        id: "ory.sessions.revoke",
        title: "撤销普通成员登录身份的残留 Ory session",
        object: "ory.sessions",
        operator: "revoke_by_email",
        params: { emailFrom: "data.email" },
      },
      {
        id: "ory.member_identity.delete",
        title: "删除邮箱为 `orf-member-login-e2e@orf.local` 的普通成员登录身份",
        object: "ory.identity",
        operator: "delete_by_email",
        params: { emailFrom: "data.email" },
      },
      {
        id: "db.member.memberships.delete",
        title: "删除普通成员的默认团队成员关系",
        object: "db.member",
        operator: "delete_memberships",
        params: { emailFrom: "data.email" },
      },
      {
        id: "db.member.delete",
        title: "删除邮箱为 `orf-member-login-e2e@orf.local` 的普通成员用户",
        object: "db.member",
        operator: "delete",
        params: { emailFrom: "data.email" },
      },
    ],
  },
} satisfies StateCaseSpec<MloginCaseData>;
