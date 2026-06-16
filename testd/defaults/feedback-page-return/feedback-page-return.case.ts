import { STATE_CASE_MODEL, type StateCaseSpec, type StepExecutionMethod, type StepSpec } from "../../_framework/types";
import type { FeedbackPageReturnCaseData } from "./_support/feedback-page-return.context";

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

export const feedbackPageReturnCase = {
  id: "defaults.feedback-page.return",
  title: "09-新建反馈页面展示与返回",
  model: STATE_CASE_MODEL,
  tags: ["defaults", "feedback", "create-feedback", "return"],
  data: {
    email: "orf-default-page-feedback-return-e2e@orf.local",
    password: "OrfDefaultPageFeedbackReturnE2E!2026",
    name: "ORF Default Page Feedback Return E2E",
    role: "admin",
    defaultLandingPath: "/bounties",
    homePath: "/dashboard",
    createFeedbackPathPattern: "/feedback/new$",
    feedbackPathPattern: "/feedback$",
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
    description: "准备新建反馈页面展示与返回测试用户并登录到首页",
    steps: [
      step("Setup-1", "api", "ory.identity.upsert", "准备邮箱为 `orf-default-page-feedback-return-e2e@orf.local`、使用固定测试密码的新建反馈页面展示与返回测试认证身份", "ory.identity", "upsert_password", { emailFrom: "data.email", passwordFrom: "data.password", nameFrom: "data.name", saveAs: "identity" }),
      step("Setup-2", "prisma", "db.user.upsert", "准备邮箱为 `orf-default-page-feedback-return-e2e@orf.local`、角色为 `admin`、状态为 `active` 的新建反馈页面展示与返回测试用户", "db.user", "upsert", { emailFrom: "data.email", passwordFrom: "data.password", nameFrom: "data.name", roleFrom: "data.role", status: "active", identityIdFrom: "runtime.identity.id", saveAs: "user" }),
      step("Setup-3", "api", "preferences.default_landing_path.set", "设置新建反馈页面展示与返回测试用户默认进入页面为 首页（默认系统页）", "user.preferences", "set_default_landing_path_by_email", { emailFrom: "data.email", pathFrom: "data.defaultLandingPath" }),
      step("Setup-4", "api", "ory.sessions.revoke", "撤销邮箱为 `orf-default-page-feedback-return-e2e@orf.local` 的新建反馈页面展示与返回测试认证身份的残留登录会话", "ory.sessions", "revoke_by_email", { emailFrom: "data.email" }),
      step("Setup-5", "playwright", "browser.clear", "移除当前浏览器中的残留登录态", "browser", "clear_state"),
      step("Setup-6", "playwright", "page.goto.auth", "打开 ORF 登录页", "page", "goto", { path: "/auth" }),
      step("Setup-7", "playwright", "fill.email", "在邮箱输入框输入 `orf-default-page-feedback-return-e2e@orf.local`", "page", "fill", { label: "Email", valueFrom: "data.email" }),
      step("Setup-8", "playwright", "fill.password", "在密码输入框输入新建反馈页面展示与返回测试固定密码", "page", "fill", { label: "Password", exact: true, valueFrom: "data.password" }),
      step("Setup-9", "playwright", "click.sign_in", "点击 \"Sign In\" 登录操作", "page.login_form", "submit", { saveAs: "loginResponse" }),
      step("Setup-10", "api", "session.authenticated", "当前会话 应为 邮箱为 `orf-default-page-feedback-return-e2e@orf.local`、角色为 `admin`、状态为 `active` 的已登录会话", "auth.session", "authenticated", { emailFrom: "data.email", roleFrom: "data.role", status: "active" }),
      step("Setup-11", "playwright", "page.goto.home", "打开 首页（默认系统页）", "page", "goto", { pathFrom: "data.homePath" }),
    ],
  },
  S0: {
    description: "管理员已登录并位于首页，新建反馈入口可用",
    assertions: [
      step("S0-1", "api", "session.authenticated", "当前会话 应为 邮箱为 `orf-default-page-feedback-return-e2e@orf.local`、角色为 `admin`、状态为 `active` 的已登录会话", "auth.session", "authenticated", { emailFrom: "data.email", roleFrom: "data.role", status: "active" }),
      step("S0-2", "playwright", "url.home", "当前页面 应为 首页（默认系统页）", "page.url", "match", { pattern: "/dashboard$" }),
      step("S0-3", "playwright", "topbar.feedback.visible", "顶部导航栏的新建反馈入口 应可见", "topbar.feedback", "visible"),
      step("S0-4", "playwright", "topbar.feedback.enabled", "顶部导航栏的新建反馈入口 应可点击", "topbar.feedback", "enabled"),
    ],
  },
  Action: {
    description: "从首页进入新建反馈页面，并从新建反馈页面返回反馈页面",
    steps: [
      step("Action-1", "playwright", "topbar.feedback.click", "点击 顶部导航栏的新建反馈入口", "topbar.feedback", "click", { saveAs: "createFeedbackPageSnapshot" }),
      step("Action-2", "playwright", "feedback_create.back.click", "点击 新建反馈页面的返回反馈入口", "feedback_create.back", "click"),
    ],
  },
  S1: {
    description: "新建反馈页面展示正确，点击返回后进入反馈页面",
    assertions: [
      step("S1-1", "playwright", "feedback_create_snapshot.page.visible", "点击顶部导航栏的新建反馈入口后，当前页面 应为 新建反馈页面", "feedback_create_snapshot.page", "visible", { snapshotFrom: "runtime.createFeedbackPageSnapshot", patternFrom: "data.createFeedbackPathPattern" }),
      step("S1-2", "playwright", "feedback_create_snapshot.title.visible", "点击顶部导航栏的新建反馈入口后，新建反馈页面的标题 应可见", "feedback_create_snapshot.title", "visible", { snapshotFrom: "runtime.createFeedbackPageSnapshot" }),
      step("S1-3", "playwright", "feedback_create_snapshot.form.visible", "点击顶部导航栏的新建反馈入口后，新建反馈表单 应可见", "feedback_create_snapshot.form", "visible", { snapshotFrom: "runtime.createFeedbackPageSnapshot" }),
      step("S1-4", "playwright", "feedback_create_snapshot.phenomenon_input.visible", "点击顶部导航栏的新建反馈入口后，新建反馈表单的现象输入区域 应可见", "feedback_create_snapshot.phenomenon_input", "visible", { snapshotFrom: "runtime.createFeedbackPageSnapshot" }),
      step("S1-5", "playwright", "feedback_create_snapshot.body_input.visible", "点击顶部导航栏的新建反馈入口后，新建反馈表单的反馈正文输入区域 应可见", "feedback_create_snapshot.body_input", "visible", { snapshotFrom: "runtime.createFeedbackPageSnapshot" }),
      step("S1-6", "playwright", "feedback_create_snapshot.submit.visible", "点击顶部导航栏的新建反馈入口后，新建反馈表单的提交操作 应可见", "feedback_create_snapshot.submit", "visible", { snapshotFrom: "runtime.createFeedbackPageSnapshot" }),
      step("S1-7", "playwright", "feedback_page.visible", "点击新建反馈页面的返回反馈入口后，当前页面 应为 反馈页面", "feedback_page", "visible", { patternFrom: "data.feedbackPathPattern" }),
      step("S1-8", "playwright", "feedback_page.title.visible", "反馈页面的标题 应可见", "feedback_page.title", "visible"),
      step("S1-9", "api", "session.authenticated.after_return", "当前会话 应仍为 邮箱为 `orf-default-page-feedback-return-e2e@orf.local`、角色为 `admin`、状态为 `active` 的已登录会话", "auth.session", "authenticated", { emailFrom: "data.email", roleFrom: "data.role", status: "active" }),
    ],
  },
  Clean: {
    description: "删除新建反馈页面展示与返回测试用户并恢复未登录基准状态",
    steps: [
      step("Clean-1", "api", "auth.logout", "注销当前登录会话", "auth", "logout"),
      step("Clean-2", "playwright", "page.runtime.stop", "离开当前 ORF 前端页面", "page.runtime", "stop"),
      step("Clean-3", "playwright", "browser.clear", "移除当前浏览器中的残留登录态", "browser", "clear_state"),
      step("Clean-4", "api", "ory.sessions.revoke", "撤销邮箱为 `orf-default-page-feedback-return-e2e@orf.local` 的新建反馈页面展示与返回测试认证身份的残留登录会话", "ory.sessions", "revoke_by_email", { emailFrom: "data.email" }),
      step("Clean-5", "api", "ory.identity.delete", "删除邮箱为 `orf-default-page-feedback-return-e2e@orf.local` 的新建反馈页面展示与返回测试认证身份", "ory.identity", "delete_by_email", { emailFrom: "data.email" }),
      step("Clean-6", "api", "preferences.default_landing_path.reset", "恢复邮箱为 `orf-default-page-feedback-return-e2e@orf.local` 的默认进入页面为 系统默认", "user.preferences", "reset_default_landing_path_by_email", { emailFrom: "data.email" }),
      step("Clean-7", "prisma", "db.user.memberships.delete", "删除邮箱为 `orf-default-page-feedback-return-e2e@orf.local` 的新建反馈页面展示与返回测试用户的默认团队成员关系", "db.user", "delete_memberships", { emailFrom: "data.email" }),
      step("Clean-8", "prisma", "db.user.delete", "删除邮箱为 `orf-default-page-feedback-return-e2e@orf.local` 的新建反馈页面展示与返回测试用户", "db.user", "delete", { emailFrom: "data.email" }),
      step("Clean-9", "api", "ory.identity.absent", "邮箱为 `orf-default-page-feedback-return-e2e@orf.local` 的新建反馈页面展示与返回测试认证身份 应不存在", "ory.identity", "absent", { emailFrom: "data.email" }),
      step("Clean-10", "prisma", "db.user.absent", "邮箱为 `orf-default-page-feedback-return-e2e@orf.local` 的新建反馈页面展示与返回测试用户 应不存在", "db.user", "absent", { emailFrom: "data.email" }),
    ],
  },
} satisfies StateCaseSpec<FeedbackPageReturnCaseData>;
