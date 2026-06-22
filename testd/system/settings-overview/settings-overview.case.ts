import { STATE_CASE_MODEL, type StateCaseSpec, type StepExecutionMethod, type StepSpec } from "../../_framework/types";
import type { SystemSettingsOverviewCaseData } from "./_support/settings-overview.context";

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

export const systemSettingsOverviewCase = {
  id: "system.settings-overview.elements",
  title: "13-系统设置页面基础元素展示",
  model: STATE_CASE_MODEL,
  tags: ["system", "settings", "overview"],
  data: {
    admin: {
      email: "orf-system-settings-overview-admin-e2e@orf.local",
      password: "OrfSystemSettingsOverviewAdminE2E!2026",
      name: "ORF System Settings Overview Admin E2E",
      role: "admin",
    },
    defaultLandingPath: "/bounties",
    settingsPath: "/system/settings",
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
    description: "准备管理员测试用户，并以管理员身份进入系统设置页面",
    steps: [
      step("Setup-1", "api", "ory.admin_identity.upsert", "准备邮箱为 `orf-system-settings-overview-admin-e2e@orf.local`、使用固定测试密码的系统设置页面管理员测试认证身份", "ory.identity", "upsert_password", { emailFrom: "data.admin.email", passwordFrom: "data.admin.password", nameFrom: "data.admin.name", saveAs: "adminIdentity" }),
      step("Setup-2", "prisma", "db.admin_user.upsert", "准备姓名为 \"ORF System Settings Overview Admin E2E\"、邮箱为 `orf-system-settings-overview-admin-e2e@orf.local`、角色为 `admin`、状态为 `active` 的系统设置页面管理员测试用户", "db.user", "upsert", { emailFrom: "data.admin.email", passwordFrom: "data.admin.password", nameFrom: "data.admin.name", roleFrom: "data.admin.role", status: "active", identityIdFrom: "runtime.adminIdentity.id", saveAs: "adminUser" }),
      step("Setup-3", "api", "admin.preferences.default_landing_path.set", "设置系统设置页面管理员测试用户默认进入页面为 首页（默认系统页）", "user.preferences", "set_default_landing_path_by_email", { emailFrom: "data.admin.email", pathFrom: "data.defaultLandingPath" }),
      step("Setup-4", "api", "ory.admin_sessions.revoke", "撤销邮箱为 `orf-system-settings-overview-admin-e2e@orf.local` 的系统设置页面管理员测试认证身份的残留登录会话", "ory.sessions", "revoke_by_email", { emailFrom: "data.admin.email" }),
      step("Setup-5", "playwright", "browser.clear", "移除当前浏览器中的残留登录态", "browser", "clear_state"),
      step("Setup-6", "playwright", "page.goto.auth", "打开 ORF 登录页", "page", "goto", { path: "/auth" }),
      step("Setup-7", "playwright", "fill.admin_email", "在邮箱输入框输入 `orf-system-settings-overview-admin-e2e@orf.local`", "page", "fill", { label: "Email", valueFrom: "data.admin.email" }),
      step("Setup-8", "playwright", "fill.admin_password", "在密码输入框输入系统设置页面管理员测试固定密码", "page", "fill", { label: "Password", exact: true, valueFrom: "data.admin.password" }),
      step("Setup-9", "playwright", "click.sign_in", "点击 \"Sign In\" 登录操作", "page.login_form", "submit", { saveAs: "adminLoginResponse" }),
      step("Setup-10", "api", "session.admin_authenticated", "当前会话 应为 邮箱为 `orf-system-settings-overview-admin-e2e@orf.local`、角色为 `admin`、状态为 `active` 的已登录会话", "auth.session", "authenticated", { emailFrom: "data.admin.email", roleFrom: "data.admin.role", status: "active" }),
      step("Setup-11", "playwright", "page.goto.settings", "打开 系统设置页面", "page", "goto", { pathFrom: "data.settingsPath" }),
    ],
  },
  S0: {
    description: "管理员已登录并位于系统设置页面",
    assertions: [
      step("S0-1", "api", "session.admin_authenticated", "当前会话 应为 邮箱为 `orf-system-settings-overview-admin-e2e@orf.local`、角色为 `admin`、状态为 `active` 的已登录会话", "auth.session", "authenticated", { emailFrom: "data.admin.email", roleFrom: "data.admin.role", status: "active" }),
      step("S0-2", "playwright", "url.settings", "当前页面 应为 系统设置页面", "page.url", "match", { pattern: "/system/settings$" }),
      step("S0-3", "playwright", "settings.title.visible", "系统设置页面标题 应可见", "page.system_settings_title", "visible"),
      step("S0-4", "playwright", "settings.detail.visible", "系统设置页面的设置详情区域 应可见", "page.system_settings_detail", "visible"),
      step("S0-5", "playwright", "settings.description.visible", "系统设置页面的系统级配置说明 应可见", "page.system_settings_description", "visible"),
    ],
  },
  Action: {
    description: "查看系统设置页面",
    steps: [
      step("Action-1", "playwright", "settings.page.observe", "查看 系统设置页面", "page.system_settings_page", "observe"),
    ],
  },
  S1: {
    description: "系统设置页面基础元素和视觉皮肤模块完整展示",
    assertions: [
      step("S1-1", "playwright", "settings.chat_section.visible", "系统设置页面的聊天设置模块 应可见", "page.system_settings_chat_section", "visible"),
      step("S1-2", "playwright", "settings.chat_attachment_limit.visible", "系统设置页面的聊天附件上传上限设置 应可见", "page.system_settings_chat_attachment_limit", "visible"),
      step("S1-3", "playwright", "settings.gitlab_chat_section.visible", "系统设置页面的 GitLab ORF Chat 设置模块 应可见", "page.system_settings_gitlab_chat_section", "visible"),
      step("S1-4", "playwright", "settings.skin_module.visible", "系统设置页面的皮肤设置模块 应可见", "page.system_settings_skin_module", "visible"),
      step("S1-5", "playwright", "settings.login_background.visible", "系统设置页面的登录页背景设置入口 应可见", "page.system_settings_skin_slot", "visible", { label: "登录页" }),
      step("S1-6", "playwright", "settings.appshell_skin.visible", "系统设置页面的 AppShell 皮肤设置入口 应可见", "page.system_settings_appshell_skin_slot", "visible"),
      step("S1-7", "playwright", "settings.background_list.visible", "系统设置页面的背景图片列表 应可见", "page.system_settings_background_list", "visible"),
      step("S1-8", "playwright", "settings.upload.visible", "系统设置页面的上传图片操作 应可见", "page.system_settings_skin_upload", "visible"),
      step("S1-9", "playwright", "settings.save.visible", "系统设置页面的保存皮肤设置操作 应可见", "page.system_settings_skin_save", "visible"),
      step("S1-10", "api", "session.admin_authenticated.after_observe", "当前会话 应仍为 邮箱为 `orf-system-settings-overview-admin-e2e@orf.local`、角色为 `admin`、状态为 `active` 的已登录会话", "auth.session", "authenticated", { emailFrom: "data.admin.email", roleFrom: "data.admin.role", status: "active" }),
    ],
  },
  Clean: {
    description: "删除系统设置页面测试管理员并恢复未登录基准状态",
    steps: [
      step("Clean-1", "api", "auth.logout", "注销当前登录会话", "auth", "logout"),
      step("Clean-2", "playwright", "page.runtime.stop", "离开当前 ORF 前端页面", "page.runtime", "stop"),
      step("Clean-3", "playwright", "browser.clear", "移除当前浏览器中的残留登录态", "browser", "clear_state"),
      step("Clean-4", "api", "ory.admin_sessions.revoke", "撤销邮箱为 `orf-system-settings-overview-admin-e2e@orf.local` 的系统设置页面管理员测试认证身份的残留登录会话", "ory.sessions", "revoke_by_email", { emailFrom: "data.admin.email" }),
      step("Clean-5", "api", "ory.admin_identity.delete", "删除邮箱为 `orf-system-settings-overview-admin-e2e@orf.local` 的系统设置页面管理员测试认证身份", "ory.identity", "delete_by_email", { emailFrom: "data.admin.email" }),
      step("Clean-6", "api", "admin.preferences.default_landing_path.reset", "恢复邮箱为 `orf-system-settings-overview-admin-e2e@orf.local` 的默认进入页面为 系统默认", "user.preferences", "reset_default_landing_path_by_email", { emailFrom: "data.admin.email" }),
      step("Clean-7", "prisma", "db.admin_user.memberships.delete", "删除邮箱为 `orf-system-settings-overview-admin-e2e@orf.local` 的系统设置页面管理员测试用户的默认团队成员关系", "db.user", "delete_memberships", { emailFrom: "data.admin.email" }),
      step("Clean-8", "prisma", "db.admin_user.delete", "删除邮箱为 `orf-system-settings-overview-admin-e2e@orf.local` 的系统设置页面管理员测试用户", "db.user", "delete", { emailFrom: "data.admin.email" }),
      step("Clean-9", "api", "ory.admin_identity.absent", "邮箱为 `orf-system-settings-overview-admin-e2e@orf.local` 的系统设置页面管理员测试认证身份 应不存在", "ory.identity", "absent", { emailFrom: "data.admin.email" }),
      step("Clean-10", "prisma", "db.admin_user.absent", "邮箱为 `orf-system-settings-overview-admin-e2e@orf.local` 的系统设置页面管理员测试用户 应不存在", "db.user", "absent", { emailFrom: "data.admin.email" }),
    ],
  },
} satisfies StateCaseSpec<SystemSettingsOverviewCaseData>;
