import { STATE_CASE_MODEL, type StateCaseSpec, type StepExecutionMethod, type StepSpec } from "../../_framework/types";
import type { PersonalSettingsChatThemeCaseData } from "./_support/personal-settings-chat-theme.context";

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

export const personalSettingsChatThemeCase = {
  id: "defaults.personal-settings.chat-theme",
  title: "16-个人设置聊天界面主题切换",
  model: STATE_CASE_MODEL,
  tags: ["defaults", "personal-settings", "chat-theme"],
  data: {
    email: "orf-default-page-chat-theme-e2e@orf.local",
    password: "OrfDefaultPageChatThemeE2E!2026",
    name: "ORF 默认页聊天主题用户",
    role: "member",
    status: "active",
    settingsPathPattern: "/settings$",
    chatPathPattern: "/chat(?:/.*)?$",
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
    description: "准备聊天主题测试用户，并登录进入个人设置页面",
    steps: [
      step("Setup-1", "api", "ory.identity.upsert", "准备邮箱为 `orf-default-page-chat-theme-e2e@orf.local`、使用固定测试密码的个人设置聊天主题测试认证身份", "ory.identity", "upsert_password", { emailFrom: "data.email", passwordFrom: "data.password", nameFrom: "data.name", saveAs: "identity" }),
      step("Setup-2", "prisma", "db.user.upsert", "准备邮箱为 `orf-default-page-chat-theme-e2e@orf.local`、姓名为 `ORF 默认页聊天主题用户`、角色为 `member`、状态为 `active` 的个人设置聊天主题测试用户", "db.user", "upsert", { emailFrom: "data.email", passwordFrom: "data.password", nameFrom: "data.name", roleFrom: "data.role", statusFrom: "data.status", identityIdFrom: "runtime.identity.id", saveAs: "user" }),
      step("Setup-3", "api", "preferences.default_landing.default", "设置个人设置聊天主题测试用户默认进入页面为 首页（默认系统页）", "user.preferences", "reset_default_landing_path_by_email", { emailFrom: "data.email" }),
      step("Setup-4", "api", "preferences.chat_theme.dark", "设置个人设置聊天主题测试用户聊天界面主题为 舒适暗色", "user.preferences", "set_chat_theme_by_email", { emailFrom: "data.email", theme: "dark" }),
      step("Setup-5", "api", "ory.sessions.revoke", "撤销邮箱为 `orf-default-page-chat-theme-e2e@orf.local` 的个人设置聊天主题测试认证身份的残留登录会话", "ory.sessions", "revoke_by_email", { emailFrom: "data.email" }),
      step("Setup-6", "playwright", "browser.clear", "移除当前浏览器中的残留登录态", "browser", "clear_state"),
      step("Setup-7", "playwright", "page.goto.auth", "打开 ORF 登录页", "page", "goto", { path: "/auth" }),
      step("Setup-8", "playwright", "fill.email", "在邮箱输入框输入 `orf-default-page-chat-theme-e2e@orf.local`", "page", "fill", { label: "Email", valueFrom: "data.email" }),
      step("Setup-9", "playwright", "fill.password", "在密码输入框输入个人设置聊天主题测试固定密码", "page", "fill", { label: "Password", exact: true, valueFrom: "data.password" }),
      step("Setup-10", "playwright", "click.sign_in", "点击 \"Sign In\" 登录操作", "page.login_form", "submit", { saveAs: "loginResponse" }),
      step("Setup-11", "api", "session.authenticated", "当前会话 应为 邮箱为 `orf-default-page-chat-theme-e2e@orf.local`、角色为 `member`、状态为 `active` 的已登录会话", "auth.session", "authenticated", { emailFrom: "data.email", roleFrom: "data.role", statusFrom: "data.status" }),
      step("Setup-12", "playwright", "page.goto.settings", "打开 个人设置页面", "page", "goto", { path: "/settings" }),
    ],
  },
  S0: {
    description: "测试用户位于个人设置页，聊天界面主题为舒适暗色",
    assertions: [
      step("S0-1", "api", "session.authenticated", "当前会话 应为 邮箱为 `orf-default-page-chat-theme-e2e@orf.local`、角色为 `member`、状态为 `active` 的已登录会话", "auth.session", "authenticated", { emailFrom: "data.email", roleFrom: "data.role", statusFrom: "data.status" }),
      step("S0-2", "playwright", "personal_settings.page.visible", "当前页面 应为 个人设置页面", "personal_settings.page", "visible", { patternFrom: "data.settingsPathPattern" }),
      step("S0-3", "playwright", "personal_settings.chat_theme.dark", "个人设置页面的聊天界面主题设置项 应显示 舒适暗色", "personal_settings.chat_theme", "selected", { label: "舒适暗色" }),
      step("S0-4", "playwright", "personal_settings.chat_theme.enabled", "个人设置页面的聊天界面主题设置项 应可选择", "personal_settings.chat_theme", "enabled"),
      step("S0-5", "api", "preferences.chat_theme.dark", "个人设置聊天主题测试用户的聊天界面主题偏好 应为 舒适暗色", "user.preferences", "chat_theme_is", { emailFrom: "data.email", theme: "dark" }),
    ],
  },
  Action: {
    description: "分别选择舒适暗色和经典浅色，并进入聊天页面观察主题背景",
    steps: [
      step("Action-1", "playwright", "chat_theme.select.dark", "在个人设置页面的聊天界面主题设置项选择 舒适暗色", "personal_settings.chat_theme", "select", { emailFrom: "data.email", label: "舒适暗色", saveAs: "darkPreferenceSnapshot" }),
      step("Action-2", "playwright", "chat_page.open.dark", "打开 聊天页面", "chat_page", "open", { saveAs: "darkChatSnapshot" }),
      step("Action-3", "playwright", "page.goto.settings.after_dark", "打开 个人设置页面", "page", "goto", { path: "/settings" }),
      step("Action-4", "playwright", "chat_theme.select.light", "在个人设置页面的聊天界面主题设置项选择 经典浅色", "personal_settings.chat_theme", "select", { emailFrom: "data.email", label: "经典浅色", saveAs: "lightPreferenceSnapshot" }),
      step("Action-5", "playwright", "chat_page.open.light", "打开 聊天页面", "chat_page", "open", { saveAs: "lightChatSnapshot" }),
    ],
  },
  S1: {
    description: "聊天页面分别呈现舒适暗色和经典浅色背景，且偏好保存正确",
    assertions: [
      step("S1-1", "playwright", "snapshot.dark_chat.page", "选择 舒适暗色 后，聊天页面 应为 聊天页面", "chat_theme_snapshot", "page_matches", { snapshotFrom: "runtime.darkChatSnapshot", patternFrom: "data.chatPathPattern" }),
      step("S1-2", "playwright", "snapshot.dark_chat.theme", "选择 舒适暗色 后，聊天界面主题 应为 舒适暗色", "chat_theme_snapshot", "theme", { snapshotFrom: "runtime.darkChatSnapshot", theme: "dark" }),
      step("S1-3", "playwright", "snapshot.dark_chat.background", "选择 舒适暗色 后，聊天界面背景 应为 黑色背景", "chat_theme_snapshot", "background", { snapshotFrom: "runtime.darkChatSnapshot", tone: "dark" }),
      step("S1-4", "api", "snapshot.dark_preference.saved", "选择 舒适暗色 后，个人设置聊天主题测试用户的聊天界面主题偏好 应为 舒适暗色", "chat_theme_snapshot", "saved_theme", { snapshotFrom: "runtime.darkPreferenceSnapshot", theme: "dark" }),
      step("S1-5", "playwright", "snapshot.light_chat.page", "选择 经典浅色 后，聊天页面 应为 聊天页面", "chat_theme_snapshot", "page_matches", { snapshotFrom: "runtime.lightChatSnapshot", patternFrom: "data.chatPathPattern" }),
      step("S1-6", "playwright", "snapshot.light_chat.theme", "选择 经典浅色 后，聊天界面主题 应为 经典浅色", "chat_theme_snapshot", "theme", { snapshotFrom: "runtime.lightChatSnapshot", theme: "light" }),
      step("S1-7", "playwright", "snapshot.light_chat.background", "选择 经典浅色 后，聊天界面背景 应为 白色背景", "chat_theme_snapshot", "background", { snapshotFrom: "runtime.lightChatSnapshot", tone: "light" }),
      step("S1-8", "api", "preferences.light.saved", "选择 经典浅色 后，个人设置聊天主题测试用户的聊天界面主题偏好 应为 经典浅色", "user.preferences", "chat_theme_is", { emailFrom: "data.email", theme: "light" }),
      step("S1-9", "api", "session.authenticated", "当前会话 应为 邮箱为 `orf-default-page-chat-theme-e2e@orf.local`、角色为 `member`、状态为 `active` 的已登录会话", "auth.session", "authenticated", { emailFrom: "data.email", roleFrom: "data.role", statusFrom: "data.status" }),
    ],
  },
  Clean: {
    description: "删除测试用户偏好、账号和页面会话状态，恢复未登录基准状态",
    steps: [
      step("Clean-1", "api", "auth.logout", "注销当前登录会话", "auth", "logout"),
      step("Clean-2", "playwright", "page.runtime.stop", "离开当前 ORF 前端页面", "page.runtime", "stop"),
      step("Clean-3", "playwright", "browser.clear", "移除当前浏览器中的残留登录态", "browser", "clear_state"),
      step("Clean-4", "api", "ory.sessions.revoke", "撤销邮箱为 `orf-default-page-chat-theme-e2e@orf.local` 的个人设置聊天主题测试认证身份的残留登录会话", "ory.sessions", "revoke_by_email", { emailFrom: "data.email" }),
      step("Clean-5", "api", "preferences.default_landing.reset", "恢复邮箱为 `orf-default-page-chat-theme-e2e@orf.local` 的默认进入页面为 系统默认", "user.preferences", "reset_default_landing_path_by_email", { emailFrom: "data.email" }),
      step("Clean-6", "api", "preferences.chat_theme.reset", "恢复邮箱为 `orf-default-page-chat-theme-e2e@orf.local` 的聊天界面主题为 舒适暗色", "user.preferences", "set_chat_theme_by_email", { emailFrom: "data.email", theme: "dark" }),
      step("Clean-7", "api", "ory.identity.delete", "删除邮箱为 `orf-default-page-chat-theme-e2e@orf.local` 的个人设置聊天主题测试认证身份", "ory.identity", "delete_by_email", { emailFrom: "data.email" }),
      step("Clean-8", "prisma", "db.user.memberships.delete", "删除邮箱为 `orf-default-page-chat-theme-e2e@orf.local` 的个人设置聊天主题测试用户的默认团队成员关系", "db.user", "delete_memberships", { emailFrom: "data.email" }),
      step("Clean-9", "prisma", "db.user.delete", "删除邮箱为 `orf-default-page-chat-theme-e2e@orf.local` 的个人设置聊天主题测试用户", "db.user", "delete", { emailFrom: "data.email" }),
      step("Clean-10", "api", "ory.identity.absent", "邮箱为 `orf-default-page-chat-theme-e2e@orf.local` 的个人设置聊天主题测试认证身份 应不存在", "ory.identity", "absent", { emailFrom: "data.email" }),
      step("Clean-11", "prisma", "db.user.absent", "邮箱为 `orf-default-page-chat-theme-e2e@orf.local` 的个人设置聊天主题测试用户 应不存在", "db.user", "absent", { emailFrom: "data.email" }),
    ],
  },
} satisfies StateCaseSpec<PersonalSettingsChatThemeCaseData>;
