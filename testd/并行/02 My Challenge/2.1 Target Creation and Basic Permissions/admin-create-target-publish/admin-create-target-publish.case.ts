import { STATE_CASE_MODEL, type StateCaseSpec } from "../../../../_framework/types";
import type { AdminCreateTargetPublishCaseData } from "./_support/admin-create-target-publish.context";

export const adminCreateTargetPublishCase = {
  id: "target.admin-create-target-publish",
  title: "管理员可以新建目标并发布",
  model: STATE_CASE_MODEL,
  tags: ["target", "create", "publish", "admin", "happy-path"],

  data: {
    adminEmail: "orf-admin-create-target-publish-e2e@orf.local",
    adminPassword: "OrfAdminCreateTargetPublishE2E!2026",
    adminName: "ORF Admin Create Target Publish E2E",
    adminRole: "admin",
    adminStatus: "active",
    objectiveTitle: "E2E-TARGET-PUBLISH-ADMIN",
  },

  B: {
    description: "系统服务可用，浏览器处于未登录基准状态",
    assertions: [
      { source: { caseStepId: "B-1", method: "api" }, id: "frontend.ready", title: "前端服务 应可用", object: "frontend.service", operator: "available" },
      { source: { caseStepId: "B-2", method: "api" }, id: "backend.ready", title: "后端服务 应可用", object: "api.health", operator: "ok" },
      { source: { caseStepId: "B-3", method: "prisma" }, id: "db.ready", title: "ORF 数据库 应可连接", object: "db", operator: "ready" },
      { source: { caseStepId: "B-4", method: "api" }, id: "session.unauthenticated", title: "当前会话 应为 未登录", object: "auth.session", operator: "unauthenticated" },
      { source: { caseStepId: "B-5", method: "playwright" }, id: "storage.empty", title: "当前浏览器 应不保留本地登录态", object: "browser.auth_storage", operator: "empty" },
    ],
  },

  Setup: {
    description: "清理残留目标，准备管理员并登录 ORF",
    steps: [
      { source: { caseStepId: "Setup-1", method: "prisma" }, id: "db.objective.delete_residue", title: "删除 本用例残留的目标 `E2E-TARGET-PUBLISH-ADMIN` 及其派生数据", object: "db.objective", operator: "delete_by_title", params: { titleFrom: "data.objectiveTitle" } },
      { source: { caseStepId: "Setup-2", method: "api" }, id: "ory.admin_identity.upsert", title: "准备邮箱为 `orf-admin-create-target-publish-e2e@orf.local`、使用固定测试密码的管理员登录身份", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.adminEmail", nameFrom: "data.adminName", passwordFrom: "data.adminPassword", saveAs: "adminIdentity" } },
      { source: { caseStepId: "Setup-3", method: "prisma" }, id: "db.admin_user.upsert", title: "准备 角色为 `admin`、状态为 `active` 的本用例管理员用户", object: "db.user", operator: "upsert", params: { emailFrom: "data.adminEmail", nameFrom: "data.adminName", roleFrom: "data.adminRole", statusFrom: "data.adminStatus", identityIdFrom: "runtime.adminIdentity.id", saveAs: "adminUser" } },
      { source: { caseStepId: "Setup-4", method: "playwright" }, id: "auth.login.admin", title: "使用 本用例管理员账号 登录 ORF", object: "page.auth", operator: "login", params: { emailFrom: "data.adminEmail", passwordFrom: "data.adminPassword" } },
    ],
  },

  S0: {
    description: "管理员已登录，顶部新建目标入口可用",
    assertions: [
      { source: { caseStepId: "S0-1", method: "api" }, id: "session.authenticated", title: "当前会话 应为 已登录", object: "auth.session", operator: "authenticated" },
      { source: { caseStepId: "S0-2", method: "api" }, id: "session.role", title: "当前会话用户角色 应为 `admin`", object: "auth.session.user_role", operator: "equals", params: { roleFrom: "data.adminRole" } },
      { source: { caseStepId: "S0-3", method: "playwright" }, id: "create_objective.visible", title: "\"新建目标\" 操作 应可见", object: "page.create_objective_action", operator: "visible" },
      { source: { caseStepId: "S0-4", method: "playwright" }, id: "create_objective.enabled", title: "\"新建目标\" 操作 应可点击", object: "page.create_objective_action", operator: "enabled" },
    ],
  },

  Action: {
    description: "管理员通过新建目标入口创建并发布目标",
    steps: [
      { source: { caseStepId: "Action-1", method: "playwright" }, id: "create_objective.click", title: "点击 \"新建目标\" 操作", object: "page.create_objective_action", operator: "click" },
      { source: { caseStepId: "Action-2", method: "playwright" }, id: "url.tasks", title: "当前页面 应为 我的挑战", object: "page.url", operator: "match", params: { pattern: "/tasks$" } },
      { source: { caseStepId: "Action-3", method: "playwright" }, id: "scope.all.selected", title: "\"所有挑战\" 视图 应处于选中状态", object: "page.challenge_scope", operator: "selected", params: { label: "所有挑战" } },
      { source: { caseStepId: "Action-4", method: "playwright" }, id: "project.unassigned.selected", title: "\"未归属目标\" 项目筛选 应处于选中状态", object: "page.challenge_project_filter", operator: "selected", params: { label: "未归属目标" } },
      { source: { caseStepId: "Action-5", method: "playwright" }, id: "draft_title.fill", title: "在新建目标标题输入框输入 `E2E-TARGET-PUBLISH-ADMIN`", object: "page.objective_draft_title", operator: "fill", params: { titleFrom: "data.objectiveTitle" } },
      { source: { caseStepId: "Action-6", method: "playwright" }, id: "draft_title.submit", title: "提交 新建目标标题", object: "page.objective_draft_title", operator: "submit", params: { titleFrom: "data.objectiveTitle", saveAs: "createdObjective" } },
      { source: { caseStepId: "Action-7", method: "playwright" }, id: "objective.visible.in_unassigned", title: "我的挑战的 \"所有挑战 / 未归属目标\" 中应显示目标 `E2E-TARGET-PUBLISH-ADMIN`", object: "page.challenge_objective", operator: "visible", params: { objectiveFrom: "runtime.createdObjective" } },
      { source: { caseStepId: "Action-8", method: "playwright" }, id: "objective.publish.click", title: "点击目标 `E2E-TARGET-PUBLISH-ADMIN` 的 \"发布\" 操作", object: "page.challenge_objective", operator: "publish", params: { objectiveFrom: "runtime.createdObjective", saveAs: "publishedObjective" } },
    ],
  },

  S1: {
    description: "发布后目标可征召挑战者，并在悬赏大厅可见",
    assertions: [
      { source: { caseStepId: "S1-1", method: "playwright" }, id: "objective.recruit.visible", title: "目标 `E2E-TARGET-PUBLISH-ADMIN` 的 \"征召\" 操作 应可见", object: "page.challenge_objective", operator: "recruit_action_visible", params: { objectiveFrom: "runtime.publishedObjective" } },
      { source: { caseStepId: "S1-2", method: "playwright" }, id: "objective.recruit.enabled", title: "目标 `E2E-TARGET-PUBLISH-ADMIN` 的 \"征召\" 操作 应可点击", object: "page.challenge_objective", operator: "recruit_action_enabled", params: { objectiveFrom: "runtime.publishedObjective" } },
      { source: { caseStepId: "S1-3", method: "api" }, id: "bounty.api.contains", title: "悬赏大厅数据 应包含目标 `E2E-TARGET-PUBLISH-ADMIN`", object: "api.bounty_hall", operator: "contains_objective", params: { objectiveFrom: "runtime.publishedObjective" } },
      { source: { caseStepId: "S1-4", method: "playwright" }, id: "page.goto.bounties", title: "打开 悬赏大厅", object: "page", operator: "goto", params: { path: "/bounties" } },
      { source: { caseStepId: "S1-5", method: "playwright" }, id: "bounty.page.visible", title: "悬赏大厅 应显示目标 `E2E-TARGET-PUBLISH-ADMIN`", object: "page.bounty_hall", operator: "objective_visible", params: { objectiveFrom: "runtime.publishedObjective" } },
      { source: { caseStepId: "S1-6", method: "prisma" }, id: "db.objective.published_at", title: "目标 `E2E-TARGET-PUBLISH-ADMIN` 的发布时间 应不为空", object: "db.objective_publication", operator: "published", params: { objectiveFrom: "runtime.publishedObjective" } },
    ],
  },

  Clean: {
    description: "删除本用例创建的目标、管理员身份和浏览器登录态",
    steps: [
      { source: { caseStepId: "Clean-1", method: "prisma" }, id: "db.objective.delete_created", title: "删除 本用例创建的目标 `E2E-TARGET-PUBLISH-ADMIN` 及其派生数据", object: "db.objective", operator: "delete", params: { idFrom: "runtime.createdObjective.id", titleFrom: "data.objectiveTitle" } },
      { source: { caseStepId: "Clean-2", method: "api" }, id: "auth.logout", title: "注销当前登录会话", object: "auth", operator: "logout" },
      { source: { caseStepId: "Clean-3", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Clean-4", method: "api" }, id: "ory.admin_identity.delete", title: "删除 本用例管理员登录身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-5", method: "prisma" }, id: "db.admin_user.delete", title: "删除 本用例管理员用户", object: "db.user", operator: "delete", params: { emailFrom: "data.adminEmail" } },
    ],
  },
} satisfies StateCaseSpec<AdminCreateTargetPublishCaseData>;
