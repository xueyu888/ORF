import { STATE_CASE_MODEL, type StateCaseSpec } from "../../_framework/types";
import type { ObjectiveCommentCaseData } from "./_support/objective-comment.context";

export const objectiveCommentCreateCase = {
  id: "comments.objective-comment",
  title: "目标新增评论",
  model: STATE_CASE_MODEL,
  tags: ["comments", "objective", "create", "admin", "happy-path"],

  data: {
    email: "orf-admin-objective-comment-e2e@orf.local",
    password: "OrfAdminObjectiveCommentE2E!2026",
    name: "ORF Admin Objective Comment E2E",
    role: "admin",
    objectiveId: "obj-testd-objective-comment",
    objectiveTitle: "E2E-OBJECTIVE-COMMENT: 目标前置",
    commentBody: "E2E-PLAN-COMMENT: 需要补充边界样例覆盖情况",
    commentBodyPrefix: "E2E-PLAN-COMMENT:",
  },

  B: {
    description: "系统服务可用，浏览器处于未登录基准状态",
    assertions: [
      { source: { caseStepId: "B-1", method: "api" }, id: "frontend.ready", title: "前端服务 应可用", object: "frontend.service", operator: "available" },
      { source: { caseStepId: "B-2", method: "api" }, id: "backend.ready", title: "后端服务 应可用", object: "api.health", operator: "ok" },
      { source: { caseStepId: "B-3", method: "api" }, id: "frontend.login_entry.accessible", title: "前端登录页入口 应可访问", object: "frontend.login_entry", operator: "accessible" },
      { source: { caseStepId: "B-4", method: "api" }, id: "session.endpoint.accessible", title: "当前会话查询接口 应可访问", object: "auth.session", operator: "accessible" },
      { source: { caseStepId: "B-5", method: "prisma" }, id: "db.ready", title: "ORF 数据库 应可连接", object: "db", operator: "ready" },
      { source: { caseStepId: "B-6", method: "prisma" }, id: "db.schema.current", title: "ORF 数据库 schema 应为 当前测试版本", object: "db.schema", operator: "current" },
      { source: { caseStepId: "B-7", method: "api" }, id: "ory.admin_public.ready", title: "Ory/Kratos Admin/Public API 应可访问", object: "ory.admin_public", operator: "ready" },
      { source: { caseStepId: "B-8", method: "api" }, id: "session.unauthenticated", title: "当前会话 应为 未登录", object: "auth.session", operator: "unauthenticated" },
      { source: { caseStepId: "B-9", method: "playwright" }, id: "cookie.absent", title: "当前浏览器 应不存在 Ory session cookie", object: "browser.cookie", operator: "absent" },
      { source: { caseStepId: "B-10", method: "playwright" }, id: "storage.empty", title: "当前浏览器 storage 应不包含 登录态", object: "browser.auth_storage", operator: "empty" },
    ],
  },

  Setup: {
    description: "准备管理员账号和本用例独占目标，登录管理员并打开目标评论窗口",
    steps: [
      { source: { caseStepId: "Setup-1", method: "prisma" }, id: "db.test_comments.delete_residue", title: "删除可能残留的测试评论消息及空线程", object: "db.test_comments", operator: "delete", params: { prefixFrom: "data.commentBodyPrefix" } },
      { source: { caseStepId: "Setup-2", method: "prisma" }, id: "db.objective.delete_residue", title: "删除可能残留的本用例目标及其派生数据", object: "db.objective", operator: "delete_by_title", params: { titleFrom: "data.objectiveTitle" } },
      { source: { caseStepId: "Setup-3", method: "api" }, id: "ory.admin_identity.upsert", title: "准备管理员登录身份", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.email", nameFrom: "data.name", passwordFrom: "data.password", saveAs: "adminIdentity" } },
      { source: { caseStepId: "Setup-4", method: "prisma" }, id: "db.admin.upsert", title: "准备管理员用户和默认团队成员关系", object: "db.user", operator: "upsert", params: { emailFrom: "data.email", nameFrom: "data.name", roleFrom: "data.role", status: "active", identityIdFrom: "runtime.adminIdentity.id", saveAs: "adminUser" } },
      { source: { caseStepId: "Setup-5", method: "prisma" }, id: "db.objective.upsert_comment_target", title: "创建本用例独占目标", object: "db.objective", operator: "upsert", params: { idFrom: "data.objectiveId", titleFrom: "data.objectiveTitle", teamIdFrom: "runtime.adminUser.teamId", stage: "resultClaiming", flowStatus: "open", status: "Draft", saveAs: "fixtureObjective" } },
      { source: { caseStepId: "Setup-6", method: "prisma" }, id: "db.comment_target.from_objective", title: "记录本用例独占目标为 runtime.commentTarget", object: "db.comment_target", operator: "from_objective", params: { objectiveIdFrom: "runtime.fixtureObjective.id", saveAs: "commentTarget" } },
      { source: { caseStepId: "Setup-7", method: "api" }, id: "ory.admin_sessions.revoke", title: "撤销管理员登录身份可能残留的 Ory session", object: "ory.sessions", operator: "revoke_by_email", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Setup-8", method: "playwright" }, id: "browser.clear", title: "清空当前浏览器上下文的 cookies/localStorage/sessionStorage", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Setup-9", method: "playwright" }, id: "page.goto.auth", title: "打开 登录页", object: "page", operator: "goto", params: { path: "/auth" } },
      { source: { caseStepId: "Setup-10", method: "playwright" }, id: "fill.email", title: "在邮箱输入框输入管理员测试邮箱", object: "page", operator: "fill", params: { label: "Email", valueFrom: "data.email" } },
      { source: { caseStepId: "Setup-11", method: "playwright" }, id: "fill.password", title: "在密码输入框输入管理员测试密码", object: "page", operator: "fill", params: { label: "Password", exact: true, valueFrom: "data.password" } },
      { source: { caseStepId: "Setup-12", method: "playwright" }, id: "click.sign_in", title: '点击 "Sign In" 登录操作', object: "page", operator: "click", params: { role: "button", name: "Sign In" } },
      { source: { caseStepId: "Setup-13", method: "api" }, id: "session.authenticated", title: "当前会话 应为 管理员已登录", object: "auth.session", operator: "authenticated", params: { emailFrom: "data.email", roleFrom: "data.role", status: "active" } },
      { source: { caseStepId: "Setup-14", method: "playwright" }, id: "page.goto.tasks", title: "打开 计划页面", object: "page", operator: "goto", params: { path: "/tasks" } },
      { source: { caseStepId: "Setup-15", method: "api" }, id: "api.my_challenges.objective_target.present", title: "计划页数据接口 应返回 本用例独占目标", object: "api.my_challenges.objective_target", operator: "present", params: { targetFrom: "runtime.commentTarget" } },
      { source: { caseStepId: "Setup-16", method: "playwright" }, id: "page.open_objective_comment", title: "在计划页挑战树中打开本用例目标的评论窗口", object: "page.objective_comment", operator: "open", params: { targetFrom: "runtime.commentTarget" } },
    ],
  },

  S0: {
    description: "评论窗口绑定当前目标，评论输入区可用，测试评论尚不存在",
    assertions: [
      { source: { caseStepId: "S0-1", method: "api" }, id: "session.authenticated", title: "当前会话 应为 管理员已登录", object: "auth.session", operator: "authenticated", params: { emailFrom: "data.email", roleFrom: "data.role", status: "active" } },
      { source: { caseStepId: "S0-2", method: "api" }, id: "api.objective_target.present", title: "计划页数据接口 应返回 runtime.commentTarget 对应的目标对象", object: "api.my_challenges.objective_target", operator: "present", params: { targetFrom: "runtime.commentTarget" } },
      { source: { caseStepId: "S0-3", method: "playwright" }, id: "url.tasks", title: "当前页面 应为 计划页面", object: "page.url", operator: "match", params: { pattern: "/tasks$" } },
      { source: { caseStepId: "S0-4", method: "playwright" }, id: "objective_row.visible", title: "计划页面中目标行 应可见", object: "page.objective_row", operator: "visible", params: { targetFrom: "runtime.commentTarget" } },
      { source: { caseStepId: "S0-5", method: "playwright" }, id: "comment_panel.title", title: "评论窗口标题 应为 runtime.commentTarget.title", object: "page.comment_panel", operator: "title", params: { targetFrom: "runtime.commentTarget" } },
      { source: { caseStepId: "S0-6", method: "playwright" }, id: "comment_composer.ready", title: "评论输入框可见", object: "page.comment_composer", operator: "ready" },
      { source: { caseStepId: "S0-7", method: "playwright" }, id: "comment_send.disabled", title: "空评论不能发送", object: "page.comment_send", operator: "disabled" },
      { source: { caseStepId: "S0-8", method: "prisma" }, id: "db.test_comments.absent", title: "数据库中不存在本用例评论正文", object: "db.test_comments", operator: "absent", params: { prefixFrom: "data.commentBodyPrefix" } },
    ],
  },

  Action: {
    description: "输入并提交一条目标外层评论",
    steps: [
      { source: { caseStepId: "Action-1", method: "playwright" }, id: "capture.comment_response", title: "在提交前注册新增评论接口响应捕获", object: "api", operator: "capture_response", params: { urlEndsWith: "/api/comments", method: "POST", saveAs: "commentResponse" } },
      { source: { caseStepId: "Action-2", method: "playwright" }, id: "fill.comment", title: "在评论输入框中输入测试评论正文", object: "page.comment_composer", operator: "fill", params: { valueFrom: "data.commentBody" } },
      { source: { caseStepId: "Action-3", method: "playwright" }, id: "submit.comment", title: "点击发送评论操作提交评论", object: "page.comment_composer", operator: "submit" },
    ],
  },

  S1: {
    description: "评论在 UI、API 和数据库中都绑定到所选目标",
    assertions: [
      { source: { caseStepId: "S1-1", method: "api" }, id: "comment_response.matches", title: "新增评论接口响应 应成功且目标匹配", object: "api.comment_response", operator: "matches", params: { responseFrom: "runtime.commentResponse", targetFrom: "runtime.commentTarget", bodyFrom: "data.commentBody" } },
      { source: { caseStepId: "S1-2", method: "playwright" }, id: "comment.author.visible", title: "评论窗口 应显示 当前测试管理员名称", object: "page.comment_author", operator: "visible", params: { authorFrom: "data.name" } },
      { source: { caseStepId: "S1-3", method: "playwright" }, id: "comment.body.visible", title: "评论窗口 应显示 测试评论正文", object: "page.comment_body", operator: "visible", params: { bodyFrom: "data.commentBody" } },
      { source: { caseStepId: "S1-4", method: "playwright" }, id: "comment_composer.empty", title: "评论输入框 应清空", object: "page.comment_composer", operator: "empty" },
      { source: { caseStepId: "S1-5", method: "playwright" }, id: "comment_panel.close", title: "关闭评论窗口", object: "page.comment_panel", operator: "close" },
      { source: { caseStepId: "S1-6", method: "playwright" }, id: "objective_comment_badge.visible", title: "目标行 应显示评论数量入口", object: "page.objective_comment_badge", operator: "visible", params: { targetFrom: "runtime.commentTarget" } },
      { source: { caseStepId: "S1-7", method: "playwright" }, id: "objective_comment_badge.open", title: "通过评论数量入口重新打开评论窗口", object: "page.objective_comment_badge", operator: "open", params: { targetFrom: "runtime.commentTarget" } },
      { source: { caseStepId: "S1-8", method: "playwright" }, id: "comment.body.visible.after_reopen", title: "重新打开后仍能看到测试评论正文", object: "page.comment_body", operator: "visible", params: { bodyFrom: "data.commentBody" } },
      { source: { caseStepId: "S1-9", method: "api" }, id: "api.my_challenges.comment.present", title: "计划页数据接口 应返回测试评论", object: "api.my_challenges.comment", operator: "present", params: { targetFrom: "runtime.commentTarget", bodyFrom: "data.commentBody", authorFrom: "data.name" } },
      { source: { caseStepId: "S1-10", method: "prisma" }, id: "db.comment.persisted", title: "数据库中 应持久化该目标外层评论", object: "db.comment", operator: "persisted", params: { targetFrom: "runtime.commentTarget", bodyFrom: "data.commentBody", emailFrom: "data.email" } },
    ],
  },

  Clean: {
    description: "删除本用例评论、目标、管理员账号和页面会话状态",
    steps: [
      { source: { caseStepId: "Clean-1", method: "playwright" }, id: "comment_panel.close", title: "若评论窗口仍打开则关闭评论窗口", object: "page.comment_panel", operator: "close", params: { optional: true } },
      { source: { caseStepId: "Clean-2", method: "prisma" }, id: "db.test_comments.delete", title: "删除本用例创建的测试评论消息及空线程", object: "db.test_comments", operator: "delete", params: { prefixFrom: "data.commentBodyPrefix" } },
      { source: { caseStepId: "Clean-3", method: "prisma" }, id: "db.objective.delete", title: "删除本用例独占目标及其派生数据", object: "db.objective", operator: "delete", params: { idFrom: "data.objectiveId", titleFrom: "data.objectiveTitle" } },
      { source: { caseStepId: "Clean-4", method: "api" }, id: "auth.logout", title: "退出当前登录态", object: "auth", operator: "logout" },
      { source: { caseStepId: "Clean-5", method: "playwright" }, id: "page.runtime.stop", title: "停止当前页面运行态", object: "page.runtime", operator: "stop" },
      { source: { caseStepId: "Clean-6", method: "playwright" }, id: "browser.clear", title: "清空当前浏览器上下文的 cookies/localStorage/sessionStorage", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Clean-7", method: "api" }, id: "ory.admin_sessions.revoke", title: "撤销管理员登录身份的 Ory session", object: "ory.sessions", operator: "revoke_by_email", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-8", method: "api" }, id: "ory.admin_identity.delete", title: "删除管理员 Ory 身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-9", method: "prisma" }, id: "db.admin.delete_memberships", title: "删除管理员默认团队成员关系", object: "db.user", operator: "delete_memberships", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-10", method: "prisma" }, id: "db.admin.delete", title: "删除管理员用户", object: "db.user", operator: "delete", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-11", method: "prisma" }, id: "db.test_comments.absent", title: "测试评论消息 应不存在", object: "db.test_comments", operator: "absent", params: { prefixFrom: "data.commentBodyPrefix" } },
      { source: { caseStepId: "Clean-12", method: "prisma" }, id: "db.objective.absent", title: "本用例目标 应不存在", object: "db.objective", operator: "absent", params: { idFrom: "data.objectiveId", titleFrom: "data.objectiveTitle" } },
      { source: { caseStepId: "Clean-13", method: "prisma" }, id: "db.admin.absent", title: "管理员用户 应不存在", object: "db.user", operator: "absent", params: { emailFrom: "data.email" } },
    ],
  },
} satisfies StateCaseSpec<ObjectiveCommentCaseData>;
