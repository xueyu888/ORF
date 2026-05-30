import { STATE_CASE_MODEL, type StateCaseSpec } from "../../_framework/types";
import type { BackgroundPermissionCaseData } from "./_support/background-permission.context";

export const backgroundPermissionCase = {
  id: "settings.background-permission",
  title: "普通成员不能修改设置页面背景",
  model: STATE_CASE_MODEL,
  tags: ["settings", "visual-background", "member", "permission"],

  data: {
    email: "orf-member-background-permission-e2e@orf.local",
    password: "OrfMemberBackgroundPermissionE2E!2026",
    name: "ORF Member Background Permission E2E",
    role: "member",
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
    description: "准备普通成员账号，记录背景原状态，登录普通成员并进入悬赏大厅",
    steps: [
      { source: { caseStepId: "Setup-1", method: "api" }, id: "backgrounds.snapshot", title: "记录当前登录页背景和侧边栏背景配置快照", object: "api.visual_backgrounds", operator: "snapshot", params: { saveAs: "backgroundSnapshot" } },
      { source: { caseStepId: "Setup-2", method: "api" }, id: "ory.member_identity.upsert", title: "准备邮箱为 `orf-member-background-permission-e2e@orf.local`、使用固定测试密码的普通成员登录身份", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.email", nameFrom: "data.name", passwordFrom: "data.password", saveAs: "memberIdentity" } },
      { source: { caseStepId: "Setup-3", method: "prisma" }, id: "db.member_user_record.upsert", title: "准备邮箱为 `orf-member-background-permission-e2e@orf.local`、状态为 `active` 的普通成员用户记录", object: "db.user_record", operator: "upsert", params: { emailFrom: "data.email", nameFrom: "data.name", status: "active", identityIdFrom: "runtime.memberIdentity.id", saveAs: "memberUserRecord" } },
      { source: { caseStepId: "Setup-4", method: "prisma" }, id: "db.member_membership.upsert", title: "准备普通成员用户的默认团队成员关系，角色为 `member`", object: "db.default_team_membership", operator: "upsert", params: { emailFrom: "data.email", roleFrom: "data.role", saveAs: "memberUser" } },
      { source: { caseStepId: "Setup-5", method: "api" }, id: "ory.member_sessions.revoke", title: "撤销普通成员登录身份可能残留的登录会话", object: "ory.sessions", operator: "revoke_by_email", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Setup-6", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Setup-7", method: "playwright" }, id: "page.goto.auth", title: "打开 ORF 登录页", object: "page", operator: "goto", params: { path: "/auth" } },
      { source: { caseStepId: "Setup-8", method: "playwright" }, id: "fill.email", title: "在邮箱输入框输入普通成员固定测试邮箱", object: "page", operator: "fill", params: { label: "Email", valueFrom: "data.email" } },
      { source: { caseStepId: "Setup-9", method: "playwright" }, id: "fill.password", title: "在密码输入框输入普通成员固定测试密码", object: "page", operator: "fill", params: { label: "Password", exact: true, valueFrom: "data.password" } },
      { source: { caseStepId: "Setup-10", method: "playwright" }, id: "click.sign_in", title: "点击 \"Sign In\" 登录操作", object: "page", operator: "click", params: { role: "button", name: "Sign In" } },
      { source: { caseStepId: "Setup-11", method: "api" }, id: "session.authenticated", title: "当前会话 应为 已登录", object: "auth.session", operator: "authenticated" },
      { source: { caseStepId: "Setup-12", method: "api" }, id: "session.email", title: "当前会话用户邮箱 应为 `orf-member-background-permission-e2e@orf.local`", object: "auth.session.user_email", operator: "equals", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Setup-13", method: "api" }, id: "session.role", title: "当前会话用户角色 应为 `member`", object: "auth.session.user_role", operator: "equals", params: { roleFrom: "data.role" } },
      { source: { caseStepId: "Setup-14", method: "api" }, id: "session.status", title: "当前会话用户状态 应为 `active`", object: "auth.session.user_status", operator: "equals", params: { status: "active" } },
      { source: { caseStepId: "Setup-15", method: "playwright" }, id: "page.goto.bounties", title: "打开 悬赏大厅", object: "page", operator: "goto", params: { path: "/bounties" } },
    ],
  },

  S0: {
    description: "普通成员已登录，但没有设置入口和设置页面权限",
    assertions: [
      { source: { caseStepId: "S0-1", method: "api" }, id: "session.authenticated", title: "当前会话 应为 已登录", object: "auth.session", operator: "authenticated" },
      { source: { caseStepId: "S0-2", method: "api" }, id: "session.email", title: "当前会话用户邮箱 应为 `orf-member-background-permission-e2e@orf.local`", object: "auth.session.user_email", operator: "equals", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "S0-3", method: "api" }, id: "session.role", title: "当前会话用户角色 应为 `member`", object: "auth.session.user_role", operator: "equals", params: { roleFrom: "data.role" } },
      { source: { caseStepId: "S0-4", method: "api" }, id: "session.status", title: "当前会话用户状态 应为 `active`", object: "auth.session.user_status", operator: "equals", params: { status: "active" } },
      { source: { caseStepId: "S0-5", method: "prisma" }, id: "db.member_user_record.matches", title: "ORF 业务系统中 应存在 邮箱为 `orf-member-background-permission-e2e@orf.local`、状态为 `active` 的普通成员用户记录", object: "db.user_record", operator: "matches", params: { emailFrom: "data.email", nameFrom: "data.name", status: "active" } },
      { source: { caseStepId: "S0-6", method: "prisma" }, id: "db.member_membership.matches", title: "普通成员用户的默认团队成员关系角色 应为 `member`", object: "db.default_team_membership", operator: "matches", params: { emailFrom: "data.email", roleFrom: "data.role" } },
      { source: { caseStepId: "S0-7", method: "playwright" }, id: "nav.visible", title: "主导航 应可见", object: "page", operator: "visible", params: { label: "主导航" } },
      { source: { caseStepId: "S0-8", method: "playwright" }, id: "current_user.visible", title: "当前用户入口 应可见", object: "page", operator: "visible", params: { label: "当前用户" } },
      { source: { caseStepId: "S0-9", method: "playwright" }, id: "settings.nav.absent", title: "侧边栏 \"设置\" 入口 应不可见", object: "page.nav", operator: "item_absent", params: { name: "设置" } },
      { source: { caseStepId: "S0-10", method: "playwright" }, id: "url.bounties", title: "当前页面 应为 悬赏大厅", object: "page.url", operator: "match", params: { pattern: "/bounties$" } },
      { source: { caseStepId: "S0-11", method: "api" }, id: "sidebar_background.readable", title: "当前普通成员读取侧边栏背景列表结果 应成功", object: "api.visual_backgrounds.sidebar", operator: "readable" },
    ],
  },

  Action: {
    description: "普通成员直接访问设置页并尝试调用背景修改接口",
    steps: [
      { source: { caseStepId: "Action-1", method: "playwright" }, id: "page.goto.settings", title: "直接访问 ORF 设置页面", object: "page", operator: "goto", params: { path: "/settings" } },
      { source: { caseStepId: "Action-2", method: "api" }, id: "api.background_config.attempt_update", title: "当前普通成员尝试修改 `sidebar_background` 配置", object: "api.visual_background_config", operator: "attempt_update", params: { saveAs: "configUpdateAttempt" } },
      { source: { caseStepId: "Action-3", method: "api" }, id: "api.background_default.attempt_update", title: "在存在可用侧边栏背景时，当前普通成员尝试设置默认背景", object: "api.visual_background_default", operator: "attempt_update", params: { saveAs: "defaultUpdateAttempt" } },
    ],
  },

  S1: {
    description: "普通成员被阻止进入设置页，背景写接口被拒绝且配置未变化",
    assertions: [
      { source: { caseStepId: "S1-1", method: "playwright" }, id: "url.bounties_after_settings", title: "直接访问设置页面后，当前页面 应为 悬赏大厅", object: "page.url", operator: "match", params: { pattern: "/bounties$" } },
      { source: { caseStepId: "S1-2", method: "playwright" }, id: "visual_settings.absent", title: "当前页面 应不显示 `视觉设置`", object: "page", operator: "count", params: { text: "视觉设置", count: 0 } },
      { source: { caseStepId: "S1-3", method: "playwright" }, id: "login_background_settings.absent", title: "当前页面 应不显示 `登录页面背景设置`", object: "page", operator: "count", params: { text: "登录页面背景设置", count: 0 } },
      { source: { caseStepId: "S1-4", method: "playwright" }, id: "sidebar_background_settings.absent", title: "当前页面 应不显示 `侧边栏背景设置`", object: "page", operator: "count", params: { text: "侧边栏背景设置", count: 0 } },
      { source: { caseStepId: "S1-5", method: "api" }, id: "background_config.forbidden", title: "背景配置修改结果状态码 应为 403 或等价权限错误", object: "api.visual_background_config", operator: "forbidden", params: { resultFrom: "runtime.configUpdateAttempt" } },
      { source: { caseStepId: "S1-6", method: "api" }, id: "background_default.forbidden", title: "默认背景设置结果状态码 应为 403 或等价权限错误；无背景可设置时 应记录为跳过", object: "api.visual_background_default", operator: "forbidden_or_skipped", params: { resultFrom: "runtime.defaultUpdateAttempt" } },
      { source: { caseStepId: "S1-7", method: "api" }, id: "backgrounds.unchanged", title: "重新读取的 `login_background` 和 `sidebar_background` 背景列表与配置 应等于 `runtime.backgroundSnapshot`", object: "api.visual_backgrounds", operator: "unchanged", params: { snapshotFrom: "runtime.backgroundSnapshot" } },
      { source: { caseStepId: "S1-8", method: "api" }, id: "session.still_authenticated", title: "当前会话 应为 已登录", object: "auth.session", operator: "authenticated" },
      { source: { caseStepId: "S1-9", method: "api" }, id: "session.email", title: "当前会话用户邮箱 应为 `orf-member-background-permission-e2e@orf.local`", object: "auth.session.user_email", operator: "equals", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "S1-10", method: "api" }, id: "session.role", title: "当前会话用户角色 应为 `member`", object: "auth.session.user_role", operator: "equals", params: { roleFrom: "data.role" } },
      { source: { caseStepId: "S1-11", method: "api" }, id: "session.status", title: "当前会话用户状态 应为 `active`", object: "auth.session.user_status", operator: "equals", params: { status: "active" } },
    ],
  },

  Clean: {
    description: "恢复背景配置，删除普通成员账号和页面会话状态",
    steps: [
      { source: { caseStepId: "Clean-1", method: "api" }, id: "backgrounds.restore_snapshot", title: "若已记录 `runtime.backgroundSnapshot`，恢复 `login_background` 和 `sidebar_background` 背景列表与配置", object: "api.visual_backgrounds", operator: "restore_snapshot", params: { snapshotFrom: "runtime.backgroundSnapshot", optional: true } },
      { source: { caseStepId: "Clean-2", method: "api" }, id: "auth.logout", title: "注销当前登录会话", object: "auth", operator: "logout" },
      { source: { caseStepId: "Clean-3", method: "playwright" }, id: "page.runtime.stop", title: "离开当前 ORF 前端页面", object: "page.runtime", operator: "stop" },
      { source: { caseStepId: "Clean-4", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Clean-5", method: "api" }, id: "ory.member_sessions.revoke", title: "撤销普通成员登录身份的残留登录会话", object: "ory.sessions", operator: "revoke_by_email", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-6", method: "api" }, id: "ory.member_identity.delete", title: "删除邮箱为 `orf-member-background-permission-e2e@orf.local` 的普通成员登录身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-7", method: "prisma" }, id: "db.member.delete_memberships", title: "删除邮箱为 `orf-member-background-permission-e2e@orf.local` 的普通成员默认团队成员关系", object: "db.user", operator: "delete_memberships", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-8", method: "prisma" }, id: "db.member.delete", title: "删除邮箱为 `orf-member-background-permission-e2e@orf.local` 的普通成员用户", object: "db.user", operator: "delete", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-9", method: "api" }, id: "backgrounds.unchanged", title: "`login_background` 和 `sidebar_background` 背景列表与配置 应等于 `runtime.backgroundSnapshot`", object: "api.visual_backgrounds", operator: "unchanged", params: { snapshotFrom: "runtime.backgroundSnapshot", optional: true } },
      { source: { caseStepId: "Clean-10", method: "api" }, id: "ory.member_identity.absent", title: "邮箱为 `orf-member-background-permission-e2e@orf.local` 的普通成员 登录身份 应不存在", object: "ory.identity", operator: "absent", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-11", method: "prisma" }, id: "db.member.absent", title: "邮箱为 `orf-member-background-permission-e2e@orf.local` 的普通成员用户 应不存在", object: "db.user", operator: "absent", params: { emailFrom: "data.email" } },
    ],
  },
} satisfies StateCaseSpec<BackgroundPermissionCaseData>;
