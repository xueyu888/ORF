import { STATE_CASE_MODEL, type StateCaseSpec } from "../../_framework/types";
import type { BackgroundSettingsCaseData } from "../_support/background-settings.context";

type BackgroundPersonalUnauthenticatedCaseData = BackgroundSettingsCaseData & {
  role: "member";
};

export const backgroundPersonalUnauthenticatedCase = {
  id: "settings.background-personal.unauthenticated-forbidden",
  title: "设置页面修改背景-未登录用户不可修改个人背景",
  model: STATE_CASE_MODEL,
  tags: ["settings", "visual-background", "personal", "unauthenticated"],

  data: {
    email: "orf-background-unauthenticated-e2e@orf.local",
    password: "OrfBackgroundUnauthenticatedE2E!2026",
    name: "ORF Background Unauthenticated E2E",
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
    description: "记录系统背景原状态，保持未登录浏览器运行态",
    steps: [
      { source: { caseStepId: "Setup-1", method: "api" }, id: "system_backgrounds.snapshot", title: "记录当前系统 `login_background` 和 `app_background` 背景列表与配置快照", object: "api.visual_backgrounds", operator: "snapshot", params: { saveAs: "backgroundSnapshot" } },
      { source: { caseStepId: "Setup-2", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Setup-3", method: "playwright" }, id: "page.goto.auth", title: "打开 ORF 登录页", object: "page", operator: "goto", params: { path: "/auth" } },
      { source: { caseStepId: "Setup-4", method: "api" }, id: "session.unauthenticated", title: "当前会话 应为 未登录", object: "auth.session", operator: "unauthenticated" },
    ],
  },

  S0: {
    description: "未登录用户停留在登录页，系统背景未变化",
    assertions: [
      { source: { caseStepId: "S0-1", method: "api" }, id: "session.unauthenticated", title: "当前会话 应为 未登录", object: "auth.session", operator: "unauthenticated" },
      { source: { caseStepId: "S0-2", method: "playwright" }, id: "url.auth", title: "当前页面 应为 登录页", object: "page.url", operator: "match", params: { pattern: "/auth$" } },
      { source: { caseStepId: "S0-3", method: "api" }, id: "system_backgrounds.unchanged", title: "当前系统 `login_background` 和 `app_background` 背景列表与配置 应等于 系统背景配置快照", object: "api.visual_backgrounds", operator: "unchanged", params: { snapshotFrom: "runtime.backgroundSnapshot" } },
    ],
  },

  Action: {
    description: "未登录用户直接提交个人背景偏好写请求",
    steps: [
      { source: { caseStepId: "Action-1", method: "api" }, id: "personal_background_config.submit", title: "未登录用户直接提交个人 AppShell 皮肤偏好", object: "api.personal_background_config", operator: "submit", params: { configFrom: "runtime.backgroundSnapshot.app_background.config", saveAs: "personalBackgroundConfigResult" } },
    ],
  },

  S1: {
    description: "个人背景偏好写入被拒绝，系统背景配置保持不变",
    assertions: [
      { source: { caseStepId: "S1-1", method: "api" }, id: "personal_background_config.unauthenticated", title: "保存个人 AppShell 皮肤偏好结果状态码 应为 401 或等价未认证错误", object: "api.personal_background_config", operator: "unauthenticated", params: { resultFrom: "runtime.personalBackgroundConfigResult" } },
      { source: { caseStepId: "S1-2", method: "api" }, id: "session.unauthenticated", title: "当前会话 应为 未登录", object: "auth.session", operator: "unauthenticated" },
      { source: { caseStepId: "S1-3", method: "api" }, id: "system_backgrounds.unchanged", title: "当前系统 `login_background` 和 `app_background` 背景列表与配置 应等于 系统背景配置快照", object: "api.visual_backgrounds", operator: "unchanged", params: { snapshotFrom: "runtime.backgroundSnapshot" } },
    ],
  },

  Clean: {
    description: "恢复系统背景，清空页面会话状态",
    steps: [
      { source: { caseStepId: "Clean-1", method: "api" }, id: "system_backgrounds.restore_snapshot", title: "若已记录系统背景配置快照，恢复系统 `login_background` 和 `app_background` 背景列表与配置", object: "api.visual_backgrounds", operator: "restore_snapshot", params: { snapshotFrom: "runtime.backgroundSnapshot", optional: true } },
      { source: { caseStepId: "Clean-2", method: "api" }, id: "auth.logout", title: "注销当前登录会话", object: "auth", operator: "logout" },
      { source: { caseStepId: "Clean-3", method: "playwright" }, id: "page.runtime.stop", title: "离开当前 ORF 前端页面", object: "page.runtime", operator: "stop" },
      { source: { caseStepId: "Clean-4", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Clean-5", method: "api" }, id: "system_backgrounds.unchanged", title: "系统 `login_background` 和 `app_background` 背景列表与配置 应等于 系统背景配置快照", object: "api.visual_backgrounds", operator: "unchanged", params: { snapshotFrom: "runtime.backgroundSnapshot", optional: true, releaseLock: true } },
    ],
  },
} satisfies StateCaseSpec<BackgroundPersonalUnauthenticatedCaseData>;
