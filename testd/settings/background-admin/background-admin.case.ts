import { STATE_CASE_MODEL, type StateCaseSpec } from "../../_framework/types";
import type { BackgroundSettingsCaseData } from "../_support/background-settings.context";

type BackgroundAdminCaseData = BackgroundSettingsCaseData & {
  role: "admin";
  loginBackgroundFileName: string;
  appBackgroundFileName: string;
};

export const backgroundAdminCase = {
  id: "settings.background-admin",
  title: "设置页面修改背景-管理员可以切换系统背景",
  model: STATE_CASE_MODEL,
  tags: ["settings", "visual-background", "admin", "system"],

  data: {
    email: "orf-admin-background-e2e@orf.local",
    password: "OrfAdminBackgroundE2E!2026",
    name: "ORF Admin Background E2E",
    role: "admin",
    loginBackgroundFileName: "testd-admin-login-background.png",
    appBackgroundFileName: "testd-admin-app-background.png",
  },

  B: {
    description: "系统服务可用，浏览器处于未登录基准状态",
    assertions: [
      { source: { caseStepId: "B-1", method: "api" }, id: "frontend.ready", title: "前端服务 应可用", object: "frontend.service", operator: "available" },
      { source: { caseStepId: "B-2", method: "api" }, id: "backend.ready", title: "后端服务 应可用", object: "api.health", operator: "ok" },
      { source: { caseStepId: "B-3", method: "api" }, id: "frontend.login_entry.accessible", title: "前端登录页入口 应可访问", object: "frontend.login_entry", operator: "accessible" },
      { source: { caseStepId: "B-4", method: "api" }, id: "session.endpoint.accessible", title: "当前会话查询能力 应可用", object: "auth.session", operator: "accessible" },
      { source: { caseStepId: "B-5", method: "prisma" }, id: "db.ready", title: "ORF 数据库 应可连接", object: "db", operator: "ready" },
      { source: { caseStepId: "B-6", method: "prisma" }, id: "db.schema.current", title: "ORF 数据库 schema 应为 当前测试版本", object: "db.schema", operator: "current" },
      { source: { caseStepId: "B-7", method: "api" }, id: "ory.admin_public.ready", title: "Ory/Kratos 认证服务的管理和公共访问能力 应可用", object: "ory.admin_public", operator: "ready" },
      { source: { caseStepId: "B-8", method: "api" }, id: "session.unauthenticated", title: "当前会话 应为 未登录", object: "auth.session", operator: "unauthenticated" },
      { source: { caseStepId: "B-9", method: "playwright" }, id: "cookie.absent", title: "当前浏览器 应不存在 Ory 登录会话 cookie", object: "browser.cookie", operator: "absent" },
      { source: { caseStepId: "B-10", method: "playwright" }, id: "storage.empty", title: "当前浏览器 应不保留本地登录态", object: "browser.auth_storage", operator: "empty" },
    ],
  },

  Setup: {
    description: "准备管理员账号，记录系统背景原状态，登录管理员并进入系统设置页面",
    steps: [
      { source: { caseStepId: "Setup-1", method: "api" }, id: "system_backgrounds.snapshot", title: "记录当前系统 `login_background` 和 `app_background` 背景列表与配置快照", object: "api.visual_backgrounds", operator: "snapshot", params: { saveAs: "backgroundSnapshot" } },
      { source: { caseStepId: "Setup-2", method: "api" }, id: "ory.admin_identity.upsert", title: "准备邮箱为 `orf-admin-background-e2e@orf.local`、使用固定测试密码的管理员登录身份", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.email", nameFrom: "data.name", passwordFrom: "data.password", saveAs: "adminIdentity" } },
      { source: { caseStepId: "Setup-3", method: "prisma" }, id: "db.admin_user_record.upsert", title: "准备邮箱为 `orf-admin-background-e2e@orf.local`、状态为 `active` 的管理员用户记录", object: "db.user_record", operator: "upsert", params: { emailFrom: "data.email", nameFrom: "data.name", status: "active", identityIdFrom: "runtime.adminIdentity.id", saveAs: "adminUserRecord" } },
      { source: { caseStepId: "Setup-4", method: "prisma" }, id: "db.admin_membership.upsert", title: "准备管理员用户的默认团队成员关系，角色为 `admin`", object: "db.default_team_membership", operator: "upsert", params: { emailFrom: "data.email", roleFrom: "data.role", saveAs: "adminUser" } },
      { source: { caseStepId: "Setup-5", method: "api" }, id: "ory.admin_sessions.revoke", title: "撤销管理员登录身份可能残留的登录会话", object: "ory.sessions", operator: "revoke_by_email", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Setup-6", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Setup-7", method: "playwright" }, id: "page.goto.auth", title: "打开 ORF 登录页", object: "page", operator: "goto", params: { path: "/auth" } },
      { source: { caseStepId: "Setup-8", method: "playwright" }, id: "fill.email", title: "在邮箱输入框输入管理员固定测试邮箱", object: "page", operator: "fill", params: { label: "Email", valueFrom: "data.email" } },
      { source: { caseStepId: "Setup-9", method: "playwright" }, id: "fill.password", title: "在密码输入框输入管理员固定测试密码", object: "page", operator: "fill", params: { label: "Password", exact: true, valueFrom: "data.password" } },
      { source: { caseStepId: "Setup-10", method: "playwright" }, id: "click.sign_in", title: "点击 \"Sign In\" 登录操作", object: "page", operator: "click", params: { role: "button", name: "Sign In" } },
      { source: { caseStepId: "Setup-11", method: "api" }, id: "session.authenticated", title: "当前会话 应为 已登录", object: "auth.session", operator: "authenticated" },
      { source: { caseStepId: "Setup-12", method: "api" }, id: "session.email", title: "当前会话用户邮箱 应为 `orf-admin-background-e2e@orf.local`", object: "auth.session.user_email", operator: "equals", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Setup-13", method: "api" }, id: "session.role", title: "当前会话用户角色 应为 `admin`", object: "auth.session.user_role", operator: "equals", params: { roleFrom: "data.role" } },
      { source: { caseStepId: "Setup-14", method: "api" }, id: "session.status", title: "当前会话用户状态 应为 `active`", object: "auth.session.user_status", operator: "equals", params: { status: "active" } },
      { source: { caseStepId: "Setup-15", method: "playwright" }, id: "page.goto.system", title: "打开 系统管理", object: "page", operator: "goto", params: { path: "/system" } },
      { source: { caseStepId: "Setup-16", method: "playwright" }, id: "page.goto.system_settings", title: "打开 系统设置", object: "page", operator: "goto", params: { path: "/system/settings" } },
    ],
  },

  S0: {
    description: "管理员已登录，可以进入系统设置并读取系统背景配置",
    assertions: [
      { source: { caseStepId: "S0-1", method: "api" }, id: "session.authenticated", title: "当前会话 应为 已登录", object: "auth.session", operator: "authenticated" },
      { source: { caseStepId: "S0-2", method: "api" }, id: "session.email", title: "当前会话用户邮箱 应为 `orf-admin-background-e2e@orf.local`", object: "auth.session.user_email", operator: "equals", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "S0-3", method: "api" }, id: "session.role", title: "当前会话用户角色 应为 `admin`", object: "auth.session.user_role", operator: "equals", params: { roleFrom: "data.role" } },
      { source: { caseStepId: "S0-4", method: "api" }, id: "session.status", title: "当前会话用户状态 应为 `active`", object: "auth.session.user_status", operator: "equals", params: { status: "active" } },
      { source: { caseStepId: "S0-5", method: "prisma" }, id: "db.admin_user_record.matches", title: "ORF 业务系统中 应存在 邮箱为 `orf-admin-background-e2e@orf.local`、状态为 `active` 的管理员用户记录", object: "db.user_record", operator: "matches", params: { emailFrom: "data.email", nameFrom: "data.name", status: "active" } },
      { source: { caseStepId: "S0-6", method: "prisma" }, id: "db.admin_membership.matches", title: "管理员用户的默认团队成员关系角色 应为 `admin`", object: "db.default_team_membership", operator: "matches", params: { emailFrom: "data.email", roleFrom: "data.role" } },
      { source: { caseStepId: "S0-7", method: "playwright" }, id: "url.system_settings", title: "当前页面 应为 系统设置页面", object: "page.url", operator: "match", params: { pattern: "/system/settings$" } },
      { source: { caseStepId: "S0-8", method: "playwright" }, id: "visual_settings.visible", title: "当前页面 应显示 `视觉设置`", object: "page", operator: "visible", params: { role: "heading", name: "视觉设置", exact: true } },
      { source: { caseStepId: "S0-9", method: "playwright" }, id: "login_background_settings.visible", title: "当前页面 应显示 `登录页面背景设置`", object: "page", operator: "visible", params: { role: "heading", name: "登录页面背景设置", exact: true } },
      { source: { caseStepId: "S0-10", method: "playwright" }, id: "app_background_settings.visible", title: "当前页面 应显示 `AppShell 皮肤设置`", object: "page", operator: "visible", params: { role: "heading", name: "AppShell 皮肤设置", exact: true } },
      { source: { caseStepId: "S0-11", method: "api" }, id: "login_background.readable", title: "当前管理员读取系统登录页背景列表结果 应成功", object: "api.visual_backgrounds.scene", operator: "readable", params: { scene: "login_background" } },
      { source: { caseStepId: "S0-12", method: "api" }, id: "app_background.readable", title: "当前管理员读取系统 AppShell 皮肤列表结果 应成功", object: "api.visual_backgrounds.scene", operator: "readable", params: { scene: "app_background" } },
      { source: { caseStepId: "S0-13", method: "api" }, id: "login_background.config_snapshot", title: "当前系统 `login_background` 配置 应等于 系统背景配置快照中的 `login_background` 配置", object: "api.visual_backgrounds.scene", operator: "config_equals", params: { scene: "login_background", configFrom: "runtime.backgroundSnapshot.login_background.config" } },
      { source: { caseStepId: "S0-14", method: "api" }, id: "app_background.config_snapshot", title: "当前系统 `app_background` 配置 应等于 系统背景配置快照中的 `app_background` 配置", object: "api.visual_backgrounds.scene", operator: "config_equals", params: { scene: "app_background", configFrom: "runtime.backgroundSnapshot.app_background.config" } },
    ],
  },

  Action: {
    description: "管理员上传候选背景，选择并设为系统登录页和登录后页面默认背景",
    steps: [
      { source: { caseStepId: "Action-1", method: "playwright" }, id: "login_background.upload", title: "在登录页面背景设置中上传本用例登录页背景图片", object: "page.system_background", operator: "upload_background", params: { scene: "login_background", fileNameFrom: "data.loginBackgroundFileName", saveAs: "uploadedLoginBackground" } },
      { source: { caseStepId: "Action-2", method: "playwright" }, id: "login_background.select", title: "在登录页面背景设置中选择本用例登录页背景图片", object: "page.system_background", operator: "select_background", params: { scene: "login_background", backgroundFrom: "runtime.uploadedLoginBackground" } },
      { source: { caseStepId: "Action-3", method: "playwright" }, id: "login_background.set_default", title: "在登录页面背景设置中将选中图片设为默认背景", object: "page.system_background", operator: "set_selected_as_default", params: { scene: "login_background", saveAs: "loginBackgroundDefaultResult" } },
      { source: { caseStepId: "Action-4", method: "playwright" }, id: "app_background.upload", title: "在 AppShell 皮肤设置中上传本用例 AppShell 皮肤图片", object: "page.system_background", operator: "upload_background", params: { scene: "app_background", fileNameFrom: "data.appBackgroundFileName", saveAs: "uploadedAppBackground" } },
      { source: { caseStepId: "Action-5", method: "playwright" }, id: "app_background.select", title: "在 AppShell 皮肤设置中选择本用例 AppShell 皮肤图片", object: "page.system_background", operator: "select_background", params: { scene: "app_background", backgroundFrom: "runtime.uploadedAppBackground" } },
      { source: { caseStepId: "Action-6", method: "playwright" }, id: "app_background.set_default", title: "在 AppShell 皮肤设置中将选中图片设为默认背景", object: "page.system_background", operator: "set_selected_as_default", params: { scene: "app_background", saveAs: "appBackgroundDefaultResult" } },
      { source: { caseStepId: "Action-7", method: "playwright" }, id: "page.system_settings.refresh", title: "刷新 系统设置页面", object: "page.settings", operator: "refresh" },
    ],
  },

  S1: {
    description: "管理员已切换系统背景，页面和会话状态保持有效",
    assertions: [
      { source: { caseStepId: "S1-1", method: "api" }, id: "login_background_default.status", title: "登录页背景设为默认结果状态码 应为 200", object: "api.visual_background_default", operator: "success", params: { resultFrom: "runtime.loginBackgroundDefaultResult" } },
      { source: { caseStepId: "S1-2", method: "api" }, id: "app_background_default.status", title: "AppShell 皮肤设为默认结果状态码 应为 200", object: "api.visual_background_default", operator: "success", params: { resultFrom: "runtime.appBackgroundDefaultResult" } },
      { source: { caseStepId: "S1-3", method: "api" }, id: "login_background.contains_uploaded", title: "当前系统登录页背景列表 应包含 本用例登录页背景图片", object: "api.visual_backgrounds.scene", operator: "contains_background", params: { scene: "login_background", backgroundFrom: "runtime.uploadedLoginBackground" } },
      { source: { caseStepId: "S1-4", method: "api" }, id: "app_background.contains_uploaded", title: "当前系统 AppShell 皮肤列表 应包含 本用例 AppShell 皮肤图片", object: "api.visual_backgrounds.scene", operator: "contains_background", params: { scene: "app_background", backgroundFrom: "runtime.uploadedAppBackground" } },
      { source: { caseStepId: "S1-5", method: "api" }, id: "login_background.fixed_uploaded", title: "重新读取的系统 `login_background.fixedBackgroundId` 应为 本用例登录页背景图片", object: "api.visual_backgrounds.scene", operator: "fixed_background", params: { scene: "login_background", backgroundFrom: "runtime.uploadedLoginBackground" } },
      { source: { caseStepId: "S1-6", method: "api" }, id: "app_background.fixed_uploaded", title: "重新读取的系统 `app_background.fixedBackgroundId` 应为 本用例 AppShell 皮肤图片", object: "api.visual_backgrounds.scene", operator: "fixed_background", params: { scene: "app_background", backgroundFrom: "runtime.uploadedAppBackground" } },
      { source: { caseStepId: "S1-7", method: "api" }, id: "login_background.config_changed", title: "重新读取的系统 `login_background` 配置 应不等于 系统背景配置快照中的 `login_background` 配置", object: "api.visual_backgrounds.scene", operator: "config_not_snapshot", params: { scene: "login_background", snapshotFrom: "runtime.backgroundSnapshot" } },
      { source: { caseStepId: "S1-8", method: "api" }, id: "app_background.config_changed", title: "重新读取的系统 `app_background` 配置 应不等于 系统背景配置快照中的 `app_background` 配置", object: "api.visual_backgrounds.scene", operator: "config_not_snapshot", params: { scene: "app_background", snapshotFrom: "runtime.backgroundSnapshot" } },
      { source: { caseStepId: "S1-9", method: "playwright" }, id: "login_background.default_visible", title: "登录页面背景设置中 应显示 本用例登录页背景图片为 默认背景", object: "page.system_background", operator: "default_visible", params: { scene: "login_background", backgroundFrom: "runtime.uploadedLoginBackground" } },
      { source: { caseStepId: "S1-10", method: "playwright" }, id: "app_background.default_visible", title: "AppShell 皮肤设置中 应显示 本用例 AppShell 皮肤图片为 默认背景", object: "page.system_background", operator: "default_visible", params: { scene: "app_background", backgroundFrom: "runtime.uploadedAppBackground" } },
      { source: { caseStepId: "S1-11", method: "playwright" }, id: "url.system_settings", title: "当前页面 应为 系统设置页面", object: "page.url", operator: "match", params: { pattern: "/system/settings$" } },
      { source: { caseStepId: "S1-12", method: "playwright" }, id: "login_background_settings.visible", title: "当前页面 应显示 `登录页面背景设置`", object: "page", operator: "visible", params: { role: "heading", name: "登录页面背景设置", exact: true } },
      { source: { caseStepId: "S1-13", method: "playwright" }, id: "app_background_settings.visible", title: "当前页面 应显示 `AppShell 皮肤设置`", object: "page", operator: "visible", params: { role: "heading", name: "AppShell 皮肤设置", exact: true } },
      { source: { caseStepId: "S1-14", method: "api" }, id: "session.authenticated", title: "当前会话 应为 已登录", object: "auth.session", operator: "authenticated" },
      { source: { caseStepId: "S1-15", method: "api" }, id: "session.email", title: "当前会话用户邮箱 应为 `orf-admin-background-e2e@orf.local`", object: "auth.session.user_email", operator: "equals", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "S1-16", method: "api" }, id: "session.role", title: "当前会话用户角色 应为 `admin`", object: "auth.session.user_role", operator: "equals", params: { roleFrom: "data.role" } },
      { source: { caseStepId: "S1-17", method: "api" }, id: "session.status", title: "当前会话用户状态 应为 `active`", object: "auth.session.user_status", operator: "equals", params: { status: "active" } },
    ],
  },

  Clean: {
    description: "恢复系统背景配置，删除管理员账号和页面会话状态",
    steps: [
      { source: { caseStepId: "Clean-1", method: "api" }, id: "system_backgrounds.restore_snapshot", title: "若已记录系统背景配置快照，恢复系统 `login_background` 和 `app_background` 背景列表与配置", object: "api.visual_backgrounds", operator: "restore_snapshot", params: { snapshotFrom: "runtime.backgroundSnapshot", optional: true } },
      { source: { caseStepId: "Clean-2", method: "api" }, id: "auth.logout", title: "注销当前登录会话", object: "auth", operator: "logout" },
      { source: { caseStepId: "Clean-3", method: "playwright" }, id: "page.runtime.stop", title: "离开当前 ORF 前端页面", object: "page.runtime", operator: "stop" },
      { source: { caseStepId: "Clean-4", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Clean-5", method: "api" }, id: "ory.admin_sessions.revoke", title: "撤销管理员登录身份的残留登录会话", object: "ory.sessions", operator: "revoke_by_email", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-6", method: "api" }, id: "ory.admin_identity.delete", title: "删除邮箱为 `orf-admin-background-e2e@orf.local` 的管理员登录身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-7", method: "prisma" }, id: "db.admin.delete_memberships", title: "删除邮箱为 `orf-admin-background-e2e@orf.local` 的管理员默认团队成员关系", object: "db.user", operator: "delete_memberships", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-8", method: "prisma" }, id: "db.admin.delete", title: "删除邮箱为 `orf-admin-background-e2e@orf.local` 的管理员用户", object: "db.user", operator: "delete", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-9", method: "api" }, id: "system_backgrounds.unchanged", title: "系统 `login_background` 和 `app_background` 背景列表与配置 应等于 系统背景配置快照", object: "api.visual_backgrounds", operator: "unchanged", params: { snapshotFrom: "runtime.backgroundSnapshot", optional: true, releaseLock: true } },
      { source: { caseStepId: "Clean-10", method: "api" }, id: "ory.admin_identity.absent", title: "邮箱为 `orf-admin-background-e2e@orf.local` 的管理员登录身份 应不存在", object: "ory.identity", operator: "absent", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-11", method: "prisma" }, id: "db.admin.absent", title: "邮箱为 `orf-admin-background-e2e@orf.local` 的管理员用户 应不存在", object: "db.user", operator: "absent", params: { emailFrom: "data.email" } },
    ],
  },
} satisfies StateCaseSpec<BackgroundAdminCaseData>;
