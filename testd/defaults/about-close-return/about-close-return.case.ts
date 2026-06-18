import { STATE_CASE_MODEL, type StateCaseSpec, type StepExecutionMethod, type StepSpec } from "../../_framework/types";
import type { AboutCloseReturnCaseData } from "./_support/about-close-return.context";

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

export const aboutCloseReturnCase = {
  id: "defaults.about-close.return",
  title: "23-关于ORF页面关闭返回原页面",
  model: STATE_CASE_MODEL,
  tags: ["defaults", "about", "client-update", "close"],
  data: {
    email: "orf-default-page-about-close-e2e@orf.local",
    password: "OrfDefaultPageAboutCloseE2E!2026",
    name: "ORF 关于关闭用户",
    role: "member",
    status: "active",
    defaultLandingPath: "/bounties",
    homePath: "/dashboard",
  },
  B: {
    description: "系统服务、客户端更新检查 Mock 能力可用，浏览器处于未登录基准状态",
    assertions: [
      step("B-1", "api", "frontend.ready", "前端服务 应可用", "frontend.service", "available"),
      step("B-2", "api", "backend.ready", "后端服务 应可用", "api.health", "ok"),
      step("B-3", "api", "frontend.login_entry.accessible", "前端登录页入口 应可访问", "frontend.login_entry", "accessible"),
      step("B-4", "api", "session.endpoint.accessible", "当前会话查询能力 应可用", "auth.session", "accessible"),
      step("B-5", "prisma", "db.ready", "ORF 数据库 应可连接", "db", "ready"),
      step("B-6", "prisma", "db.schema.current", "ORF 数据库 schema 应为 当前测试版本", "db.schema", "current"),
      step("B-7", "api", "ory.admin_public.ready", "Ory/Kratos 认证服务的管理和公共访问能力 应可用", "ory.admin_public", "ready"),
      step("B-8", "mock", "client_update.mock.available", "客户端更新检查 Mock 能力 应可用", "client_update.mock", "available"),
      step("B-9", "api", "session.unauthenticated", "当前会话 应为 未登录", "auth.session", "unauthenticated"),
      step("B-10", "playwright", "cookie.absent", "当前浏览器 应不存在 Ory 登录会话 cookie", "browser.cookie", "absent"),
      step("B-11", "playwright", "storage.empty", "当前浏览器 应不保留本地登录态", "browser.auth_storage", "empty"),
    ],
  },
  Setup: {
    description: "准备关于 ORF 页面关闭测试用户，登录首页并打开关于与更新弹窗",
    steps: [
      step("Setup-1", "api", "ory.identity.upsert", "准备邮箱为 `orf-default-page-about-close-e2e@orf.local`、使用固定测试密码的关于 ORF 页面关闭测试认证身份", "ory.identity", "upsert_password", { emailFrom: "data.email", passwordFrom: "data.password", nameFrom: "data.name", saveAs: "identity" }),
      step("Setup-2", "prisma", "db.user.upsert", "准备邮箱为 `orf-default-page-about-close-e2e@orf.local`、姓名为 `ORF 关于关闭用户`、角色为 `member`、状态为 `active` 的关于 ORF 页面关闭测试用户", "db.user", "upsert", { emailFrom: "data.email", passwordFrom: "data.password", nameFrom: "data.name", roleFrom: "data.role", statusFrom: "data.status", identityIdFrom: "runtime.identity.id", saveAs: "user" }),
      step("Setup-3", "api", "user.preferences.default_landing_path.set", "设置关于 ORF 页面关闭测试用户默认进入页面为 首页（默认系统页）", "user.preferences", "set_default_landing_path_by_email", { emailFrom: "data.email", pathFrom: "data.defaultLandingPath" }),
      step("Setup-4", "api", "ory.sessions.revoke", "撤销邮箱为 `orf-default-page-about-close-e2e@orf.local` 的关于 ORF 页面关闭测试认证身份的残留登录会话", "ory.sessions", "revoke_by_email", { emailFrom: "data.email" }),
      step("Setup-5", "playwright", "browser.clear", "移除当前浏览器中的残留登录态", "browser", "clear_state"),
      step("Setup-6", "mock", "client_update.mock.latest", "设置客户端更新检查结果为 当前版本已是最新版本", "client_update.mock", "latest_current"),
      step("Setup-7", "playwright", "page.goto.auth", "打开 ORF 登录页", "page", "goto", { path: "/auth" }),
      step("Setup-8", "playwright", "fill.email", "在邮箱输入框输入 `orf-default-page-about-close-e2e@orf.local`", "page", "fill", { label: "Email", valueFrom: "data.email" }),
      step("Setup-9", "playwright", "fill.password", "在密码输入框输入关于 ORF 页面关闭测试固定密码", "page", "fill", { label: "Password", exact: true, valueFrom: "data.password" }),
      step("Setup-10", "playwright", "click.sign_in", "点击 \"Sign In\" 登录操作", "page.login_form", "submit", { saveAs: "loginResponse" }),
      step("Setup-11", "api", "session.authenticated", "当前会话 应为 邮箱为 `orf-default-page-about-close-e2e@orf.local`、角色为 `member`、状态为 `active` 的已登录会话", "auth.session", "authenticated", { emailFrom: "data.email", roleFrom: "data.role", statusFrom: "data.status" }),
      step("Setup-12", "playwright", "page.goto.home", "打开 首页（默认系统页）", "page", "goto", { pathFrom: "data.homePath" }),
      step("Setup-13", "playwright", "sidebar.user_menu.click", "点击 侧边栏底部的用户菜单入口", "sidebar.user_menu", "click"),
      step("Setup-14", "playwright", "user_menu.about.click", "点击 用户菜单中的 \"关于与更新\" 操作", "page.user_menu_item", "click", { name: "关于与更新" }),
    ],
  },
  S0: {
    description: "关于与更新弹窗已打开，关闭操作可用",
    assertions: [
      step("S0-1", "api", "session.authenticated", "当前会话 应为 邮箱为 `orf-default-page-about-close-e2e@orf.local`、角色为 `member`、状态为 `active` 的已登录会话", "auth.session", "authenticated", { emailFrom: "data.email", roleFrom: "data.role", statusFrom: "data.status" }),
      step("S0-2", "playwright", "url.home", "当前页面 应为 首页（默认系统页）", "page.url", "match", { pattern: "/dashboard$" }),
      step("S0-3", "playwright", "about_update_dialog.visible", "关于与更新弹窗 应可见", "about_update_dialog", "visible"),
      step("S0-4", "playwright", "about_update_dialog.kicker", "关于与更新弹窗 应显示 `关于 ORF` 标识", "about_update_dialog", "contains_text", { text: "关于 ORF" }),
      step("S0-5", "playwright", "about_update_dialog.title", "关于与更新弹窗 应显示 `版本与更新` 标题", "about_update_dialog", "contains_heading", { name: "版本与更新" }),
      step("S0-6", "playwright", "about_update_dialog.close.visible", "关于与更新弹窗的关闭操作 应可见", "about_update_dialog.close", "visible"),
      step("S0-7", "playwright", "about_update_dialog.close.enabled", "关于与更新弹窗的关闭操作 应可点击", "about_update_dialog.close", "enabled"),
    ],
  },
  Action: {
    description: "关闭关于与更新弹窗",
    steps: [
      step("Action-1", "playwright", "about_update_dialog.close.click", "点击 关于与更新弹窗的关闭操作", "about_update_dialog.close", "click"),
    ],
  },
  S1: {
    description: "关于与更新弹窗关闭，用户仍停留在首页",
    assertions: [
      step("S1-1", "playwright", "about_update_dialog.hidden", "关于与更新弹窗 应不可见", "about_update_dialog", "hidden"),
      step("S1-2", "playwright", "url.home.after_close", "当前页面 应仍为 首页（默认系统页）", "page.url", "match", { pattern: "/dashboard$" }),
      step("S1-3", "playwright", "sidebar.current_user_name.text", "侧边栏底部的当前用户名 应显示 `ORF 关于关闭用户`", "sidebar.current_user_name", "text", { nameFrom: "data.name" }),
      step("S1-4", "playwright", "sidebar.user_menu.visible", "侧边栏底部的用户菜单入口 应可见", "sidebar.user_menu", "visible"),
      step("S1-5", "api", "session.authenticated.after_close", "当前会话 应仍为 邮箱为 `orf-default-page-about-close-e2e@orf.local`、角色为 `member`、状态为 `active` 的已登录会话", "auth.session", "authenticated", { emailFrom: "data.email", roleFrom: "data.role", statusFrom: "data.status" }),
    ],
  },
  Clean: {
    description: "删除关于 ORF 页面关闭测试用户并恢复未登录基准状态",
    steps: [
      step("Clean-1", "api", "auth.logout", "注销当前登录会话", "auth", "logout"),
      step("Clean-2", "playwright", "page.runtime.stop", "离开当前 ORF 前端页面", "page.runtime", "stop"),
      step("Clean-3", "playwright", "browser.clear", "移除当前浏览器中的残留登录态", "browser", "clear_state"),
      step("Clean-4", "api", "ory.sessions.revoke", "撤销邮箱为 `orf-default-page-about-close-e2e@orf.local` 的关于 ORF 页面关闭测试认证身份的残留登录会话", "ory.sessions", "revoke_by_email", { emailFrom: "data.email" }),
      step("Clean-5", "api", "user.preferences.default_landing_path.reset", "恢复邮箱为 `orf-default-page-about-close-e2e@orf.local` 的默认进入页面为 系统默认", "user.preferences", "reset_default_landing_path_by_email", { emailFrom: "data.email" }),
      step("Clean-6", "api", "ory.identity.delete", "删除邮箱为 `orf-default-page-about-close-e2e@orf.local` 的关于 ORF 页面关闭测试认证身份", "ory.identity", "delete_by_email", { emailFrom: "data.email" }),
      step("Clean-7", "prisma", "db.user.memberships.delete", "删除邮箱为 `orf-default-page-about-close-e2e@orf.local` 的关于 ORF 页面关闭测试用户的默认团队成员关系", "db.user", "delete_memberships", { emailFrom: "data.email" }),
      step("Clean-8", "prisma", "db.user.delete", "删除邮箱为 `orf-default-page-about-close-e2e@orf.local` 的关于 ORF 页面关闭测试用户", "db.user", "delete", { emailFrom: "data.email" }),
      step("Clean-9", "api", "ory.identity.absent", "邮箱为 `orf-default-page-about-close-e2e@orf.local` 的关于 ORF 页面关闭测试认证身份 应不存在", "ory.identity", "absent", { emailFrom: "data.email" }),
      step("Clean-10", "prisma", "db.user.absent", "邮箱为 `orf-default-page-about-close-e2e@orf.local` 的关于 ORF 页面关闭测试用户 应不存在", "db.user", "absent", { emailFrom: "data.email" }),
    ],
  },
} satisfies StateCaseSpec<AboutCloseReturnCaseData>;
