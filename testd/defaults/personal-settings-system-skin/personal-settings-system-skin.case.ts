import { STATE_CASE_MODEL, type StateCaseSpec, type StepExecutionMethod, type StepSpec } from "../../_framework/types";
import type { PersonalSettingsSystemSkinCaseData } from "./_support/personal-settings-system-skin.context";

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

export const personalSettingsSystemSkinCase = {
  id: "defaults.personal-settings.system-skin",
  title: "18-个人设置系统皮肤应用与删除限制",
  model: STATE_CASE_MODEL,
  tags: ["defaults", "personal-settings", "system-skin", "background"],
  data: {
    email: "orf-default-page-system-skin-e2e@orf.local",
    password: "OrfDefaultPageSystemSkinE2E!2026",
    name: "ORF 默认页系统皮肤用户",
    role: "member",
    status: "active",
    settingsPathPattern: "/settings$",
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
    description: "准备系统皮肤测试用户，并登录进入个人设置页面",
    steps: [
      step("Setup-1", "api", "ory.identity.upsert", "准备邮箱为 `orf-default-page-system-skin-e2e@orf.local`、使用固定测试密码的个人设置系统皮肤测试认证身份", "ory.identity", "upsert_password", { emailFrom: "data.email", passwordFrom: "data.password", nameFrom: "data.name", saveAs: "identity" }),
      step("Setup-2", "prisma", "db.user.upsert", "准备邮箱为 `orf-default-page-system-skin-e2e@orf.local`、姓名为 `ORF 默认页系统皮肤用户`、角色为 `member`、状态为 `active` 的个人设置系统皮肤测试用户", "db.user", "upsert", { emailFrom: "data.email", passwordFrom: "data.password", nameFrom: "data.name", roleFrom: "data.role", statusFrom: "data.status", identityIdFrom: "runtime.identity.id", saveAs: "user" }),
      step("Setup-3", "api", "preferences.default_landing.default", "设置个人设置系统皮肤测试用户默认进入页面为 首页（默认系统页）", "user.preferences", "reset_default_landing_path_by_email", { emailFrom: "data.email" }),
      step("Setup-4", "api", "preferences.app_background.default", "设置个人设置系统皮肤测试用户 AppShell 皮肤偏好为 系统默认", "user.preferences", "reset_app_background_by_email", { emailFrom: "data.email" }),
      step("Setup-5", "api", "ory.sessions.revoke", "撤销邮箱为 `orf-default-page-system-skin-e2e@orf.local` 的个人设置系统皮肤测试认证身份的残留登录会话", "ory.sessions", "revoke_by_email", { emailFrom: "data.email" }),
      step("Setup-6", "playwright", "browser.clear", "移除当前浏览器中的残留登录态", "browser", "clear_state"),
      step("Setup-7", "playwright", "page.goto.auth", "打开 ORF 登录页", "page", "goto", { path: "/auth" }),
      step("Setup-8", "playwright", "fill.email", "在邮箱输入框输入 `orf-default-page-system-skin-e2e@orf.local`", "page", "fill", { label: "Email", valueFrom: "data.email" }),
      step("Setup-9", "playwright", "fill.password", "在密码输入框输入个人设置系统皮肤测试固定密码", "page", "fill", { label: "Password", exact: true, valueFrom: "data.password" }),
      step("Setup-10", "playwright", "click.sign_in", "点击 \"Sign In\" 登录操作", "page.login_form", "submit", { saveAs: "loginResponse" }),
      step("Setup-11", "api", "session.authenticated", "当前会话 应为 邮箱为 `orf-default-page-system-skin-e2e@orf.local`、角色为 `member`、状态为 `active` 的已登录会话", "auth.session", "authenticated", { emailFrom: "data.email", roleFrom: "data.role", statusFrom: "data.status" }),
      step("Setup-12", "playwright", "page.goto.settings", "打开 个人设置页面", "page", "goto", { path: "/settings" }),
    ],
  },
  S0: {
    description: "测试用户位于个人设置页，系统皮肤列表和操作入口可见",
    assertions: [
      step("S0-1", "api", "session.authenticated", "当前会话 应为 邮箱为 `orf-default-page-system-skin-e2e@orf.local`、角色为 `member`、状态为 `active` 的已登录会话", "auth.session", "authenticated", { emailFrom: "data.email", roleFrom: "data.role", statusFrom: "data.status" }),
      step("S0-2", "playwright", "personal_settings.page.visible", "当前页面 应为 个人设置页面", "personal_settings.page", "visible", { patternFrom: "data.settingsPathPattern" }),
      step("S0-3", "playwright", "personal_settings.skin_list.visible", "个人设置页面的皮肤列表 应可见", "personal_settings.skin_list", "visible"),
      step("S0-4", "playwright", "personal_settings.skin_list.contains_system", "个人设置页面的皮肤列表 应包含 系统皮肤", "personal_settings.skin_list", "contains_system_skin"),
      step("S0-5", "playwright", "personal_settings.system_skin.selectable", "个人设置页面的系统皮肤卡片 应可选择", "personal_settings.system_skin_card", "selectable"),
      step("S0-6", "playwright", "personal_settings.use_system_default.visible", "个人设置页面的使用系统默认操作 应可见", "personal_settings.use_system_default_background", "visible"),
      step("S0-7", "playwright", "personal_settings.use_selected.visible", "个人设置页面的设为我的背景操作 应可见", "personal_settings.use_selected_background", "visible"),
      step("S0-8", "playwright", "personal_settings.delete_skin.visible", "个人设置页面的删除皮肤操作 应可见", "personal_settings.delete_skin", "visible"),
      step("S0-9", "api", "preferences.app_background.default", "个人设置系统皮肤测试用户的 AppShell 皮肤偏好 应为 系统默认", "user.preferences", "app_background_is_default", { emailFrom: "data.email" }),
    ],
  },
  Action: {
    description: "选择系统皮肤、应用为个人背景、恢复系统默认并再次选择系统皮肤",
    steps: [
      step("Action-1", "playwright", "system_skin.select", "选择 个人设置页面的一个系统皮肤卡片", "personal_settings.system_skin_card", "select", { saveAs: "selectedSystemSkin" }),
      step("Action-2", "playwright", "system_skin.use_selected", "点击 个人设置页面的设为我的背景操作", "personal_settings.use_selected_background", "click", { emailFrom: "data.email", backgroundFrom: "runtime.selectedSystemSkin", saveAs: "appliedSystemSkinSnapshot" }),
      step("Action-3", "playwright", "system_skin.use_default", "点击 个人设置页面的使用系统默认操作", "personal_settings.use_system_default_background", "click", { emailFrom: "data.email", saveAs: "systemDefaultSkinSnapshot" }),
      step("Action-4", "playwright", "system_skin.select_again", "选择 个人设置页面的一个系统皮肤卡片", "personal_settings.system_skin_card", "select", { saveAs: "selectedSystemSkinAfterDefault" }),
    ],
  },
  S1: {
    description: "系统皮肤应用和恢复系统默认均生效，系统内置皮肤不支持删除",
    assertions: [
      step("S1-1", "playwright", "snapshot.applied.page_background", "选择系统皮肤并设为我的背景后，页面背景 应应用所选系统皮肤", "system_skin_snapshot", "page_background_applied", { snapshotFrom: "runtime.appliedSystemSkinSnapshot", backgroundFrom: "runtime.selectedSystemSkin" }),
      step("S1-2", "api", "snapshot.applied.preference", "选择系统皮肤并设为我的背景后，个人设置系统皮肤测试用户的 AppShell 皮肤偏好 应为 所选系统皮肤", "system_skin_snapshot", "preference_is_background", { snapshotFrom: "runtime.appliedSystemSkinSnapshot", backgroundFrom: "runtime.selectedSystemSkin" }),
      step("S1-3", "playwright", "snapshot.default.page_background", "点击使用系统默认后，页面背景 应恢复为 系统默认皮肤", "system_skin_snapshot", "page_background_default", { snapshotFrom: "runtime.systemDefaultSkinSnapshot" }),
      step("S1-4", "api", "snapshot.default.preference", "点击使用系统默认后，个人设置系统皮肤测试用户的 AppShell 皮肤偏好 应为 系统默认", "system_skin_snapshot", "preference_is_default", { snapshotFrom: "runtime.systemDefaultSkinSnapshot" }),
      step("S1-5", "playwright", "personal_settings.delete_skin.disabled", "选择系统皮肤卡片后，个人设置页面的删除皮肤操作 应不可点击", "personal_settings.delete_skin", "disabled"),
      step("S1-6", "api", "system_skin.file.exists", "选择系统皮肤卡片后，个人设置系统皮肤测试用户的系统内置皮肤文件 应仍存在", "system_skin_file", "exists", { backgroundFrom: "runtime.selectedSystemSkinAfterDefault" }),
      step("S1-7", "api", "session.authenticated", "当前会话 应为 邮箱为 `orf-default-page-system-skin-e2e@orf.local`、角色为 `member`、状态为 `active` 的已登录会话", "auth.session", "authenticated", { emailFrom: "data.email", roleFrom: "data.role", statusFrom: "data.status" }),
    ],
  },
  Clean: {
    description: "删除测试用户偏好、账号和页面会话状态，恢复未登录基准状态",
    steps: [
      step("Clean-1", "api", "auth.logout", "注销当前登录会话", "auth", "logout"),
      step("Clean-2", "playwright", "page.runtime.stop", "离开当前 ORF 前端页面", "page.runtime", "stop"),
      step("Clean-3", "playwright", "browser.clear", "移除当前浏览器中的残留登录态", "browser", "clear_state"),
      step("Clean-4", "api", "ory.sessions.revoke", "撤销邮箱为 `orf-default-page-system-skin-e2e@orf.local` 的个人设置系统皮肤测试认证身份的残留登录会话", "ory.sessions", "revoke_by_email", { emailFrom: "data.email" }),
      step("Clean-5", "api", "preferences.default_landing.reset", "恢复邮箱为 `orf-default-page-system-skin-e2e@orf.local` 的默认进入页面为 系统默认", "user.preferences", "reset_default_landing_path_by_email", { emailFrom: "data.email" }),
      step("Clean-6", "api", "preferences.app_background.reset", "恢复邮箱为 `orf-default-page-system-skin-e2e@orf.local` 的 AppShell 皮肤偏好为 系统默认", "user.preferences", "reset_app_background_by_email", { emailFrom: "data.email" }),
      step("Clean-7", "api", "ory.identity.delete", "删除邮箱为 `orf-default-page-system-skin-e2e@orf.local` 的个人设置系统皮肤测试认证身份", "ory.identity", "delete_by_email", { emailFrom: "data.email" }),
      step("Clean-8", "prisma", "db.user.memberships.delete", "删除邮箱为 `orf-default-page-system-skin-e2e@orf.local` 的个人设置系统皮肤测试用户的默认团队成员关系", "db.user", "delete_memberships", { emailFrom: "data.email" }),
      step("Clean-9", "prisma", "db.user.delete", "删除邮箱为 `orf-default-page-system-skin-e2e@orf.local` 的个人设置系统皮肤测试用户", "db.user", "delete", { emailFrom: "data.email" }),
      step("Clean-10", "api", "ory.identity.absent", "邮箱为 `orf-default-page-system-skin-e2e@orf.local` 的个人设置系统皮肤测试认证身份 应不存在", "ory.identity", "absent", { emailFrom: "data.email" }),
      step("Clean-11", "prisma", "db.user.absent", "邮箱为 `orf-default-page-system-skin-e2e@orf.local` 的个人设置系统皮肤测试用户 应不存在", "db.user", "absent", { emailFrom: "data.email" }),
    ],
  },
} satisfies StateCaseSpec<PersonalSettingsSystemSkinCaseData>;
