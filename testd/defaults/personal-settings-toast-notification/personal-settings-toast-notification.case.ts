import { STATE_CASE_MODEL, type StateCaseSpec, type StepExecutionMethod, type StepSpec } from "../../_framework/types";
import type { PersonalSettingsToastNotificationCaseData } from "./_support/personal-settings-toast-notification.context";

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

export const personalSettingsToastNotificationCase = {
  id: "defaults.personal-settings.toast-notification",
  title: "17-个人设置Toast通知开关校验",
  model: STATE_CASE_MODEL,
  tags: ["defaults", "personal-settings", "toast", "notification"],
  data: {
    email: "orf-default-page-toast-e2e@orf.local",
    password: "OrfDefaultPageToastE2E!2026",
    name: "ORF 默认页Toast通知用户",
    role: "member",
    status: "active",
    settingsPathPattern: "/settings$",
    toastMessage: "系统通知已发出",
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
    description: "准备 Toast 通知测试用户，并登录进入个人设置页面",
    steps: [
      step("Setup-1", "api", "ory.identity.upsert", "准备邮箱为 `orf-default-page-toast-e2e@orf.local`、使用固定测试密码的个人设置 Toast 通知测试认证身份", "ory.identity", "upsert_password", { emailFrom: "data.email", passwordFrom: "data.password", nameFrom: "data.name", saveAs: "identity" }),
      step("Setup-2", "prisma", "db.user.upsert", "准备邮箱为 `orf-default-page-toast-e2e@orf.local`、姓名为 `ORF 默认页Toast通知用户`、角色为 `member`、状态为 `active` 的个人设置 Toast 通知测试用户", "db.user", "upsert", { emailFrom: "data.email", passwordFrom: "data.password", nameFrom: "data.name", roleFrom: "data.role", statusFrom: "data.status", identityIdFrom: "runtime.identity.id", saveAs: "user" }),
      step("Setup-3", "api", "preferences.default_landing.default", "设置个人设置 Toast 通知测试用户默认进入页面为 首页（默认系统页）", "user.preferences", "reset_default_landing_path_by_email", { emailFrom: "data.email" }),
      step("Setup-4", "api", "preferences.toast.enabled", "设置个人设置 Toast 通知测试用户 Toast 通知偏好为 开启", "user.preferences", "set_toast_enabled_by_email", { emailFrom: "data.email", enabled: true }),
      step("Setup-5", "api", "ory.sessions.revoke", "撤销邮箱为 `orf-default-page-toast-e2e@orf.local` 的个人设置 Toast 通知测试认证身份的残留登录会话", "ory.sessions", "revoke_by_email", { emailFrom: "data.email" }),
      step("Setup-6", "playwright", "browser.clear", "移除当前浏览器中的残留登录态", "browser", "clear_state"),
      step("Setup-7", "playwright", "page.goto.auth", "打开 ORF 登录页", "page", "goto", { path: "/auth" }),
      step("Setup-8", "playwright", "fill.email", "在邮箱输入框输入 `orf-default-page-toast-e2e@orf.local`", "page", "fill", { label: "Email", valueFrom: "data.email" }),
      step("Setup-9", "playwright", "fill.password", "在密码输入框输入个人设置 Toast 通知测试固定密码", "page", "fill", { label: "Password", exact: true, valueFrom: "data.password" }),
      step("Setup-10", "playwright", "click.sign_in", "点击 \"Sign In\" 登录操作", "page.login_form", "submit", { saveAs: "loginResponse" }),
      step("Setup-11", "api", "session.authenticated", "当前会话 应为 邮箱为 `orf-default-page-toast-e2e@orf.local`、角色为 `member`、状态为 `active` 的已登录会话", "auth.session", "authenticated", { emailFrom: "data.email", roleFrom: "data.role", statusFrom: "data.status" }),
      step("Setup-12", "playwright", "page.goto.settings", "打开 个人设置页面", "page", "goto", { path: "/settings" }),
    ],
  },
  S0: {
    description: "测试用户位于个人设置页，Toast 通知开关已开启，系统通知测试操作可用",
    assertions: [
      step("S0-1", "api", "session.authenticated", "当前会话 应为 邮箱为 `orf-default-page-toast-e2e@orf.local`、角色为 `member`、状态为 `active` 的已登录会话", "auth.session", "authenticated", { emailFrom: "data.email", roleFrom: "data.role", statusFrom: "data.status" }),
      step("S0-2", "playwright", "personal_settings.page.visible", "当前页面 应为 个人设置页面", "personal_settings.page", "visible", { patternFrom: "data.settingsPathPattern" }),
      step("S0-3", "playwright", "personal_settings.toast.visible", "个人设置页面的 Toast 通知设置项 应可见", "personal_settings.toast", "visible"),
      step("S0-4", "playwright", "personal_settings.toast.checked", "个人设置页面的 Toast 通知开关 应为 开启", "personal_settings.toast", "checked", { enabled: true }),
      step("S0-5", "playwright", "personal_settings.toast.enabled", "个人设置页面的 Toast 通知开关 应可点击", "personal_settings.toast", "enabled"),
      step("S0-6", "playwright", "personal_settings.system_notification_test.visible", "个人设置页面的系统通知测试操作 应可见", "personal_settings.system_notification_test", "visible"),
      step("S0-7", "playwright", "personal_settings.system_notification_test.enabled", "个人设置页面的系统通知测试操作 应可点击", "personal_settings.system_notification_test", "enabled"),
      step("S0-8", "api", "preferences.toast.enabled", "个人设置 Toast 通知测试用户的 Toast 通知偏好 应为 开启", "user.preferences", "toast_enabled_is", { emailFrom: "data.email", enabled: true }),
    ],
  },
  Action: {
    description: "开启 Toast 时触发系统通知测试，再关闭 Toast 并再次触发系统通知测试",
    steps: [
      step("Action-1", "playwright", "system_notification_test.click.with_toast", "点击 个人设置页面的系统通知测试操作", "personal_settings.system_notification_test", "click", { emailFrom: "data.email", messageFrom: "data.toastMessage", saveAs: "toastEnabledSnapshot" }),
      step("Action-2", "playwright", "toast.switch.off", "在个人设置页面的 Toast 通知开关选择 关闭", "personal_settings.toast", "set_checked", { emailFrom: "data.email", enabled: false, saveAs: "toastDisabledPreferenceSnapshot" }),
      step("Action-3", "playwright", "system_notification_test.click.without_toast", "点击 个人设置页面的系统通知测试操作", "personal_settings.system_notification_test", "click", { emailFrom: "data.email", messageFrom: "data.toastMessage", saveAs: "toastDisabledSnapshot" }),
    ],
  },
  S1: {
    description: "Toast 通知开关分别控制系统通知测试后的页面弹窗式提示信息",
    assertions: [
      step("S1-1", "playwright", "snapshot.toast.visible", "Toast 通知开启时点击系统通知测试后，页面 应显示 弹窗式提示信息", "toast_snapshot", "visible", { snapshotFrom: "runtime.toastEnabledSnapshot" }),
      step("S1-2", "playwright", "snapshot.toast.contains", "Toast 通知开启时点击系统通知测试后，弹窗式提示信息 应包含 `系统通知已发出`", "toast_snapshot", "contains", { snapshotFrom: "runtime.toastEnabledSnapshot", messageFrom: "data.toastMessage" }),
      step("S1-3", "api", "snapshot.toast.preference_enabled", "Toast 通知开启时点击系统通知测试后，个人设置 Toast 通知测试用户的 Toast 通知偏好 应为 开启", "toast_snapshot", "saved_preference", { snapshotFrom: "runtime.toastEnabledSnapshot", enabled: true }),
      step("S1-4", "playwright", "personal_settings.toast.unchecked", "Toast 通知关闭后，个人设置页面的 Toast 通知开关 应为 关闭", "personal_settings.toast", "checked", { enabled: false }),
      step("S1-5", "playwright", "snapshot.toast.hidden", "Toast 通知关闭时点击系统通知测试后，页面 应不显示 弹窗式提示信息", "toast_snapshot", "hidden", { snapshotFrom: "runtime.toastDisabledSnapshot" }),
      step("S1-6", "api", "preferences.toast.disabled", "Toast 通知关闭时点击系统通知测试后，个人设置 Toast 通知测试用户的 Toast 通知偏好 应为 关闭", "user.preferences", "toast_enabled_is", { emailFrom: "data.email", enabled: false }),
      step("S1-7", "api", "session.authenticated", "当前会话 应为 邮箱为 `orf-default-page-toast-e2e@orf.local`、角色为 `member`、状态为 `active` 的已登录会话", "auth.session", "authenticated", { emailFrom: "data.email", roleFrom: "data.role", statusFrom: "data.status" }),
    ],
  },
  Clean: {
    description: "删除测试用户偏好、账号和页面会话状态，恢复未登录基准状态",
    steps: [
      step("Clean-1", "api", "auth.logout", "注销当前登录会话", "auth", "logout"),
      step("Clean-2", "playwright", "page.runtime.stop", "离开当前 ORF 前端页面", "page.runtime", "stop"),
      step("Clean-3", "playwright", "browser.clear", "移除当前浏览器中的残留登录态", "browser", "clear_state"),
      step("Clean-4", "api", "ory.sessions.revoke", "撤销邮箱为 `orf-default-page-toast-e2e@orf.local` 的个人设置 Toast 通知测试认证身份的残留登录会话", "ory.sessions", "revoke_by_email", { emailFrom: "data.email" }),
      step("Clean-5", "api", "preferences.default_landing.reset", "恢复邮箱为 `orf-default-page-toast-e2e@orf.local` 的默认进入页面为 系统默认", "user.preferences", "reset_default_landing_path_by_email", { emailFrom: "data.email" }),
      step("Clean-6", "api", "preferences.toast.reset", "恢复邮箱为 `orf-default-page-toast-e2e@orf.local` 的 Toast 通知偏好为 开启", "user.preferences", "set_toast_enabled_by_email", { emailFrom: "data.email", enabled: true }),
      step("Clean-7", "api", "ory.identity.delete", "删除邮箱为 `orf-default-page-toast-e2e@orf.local` 的个人设置 Toast 通知测试认证身份", "ory.identity", "delete_by_email", { emailFrom: "data.email" }),
      step("Clean-8", "prisma", "db.user.memberships.delete", "删除邮箱为 `orf-default-page-toast-e2e@orf.local` 的个人设置 Toast 通知测试用户的默认团队成员关系", "db.user", "delete_memberships", { emailFrom: "data.email" }),
      step("Clean-9", "prisma", "db.user.delete", "删除邮箱为 `orf-default-page-toast-e2e@orf.local` 的个人设置 Toast 通知测试用户", "db.user", "delete", { emailFrom: "data.email" }),
      step("Clean-10", "api", "ory.identity.absent", "邮箱为 `orf-default-page-toast-e2e@orf.local` 的个人设置 Toast 通知测试认证身份 应不存在", "ory.identity", "absent", { emailFrom: "data.email" }),
      step("Clean-11", "prisma", "db.user.absent", "邮箱为 `orf-default-page-toast-e2e@orf.local` 的个人设置 Toast 通知测试用户 应不存在", "db.user", "absent", { emailFrom: "data.email" }),
    ],
  },
} satisfies StateCaseSpec<PersonalSettingsToastNotificationCaseData>;
