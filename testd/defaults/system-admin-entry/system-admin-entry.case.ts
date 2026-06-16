import { STATE_CASE_MODEL, type StateCaseSpec, type StepExecutionMethod, type StepSpec } from "../../_framework/types";
import type { SystemAdminEntryCaseData } from "./_support/system-admin-entry.context";

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

export const systemAdminEntryCase = {
  id: "defaults.system-admin-entry.role-visibility",
  title: "03-首页系统管理入口按角色展示",
  model: STATE_CASE_MODEL,
  tags: ["defaults", "sidebar", "system-management", "role-visibility"],
  data: {
    admin: {
      email: "orf-default-page-admin-entry-admin-e2e@orf.local",
      password: "OrfDefaultPageAdminEntryAdminE2E!2026",
      name: "ORF Default Page Admin Entry Admin E2E",
      role: "admin",
    },
    member: {
      email: "orf-default-page-admin-entry-member-e2e@orf.local",
      password: "OrfDefaultPageAdminEntryMemberE2E!2026",
      name: "ORF Default Page Admin Entry Member E2E",
      role: "member",
    },
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
    description: "准备管理员和普通成员测试用户，并以管理员身份进入首页",
    steps: [
      step("Setup-1", "api", "ory.admin_identity.upsert", "准备邮箱为 `orf-default-page-admin-entry-admin-e2e@orf.local`、使用固定测试密码的默认系统页管理员测试认证身份", "ory.identity", "upsert_password", { emailFrom: "data.admin.email", passwordFrom: "data.admin.password", nameFrom: "data.admin.name", saveAs: "adminIdentity" }),
      step("Setup-2", "prisma", "db.admin_user.upsert", "准备邮箱为 `orf-default-page-admin-entry-admin-e2e@orf.local`、角色为 `admin`、状态为 `active` 的默认系统页管理员测试用户", "db.user", "upsert", { emailFrom: "data.admin.email", passwordFrom: "data.admin.password", nameFrom: "data.admin.name", roleFrom: "data.admin.role", status: "active", identityIdFrom: "runtime.adminIdentity.id", saveAs: "adminUser" }),
      step("Setup-3", "api", "admin.preferences.default_landing_path.set", "设置默认系统页管理员测试用户默认进入页面为 首页（默认系统页）", "user.preferences", "set_default_landing_path_by_email", { emailFrom: "data.admin.email", pathFrom: "data.defaultLandingPath" }),
      step("Setup-4", "api", "ory.member_identity.upsert", "准备邮箱为 `orf-default-page-admin-entry-member-e2e@orf.local`、使用固定测试密码的默认系统页普通成员测试认证身份", "ory.identity", "upsert_password", { emailFrom: "data.member.email", passwordFrom: "data.member.password", nameFrom: "data.member.name", saveAs: "memberIdentity" }),
      step("Setup-5", "prisma", "db.member_user.upsert", "准备邮箱为 `orf-default-page-admin-entry-member-e2e@orf.local`、角色为 `member`、状态为 `active` 的默认系统页普通成员测试用户", "db.user", "upsert", { emailFrom: "data.member.email", passwordFrom: "data.member.password", nameFrom: "data.member.name", roleFrom: "data.member.role", status: "active", identityIdFrom: "runtime.memberIdentity.id", saveAs: "memberUser" }),
      step("Setup-6", "api", "member.preferences.default_landing_path.set", "设置默认系统页普通成员测试用户默认进入页面为 首页（默认系统页）", "user.preferences", "set_default_landing_path_by_email", { emailFrom: "data.member.email", pathFrom: "data.defaultLandingPath" }),
      step("Setup-7", "api", "ory.admin_sessions.revoke", "撤销邮箱为 `orf-default-page-admin-entry-admin-e2e@orf.local` 的默认系统页管理员测试认证身份的残留登录会话", "ory.sessions", "revoke_by_email", { emailFrom: "data.admin.email" }),
      step("Setup-8", "api", "ory.member_sessions.revoke", "撤销邮箱为 `orf-default-page-admin-entry-member-e2e@orf.local` 的默认系统页普通成员测试认证身份的残留登录会话", "ory.sessions", "revoke_by_email", { emailFrom: "data.member.email" }),
      step("Setup-9", "playwright", "browser.clear", "移除当前浏览器中的残留登录态", "browser", "clear_state"),
      step("Setup-10", "playwright", "page.goto.auth", "打开 ORF 登录页", "page", "goto", { path: "/auth" }),
      step("Setup-11", "playwright", "fill.admin_email", "在邮箱输入框输入 `orf-default-page-admin-entry-admin-e2e@orf.local`", "page", "fill", { label: "Email", valueFrom: "data.admin.email" }),
      step("Setup-12", "playwright", "fill.admin_password", "在密码输入框输入默认系统页管理员测试固定密码", "page", "fill", { label: "Password", exact: true, valueFrom: "data.admin.password" }),
      step("Setup-13", "playwright", "click.sign_in", "点击 \"Sign In\" 登录操作", "page.login_form", "submit", { saveAs: "adminLoginResponse" }),
      step("Setup-14", "api", "session.admin_authenticated", "当前会话 应为 邮箱为 `orf-default-page-admin-entry-admin-e2e@orf.local`、角色为 `admin`、状态为 `active` 的已登录会话", "auth.session", "authenticated", { emailFrom: "data.admin.email", roleFrom: "data.admin.role", status: "active" }),
      step("Setup-15", "playwright", "page.goto.home", "打开 首页（默认系统页）", "page", "goto", { pathFrom: "data.homePath" }),
    ],
  },
  S0: {
    description: "管理员已登录并位于默认系统页，侧边栏基础区域可见",
    assertions: [
      step("S0-1", "api", "session.admin_authenticated", "当前会话 应为 邮箱为 `orf-default-page-admin-entry-admin-e2e@orf.local`、角色为 `admin`、状态为 `active` 的已登录会话", "auth.session", "authenticated", { emailFrom: "data.admin.email", roleFrom: "data.admin.role", status: "active" }),
      step("S0-2", "playwright", "url.home", "当前页面 应为 首页（默认系统页）", "page.url", "match", { pattern: "/dashboard$" }),
      step("S0-3", "playwright", "sidebar.visible", "侧边栏 应可见", "page.sidebar", "visible"),
      step("S0-4", "playwright", "sidebar.entries.visible", "侧边栏的基础菜单入口 应可见", "page.sidebar_base_entries", "visible"),
    ],
  },
  Action: {
    description: "观察管理员系统管理入口，切换为普通成员后再次观察",
    steps: [
      step("Action-1", "playwright", "admin.sidebar.observe", "查看 管理员登录后的 首页（默认系统页）侧边栏", "page.sidebar", "observe_admin_system_entry", { saveAs: "adminSystemEntrySnapshot" }),
      step("Action-2", "playwright", "admin.logout", "注销当前管理员登录会话", "auth", "logout"),
      step("Action-3", "playwright", "browser.clear", "移除当前浏览器中的残留登录态", "browser", "clear_state"),
      step("Action-4", "playwright", "page.goto.auth.member", "打开 ORF 登录页", "page", "goto", { path: "/auth" }),
      step("Action-5", "playwright", "fill.member_email", "在邮箱输入框输入 `orf-default-page-admin-entry-member-e2e@orf.local`", "page", "fill", { label: "Email", valueFrom: "data.member.email" }),
      step("Action-6", "playwright", "fill.member_password", "在密码输入框输入默认系统页普通成员测试固定密码", "page", "fill", { label: "Password", exact: true, valueFrom: "data.member.password" }),
      step("Action-7", "playwright", "click.sign_in.member", "点击 \"Sign In\" 登录操作", "page.login_form", "submit", { saveAs: "memberLoginResponse" }),
      step("Action-8", "api", "session.member_authenticated", "当前会话 应为 邮箱为 `orf-default-page-admin-entry-member-e2e@orf.local`、角色为 `member`、状态为 `active` 的已登录会话", "auth.session", "authenticated", { emailFrom: "data.member.email", roleFrom: "data.member.role", status: "active" }),
      step("Action-9", "playwright", "page.goto.home.member", "打开 首页（默认系统页）", "page", "goto", { pathFrom: "data.homePath" }),
      step("Action-10", "playwright", "member.sidebar.observe", "查看 普通成员登录后的 首页（默认系统页）侧边栏", "page.sidebar", "observe"),
    ],
  },
  S1: {
    description: "系统管理入口按角色正确展示",
    assertions: [
      step("S1-1", "playwright", "admin.system_entry.visible", "管理员登录后的侧边栏的系统管理入口 应可见", "page.sidebar_system_entry_snapshot", "visible", { snapshotFrom: "runtime.adminSystemEntrySnapshot" }),
      step("S1-2", "playwright", "admin.system_entry.enabled", "管理员登录后的侧边栏的系统管理入口 应可点击", "page.sidebar_system_entry_snapshot", "enabled", { snapshotFrom: "runtime.adminSystemEntrySnapshot" }),
      step("S1-3", "playwright", "member.system_entry.hidden", "普通成员登录后的侧边栏的系统管理入口 应不可见", "page.sidebar_system_entry", "hidden"),
      step("S1-4", "api", "session.member_authenticated.after_observe", "当前会话 应仍为 邮箱为 `orf-default-page-admin-entry-member-e2e@orf.local`、角色为 `member`、状态为 `active` 的已登录会话", "auth.session", "authenticated", { emailFrom: "data.member.email", roleFrom: "data.member.role", status: "active" }),
    ],
  },
  Clean: {
    description: "删除管理员和普通成员测试用户并恢复未登录基准状态",
    steps: [
      step("Clean-1", "api", "auth.logout", "注销当前登录会话", "auth", "logout"),
      step("Clean-2", "playwright", "page.runtime.stop", "离开当前 ORF 前端页面", "page.runtime", "stop"),
      step("Clean-3", "playwright", "browser.clear", "移除当前浏览器中的残留登录态", "browser", "clear_state"),
      step("Clean-4", "api", "ory.admin_sessions.revoke", "撤销邮箱为 `orf-default-page-admin-entry-admin-e2e@orf.local` 的默认系统页管理员测试认证身份的残留登录会话", "ory.sessions", "revoke_by_email", { emailFrom: "data.admin.email" }),
      step("Clean-5", "api", "ory.member_sessions.revoke", "撤销邮箱为 `orf-default-page-admin-entry-member-e2e@orf.local` 的默认系统页普通成员测试认证身份的残留登录会话", "ory.sessions", "revoke_by_email", { emailFrom: "data.member.email" }),
      step("Clean-6", "api", "ory.admin_identity.delete", "删除邮箱为 `orf-default-page-admin-entry-admin-e2e@orf.local` 的默认系统页管理员测试认证身份", "ory.identity", "delete_by_email", { emailFrom: "data.admin.email" }),
      step("Clean-7", "api", "ory.member_identity.delete", "删除邮箱为 `orf-default-page-admin-entry-member-e2e@orf.local` 的默认系统页普通成员测试认证身份", "ory.identity", "delete_by_email", { emailFrom: "data.member.email" }),
      step("Clean-8", "api", "admin.preferences.default_landing_path.reset", "恢复邮箱为 `orf-default-page-admin-entry-admin-e2e@orf.local` 的默认进入页面为 系统默认", "user.preferences", "reset_default_landing_path_by_email", { emailFrom: "data.admin.email" }),
      step("Clean-9", "api", "member.preferences.default_landing_path.reset", "恢复邮箱为 `orf-default-page-admin-entry-member-e2e@orf.local` 的默认进入页面为 系统默认", "user.preferences", "reset_default_landing_path_by_email", { emailFrom: "data.member.email" }),
      step("Clean-10", "prisma", "db.admin_user.memberships.delete", "删除邮箱为 `orf-default-page-admin-entry-admin-e2e@orf.local` 的默认系统页管理员测试用户的默认团队成员关系", "db.user", "delete_memberships", { emailFrom: "data.admin.email" }),
      step("Clean-11", "prisma", "db.member_user.memberships.delete", "删除邮箱为 `orf-default-page-admin-entry-member-e2e@orf.local` 的默认系统页普通成员测试用户的默认团队成员关系", "db.user", "delete_memberships", { emailFrom: "data.member.email" }),
      step("Clean-12", "prisma", "db.admin_user.delete", "删除邮箱为 `orf-default-page-admin-entry-admin-e2e@orf.local` 的默认系统页管理员测试用户", "db.user", "delete", { emailFrom: "data.admin.email" }),
      step("Clean-13", "prisma", "db.member_user.delete", "删除邮箱为 `orf-default-page-admin-entry-member-e2e@orf.local` 的默认系统页普通成员测试用户", "db.user", "delete", { emailFrom: "data.member.email" }),
      step("Clean-14", "api", "ory.admin_identity.absent", "邮箱为 `orf-default-page-admin-entry-admin-e2e@orf.local` 的默认系统页管理员测试认证身份 应不存在", "ory.identity", "absent", { emailFrom: "data.admin.email" }),
      step("Clean-15", "api", "ory.member_identity.absent", "邮箱为 `orf-default-page-admin-entry-member-e2e@orf.local` 的默认系统页普通成员测试认证身份 应不存在", "ory.identity", "absent", { emailFrom: "data.member.email" }),
      step("Clean-16", "prisma", "db.admin_user.absent", "邮箱为 `orf-default-page-admin-entry-admin-e2e@orf.local` 的默认系统页管理员测试用户 应不存在", "db.user", "absent", { emailFrom: "data.admin.email" }),
      step("Clean-17", "prisma", "db.member_user.absent", "邮箱为 `orf-default-page-admin-entry-member-e2e@orf.local` 的默认系统页普通成员测试用户 应不存在", "db.user", "absent", { emailFrom: "data.member.email" }),
    ],
  },
} satisfies StateCaseSpec<SystemAdminEntryCaseData>;
