import { STATE_CASE_MODEL, type StateCaseSpec, type StepExecutionMethod, type StepSpec } from "../../_framework/types";
import type { SystemMembersOverviewCaseData } from "./_support/members-overview.context";

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

export const systemMembersOverviewCase = {
  id: "system.members-overview.elements",
  title: "02-成员管理页面基础元素展示",
  model: STATE_CASE_MODEL,
  tags: ["system", "members", "overview"],
  data: {
    admin: {
      email: "orf-system-members-overview-admin-e2e@orf.local",
      password: "OrfSystemMembersOverviewAdminE2E!2026",
      name: "ORF Members Overview Admin E2E",
      role: "admin",
    },
    member: {
      email: "orf-system-members-overview-member-e2e@orf.local",
      name: "ORF Members Overview Member E2E",
      role: "member",
    },
    defaultLandingPath: "/bounties",
    membersPath: "/system/members",
    expectedSearchPlaceholder: "搜索姓名或邮箱",
    minUserCount: 2,
    minRoleCount: 2,
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
    description: "准备管理员和普通成员测试用户，并以管理员身份进入成员管理页面",
    steps: [
      step("Setup-1", "api", "ory.admin_identity.upsert", "准备邮箱为 `orf-system-members-overview-admin-e2e@orf.local`、使用固定测试密码的成员管理页面管理员测试认证身份", "ory.identity", "upsert_password", { emailFrom: "data.admin.email", passwordFrom: "data.admin.password", nameFrom: "data.admin.name", saveAs: "adminIdentity" }),
      step("Setup-2", "prisma", "db.admin_user.upsert", "准备邮箱为 `orf-system-members-overview-admin-e2e@orf.local`、角色为 `admin`、状态为 `active` 的成员管理页面管理员测试用户", "db.user", "upsert", { emailFrom: "data.admin.email", passwordFrom: "data.admin.password", nameFrom: "data.admin.name", roleFrom: "data.admin.role", status: "active", identityIdFrom: "runtime.adminIdentity.id", saveAs: "adminUser" }),
      step("Setup-3", "api", "admin.preferences.default_landing_path.set", "设置成员管理页面管理员测试用户默认进入页面为 首页（默认系统页）", "user.preferences", "set_default_landing_path_by_email", { emailFrom: "data.admin.email", pathFrom: "data.defaultLandingPath" }),
      step("Setup-4", "prisma", "db.member_user.upsert", "准备姓名为 \"ORF Members Overview Member E2E\"、邮箱为 `orf-system-members-overview-member-e2e@orf.local`、角色为 `member`、状态为 `active` 的成员管理页面普通成员测试用户", "db.user", "upsert", { emailFrom: "data.member.email", nameFrom: "data.member.name", roleFrom: "data.member.role", status: "active", saveAs: "memberUser" }),
      step("Setup-5", "api", "ory.admin_sessions.revoke", "撤销邮箱为 `orf-system-members-overview-admin-e2e@orf.local` 的成员管理页面管理员测试认证身份的残留登录会话", "ory.sessions", "revoke_by_email", { emailFrom: "data.admin.email" }),
      step("Setup-6", "playwright", "browser.clear", "移除当前浏览器中的残留登录态", "browser", "clear_state"),
      step("Setup-7", "playwright", "page.goto.auth", "打开 ORF 登录页", "page", "goto", { path: "/auth" }),
      step("Setup-8", "playwright", "fill.admin_email", "在邮箱输入框输入 `orf-system-members-overview-admin-e2e@orf.local`", "page", "fill", { label: "Email", valueFrom: "data.admin.email" }),
      step("Setup-9", "playwright", "fill.admin_password", "在密码输入框输入成员管理页面管理员测试固定密码", "page", "fill", { label: "Password", exact: true, valueFrom: "data.admin.password" }),
      step("Setup-10", "playwright", "click.sign_in", "点击 \"Sign In\" 登录操作", "page.login_form", "submit", { saveAs: "adminLoginResponse" }),
      step("Setup-11", "api", "session.admin_authenticated", "当前会话 应为 邮箱为 `orf-system-members-overview-admin-e2e@orf.local`、角色为 `admin`、状态为 `active` 的已登录会话", "auth.session", "authenticated", { emailFrom: "data.admin.email", roleFrom: "data.admin.role", status: "active" }),
      step("Setup-12", "playwright", "page.goto.members", "打开 成员管理页面", "page", "goto", { pathFrom: "data.membersPath" }),
    ],
  },
  S0: {
    description: "管理员已登录并位于成员管理页面，测试用户数据存在",
    assertions: [
      step("S0-1", "api", "session.admin_authenticated", "当前会话 应为 邮箱为 `orf-system-members-overview-admin-e2e@orf.local`、角色为 `admin`、状态为 `active` 的已登录会话", "auth.session", "authenticated", { emailFrom: "data.admin.email", roleFrom: "data.admin.role", status: "active" }),
      step("S0-2", "playwright", "url.members", "当前页面 应为 成员管理页面", "page.url", "match", { pattern: "/system/members$" }),
      step("S0-3", "playwright", "members.title.visible", "成员管理页面标题 应可见", "page.members_title", "visible"),
      step("S0-4", "prisma", "db.admin_user.exists", "邮箱为 `orf-system-members-overview-admin-e2e@orf.local` 的成员管理页面管理员测试用户 应存在", "db.user", "matches", { emailFrom: "data.admin.email", roleFrom: "data.admin.role", status: "active" }),
      step("S0-5", "prisma", "db.member_user.exists", "邮箱为 `orf-system-members-overview-member-e2e@orf.local` 的成员管理页面普通成员测试用户 应存在", "db.user", "matches", { emailFrom: "data.member.email", roleFrom: "data.member.role", status: "active" }),
    ],
  },
  Action: {
    description: "查看成员管理页面",
    steps: [
      step("Action-1", "playwright", "members.page.observe", "查看 成员管理页面", "page.members_page", "observe"),
    ],
  },
  S1: {
    description: "成员管理页面基础元素完整展示",
    assertions: [
      step("S1-1", "playwright", "members.search.visible", "成员管理页面的搜索框 应可见", "page.members_search", "visible"),
      step("S1-2", "playwright", "members.search.placeholder", "成员管理页面的搜索框占位文案 应为 \"搜索姓名或邮箱\"", "page.members_search", "placeholder", { valueFrom: "data.expectedSearchPlaceholder" }),
      step("S1-3", "playwright", "members.role_filter.visible", "成员管理页面的角色筛选 应可见", "page.members_role_filter", "visible"),
      step("S1-4", "playwright", "members.role_filter.option_all", "成员管理页面的角色筛选 应包含 \"全部角色\" 选项", "page.members_role_filter", "has_option", { label: "全部角色" }),
      step("S1-5", "playwright", "members.role_filter.option_admin", "成员管理页面的角色筛选 应包含 \"管理员\" 选项", "page.members_role_filter", "has_option", { label: "管理员" }),
      step("S1-6", "playwright", "members.role_filter.option_member", "成员管理页面的角色筛选 应包含 \"成员\" 选项", "page.members_role_filter", "has_option", { label: "成员" }),
      step("S1-7", "playwright", "members.list.visible", "成员管理页面的用户列表 应可见", "page.members_list", "visible"),
      step("S1-8", "playwright", "members.list.admin.visible", "成员管理页面的用户列表 应显示 管理员测试用户", "page.members_list", "contains_user", { emailFrom: "data.admin.email", nameFrom: "data.admin.name" }),
      step("S1-9", "playwright", "members.list.member.visible", "成员管理页面的用户列表 应显示 普通成员测试用户", "page.members_list", "contains_user", { emailFrom: "data.member.email", nameFrom: "data.member.name" }),
      step("S1-10", "playwright", "members.add_button.visible", "成员管理页面的新增用户按钮 应可见", "page.members_add_button", "visible"),
      step("S1-11", "playwright", "members.add_button.enabled", "成员管理页面的新增用户按钮 应可点击", "page.members_add_button", "enabled"),
      step("S1-12", "playwright", "members.user_stat.visible", "成员管理页面的用户统计 应可见", "page.members_user_stat", "visible"),
      step("S1-13", "playwright", "members.user_stat.min", "成员管理页面的用户统计数 应大于等于 2", "page.members_user_stat", "at_least", { minFrom: "data.minUserCount" }),
      step("S1-14", "playwright", "members.role_stat.visible", "成员管理页面的角色统计 应可见", "page.members_role_stat", "visible"),
      step("S1-15", "playwright", "members.role_stat.min", "成员管理页面的角色统计数 应大于等于 2", "page.members_role_stat", "at_least", { minFrom: "data.minRoleCount" }),
      step("S1-16", "api", "session.admin_authenticated.after_observe", "当前会话 应仍为 邮箱为 `orf-system-members-overview-admin-e2e@orf.local`、角色为 `admin`、状态为 `active` 的已登录会话", "auth.session", "authenticated", { emailFrom: "data.admin.email", roleFrom: "data.admin.role", status: "active" }),
    ],
  },
  Clean: {
    description: "删除管理员和普通成员测试用户并恢复未登录基准状态",
    steps: [
      step("Clean-1", "api", "auth.logout", "注销当前登录会话", "auth", "logout"),
      step("Clean-2", "playwright", "page.runtime.stop", "离开当前 ORF 前端页面", "page.runtime", "stop"),
      step("Clean-3", "playwright", "browser.clear", "移除当前浏览器中的残留登录态", "browser", "clear_state"),
      step("Clean-4", "api", "ory.admin_sessions.revoke", "撤销邮箱为 `orf-system-members-overview-admin-e2e@orf.local` 的成员管理页面管理员测试认证身份的残留登录会话", "ory.sessions", "revoke_by_email", { emailFrom: "data.admin.email" }),
      step("Clean-5", "api", "ory.admin_identity.delete", "删除邮箱为 `orf-system-members-overview-admin-e2e@orf.local` 的成员管理页面管理员测试认证身份", "ory.identity", "delete_by_email", { emailFrom: "data.admin.email" }),
      step("Clean-6", "api", "admin.preferences.default_landing_path.reset", "恢复邮箱为 `orf-system-members-overview-admin-e2e@orf.local` 的默认进入页面为 系统默认", "user.preferences", "reset_default_landing_path_by_email", { emailFrom: "data.admin.email" }),
      step("Clean-7", "prisma", "db.admin_user.memberships.delete", "删除邮箱为 `orf-system-members-overview-admin-e2e@orf.local` 的成员管理页面管理员测试用户的默认团队成员关系", "db.user", "delete_memberships", { emailFrom: "data.admin.email" }),
      step("Clean-8", "prisma", "db.member_user.memberships.delete", "删除邮箱为 `orf-system-members-overview-member-e2e@orf.local` 的成员管理页面普通成员测试用户的默认团队成员关系", "db.user", "delete_memberships", { emailFrom: "data.member.email" }),
      step("Clean-9", "prisma", "db.admin_user.delete", "删除邮箱为 `orf-system-members-overview-admin-e2e@orf.local` 的成员管理页面管理员测试用户", "db.user", "delete", { emailFrom: "data.admin.email" }),
      step("Clean-10", "prisma", "db.member_user.delete", "删除邮箱为 `orf-system-members-overview-member-e2e@orf.local` 的成员管理页面普通成员测试用户", "db.user", "delete", { emailFrom: "data.member.email" }),
      step("Clean-11", "api", "ory.admin_identity.absent", "邮箱为 `orf-system-members-overview-admin-e2e@orf.local` 的成员管理页面管理员测试认证身份 应不存在", "ory.identity", "absent", { emailFrom: "data.admin.email" }),
      step("Clean-12", "prisma", "db.admin_user.absent", "邮箱为 `orf-system-members-overview-admin-e2e@orf.local` 的成员管理页面管理员测试用户 应不存在", "db.user", "absent", { emailFrom: "data.admin.email" }),
      step("Clean-13", "prisma", "db.member_user.absent", "邮箱为 `orf-system-members-overview-member-e2e@orf.local` 的成员管理页面普通成员测试用户 应不存在", "db.user", "absent", { emailFrom: "data.member.email" }),
    ],
  },
} satisfies StateCaseSpec<SystemMembersOverviewCaseData>;
