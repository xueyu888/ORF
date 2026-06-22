import { STATE_CASE_MODEL, type StateCaseSpec, type StepExecutionMethod, type StepSpec } from "../../_framework/types";
import type { FeedbackImageUploadCaseData } from "./_support/feedback-image-upload.context";

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

export const feedbackImageUploadCase = {
  id: "defaults.feedback-image.upload-validation",
  title: "11-新建反馈图片上传校验",
  model: STATE_CASE_MODEL,
  tags: ["defaults", "feedback", "create-feedback", "image-upload"],
  data: {
    email: "orf-default-page-feedback-image-e2e@orf.local",
    password: "OrfDefaultPageFeedbackImageE2E!2026",
    name: "ORF Default Page Feedback Image E2E",
    role: "admin",
    defaultLandingPath: "/bounties",
    homePath: "/dashboard",
    createFeedbackPathPattern: "/feedback/new$",
    validImageFileName: "orf-feedback-valid-upload.png",
    textAttachmentFileName: "orf-feedback-text-attachment.txt",
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
    description: "准备新建反馈图片上传测试用户、上传文件，登录并进入新建反馈页面",
    steps: [
      step("Setup-1", "api", "ory.identity.upsert", "准备邮箱为 `orf-default-page-feedback-image-e2e@orf.local`、使用固定测试密码的新建反馈图片上传测试认证身份", "ory.identity", "upsert_password", { emailFrom: "data.email", passwordFrom: "data.password", nameFrom: "data.name", saveAs: "identity" }),
      step("Setup-2", "prisma", "db.user.upsert", "准备邮箱为 `orf-default-page-feedback-image-e2e@orf.local`、角色为 `admin`、状态为 `active` 的新建反馈图片上传测试用户", "db.user", "upsert", { emailFrom: "data.email", passwordFrom: "data.password", nameFrom: "data.name", roleFrom: "data.role", status: "active", identityIdFrom: "runtime.identity.id", saveAs: "user" }),
      step("Setup-3", "api", "preferences.default_landing_path.set", "设置新建反馈图片上传测试用户默认进入页面为 首页（默认系统页）", "user.preferences", "set_default_landing_path_by_email", { emailFrom: "data.email", pathFrom: "data.defaultLandingPath" }),
      step("Setup-4", "mock", "mock.valid_image.prepare", "准备本用例有效图片文件", "mock.feedback_file", "prepare_image", { fileNameFrom: "data.validImageFileName", saveAs: "validImage" }),
      step("Setup-5", "mock", "mock.text_attachment.prepare", "准备本用例文本附件文件", "mock.feedback_file", "prepare_text_attachment", { fileNameFrom: "data.textAttachmentFileName", saveAs: "textAttachment" }),
      step("Setup-6", "api", "ory.sessions.revoke", "撤销邮箱为 `orf-default-page-feedback-image-e2e@orf.local` 的新建反馈图片上传测试认证身份的残留登录会话", "ory.sessions", "revoke_by_email", { emailFrom: "data.email" }),
      step("Setup-7", "playwright", "browser.clear", "移除当前浏览器中的残留登录态", "browser", "clear_state"),
      step("Setup-8", "playwright", "page.goto.auth", "打开 ORF 登录页", "page", "goto", { path: "/auth" }),
      step("Setup-9", "playwright", "fill.email", "在邮箱输入框输入 `orf-default-page-feedback-image-e2e@orf.local`", "page", "fill", { label: "Email", valueFrom: "data.email" }),
      step("Setup-10", "playwright", "fill.password", "在密码输入框输入新建反馈图片上传测试固定密码", "page", "fill", { label: "Password", exact: true, valueFrom: "data.password" }),
      step("Setup-11", "playwright", "click.sign_in", "点击 \"Sign In\" 登录操作", "page.login_form", "submit", { saveAs: "loginResponse" }),
      step("Setup-12", "api", "session.authenticated", "当前会话 应为 邮箱为 `orf-default-page-feedback-image-e2e@orf.local`、角色为 `admin`、状态为 `active` 的已登录会话", "auth.session", "authenticated", { emailFrom: "data.email", roleFrom: "data.role", status: "active" }),
      step("Setup-13", "playwright", "page.goto.home", "打开 首页（默认系统页）", "page", "goto", { pathFrom: "data.homePath" }),
      step("Setup-14", "playwright", "topbar.feedback.click", "点击 顶部导航栏的新建反馈入口", "topbar.feedback", "click"),
    ],
  },
  S0: {
    description: "新建反馈页面表单可见，反馈描述为空且添加图片或附件操作可用",
    assertions: [
      step("S0-1", "api", "session.authenticated", "当前会话 应为 邮箱为 `orf-default-page-feedback-image-e2e@orf.local`、角色为 `admin`、状态为 `active` 的已登录会话", "auth.session", "authenticated", { emailFrom: "data.email", roleFrom: "data.role", status: "active" }),
      step("S0-2", "playwright", "feedback_create.page.visible", "当前页面 应为 新建反馈页面", "feedback_create.page", "visible", { patternFrom: "data.createFeedbackPathPattern" }),
      step("S0-3", "playwright", "feedback_create.form.visible", "新建反馈表单 应可见", "feedback_create.form", "visible"),
      step("S0-4", "playwright", "feedback_create.description_input.empty", "新建反馈表单的反馈描述输入区域 应为空", "feedback_create.description_input", "empty"),
      step("S0-5", "playwright", "feedback_create.add_image.enabled", "新建反馈表单的 \"添加图片或附件\" 操作 应可点击", "feedback_create.add_image", "enabled"),
    ],
  },
  Action: {
    description: "通过添加图片或附件入口依次选择有效图片和文本附件",
    steps: [
      step("Action-1", "playwright", "feedback_create.add_image.choose_valid", "通过新建反馈表单的 \"添加图片或附件\" 操作选择本用例有效图片文件", "feedback_create.add_image", "choose", { filePathFrom: "runtime.validImage.path", fileNameFrom: "data.validImageFileName" }),
      step("Action-2", "playwright", "feedback_create.add_image.choose_text", "通过新建反馈表单的 \"添加图片或附件\" 操作选择本用例文本附件文件", "feedback_create.add_image", "choose", { filePathFrom: "runtime.textAttachment.path", fileNameFrom: "data.textAttachmentFileName" }),
    ],
  },
  S1: {
    description: "有效图片和文本文件均被添加为反馈附件",
    assertions: [
      step("S1-1", "playwright", "feedback_create.description_input.contains_image", "新建反馈表单的反馈描述输入区域 应包含 本用例有效图片附件展示文本", "feedback_create.description_input", "contains_image_reference", { fileNameFrom: "data.validImageFileName" }),
      step("S1-2", "playwright", "feedback_create.pending_attachments.contains_image", "新建反馈表单的待提交附件列表 应显示 本用例有效图片文件", "feedback_create.pending_attachments", "contains_file", { fileNameFrom: "data.validImageFileName" }),
      step("S1-3", "playwright", "feedback_create.description_input.contains_text_attachment", "新建反馈表单的反馈描述输入区域 应包含 本用例文本附件展示文本", "feedback_create.description_input", "contains_attachment_reference", { fileNameFrom: "data.textAttachmentFileName" }),
      step("S1-4", "playwright", "feedback_create.pending_attachments.contains_text", "新建反馈表单的待提交附件列表 应显示 本用例文本附件文件", "feedback_create.pending_attachments", "contains_file", { fileNameFrom: "data.textAttachmentFileName" }),
      step("S1-5", "api", "session.authenticated.after_upload", "当前会话 应仍为 邮箱为 `orf-default-page-feedback-image-e2e@orf.local`、角色为 `admin`、状态为 `active` 的已登录会话", "auth.session", "authenticated", { emailFrom: "data.email", roleFrom: "data.role", status: "active" }),
    ],
  },
  Clean: {
    description: "删除新建反馈图片上传测试用户并恢复未登录基准状态",
    steps: [
      step("Clean-1", "api", "auth.logout", "注销当前登录会话", "auth", "logout"),
      step("Clean-2", "playwright", "page.runtime.stop", "离开当前 ORF 前端页面", "page.runtime", "stop"),
      step("Clean-3", "playwright", "browser.clear", "移除当前浏览器中的残留登录态", "browser", "clear_state"),
      step("Clean-4", "api", "ory.sessions.revoke", "撤销邮箱为 `orf-default-page-feedback-image-e2e@orf.local` 的新建反馈图片上传测试认证身份的残留登录会话", "ory.sessions", "revoke_by_email", { emailFrom: "data.email" }),
      step("Clean-5", "api", "ory.identity.delete", "删除邮箱为 `orf-default-page-feedback-image-e2e@orf.local` 的新建反馈图片上传测试认证身份", "ory.identity", "delete_by_email", { emailFrom: "data.email" }),
      step("Clean-6", "api", "preferences.default_landing_path.reset", "恢复邮箱为 `orf-default-page-feedback-image-e2e@orf.local` 的默认进入页面为 系统默认", "user.preferences", "reset_default_landing_path_by_email", { emailFrom: "data.email" }),
      step("Clean-7", "prisma", "db.user.memberships.delete", "删除邮箱为 `orf-default-page-feedback-image-e2e@orf.local` 的新建反馈图片上传测试用户的默认团队成员关系", "db.user", "delete_memberships", { emailFrom: "data.email" }),
      step("Clean-8", "prisma", "db.user.delete", "删除邮箱为 `orf-default-page-feedback-image-e2e@orf.local` 的新建反馈图片上传测试用户", "db.user", "delete", { emailFrom: "data.email" }),
      step("Clean-9", "api", "ory.identity.absent", "邮箱为 `orf-default-page-feedback-image-e2e@orf.local` 的新建反馈图片上传测试认证身份 应不存在", "ory.identity", "absent", { emailFrom: "data.email" }),
      step("Clean-10", "prisma", "db.user.absent", "邮箱为 `orf-default-page-feedback-image-e2e@orf.local` 的新建反馈图片上传测试用户 应不存在", "db.user", "absent", { emailFrom: "data.email" }),
    ],
  },
} satisfies StateCaseSpec<FeedbackImageUploadCaseData>;
