import { STATE_CASE_MODEL, type StateCaseSpec, type StepExecutionMethod, type StepSpec } from "../../_framework/types";
import type { SidebarNavCaseData } from "./_support/sidebar-nav.context";

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

export const sidebarNavCase = {
  id: "defaults.sidebar-nav.complete",
  title: "02-首页侧边栏菜单展示与收起展开",
  model: STATE_CASE_MODEL,
  tags: ["defaults", "sidebar", "navigation", "desktop-chrome"],
  data: {
    email: "orf-default-page-sidebar-e2e@orf.local",
    password: "OrfDefaultPageSidebarE2E!2026",
    name: "ORF Default Page Sidebar E2E",
    role: "member",
    defaultLandingPath: "/bounties",
    homePath: "/dashboard",
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
    description: "准备默认系统页测试用户、清理会话并进入首页",
    steps: [
      step("Setup-1", "api", "ory.identity.upsert", "准备邮箱为 `orf-default-page-sidebar-e2e@orf.local`、使用固定测试密码的默认系统页测试认证身份", "ory.identity", "upsert_password", { emailFrom: "data.email", passwordFrom: "data.password", nameFrom: "data.name", saveAs: "identity" }),
      step("Setup-2", "prisma", "db.user.upsert", "准备邮箱为 `orf-default-page-sidebar-e2e@orf.local`、角色为 `member`、状态为 `active` 的默认系统页测试用户", "db.user", "upsert", { emailFrom: "data.email", passwordFrom: "data.password", nameFrom: "data.name", roleFrom: "data.role", status: "active", identityIdFrom: "runtime.identity.id", saveAs: "user" }),
      step("Setup-3", "api", "user.preferences.default_landing_path.set", "设置默认系统页测试用户默认进入页面为 首页（默认系统页）", "user.preferences", "set_default_landing_path_by_email", { emailFrom: "data.email", pathFrom: "data.defaultLandingPath" }),
      step("Setup-4", "api", "ory.sessions.revoke", "撤销邮箱为 `orf-default-page-sidebar-e2e@orf.local` 的默认系统页测试认证身份的残留登录会话", "ory.sessions", "revoke_by_email", { emailFrom: "data.email" }),
      step("Setup-5", "playwright", "browser.clear", "移除当前浏览器中的残留登录态", "browser", "clear_state"),
      step("Setup-6", "playwright", "page.goto.auth", "打开 ORF 登录页", "page", "goto", { path: "/auth" }),
      step("Setup-7", "playwright", "fill.email", "在邮箱输入框输入 `orf-default-page-sidebar-e2e@orf.local`", "page", "fill", { label: "Email", valueFrom: "data.email" }),
      step("Setup-8", "playwright", "fill.password", "在密码输入框输入默认系统页测试固定密码", "page", "fill", { label: "Password", exact: true, valueFrom: "data.password" }),
      step("Setup-9", "playwright", "click.sign_in", "点击 \"Sign In\" 登录操作", "page.login_form", "submit", { saveAs: "loginResponse" }),
      step("Setup-10", "api", "session.authenticated", "当前会话 应为 邮箱为 `orf-default-page-sidebar-e2e@orf.local`、角色为 `member`、状态为 `active` 的已登录会话", "auth.session", "authenticated", { emailFrom: "data.email", roleFrom: "data.role", status: "active" }),
      step("Setup-11", "playwright", "page.goto.home", "打开 首页（默认系统页）", "page", "goto", { pathFrom: "data.homePath" }),
    ],
  },
  S0: {
    description: "已登录用户位于默认系统页，侧边栏基础区域可见",
    assertions: [
      step("S0-1", "api", "session.authenticated", "当前会话 应为 邮箱为 `orf-default-page-sidebar-e2e@orf.local`、角色为 `member`、状态为 `active` 的已登录会话", "auth.session", "authenticated", { emailFrom: "data.email", roleFrom: "data.role", status: "active" }),
      step("S0-2", "playwright", "url.home", "当前页面 应为 首页（默认系统页）", "page.url", "match", { pattern: "/dashboard$" }),
      step("S0-3", "playwright", "nav.visible", "主导航 应可见", "page", "visible", { label: "主导航" }),
      step("S0-4", "playwright", "sidebar.entries.visible", "侧边栏的基础菜单入口 应可见", "page", "visible", { label: "主导航" }),
    ],
  },
  Action: {
    description: "观察默认系统页侧边栏菜单，收起后确认折叠状态，再重新展开",
    steps: [
      step("Action-1", "playwright", "sidebar.observe", "查看 首页（默认系统页）侧边栏菜单", "page.sidebar", "observe"),
      step("Action-2", "playwright", "sidebar.collapse", "收起 首页（默认系统页）侧边栏", "page.sidebar.toggle", "click", { name: "折叠侧边栏" }),
      step("Action-3", "playwright", "sidebar.collapse.confirm", "侧边栏收起后 应处于收起状态", "page.sidebar", "collapsed", { expected: true }),
      step("Action-4", "playwright", "sidebar.expand", "展开 首页（默认系统页）侧边栏", "page.sidebar.toggle", "click", { name: "展开侧边栏" }),
    ],
  },
  S1: {
    description: "侧边栏完整展示基础入口，展开状态恢复正常",
    assertions: [
      step("S1-1", "playwright", "sidebar.bounties.visible", "侧边栏的悬赏大厅入口 应可见", "page.sidebar_item", "visible", { name: "悬赏大厅" }),
      step("S1-2", "playwright", "sidebar.tasks.visible", "侧边栏的我的挑战入口 应可见", "page.sidebar_item", "visible", { name: "我的挑战" }),
      step("S1-3", "playwright", "sidebar.feedback.visible", "侧边栏的反馈入口 应可见", "page.sidebar_item", "visible", { name: "反馈" }),
      step("S1-4", "playwright", "sidebar.reports.visible", "侧边栏的统计入口 应可见", "page.sidebar_item", "visible", { name: "统计" }),
      step("S1-5", "playwright", "sidebar.bounties.enabled", "侧边栏的悬赏大厅入口 应可点击", "page.sidebar_item", "enabled", { name: "悬赏大厅" }),
      step("S1-6", "playwright", "sidebar.tasks.enabled", "侧边栏的我的挑战入口 应可点击", "page.sidebar_item", "enabled", { name: "我的挑战" }),
      step("S1-7", "playwright", "sidebar.feedback.enabled", "侧边栏的反馈入口 应可点击", "page.sidebar_item", "enabled", { name: "反馈" }),
      step("S1-8", "playwright", "sidebar.reports.enabled", "侧边栏的统计入口 应可点击", "page.sidebar_item", "enabled", { name: "统计" }),
      step("S1-9", "playwright", "sidebar.expanded", "侧边栏展开后 应处于展开状态", "page.sidebar", "collapsed", { expected: false }),
      step("S1-10", "playwright", "sidebar.bounties.label.visible", "侧边栏展开后 侧边栏的悬赏大厅入口文本 应可见", "page.sidebar_label", "visible", { name: "悬赏大厅" }),
      step("S1-11", "playwright", "sidebar.tasks.label.visible", "侧边栏展开后 侧边栏的我的挑战入口文本 应可见", "page.sidebar_label", "visible", { name: "我的挑战" }),
      step("S1-12", "playwright", "sidebar.feedback.label.visible", "侧边栏展开后 侧边栏的反馈入口文本 应可见", "page.sidebar_label", "visible", { name: "反馈" }),
      step("S1-13", "playwright", "sidebar.reports.label.visible", "侧边栏展开后 侧边栏的统计入口文本 应可见", "page.sidebar_label", "visible", { name: "统计" }),
      step("S1-14", "api", "session.authenticated.after_observe", "当前会话 应仍为 邮箱为 `orf-default-page-sidebar-e2e@orf.local`、角色为 `member`、状态为 `active` 的已登录会话", "auth.session", "authenticated", { emailFrom: "data.email", roleFrom: "data.role", status: "active" }),
    ],
  },
  Clean: {
    description: "删除默认系统页测试用户并恢复未登录基准状态",
    steps: [
      step("Clean-1", "api", "auth.logout", "注销当前登录会话", "auth", "logout"),
      step("Clean-2", "playwright", "page.runtime.stop", "离开当前 ORF 前端页面", "page.runtime", "stop"),
      step("Clean-3", "playwright", "browser.clear", "移除当前浏览器中的残留登录态", "browser", "clear_state"),
      step("Clean-4", "api", "ory.sessions.revoke", "撤销邮箱为 `orf-default-page-sidebar-e2e@orf.local` 的默认系统页测试认证身份的残留登录会话", "ory.sessions", "revoke_by_email", { emailFrom: "data.email" }),
      step("Clean-5", "api", "ory.identity.delete", "删除邮箱为 `orf-default-page-sidebar-e2e@orf.local` 的默认系统页测试认证身份", "ory.identity", "delete_by_email", { emailFrom: "data.email" }),
      step("Clean-6", "api", "user.preferences.default_landing_path.reset", "恢复邮箱为 `orf-default-page-sidebar-e2e@orf.local` 的默认进入页面为 系统默认", "user.preferences", "reset_default_landing_path_by_email", { emailFrom: "data.email" }),
      step("Clean-7", "prisma", "db.user.memberships.delete", "删除邮箱为 `orf-default-page-sidebar-e2e@orf.local` 的默认系统页测试用户的默认团队成员关系", "db.user", "delete_memberships", { emailFrom: "data.email" }),
      step("Clean-8", "prisma", "db.user.delete", "删除邮箱为 `orf-default-page-sidebar-e2e@orf.local` 的默认系统页测试用户", "db.user", "delete", { emailFrom: "data.email" }),
      step("Clean-9", "api", "ory.identity.absent", "邮箱为 `orf-default-page-sidebar-e2e@orf.local` 的默认系统页测试认证身份 应不存在", "ory.identity", "absent", { emailFrom: "data.email" }),
      step("Clean-10", "prisma", "db.user.absent", "邮箱为 `orf-default-page-sidebar-e2e@orf.local` 的默认系统页测试用户 应不存在", "db.user", "absent", { emailFrom: "data.email" }),
    ],
  },
} satisfies StateCaseSpec<SidebarNavCaseData>;
