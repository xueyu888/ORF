import { STATE_CASE_MODEL, type StateCaseSpec, type StepExecutionMethod, type StepSpec } from "../../_framework/types";
import type { AboutVersionInfoCaseData } from "./_support/about-version-info.context";

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

export const aboutVersionInfoCase = {
  id: "defaults.about-version.info",
  title: "21-关于ORF版本信息展示",
  model: STATE_CASE_MODEL,
  tags: ["defaults", "about", "client-update", "version"],
  data: {
    email: "orf-default-page-about-version-e2e@orf.local",
    password: "OrfDefaultPageAboutVersionE2E!2026",
    name: "ORF 关于版本用户",
    role: "member",
    status: "active",
    defaultLandingPath: "/bounties",
    homePath: "/dashboard",
  },
  B: {
    description: "系统服务、客户端更新检查能力可用，浏览器处于未登录基准状态",
    assertions: [
      step("B-1", "api", "frontend.ready", "前端服务 应可用", "frontend.service", "available"),
      step("B-2", "api", "backend.ready", "后端服务 应可用", "api.health", "ok"),
      step("B-3", "api", "frontend.login_entry.accessible", "前端登录页入口 应可访问", "frontend.login_entry", "accessible"),
      step("B-4", "api", "session.endpoint.accessible", "当前会话查询能力 应可用", "auth.session", "accessible"),
      step("B-5", "prisma", "db.ready", "ORF 数据库 应可连接", "db", "ready"),
      step("B-6", "prisma", "db.schema.current", "ORF 数据库 schema 应为 当前测试版本", "db.schema", "current"),
      step("B-7", "api", "ory.admin_public.ready", "Ory/Kratos 认证服务的管理和公共访问能力 应可用", "ory.admin_public", "ready"),
      step("B-8", "api", "client_update.check.available", "客户端更新检查能力 应可用", "client_update.check", "available"),
      step("B-9", "api", "session.unauthenticated", "当前会话 应为 未登录", "auth.session", "unauthenticated"),
      step("B-10", "playwright", "cookie.absent", "当前浏览器 应不存在 Ory 登录会话 cookie", "browser.cookie", "absent"),
      step("B-11", "playwright", "storage.empty", "当前浏览器 应不保留本地登录态", "browser.auth_storage", "empty"),
    ],
  },
  Setup: {
    description: "准备关于 ORF 版本信息测试用户并登录首页",
    steps: [
      step("Setup-1", "api", "ory.identity.upsert", "准备邮箱为 `orf-default-page-about-version-e2e@orf.local`、使用固定测试密码的关于 ORF 版本信息测试认证身份", "ory.identity", "upsert_password", { emailFrom: "data.email", passwordFrom: "data.password", nameFrom: "data.name", saveAs: "identity" }),
      step("Setup-2", "prisma", "db.user.upsert", "准备邮箱为 `orf-default-page-about-version-e2e@orf.local`、姓名为 `ORF 关于版本用户`、角色为 `member`、状态为 `active` 的关于 ORF 版本信息测试用户", "db.user", "upsert", { emailFrom: "data.email", passwordFrom: "data.password", nameFrom: "data.name", roleFrom: "data.role", statusFrom: "data.status", identityIdFrom: "runtime.identity.id", saveAs: "user" }),
      step("Setup-3", "api", "user.preferences.default_landing_path.set", "设置关于 ORF 版本信息测试用户默认进入页面为 首页（默认系统页）", "user.preferences", "set_default_landing_path_by_email", { emailFrom: "data.email", pathFrom: "data.defaultLandingPath" }),
      step("Setup-4", "api", "ory.sessions.revoke", "撤销邮箱为 `orf-default-page-about-version-e2e@orf.local` 的关于 ORF 版本信息测试认证身份的残留登录会话", "ory.sessions", "revoke_by_email", { emailFrom: "data.email" }),
      step("Setup-5", "playwright", "browser.clear", "移除当前浏览器中的残留登录态", "browser", "clear_state"),
      step("Setup-6", "playwright", "page.goto.auth", "打开 ORF 登录页", "page", "goto", { path: "/auth" }),
      step("Setup-7", "playwright", "fill.email", "在邮箱输入框输入 `orf-default-page-about-version-e2e@orf.local`", "page", "fill", { label: "Email", valueFrom: "data.email" }),
      step("Setup-8", "playwright", "fill.password", "在密码输入框输入关于 ORF 版本信息测试固定密码", "page", "fill", { label: "Password", exact: true, valueFrom: "data.password" }),
      step("Setup-9", "playwright", "click.sign_in", "点击 \"Sign In\" 登录操作", "page.login_form", "submit", { saveAs: "loginResponse" }),
      step("Setup-10", "api", "session.authenticated", "当前会话 应为 邮箱为 `orf-default-page-about-version-e2e@orf.local`、角色为 `member`、状态为 `active` 的已登录会话", "auth.session", "authenticated", { emailFrom: "data.email", roleFrom: "data.role", statusFrom: "data.status" }),
      step("Setup-11", "playwright", "page.goto.home", "打开 首页（默认系统页）", "page", "goto", { pathFrom: "data.homePath" }),
    ],
  },
  S0: {
    description: "测试用户已登录首页，用户菜单可打开且关于与更新弹窗未展示",
    assertions: [
      step("S0-1", "api", "session.authenticated", "当前会话 应为 邮箱为 `orf-default-page-about-version-e2e@orf.local`、角色为 `member`、状态为 `active` 的已登录会话", "auth.session", "authenticated", { emailFrom: "data.email", roleFrom: "data.role", statusFrom: "data.status" }),
      step("S0-2", "playwright", "url.home", "当前页面 应为 首页（默认系统页）", "page.url", "match", { pattern: "/dashboard$" }),
      step("S0-3", "playwright", "sidebar.current_user_name.text", "侧边栏底部的当前用户名 应显示 `ORF 关于版本用户`", "sidebar.current_user_name", "text", { nameFrom: "data.name" }),
      step("S0-4", "playwright", "sidebar.user_menu.visible", "侧边栏底部的用户菜单入口 应可见", "sidebar.user_menu", "visible"),
      step("S0-5", "playwright", "sidebar.user_menu.enabled", "侧边栏底部的用户菜单入口 应可点击", "sidebar.user_menu", "enabled"),
      step("S0-6", "playwright", "about_update_dialog.hidden", "关于与更新弹窗 应不可见", "about_update_dialog", "hidden"),
    ],
  },
  Action: {
    description: "通过用户菜单打开关于与更新弹窗",
    steps: [
      step("Action-1", "playwright", "sidebar.user_menu.click", "点击 侧边栏底部的用户菜单入口", "sidebar.user_menu", "click"),
      step("Action-2", "playwright", "user_menu.visible", "用户菜单 应可见", "user_menu", "visible"),
      step("Action-3", "playwright", "user_menu.about.visible", "用户菜单中的 \"关于与更新\" 操作 应可见", "user_menu.item", "visible", { name: "关于与更新" }),
      step("Action-4", "playwright", "user_menu.about.enabled", "用户菜单中的 \"关于与更新\" 操作 应可点击", "user_menu.item", "enabled", { name: "关于与更新" }),
      step("Action-5", "playwright", "user_menu.about.click", "点击 用户菜单中的 \"关于与更新\" 操作", "page.user_menu_item", "click", { name: "关于与更新" }),
    ],
  },
  S1: {
    description: "关于与更新弹窗完整展示版本信息、安装包信息和发布说明入口",
    assertions: [
      step("S1-1", "playwright", "about_update_dialog.visible", "关于与更新弹窗 应可见", "about_update_dialog", "visible"),
      step("S1-2", "playwright", "about_update_dialog.kicker", "关于与更新弹窗 应显示 `关于 ORF` 标识", "about_update_dialog", "contains_text", { text: "关于 ORF" }),
      step("S1-3", "playwright", "about_update_dialog.title", "关于与更新弹窗 应显示 `版本与更新` 标题", "about_update_dialog", "contains_heading", { name: "版本与更新" }),
      step("S1-4", "playwright", "about_update_dialog.current_version.visible", "关于与更新弹窗的当前版本信息 应可见", "about_update_dialog.fact", "visible", { label: "当前版本" }),
      step("S1-5", "playwright", "about_update_dialog.client.visible", "关于与更新弹窗的客户端信息 应可见", "about_update_dialog.fact", "visible", { label: "客户端" }),
      step("S1-6", "playwright", "about_update_dialog.latest_version.visible", "关于与更新弹窗的最新版本信息 应可见", "about_update_dialog.fact", "visible", { label: "最新版本" }),
      step("S1-7", "playwright", "about_update_dialog.published_at.visible", "关于与更新弹窗的发布时间信息 应可见", "about_update_dialog.fact", "visible", { label: "发布时间" }),
      step("S1-8", "playwright", "about_update_dialog.service_url.visible", "关于与更新弹窗的服务地址信息 应可见", "about_update_dialog.fact", "visible", { label: "服务地址" }),
      step("S1-9", "playwright", "about_update_dialog.installer.visible", "关于与更新弹窗的安装包信息 应可见", "about_update_dialog.fact", "visible", { label: "安装包" }),
      step("S1-10", "playwright", "about_update_dialog.check_update.visible", "关于与更新弹窗的检查更新操作 应可见", "about_update_dialog.action", "visible", { name: "检查更新" }),
      step("S1-11", "playwright", "about_update_dialog.release_notes.visible", "关于与更新弹窗的发布说明操作 应可见", "about_update_dialog.action", "visible", { name: "发布说明" }),
      step("S1-12", "playwright", "about_update_dialog.release_notes.click", "点击 关于与更新弹窗的发布说明操作", "about_update_dialog.release_notes", "click", { saveAs: "releaseNotes" }),
      step("S1-13", "playwright", "release_notes.accessible", "当前版本发布说明 应可访问", "release_notes", "accessible", { snapshotFrom: "runtime.releaseNotes" }),
    ],
  },
  Clean: {
    description: "删除关于 ORF 版本信息测试用户并恢复未登录基准状态",
    steps: [
      step("Clean-1", "api", "auth.logout", "注销当前登录会话", "auth", "logout"),
      step("Clean-2", "playwright", "page.runtime.stop", "离开当前 ORF 前端页面", "page.runtime", "stop"),
      step("Clean-3", "playwright", "browser.clear", "移除当前浏览器中的残留登录态", "browser", "clear_state"),
      step("Clean-4", "api", "ory.sessions.revoke", "撤销邮箱为 `orf-default-page-about-version-e2e@orf.local` 的关于 ORF 版本信息测试认证身份的残留登录会话", "ory.sessions", "revoke_by_email", { emailFrom: "data.email" }),
      step("Clean-5", "api", "user.preferences.default_landing_path.reset", "恢复邮箱为 `orf-default-page-about-version-e2e@orf.local` 的默认进入页面为 系统默认", "user.preferences", "reset_default_landing_path_by_email", { emailFrom: "data.email" }),
      step("Clean-6", "api", "ory.identity.delete", "删除邮箱为 `orf-default-page-about-version-e2e@orf.local` 的关于 ORF 版本信息测试认证身份", "ory.identity", "delete_by_email", { emailFrom: "data.email" }),
      step("Clean-7", "prisma", "db.user.memberships.delete", "删除邮箱为 `orf-default-page-about-version-e2e@orf.local` 的关于 ORF 版本信息测试用户的默认团队成员关系", "db.user", "delete_memberships", { emailFrom: "data.email" }),
      step("Clean-8", "prisma", "db.user.delete", "删除邮箱为 `orf-default-page-about-version-e2e@orf.local` 的关于 ORF 版本信息测试用户", "db.user", "delete", { emailFrom: "data.email" }),
      step("Clean-9", "api", "ory.identity.absent", "邮箱为 `orf-default-page-about-version-e2e@orf.local` 的关于 ORF 版本信息测试认证身份 应不存在", "ory.identity", "absent", { emailFrom: "data.email" }),
      step("Clean-10", "prisma", "db.user.absent", "邮箱为 `orf-default-page-about-version-e2e@orf.local` 的关于 ORF 版本信息测试用户 应不存在", "db.user", "absent", { emailFrom: "data.email" }),
    ],
  },
} satisfies StateCaseSpec<AboutVersionInfoCaseData>;
