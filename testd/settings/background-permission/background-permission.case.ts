import { STATE_CASE_MODEL, type StateCaseSpec } from "../../_framework/types";
import type { BackgroundPermissionCaseData } from "./_support/background-permission.context";

export const backgroundPermissionCase = {
  id: "settings.background.member-forbidden",
  title: "普通成员不能修改设置页面背景",
  model: STATE_CASE_MODEL,
  tags: ["settings", "visual-background", "member", "permission"],

  data: {
    email: "orf-member-e2e@orf.local",
    password: "OrfMemberE2E!2026",
    name: "ORF Member E2E",
    role: "member",
  },

  B: {
    description: "普通成员账号可用，背景配置可读取，浏览器未登录",
    assertions: [
      { id: "backend.ready", title: "后端服务可用", object: "api.health", operator: "ok" },
      { id: "db.ready", title: "数据库可连接", object: "db", operator: "ready" },
      { id: "ory.ready", title: "Ory Admin API 可用", object: "ory.admin", operator: "ready" },
      {
        id: "ory.member_identity.exists",
        title: "普通成员 Ory 身份存在",
        object: "ory.identity",
        operator: "exists",
        params: { emailFrom: "data.email" },
      },
      { id: "db.member.active", title: "预置普通成员账号可用", object: "db.member", operator: "active" },
      {
        id: "backgrounds.snapshot",
        title: "记录背景配置快照",
        object: "api.visual_backgrounds",
        operator: "snapshot",
        params: { saveAs: "backgroundSnapshot" },
      },
      { id: "session.unauthenticated", title: "后端 session 未登录", object: "auth.session", operator: "unauthenticated" },
      { id: "cookie.absent", title: "浏览器不存在登录 cookie", object: "browser.cookie", operator: "absent" },
      { id: "storage.empty", title: "浏览器 storage 不含登录态", object: "browser.auth_storage", operator: "empty" },
    ],
  },

  Setup: {
    description: "登录普通成员并进入可访问页面",
    steps: [
      { id: "browser.clear", title: "清理浏览器状态", object: "browser", operator: "clear_state" },
      { id: "page.goto.auth", title: "打开登录页", object: "page", operator: "goto", params: { path: "/auth" } },
      { id: "fill.email", title: "输入邮箱", object: "page", operator: "fill", params: { label: "Email", valueFrom: "data.email" } },
      {
        id: "fill.password",
        title: "输入密码",
        object: "page",
        operator: "fill",
        params: { label: "Password", exact: true, valueFrom: "data.password" },
      },
      {
        id: "click.sign_in",
        title: "点击登录按钮",
        object: "page",
        operator: "click",
        params: { role: "button", name: "Sign In" },
      },
      {
        id: "session.authenticated",
        title: "等待普通成员 session 已登录",
        object: "auth.session",
        operator: "authenticated",
        params: { emailFrom: "data.email", roleFrom: "data.role", status: "active" },
      },
      { id: "page.goto.bounties", title: "打开悬赏大厅", object: "page", operator: "goto", params: { path: "/bounties" } },
    ],
  },

  S0: {
    description: "普通成员已登录，但没有设置入口和设置页面权限",
    assertions: [
      {
        id: "session.authenticated",
        title: "后端 session 已登录",
        object: "auth.session",
        operator: "authenticated",
        params: { emailFrom: "data.email", roleFrom: "data.role", status: "active" },
      },
      { id: "nav.visible", title: "主导航可见", object: "page", operator: "visible", params: { label: "主导航" } },
      { id: "current_user.visible", title: "当前用户入口可见", object: "page", operator: "visible", params: { label: "当前用户" } },
      { id: "settings.nav.absent", title: "设置入口不可见", object: "page.nav", operator: "item_absent", params: { name: "设置" } },
      { id: "url.bounties", title: "悬赏大厅可访问", object: "page.url", operator: "match", params: { pattern: "/bounties$" } },
      {
        id: "sidebar_background.readable",
        title: "当前成员可读取侧边栏背景配置",
        object: "api.visual_backgrounds.sidebar",
        operator: "readable",
      },
    ],
  },

  Action: {
    description: "普通成员直接访问设置页并尝试调用背景修改接口",
    steps: [
      { id: "page.goto.settings", title: "直接访问设置页", object: "page", operator: "goto", params: { path: "/settings" } },
      {
        id: "api.background_config.attempt_update",
        title: "尝试修改侧边栏背景配置",
        object: "api.visual_background_config",
        operator: "attempt_update",
        params: { saveAs: "configUpdateAttempt" },
      },
      {
        id: "api.background_default.attempt_update",
        title: "尝试设置默认背景",
        object: "api.visual_background_default",
        operator: "attempt_update",
        params: { saveAs: "defaultUpdateAttempt" },
      },
    ],
  },

  S1: {
    description: "普通成员被阻止进入设置页，背景写接口被拒绝且配置未变化",
    assertions: [
      { id: "url.not_settings", title: "不会停留在设置页", object: "page.url", operator: "match", params: { pattern: "/bounties$" } },
      { id: "visual_settings.absent", title: "视觉设置内容不可见", object: "page", operator: "count", params: { text: "视觉设置", count: 0 } },
      {
        id: "login_background_settings.absent",
        title: "登录页面背景设置不可见",
        object: "page",
        operator: "count",
        params: { text: "登录页面背景设置", count: 0 },
      },
      {
        id: "sidebar_background_settings.absent",
        title: "侧边栏背景设置不可见",
        object: "page",
        operator: "count",
        params: { text: "侧边栏背景设置", count: 0 },
      },
      {
        id: "background_config.forbidden",
        title: "背景配置写接口被拒绝",
        object: "api.visual_background_config",
        operator: "forbidden",
        params: { resultFrom: "runtime.configUpdateAttempt" },
      },
      {
        id: "background_default.forbidden",
        title: "默认背景写接口被拒绝或无背景可设置",
        object: "api.visual_background_default",
        operator: "forbidden_or_skipped",
        params: { resultFrom: "runtime.defaultUpdateAttempt" },
      },
      {
        id: "backgrounds.unchanged",
        title: "背景配置没有变化",
        object: "api.visual_backgrounds",
        operator: "unchanged",
        params: { snapshotFrom: "runtime.backgroundSnapshot" },
      },
      {
        id: "session.still_authenticated",
        title: "普通成员仍保持登录",
        object: "auth.session",
        operator: "authenticated",
        params: { emailFrom: "data.email", roleFrom: "data.role", status: "active" },
      },
    ],
  },

  Clean: {
    description: "退出登录并确认背景配置未被修改",
    steps: [
      { id: "auth.logout", title: "退出当前登录态", object: "auth", operator: "logout" },
      { id: "browser.clear", title: "清理浏览器状态", object: "browser", operator: "clear_state" },
      {
        id: "backgrounds.unchanged",
        title: "确认背景配置没有变化",
        object: "api.visual_backgrounds",
        operator: "unchanged",
        params: { snapshotFrom: "runtime.backgroundSnapshot" },
      },
      {
        id: "ory.member_identity.exists",
        title: "普通成员 Ory 身份仍然存在",
        object: "ory.identity",
        operator: "exists",
        params: { emailFrom: "data.email" },
      },
      { id: "db.member.active", title: "预置普通成员账号仍然可用", object: "db.member", operator: "active" },
    ],
  },
} satisfies StateCaseSpec<BackgroundPermissionCaseData>;
