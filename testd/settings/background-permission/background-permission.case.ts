import { STATE_CASE_MODEL, type StateCaseSpec } from "../../_framework/types";
import type { BackgroundPersonalCaseData } from "./_support/background-permission.context";

function createBackgroundPersonalCase(data: BackgroundPersonalCaseData) {
  return {
    id: `settings.background-personal.${data.role}`,
    title: `设置页面修改背景-${data.role === "admin" ? "管理员" : "普通成员"}可以切换个人 侧边栏皮肤`,
    model: STATE_CASE_MODEL,
    tags: ["settings", "visual-background", "personal", data.role],

    data,

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
      description: "准备当前角色账号，记录系统和个人背景原状态，登录后进入悬赏大厅",
      steps: [
        { source: { caseStepId: "Setup-1", method: "api" }, id: "system_backgrounds.snapshot", title: "记录当前系统 `login_background` 和 `topbar_background` 背景列表与配置快照", object: "api.visual_backgrounds", operator: "snapshot", params: { saveAs: "backgroundSnapshot" } },
        { source: { caseStepId: "Setup-2", method: "api" }, id: "ory.identity.upsert", title: "准备当前角色对应邮箱、使用固定测试密码的登录身份", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.email", nameFrom: "data.name", passwordFrom: "data.password", saveAs: "identity" } },
        { source: { caseStepId: "Setup-3", method: "prisma" }, id: "db.user_record.upsert", title: "准备当前角色对应邮箱、状态为 `active` 的用户记录", object: "db.user_record", operator: "upsert", params: { emailFrom: "data.email", nameFrom: "data.name", status: "active", identityIdFrom: "runtime.identity.id", saveAs: "userRecord" } },
        { source: { caseStepId: "Setup-4", method: "prisma" }, id: "db.membership.upsert", title: "准备当前用户的默认团队成员关系，角色为当前用例参数角色", object: "db.default_team_membership", operator: "upsert", params: { emailFrom: "data.email", roleFrom: "data.role", saveAs: "currentUser" } },
        { source: { caseStepId: "Setup-5", method: "api" }, id: "personal_settings.snapshot", title: "记录当前用户个人设置和个人背景目录快照", object: "api.personal_settings", operator: "snapshot", params: { userIdFrom: "runtime.currentUser.userId", saveAs: "personalSettingsSnapshot" } },
        { source: { caseStepId: "Setup-6", method: "api" }, id: "ory.sessions.revoke", title: "撤销当前用户登录身份可能残留的登录会话", object: "ory.sessions", operator: "revoke_by_email", params: { emailFrom: "data.email" } },
        { source: { caseStepId: "Setup-7", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
        { source: { caseStepId: "Setup-8", method: "playwright" }, id: "page.goto.auth", title: "打开 ORF 登录页", object: "page", operator: "goto", params: { path: "/auth" } },
        { source: { caseStepId: "Setup-9", method: "playwright" }, id: "fill.email", title: "在邮箱输入框输入当前用户固定测试邮箱", object: "page", operator: "fill", params: { label: "Email", valueFrom: "data.email" } },
        { source: { caseStepId: "Setup-10", method: "playwright" }, id: "fill.password", title: "在密码输入框输入当前用户固定测试密码", object: "page", operator: "fill", params: { label: "Password", exact: true, valueFrom: "data.password" } },
        { source: { caseStepId: "Setup-11", method: "playwright" }, id: "click.sign_in", title: "点击 \"Sign In\" 登录操作", object: "page.login_form", operator: "submit" },
        { source: { caseStepId: "Setup-12", method: "api" }, id: "session.authenticated", title: "当前会话 应为 已登录", object: "auth.session", operator: "authenticated" },
        { source: { caseStepId: "Setup-13", method: "api" }, id: "session.email", title: "当前会话用户邮箱 应为 当前用户固定测试邮箱", object: "auth.session.user_email", operator: "equals", params: { emailFrom: "data.email" } },
        { source: { caseStepId: "Setup-14", method: "api" }, id: "session.role", title: "当前会话用户角色 应为 当前用例参数角色", object: "auth.session.user_role", operator: "equals", params: { roleFrom: "data.role" } },
        { source: { caseStepId: "Setup-15", method: "api" }, id: "session.status", title: "当前会话用户状态 应为 `active`", object: "auth.session.user_status", operator: "equals", params: { status: "active" } },
        { source: { caseStepId: "Setup-16", method: "playwright" }, id: "page.goto.bounties", title: "打开 悬赏大厅", object: "page", operator: "goto", params: { path: "/bounties" } },
      ],
    },

    S0: {
      description: "当前角色用户已登录，个人设置入口可见且系统背景未变化",
      assertions: [
        { source: { caseStepId: "S0-1", method: "api" }, id: "session.authenticated", title: "当前会话 应为 已登录", object: "auth.session", operator: "authenticated" },
        { source: { caseStepId: "S0-2", method: "api" }, id: "session.email", title: "当前会话用户邮箱 应为 当前用户固定测试邮箱", object: "auth.session.user_email", operator: "equals", params: { emailFrom: "data.email" } },
        { source: { caseStepId: "S0-3", method: "api" }, id: "session.role", title: "当前会话用户角色 应为 当前用例参数角色", object: "auth.session.user_role", operator: "equals", params: { roleFrom: "data.role" } },
        { source: { caseStepId: "S0-4", method: "api" }, id: "session.status", title: "当前会话用户状态 应为 `active`", object: "auth.session.user_status", operator: "equals", params: { status: "active" } },
        { source: { caseStepId: "S0-5", method: "prisma" }, id: "db.user_record.matches", title: "ORF 业务系统中 应存在 当前用户固定测试邮箱、状态为 `active` 的用户记录", object: "db.user_record", operator: "matches", params: { emailFrom: "data.email", nameFrom: "data.name", status: "active" } },
        { source: { caseStepId: "S0-6", method: "prisma" }, id: "db.membership.matches", title: "当前用户的默认团队成员关系角色 应为 当前用例参数角色", object: "db.default_team_membership", operator: "matches", params: { emailFrom: "data.email", roleFrom: "data.role" } },
        { source: { caseStepId: "S0-7", method: "playwright" }, id: "nav.visible", title: "主导航 应可见", object: "page", operator: "visible", params: { label: "主导航" } },
        { source: { caseStepId: "S0-8", method: "playwright" }, id: "user_menu.visible", title: "用户菜单 应可见", object: "page", operator: "visible", params: { label: "用户菜单" } },
        { source: { caseStepId: "S0-9", method: "playwright" }, id: "personal_settings_menu_item.visible", title: "用户菜单中的 \"个人设置\" 操作 应可见", object: "page.user_menu_item", operator: "visible", params: { name: "个人设置" } },
        { source: { caseStepId: "S0-10", method: "playwright" }, id: "url.bounties", title: "当前页面 应为 悬赏大厅", object: "page.url", operator: "match", params: { pattern: "/bounties$" } },
        { source: { caseStepId: "S0-11", method: "api" }, id: "personal_backgrounds.readable", title: "当前用户读取个人背景列表和个人偏好结果 应成功", object: "api.personal_backgrounds", operator: "readable" },
        { source: { caseStepId: "S0-12", method: "api" }, id: "system_backgrounds.unchanged", title: "当前系统 `login_background` 和 `topbar_background` 背景列表与配置 应等于 系统背景配置快照", object: "api.visual_backgrounds", operator: "unchanged", params: { snapshotFrom: "runtime.backgroundSnapshot" } },
      ],
    },

    Action: {
      description: "当前用户进入个人设置，上传候选皮肤并切换当前个人 侧边栏皮肤",
      steps: [
        { source: { caseStepId: "Action-1", method: "playwright" }, id: "personal_settings_menu_item.click", title: "点击 用户菜单中的 \"个人设置\" 操作", object: "page.user_menu_item", operator: "click", params: { name: "个人设置" } },
        { source: { caseStepId: "Action-2", method: "playwright" }, id: "personal_background.upload_first", title: "在个人设置的 侧边栏皮肤上传入口上传本用例第一个个人 侧边栏皮肤图片", object: "page.personal_settings", operator: "upload_background", params: { fileNameFrom: "data.firstPersonalBackgroundFileName", saveAs: "firstPersonalBackground" } },
        { source: { caseStepId: "Action-3", method: "playwright" }, id: "personal_background.upload_second", title: "在个人设置的 侧边栏皮肤上传入口上传本用例第二个个人 侧边栏皮肤图片", object: "page.personal_settings", operator: "upload_background", params: { fileNameFrom: "data.secondPersonalBackgroundFileName", saveAs: "secondPersonalBackground" } },
        { source: { caseStepId: "Action-4", method: "playwright" }, id: "personal_background.select_first", title: "在 侧边栏皮肤列表中选择本用例第一个个人 侧边栏皮肤图片", object: "page.personal_settings", operator: "select_background", params: { backgroundFrom: "runtime.firstPersonalBackground" } },
        { source: { caseStepId: "Action-5", method: "playwright" }, id: "personal_background.use_selected", title: "点击 \"保存\" 操作，将本用例第一个个人 侧边栏皮肤图片保存为本人 侧边栏皮肤", object: "page.personal_settings", operator: "use_selected_background", params: { backgroundFrom: "runtime.firstPersonalBackground", saveAs: "personalBackgroundUpdateResult" } },
      ],
    },

    S1: {
      description: "当前用户个人背景已切换，系统背景配置保持不变",
      assertions: [
        { source: { caseStepId: "S1-1", method: "playwright" }, id: "url.personal_settings", title: "当前页面 应为 个人设置页面", object: "page.url", operator: "match", params: { pattern: "/settings$" } },
        { source: { caseStepId: "S1-2", method: "playwright" }, id: "personal_settings.visible", title: "当前页面 应显示 `个人设置`", object: "page", operator: "visible", params: { text: "个人设置", exact: true } },
        { source: { caseStepId: "S1-3", method: "playwright" }, id: "post_login_background.visible", title: "当前页面 应显示 `侧边栏`", object: "page", operator: "visible", params: { role: "heading", name: "侧边栏", exact: true } },
        { source: { caseStepId: "S1-4", method: "api" }, id: "personal_backgrounds.contains_first", title: "当前用户个人背景列表 应包含 本用例第一个个人 侧边栏皮肤图片", object: "api.personal_backgrounds", operator: "contains_background", params: { backgroundFrom: "runtime.firstPersonalBackground" } },
        { source: { caseStepId: "S1-5", method: "api" }, id: "personal_backgrounds.contains_second", title: "当前用户个人背景列表 应包含 本用例第二个个人 侧边栏皮肤图片", object: "api.personal_backgrounds", operator: "contains_background", params: { backgroundFrom: "runtime.secondPersonalBackground" } },
        { source: { caseStepId: "S1-6", method: "api" }, id: "personal_background.preference_fixed", title: "当前用户个人背景偏好 `backgrounds.sidebar_background.fixedBackgroundId` 应为 本用例第一个个人 侧边栏皮肤图片", object: "api.personal_backgrounds", operator: "preference_fixed_background", params: { backgroundFrom: "runtime.firstPersonalBackground" } },
        { source: { caseStepId: "S1-7", method: "playwright" }, id: "personal_background.current_visible", title: "侧边栏皮肤区域 应显示 本用例第一个个人 侧边栏皮肤图片为 当前背景", object: "page.personal_background", operator: "current_visible", params: { backgroundFrom: "runtime.firstPersonalBackground" } },
        { source: { caseStepId: "S1-8", method: "api" }, id: "system_backgrounds.unchanged", title: "当前系统 `login_background` 和 `topbar_background` 背景列表与配置 应等于 系统背景配置快照", object: "api.visual_backgrounds", operator: "unchanged", params: { snapshotFrom: "runtime.backgroundSnapshot" } },
        { source: { caseStepId: "S1-9", method: "api" }, id: "session.authenticated", title: "当前会话 应为 已登录", object: "auth.session", operator: "authenticated" },
        { source: { caseStepId: "S1-10", method: "api" }, id: "session.email", title: "当前会话用户邮箱 应为 当前用户固定测试邮箱", object: "auth.session.user_email", operator: "equals", params: { emailFrom: "data.email" } },
        { source: { caseStepId: "S1-11", method: "api" }, id: "session.role", title: "当前会话用户角色 应为 当前用例参数角色", object: "auth.session.user_role", operator: "equals", params: { roleFrom: "data.role" } },
        { source: { caseStepId: "S1-12", method: "api" }, id: "session.status", title: "当前会话用户状态 应为 `active`", object: "auth.session.user_status", operator: "equals", params: { status: "active" } },
      ],
    },

    Clean: {
      description: "恢复个人设置和系统背景，删除当前用户账号和页面会话状态",
      steps: [
        { source: { caseStepId: "Clean-1", method: "api" }, id: "personal_settings.restore_snapshot", title: "若已记录当前用户个人设置快照，恢复当前用户个人设置和个人背景目录", object: "api.personal_settings", operator: "restore_snapshot", params: { snapshotFrom: "runtime.personalSettingsSnapshot", optional: true } },
        { source: { caseStepId: "Clean-2", method: "api" }, id: "system_backgrounds.restore_snapshot", title: "若已记录系统背景配置快照，恢复系统 `login_background` 和 `topbar_background` 背景列表与配置", object: "api.visual_backgrounds", operator: "restore_snapshot", params: { snapshotFrom: "runtime.backgroundSnapshot", optional: true } },
        { source: { caseStepId: "Clean-3", method: "api" }, id: "auth.logout", title: "注销当前登录会话", object: "auth", operator: "logout" },
        { source: { caseStepId: "Clean-4", method: "playwright" }, id: "page.runtime.stop", title: "离开当前 ORF 前端页面", object: "page.runtime", operator: "stop" },
        { source: { caseStepId: "Clean-5", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
        { source: { caseStepId: "Clean-6", method: "api" }, id: "ory.sessions.revoke", title: "撤销当前用户登录身份的残留登录会话", object: "ory.sessions", operator: "revoke_by_email", params: { emailFrom: "data.email" } },
        { source: { caseStepId: "Clean-7", method: "api" }, id: "ory.identity.delete", title: "删除当前用户固定测试邮箱对应的登录身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.email" } },
        { source: { caseStepId: "Clean-8", method: "prisma" }, id: "db.user.delete_memberships", title: "删除当前用户固定测试邮箱对应的默认团队成员关系", object: "db.user", operator: "delete_memberships", params: { emailFrom: "data.email" } },
        { source: { caseStepId: "Clean-9", method: "prisma" }, id: "db.user.delete", title: "删除当前用户固定测试邮箱对应的用户记录", object: "db.user", operator: "delete", params: { emailFrom: "data.email" } },
        { source: { caseStepId: "Clean-10", method: "api" }, id: "system_backgrounds.unchanged", title: "系统 `login_background` 和 `topbar_background` 背景列表与配置 应等于 系统背景配置快照", object: "api.visual_backgrounds", operator: "unchanged", params: { snapshotFrom: "runtime.backgroundSnapshot", optional: true, releaseLock: true } },
        { source: { caseStepId: "Clean-11", method: "api" }, id: "ory.identity.absent", title: "当前用户固定测试邮箱对应的登录身份 应不存在", object: "ory.identity", operator: "absent", params: { emailFrom: "data.email" } },
        { source: { caseStepId: "Clean-12", method: "prisma" }, id: "db.user.absent", title: "当前用户固定测试邮箱对应的用户记录 应不存在", object: "db.user", operator: "absent", params: { emailFrom: "data.email" } },
      ],
    },
  } satisfies StateCaseSpec<BackgroundPersonalCaseData>;
}

export const backgroundPersonalCases = [
  createBackgroundPersonalCase({
    email: "orf-member-background-personal-e2e@orf.local",
    password: "OrfMemberBackgroundPersonalE2E!2026",
    name: "ORF Member Background Personal E2E",
    role: "member",
    firstPersonalBackgroundFileName: "testd-member-personal-background-first.png",
    secondPersonalBackgroundFileName: "testd-member-personal-background-second.png",
  }),
  createBackgroundPersonalCase({
    email: "orf-admin-background-personal-e2e@orf.local",
    password: "OrfAdminBackgroundPersonalE2E!2026",
    name: "ORF Admin Background Personal E2E",
    role: "admin",
    firstPersonalBackgroundFileName: "testd-admin-personal-background-first.png",
    secondPersonalBackgroundFileName: "testd-admin-personal-background-second.png",
  }),
];
