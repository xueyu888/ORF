import { STATE_CASE_MODEL, type StateCaseSpec } from "../../_framework/types";
import type { MloginCaseData } from "./_support/mlogin.context";

export const mloginSuccessCase = {
  id: "auth.login.success",
  title: "普通成员可以使用正确邮箱和密码登录 ORF",
  model: STATE_CASE_MODEL,
  tags: ["auth", "login", "happy-path"],

  data: {
    email: "orf-login-e2e@orf.local",
    password: "OrfLoginE2E!2026",
    name: "ORF Login E2E",
    userId: "user-orf-login-e2e",
    teamId: "team-orf-login-e2e",
    role: "member",
  },

  B: {
    description: "系统服务可用，浏览器处于未登录基准状态",
    assertions: [
      {
        id: "backend.ready",
        title: "后端服务可用",
        source: { caseStepId: "B-1", method: "api" },
        object: "api.health",
        operator: "ok",
      },
      {
        id: "db.ready",
        title: "数据库可连接",
        source: { caseStepId: "B-2", method: "prisma" },
        object: "db",
        operator: "ready",
      },
      {
        id: "ory.ready",
        title: "Ory Admin API 可用",
        source: { caseStepId: "B-3", method: "api" },
        object: "ory.admin",
        operator: "ready",
      },
      {
        id: "protected.redirects_to_auth",
        title: "受保护页面会回到登录页",
        source: { caseStepId: "B-7", method: "playwright" },
        object: "page.protected",
        operator: "redirects_to_auth",
        params: {
          path: "/bounties",
          pattern: "/auth$",
        },
      },
      {
        id: "session.unauthenticated",
        title: "后端 session 未登录",
        source: { caseStepId: "B-4", method: "api" },
        object: "auth.session",
        operator: "unauthenticated",
      },
      {
        id: "cookie.absent",
        title: "浏览器不存在登录 cookie",
        source: { caseStepId: "B-5", method: "playwright" },
        object: "browser.cookie",
        operator: "absent",
      },
      {
        id: "storage.empty",
        title: "浏览器 storage 不含登录态",
        source: { caseStepId: "B-6", method: "playwright" },
        object: "browser.auth_storage",
        operator: "empty",
      },
    ],
  },

  Setup: {
    description: "准备测试身份、ORF 成员关系并进入登录页",
    steps: [
      {
        id: "ory.identity.upsert",
        title: "准备 Ory 测试身份",
        source: { caseStepId: "Setup-1", method: "api" },
        object: "ory.identity",
        operator: "upsert",
        params: {
          saveAs: "oryIdentity",
        },
      },
      {
        id: "ory.sessions.revoke",
        title: "清理测试身份已有 Ory session",
        source: { caseStepId: "Setup-4", method: "api" },
        object: "ory.sessions",
        operator: "revoke",
        params: {
          identityIdFrom: "runtime.oryIdentity.id",
        },
      },
      {
        id: "db.team.ensure",
        title: "准备测试团队",
        source: { caseStepId: "Setup-2", method: "prisma" },
        object: "db.team",
        operator: "ensure",
        params: {
          saveAs: "teamId",
        },
      },
      {
        id: "db.user.upsert",
        title: "准备 ORF 测试成员",
        source: { caseStepId: "Setup-2", method: "prisma" },
        object: "db.user",
        operator: "upsert",
        params: {
          saveAs: "orfUser",
        },
      },
      {
        id: "browser.clear",
        title: "清理浏览器状态",
        source: { caseStepId: "Setup-5", method: "playwright" },
        object: "browser",
        operator: "clear_state",
      },
      {
        id: "page.goto.auth",
        title: "打开登录页",
        source: { caseStepId: "Setup-6", method: "playwright" },
        object: "page",
        operator: "goto",
        params: {
          path: "/auth",
        },
      },
    ],
  },

  S0: {
    description: "登录页可用，测试用户存在，当前浏览器仍未登录",
    assertions: [
      {
        id: "url.auth",
        title: "当前页面是登录页",
        source: { caseStepId: "S0-1", method: "playwright" },
        object: "page.url",
        operator: "match",
        params: {
          pattern: "/auth$",
        },
      },
      {
        id: "heading.sign_in.visible",
        title: "登录页标题可见",
        source: { caseStepId: "S0-2", method: "playwright" },
        object: "page",
        operator: "visible",
        params: {
          role: "heading",
          name: "Sign in",
        },
      },
      {
        id: "input.email.empty",
        title: "邮箱输入框为空",
        source: { caseStepId: "S0-3", method: "playwright" },
        object: "input",
        operator: "value",
        params: {
          label: "Email",
          value: "",
        },
      },
      {
        id: "input.password.empty",
        title: "密码输入框为空",
        source: { caseStepId: "S0-4", method: "playwright" },
        object: "input",
        operator: "value",
        params: {
          label: "Password",
          exact: true,
          value: "",
        },
      },
      {
        id: "button.sign_in.enabled",
        title: "登录按钮可点击",
        source: { caseStepId: "S0-5", method: "playwright" },
        object: "page",
        operator: "enabled",
        params: {
          role: "button",
          name: "Sign In",
        },
      },
      {
        id: "session.unauthenticated",
        title: "后端 session 未登录",
        source: { caseStepId: "S0-6", method: "api" },
        object: "auth.session",
        operator: "unauthenticated",
      },
      {
        id: "cookie.absent",
        title: "浏览器不存在登录 cookie",
        source: { caseStepId: "S0-7", method: "playwright" },
        object: "browser.cookie",
        operator: "absent",
      },
      {
        id: "ory.identity.exists",
        title: "Ory 测试身份存在",
        source: { caseStepId: "S0-8", method: "api" },
        object: "ory.identity",
        operator: "exists",
        params: {
          emailFrom: "data.email",
        },
      },
      {
        id: "db.member.matches",
        title: "ORF 普通成员关系存在",
        source: { caseStepId: "S0-9", method: "prisma" },
        object: "db.member",
        operator: "matches",
        params: {
          userIdFrom: "runtime.orfUser.id",
          teamIdFrom: "data.teamId",
          emailFrom: "data.email",
          roleFrom: "data.role",
        },
      },
    ],
  },

  Action: {
    description: "输入正确邮箱和密码并提交登录表单",
    steps: [
      {
        id: "fill.email",
        title: "输入邮箱",
        source: { caseStepId: "Action-1", method: "playwright" },
        object: "page",
        operator: "fill",
        params: {
          label: "Email",
          valueFrom: "data.email",
        },
      },
      {
        id: "fill.password",
        title: "输入密码",
        source: { caseStepId: "Action-2", method: "playwright" },
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
        title: "注册登录接口响应捕获",
        source: { caseStepId: "S1-1", method: "api" },
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
        title: "点击登录按钮",
        source: { caseStepId: "Action-3", method: "playwright" },
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
    description: "页面进入登录后状态，后端 session 有效",
    assertions: [
      {
        id: "login_response.ok",
        title: "登录接口响应成功",
        source: { caseStepId: "S1-1", method: "api" },
        object: "api.response",
        operator: "ok",
        params: {
          responseFrom: "runtime.loginResponse",
          status: 200,
        },
      },
      {
        id: "url.bounties",
        title: "进入 bounties 页面",
        source: { caseStepId: "S1-2", method: "playwright" },
        object: "page.url",
        operator: "match",
        params: {
          pattern: "/bounties$",
        },
      },
      {
        id: "cookie.present",
        title: "浏览器存在登录 cookie",
        source: { caseStepId: "S1-3", method: "playwright" },
        object: "browser.cookie",
        operator: "present",
      },
      {
        id: "session.authenticated",
        title: "后端 session 已登录",
        source: { caseStepId: "S1-4", method: "api" },
        object: "auth.session",
        operator: "authenticated",
        params: {
          emailFrom: "data.email",
          roleFrom: "data.role",
        },
      },
      {
        id: "nav.visible",
        title: "主导航可见",
        source: { caseStepId: "S1-5", method: "playwright" },
        object: "page",
        operator: "visible",
        params: {
          label: "主导航",
        },
      },
      {
        id: "current_user.visible",
        title: "当前用户入口可见",
        source: { caseStepId: "S1-6", method: "playwright" },
        object: "page",
        operator: "visible",
        params: {
          label: "当前用户",
        },
      },
      {
        id: "logout.visible",
        title: "退出登录按钮可见",
        source: { caseStepId: "S1-7", method: "playwright" },
        object: "page",
        operator: "visible",
        params: {
          role: "button",
          name: "退出登录",
        },
      },
      {
        id: "sign_in.absent",
        title: "登录按钮不再出现在当前页面",
        source: { caseStepId: "S1-8", method: "playwright" },
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
        title: "ORF 普通成员关系仍然存在",
        source: { caseStepId: "S1-9", method: "prisma" },
        object: "db.member",
        operator: "matches",
        params: {
          userIdFrom: "runtime.orfUser.id",
          teamIdFrom: "data.teamId",
          emailFrom: "data.email",
          roleFrom: "data.role",
        },
      },
    ],
  },

  Clean: {
    description: "登出并恢复测试前基准状态",
    steps: [
      {
        id: "auth.logout",
        title: "退出当前登录态",
        source: { caseStepId: "Clean-1", method: "api" },
        object: "auth",
        operator: "logout",
      },
      {
        id: "browser.clear",
        title: "清理浏览器状态",
        source: { caseStepId: "Clean-2", method: "playwright" },
        object: "browser",
        operator: "clear_state",
      },
      {
        id: "db.restore_last_online_at",
        title: "恢复 last_online_at",
        source: { caseStepId: "Clean-3", method: "prisma" },
        object: "db.user",
        operator: "restore_last_online_at",
        params: {
          userIdFrom: "runtime.orfUser.id",
          lastOnlineAtFrom: "runtime.orfUser.previousLastOnlineAt",
          optional: true,
        },
      },
      {
        id: "ory.sessions.revoke",
        title: "撤销测试身份 Ory session",
        source: { caseStepId: "Clean-4", method: "api" },
        object: "ory.sessions",
        operator: "revoke",
        params: {
          identityIdFrom: "runtime.oryIdentity.id",
          optional: true,
        },
      },
    ],
  },
} satisfies StateCaseSpec<MloginCaseData>;
