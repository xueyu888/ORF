import { STATE_CASE_MODEL, type StateCaseSpec, type StepExecutionMethod, type StepSpec } from "../../_framework/types";
import type { AboutUpdateStatusCaseData } from "./_support/about-update-status.context";

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

export const aboutUpdateStatusCase = {
  id: "defaults.about-update.status",
  title: "22-关于ORF检查更新与安装状态",
  model: STATE_CASE_MODEL,
  tags: ["defaults", "about", "client-update", "status"],
  data: {
    currentVersion: "0.0.0",
    email: "orf-default-page-update-status-e2e@orf.local",
    homePath: "/dashboard",
    latestVersion: "0.0.0",
    name: "ORF 检查更新用户",
    newVersion: "0.0.1",
    password: "OrfDefaultPageUpdateStatusE2E!2026",
    role: "member",
    status: "active",
  },
  B: {
    description: "系统服务和客户端更新检查 Mock 能力可用，浏览器处于未登录基准状态",
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
    description: "准备关于 ORF 检查更新测试用户、Mock 更新结果，并打开关于与更新弹窗",
    steps: [
      step("Setup-1", "api", "ory.identity.upsert", "准备邮箱为 `orf-default-page-update-status-e2e@orf.local`、使用固定测试密码的关于 ORF 检查更新测试认证身份", "ory.identity", "upsert_password", { emailFrom: "data.email", passwordFrom: "data.password", nameFrom: "data.name", saveAs: "identity" }),
      step("Setup-2", "prisma", "db.user.upsert", "准备邮箱为 `orf-default-page-update-status-e2e@orf.local`、姓名为 `ORF 检查更新用户`、角色为 `member`、状态为 `active` 的关于 ORF 检查更新测试用户", "db.user", "upsert", { emailFrom: "data.email", passwordFrom: "data.password", nameFrom: "data.name", roleFrom: "data.role", statusFrom: "data.status", identityIdFrom: "runtime.identity.id", saveAs: "user" }),
      step("Setup-3", "api", "user.preferences.default_landing_path.set", "设置关于 ORF 检查更新测试用户默认进入页面为 首页（默认系统页）", "user.preferences", "set_default_landing_path_by_email", { emailFrom: "data.email", path: "/bounties" }),
      step("Setup-4", "api", "ory.sessions.revoke", "撤销邮箱为 `orf-default-page-update-status-e2e@orf.local` 的关于 ORF 检查更新测试认证身份的残留登录会话", "ory.sessions", "revoke_by_email", { emailFrom: "data.email" }),
      step("Setup-5", "playwright", "browser.clear", "移除当前浏览器中的残留登录态", "browser", "clear_state"),
      step("Setup-6", "mock", "client_update.runtime.current_version", "设置客户端当前版本为 `0.0.0`", "client_update.runtime", "set_current_version", { versionFrom: "data.currentVersion" }),
      step("Setup-7", "mock", "client_update.result.latest", "设置客户端更新检查结果为 当前版本已是最新版本", "client_update.mock", "set_latest_result", { versionFrom: "data.latestVersion" }),
      step("Setup-8", "playwright", "page.goto.auth", "打开 ORF 登录页", "page", "goto", { path: "/auth" }),
      step("Setup-9", "playwright", "fill.email", "在邮箱输入框输入 `orf-default-page-update-status-e2e@orf.local`", "page", "fill", { label: "Email", valueFrom: "data.email" }),
      step("Setup-10", "playwright", "fill.password", "在密码输入框输入关于 ORF 检查更新测试固定密码", "page", "fill", { label: "Password", exact: true, valueFrom: "data.password" }),
      step("Setup-11", "playwright", "click.sign_in", "点击 \"Sign In\" 登录操作", "page.login_form", "submit", { saveAs: "loginResponse" }),
      step("Setup-12", "api", "session.authenticated", "当前会话 应为 邮箱为 `orf-default-page-update-status-e2e@orf.local`、角色为 `member`、状态为 `active` 的已登录会话", "auth.session", "authenticated", { emailFrom: "data.email", roleFrom: "data.role", statusFrom: "data.status" }),
      step("Setup-13", "playwright", "page.goto.home", "打开 首页（默认系统页）", "page", "goto", { pathFrom: "data.homePath" }),
      step("Setup-14", "playwright", "sidebar.user_menu.click", "点击 侧边栏底部的用户菜单入口", "sidebar.user_menu", "click"),
      step("Setup-15", "playwright", "user_menu.about.click", "点击 用户菜单中的 \"关于与更新\" 操作", "page.user_menu_item", "click", { name: "关于与更新" }),
    ],
  },
  S0: {
    description: "测试用户位于首页，关于与更新弹窗已打开且初始为无需安装状态",
    assertions: [
      step("S0-1", "api", "session.authenticated", "当前会话 应为 邮箱为 `orf-default-page-update-status-e2e@orf.local`、角色为 `member`、状态为 `active` 的已登录会话", "auth.session", "authenticated", { emailFrom: "data.email", roleFrom: "data.role", statusFrom: "data.status" }),
      step("S0-2", "playwright", "url.home", "当前页面 应为 首页（默认系统页）", "page.url", "match", { pattern: "/dashboard$" }),
      step("S0-3", "playwright", "about_update_dialog.visible", "关于与更新弹窗 应可见", "about_update_dialog", "visible"),
      step("S0-4", "playwright", "about_update_dialog.title", "关于与更新弹窗 应显示 `版本与更新` 标题", "about_update_dialog", "contains_heading", { name: "版本与更新" }),
      step("S0-5", "playwright", "about_update_dialog.check_update.visible", "关于与更新弹窗的检查更新操作 应可见", "about_update_dialog.action", "visible", { name: "检查更新" }),
      step("S0-6", "playwright", "about_update_dialog.check_update.enabled", "关于与更新弹窗的检查更新操作 应可点击", "about_update_dialog.action", "enabled", { name: "检查更新" }),
      step("S0-7", "playwright", "about_update_dialog.install.not_needed", "关于与更新弹窗的安装操作 应显示 无需安装", "about_update_dialog.install_action", "text", { text: "无需安装" }),
    ],
  },
  Action: {
    description: "先检查当前最新版本，再切换 Mock 为新版本并再次检查",
    steps: [
      step("Action-1", "playwright", "about_update_dialog.check_update.first", "点击 关于与更新弹窗的检查更新操作", "about_update_dialog.check_update", "click", { saveAs: "latestCheck" }),
      step("Action-2", "mock", "client_update.result.new_version", "设置客户端更新检查结果为 存在新版本且包含当前客户端可用安装包", "client_update.mock", "set_new_version_result", { versionFrom: "data.newVersion" }),
      step("Action-3", "playwright", "about_update_dialog.check_update.second", "点击 关于与更新弹窗的检查更新操作", "about_update_dialog.check_update", "click", { saveAs: "newVersionCheck" }),
    ],
  },
  S1: {
    description: "关于与更新弹窗分别展示最新版本无需安装状态和新版本可安装状态",
    assertions: [
      step("S1-1", "playwright", "snapshot.latest.summary", "第一次检查更新后，关于与更新弹窗 应显示 当前已经是最新版本", "update_check_snapshot", "summary_contains", { snapshotFrom: "runtime.latestCheck", text: "当前已经是最新版本" }),
      step("S1-2", "playwright", "snapshot.latest.install.not_needed", "第一次检查更新后，关于与更新弹窗的安装操作 应显示 无需安装", "update_check_snapshot", "install_action_text", { snapshotFrom: "runtime.latestCheck", text: "无需安装" }),
      step("S1-3", "playwright", "snapshot.latest.version", "第一次检查更新后，关于与更新弹窗的最新版本信息 应显示 `0.0.0`", "update_check_snapshot", "fact_text", { snapshotFrom: "runtime.latestCheck", label: "最新版本", textFrom: "data.latestVersion" }),
      step("S1-4", "playwright", "snapshot.new_version.summary", "第二次检查更新后，关于与更新弹窗 应显示 发现 ORF 客户端新版本", "update_check_snapshot", "summary_contains", { snapshotFrom: "runtime.newVersionCheck", text: "发现 ORF 客户端" }),
      step("S1-5", "playwright", "snapshot.new_version.version", "第二次检查更新后，关于与更新弹窗的最新版本信息 应显示 `0.0.1`", "update_check_snapshot", "fact_text", { snapshotFrom: "runtime.newVersionCheck", label: "最新版本", textFrom: "data.newVersion" }),
      step("S1-6", "playwright", "snapshot.new_version.installer", "第二次检查更新后，关于与更新弹窗的安装包信息 应显示 可用安装包", "update_check_snapshot", "fact_contains", { snapshotFrom: "runtime.newVersionCheck", label: "安装包", text: "ORF-Setup-0.0.1.exe" }),
      step("S1-7", "playwright", "snapshot.new_version.install.download", "第二次检查更新后，关于与更新弹窗的安装操作 应显示 下载并安装", "update_check_snapshot", "install_action_text", { snapshotFrom: "runtime.newVersionCheck", text: "下载并安装" }),
      step("S1-8", "playwright", "about_update_dialog.install.enabled", "第二次检查更新后，关于与更新弹窗的安装操作 应可点击", "about_update_dialog.install_action", "enabled"),
      step("S1-9", "api", "session.authenticated.after_check", "当前会话 应仍为 邮箱为 `orf-default-page-update-status-e2e@orf.local`、角色为 `member`、状态为 `active` 的已登录会话", "auth.session", "authenticated", { emailFrom: "data.email", roleFrom: "data.role", statusFrom: "data.status" }),
    ],
  },
  Clean: {
    description: "删除关于 ORF 检查更新测试用户并恢复未登录基准状态",
    steps: [
      step("Clean-1", "api", "auth.logout", "注销当前登录会话", "auth", "logout"),
      step("Clean-2", "playwright", "page.runtime.stop", "离开当前 ORF 前端页面", "page.runtime", "stop"),
      step("Clean-3", "playwright", "browser.clear", "移除当前浏览器中的残留登录态", "browser", "clear_state"),
      step("Clean-4", "api", "ory.sessions.revoke", "撤销邮箱为 `orf-default-page-update-status-e2e@orf.local` 的关于 ORF 检查更新测试认证身份的残留登录会话", "ory.sessions", "revoke_by_email", { emailFrom: "data.email" }),
      step("Clean-5", "api", "user.preferences.default_landing_path.reset", "恢复邮箱为 `orf-default-page-update-status-e2e@orf.local` 的默认进入页面为 系统默认", "user.preferences", "reset_default_landing_path_by_email", { emailFrom: "data.email" }),
      step("Clean-6", "api", "ory.identity.delete", "删除邮箱为 `orf-default-page-update-status-e2e@orf.local` 的关于 ORF 检查更新测试认证身份", "ory.identity", "delete_by_email", { emailFrom: "data.email" }),
      step("Clean-7", "prisma", "db.user.memberships.delete", "删除邮箱为 `orf-default-page-update-status-e2e@orf.local` 的关于 ORF 检查更新测试用户的默认团队成员关系", "db.user", "delete_memberships", { emailFrom: "data.email" }),
      step("Clean-8", "prisma", "db.user.delete", "删除邮箱为 `orf-default-page-update-status-e2e@orf.local` 的关于 ORF 检查更新测试用户", "db.user", "delete", { emailFrom: "data.email" }),
      step("Clean-9", "api", "ory.identity.absent", "邮箱为 `orf-default-page-update-status-e2e@orf.local` 的关于 ORF 检查更新测试认证身份 应不存在", "ory.identity", "absent", { emailFrom: "data.email" }),
      step("Clean-10", "prisma", "db.user.absent", "邮箱为 `orf-default-page-update-status-e2e@orf.local` 的关于 ORF 检查更新测试用户 应不存在", "db.user", "absent", { emailFrom: "data.email" }),
    ],
  },
} satisfies StateCaseSpec<AboutUpdateStatusCaseData>;
