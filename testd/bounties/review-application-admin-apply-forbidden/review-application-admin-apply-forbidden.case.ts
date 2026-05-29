import { STATE_CASE_MODEL, type StateCaseSpec } from "../../_framework/types";
import type { ReviewApplicationAdminApplyForbiddenCaseData } from "./_support/review-application-admin-apply-forbidden.context";

export const reviewApplicationAdminApplyForbiddenCase = {
  id: "bounties.review-application.admin-apply-forbidden",
  title: "成员申请挑战审批-管理员不可申请挑战",
  model: STATE_CASE_MODEL,
  tags: ["bounties", "challenge-application", "apply", "admin", "permission", "negative-path"],

  data: {
    email: "orf-admin-apply-forbidden-e2e@orf.local",
    password: "OrfAdminApplyForbiddenE2E!2026",
    name: "ORF Admin Apply Forbidden E2E",
    role: "admin",
    objectiveId: "obj-testd-admin-apply-forbidden",
    objectiveTitle: "E2E-APPLY-FORBIDDEN: 管理员不可申请挑战",
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
    description: "准备管理员、本用例独占申请目标，并完成管理员登录",
    steps: [
      { source: { caseStepId: "Setup-1", method: "prisma" }, id: "db.objective.delete_residue", title: "删除 本用例残留的申请目标及其派生数据", object: "db.objective", operator: "delete_by_title", params: { titleFrom: "data.objectiveTitle" } },
      { source: { caseStepId: "Setup-2", method: "api" }, id: "ory.admin_identity.upsert", title: "准备邮箱为 `orf-admin-apply-forbidden-e2e@orf.local`、使用固定测试密码的管理员登录身份", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.email", nameFrom: "data.name", passwordFrom: "data.password", saveAs: "adminIdentity" } },
      { source: { caseStepId: "Setup-3", method: "prisma" }, id: "db.admin_user_record.upsert", title: "准备邮箱为 `orf-admin-apply-forbidden-e2e@orf.local`、状态为 `active` 的管理员用户记录", object: "db.user_record", operator: "upsert", params: { emailFrom: "data.email", nameFrom: "data.name", status: "active", identityIdFrom: "runtime.adminIdentity.id", saveAs: "adminUserRecord" } },
      { source: { caseStepId: "Setup-4", method: "prisma" }, id: "db.admin_membership.upsert", title: "准备邮箱为 `orf-admin-apply-forbidden-e2e@orf.local` 的管理员用户默认团队成员关系，角色为 `admin`", object: "db.default_team_membership", operator: "upsert", params: { emailFrom: "data.email", roleFrom: "data.role", saveAs: "adminUser" } },
      { source: { caseStepId: "Setup-5", method: "prisma" }, id: "db.apply_target.upsert", title: "创建标题为 `E2E-APPLY-FORBIDDEN: 管理员不可申请挑战`、流转状态为 `open`、阶段为 `resultClaiming` 的本用例申请目标", object: "db.admin_apply_forbidden_target", operator: "upsert", params: { idFrom: "data.objectiveId", titleFrom: "data.objectiveTitle", teamIdFrom: "runtime.adminUser.teamId", adminNameFrom: "data.name", createdByFrom: "runtime.adminUser.userId", updatedByFrom: "runtime.adminUser.userId", saveAs: "applyTarget" } },
      { source: { caseStepId: "Setup-6", method: "api" }, id: "ory.admin_sessions.revoke", title: "撤销管理员登录身份的残留登录会话", object: "ory.sessions", operator: "revoke_by_email", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Setup-7", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Setup-8", method: "playwright" }, id: "page.goto.auth", title: "打开 ORF 登录页", object: "page", operator: "goto", params: { path: "/auth" } },
      { source: { caseStepId: "Setup-9", method: "playwright" }, id: "fill.email", title: "在邮箱输入框输入管理员固定测试邮箱", object: "page", operator: "fill", params: { label: "Email", valueFrom: "data.email" } },
      { source: { caseStepId: "Setup-10", method: "playwright" }, id: "fill.password", title: "在密码输入框输入管理员固定测试密码", object: "page", operator: "fill", params: { label: "Password", exact: true, valueFrom: "data.password" } },
      { source: { caseStepId: "Setup-11", method: "playwright" }, id: "click.sign_in", title: "点击 \"Sign In\" 登录操作", object: "page", operator: "click", params: { role: "button", name: "Sign In" } },
    ],
  },

  S0: {
    description: "管理员已登录，本用例申请目标处于可申请状态且未产生管理员申请",
    assertions: [
      { source: { caseStepId: "S0-1", method: "api" }, id: "session.authenticated", title: "当前会话 应为 已登录", object: "auth.session", operator: "authenticated" },
      { source: { caseStepId: "S0-2", method: "api" }, id: "session.email", title: "当前会话用户邮箱 应为 `orf-admin-apply-forbidden-e2e@orf.local`", object: "auth.session.user_email", operator: "equals", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "S0-3", method: "api" }, id: "session.role", title: "当前会话用户角色 应为 `admin`", object: "auth.session.user_role", operator: "equals", params: { roleFrom: "data.role" } },
      { source: { caseStepId: "S0-4", method: "api" }, id: "session.status", title: "当前会话用户状态 应为 `active`", object: "auth.session.user_status", operator: "equals", params: { status: "active" } },
      { source: { caseStepId: "S0-5", method: "prisma" }, id: "db.apply_target.flow_status", title: "本用例申请目标的流转状态 应为 `open`", object: "db.admin_apply_forbidden_target", operator: "flow_status", params: { targetFrom: "runtime.applyTarget", status: "open" } },
      { source: { caseStepId: "S0-6", method: "prisma" }, id: "db.apply_target.stage", title: "本用例申请目标的阶段 应为 `resultClaiming`", object: "db.admin_apply_forbidden_target", operator: "stage", params: { targetFrom: "runtime.applyTarget", stage: "resultClaiming" } },
      { source: { caseStepId: "S0-7", method: "prisma" }, id: "db.apply_target.application_absent", title: "\"ORF Admin Apply Forbidden E2E\" 对本用例申请目标的挑战申请 应不存在", object: "db.admin_apply_forbidden_target", operator: "application_absent", params: { targetFrom: "runtime.applyTarget", applicantFrom: "data.name" } },
      { source: { caseStepId: "S0-8", method: "prisma" }, id: "db.apply_target.challenger_absent", title: "本用例申请目标的挑战者列表 应不包含 \"ORF Admin Apply Forbidden E2E\"", object: "db.admin_apply_forbidden_target", operator: "challenger_absent", params: { targetFrom: "runtime.applyTarget", applicantFrom: "data.name" } },
    ],
  },

  Action: {
    description: "管理员进入悬赏大厅，点击申请目标的申请操作并读取管理员视角的悬赏大厅数据",
    steps: [
      { source: { caseStepId: "Action-1", method: "playwright" }, id: "page.goto.bounties", title: "管理员打开 悬赏大厅", object: "page", operator: "goto", params: { path: "/bounties" } },
      { source: { caseStepId: "Action-2", method: "playwright" }, id: "apply_target.apply_visible", title: "本用例申请目标的 \"申请挑战\" 操作 应可见", object: "page.admin_bounty_row", operator: "apply_visible", params: { targetFrom: "runtime.applyTarget" } },
      { source: { caseStepId: "Action-3", method: "playwright" }, id: "apply_target.apply", title: "点击 本用例申请目标的 \"申请挑战\" 操作", object: "page.admin_bounty_row", operator: "apply", params: { targetFrom: "runtime.applyTarget" } },
      { source: { caseStepId: "Action-4", method: "api" }, id: "api.admin_bounties.read", title: "读取 管理员悬赏大厅数据", object: "api.admin_bounties", operator: "read", params: { saveAs: "adminBountyHallAfter" } },
    ],
  },

  S1: {
    description: "管理员申请挑战被前端阻拦，申请目标状态保持不变",
    assertions: [
      { source: { caseStepId: "S1-1", method: "playwright" }, id: "url.bounties", title: "当前页面 应为 悬赏大厅", object: "page.url", operator: "match", params: { pattern: "/bounties$" } },
      { source: { caseStepId: "S1-2", method: "api" }, id: "api.admin_bounties.objective_present", title: "管理员悬赏大厅数据 应包含 本用例申请目标", object: "api.admin_bounties", operator: "objective_present", params: { targetFrom: "runtime.applyTarget" } },
      { source: { caseStepId: "S1-3", method: "api" }, id: "api.admin_bounties.current_application_absent", title: "管理员悬赏大厅数据中的本用例申请目标 应不标记为 已申请", object: "api.admin_bounties", operator: "current_application_absent", params: { targetFrom: "runtime.applyTarget" } },
      { source: { caseStepId: "S1-4", method: "playwright" }, id: "apply_blocker.visible", title: "\"指挥官不应该申请挑战\" 阻拦弹窗 应可见", object: "page.admin_apply_blocker", operator: "visible" },
      { source: { caseStepId: "S1-5", method: "playwright" }, id: "apply_blocker.acknowledge_visible", title: "\"我知道了\" 操作 应可见", object: "page.admin_apply_blocker", operator: "acknowledge_visible" },
      { source: { caseStepId: "S1-6", method: "prisma" }, id: "db.apply_target.application_still_absent", title: "\"ORF Admin Apply Forbidden E2E\" 对本用例申请目标的挑战申请 应仍不存在", object: "db.admin_apply_forbidden_target", operator: "application_absent", params: { targetFrom: "runtime.applyTarget", applicantFrom: "data.name" } },
      { source: { caseStepId: "S1-7", method: "prisma" }, id: "db.apply_target.challenger_still_absent", title: "本用例申请目标的挑战者列表 应仍不包含 \"ORF Admin Apply Forbidden E2E\"", object: "db.admin_apply_forbidden_target", operator: "challenger_absent", params: { targetFrom: "runtime.applyTarget", applicantFrom: "data.name" } },
      { source: { caseStepId: "S1-8", method: "prisma" }, id: "db.apply_target.flow_still_open", title: "本用例申请目标的流转状态 应仍为 `open`", object: "db.admin_apply_forbidden_target", operator: "flow_status", params: { targetFrom: "runtime.applyTarget", status: "open" } },
      { source: { caseStepId: "S1-9", method: "prisma" }, id: "db.apply_target.stage_still_result_claiming", title: "本用例申请目标的阶段 应仍为 `resultClaiming`", object: "db.admin_apply_forbidden_target", operator: "stage", params: { targetFrom: "runtime.applyTarget", stage: "resultClaiming" } },
      { source: { caseStepId: "S1-10", method: "api" }, id: "session.authenticated", title: "当前会话 应为 已登录", object: "auth.session", operator: "authenticated" },
      { source: { caseStepId: "S1-11", method: "api" }, id: "session.email", title: "当前会话用户邮箱 应为 `orf-admin-apply-forbidden-e2e@orf.local`", object: "auth.session.user_email", operator: "equals", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "S1-12", method: "api" }, id: "session.role", title: "当前会话用户角色 应为 `admin`", object: "auth.session.user_role", operator: "equals", params: { roleFrom: "data.role" } },
      { source: { caseStepId: "S1-13", method: "api" }, id: "session.status", title: "当前会话用户状态 应为 `active`", object: "auth.session.user_status", operator: "equals", params: { status: "active" } },
    ],
  },

  Clean: {
    description: "删除本用例目标、管理员身份和浏览器状态",
    steps: [
      { source: { caseStepId: "Clean-1", method: "prisma" }, id: "db.objective.delete", title: "删除 本用例申请目标及其派生数据", object: "db.objective", operator: "delete", params: { idFrom: "data.objectiveId", titleFrom: "data.objectiveTitle" } },
      { source: { caseStepId: "Clean-2", method: "api" }, id: "auth.logout", title: "注销当前登录会话", object: "auth", operator: "logout" },
      { source: { caseStepId: "Clean-3", method: "playwright" }, id: "page.runtime.stop", title: "离开当前 ORF 前端页面", object: "page.runtime", operator: "stop" },
      { source: { caseStepId: "Clean-4", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Clean-5", method: "api" }, id: "ory.admin_sessions.revoke", title: "撤销管理员登录身份的残留登录会话", object: "ory.sessions", operator: "revoke_by_email", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-6", method: "api" }, id: "ory.admin_identity.delete", title: "删除邮箱为 `orf-admin-apply-forbidden-e2e@orf.local` 的管理员登录身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-7", method: "prisma" }, id: "db.admin_membership.delete", title: "删除邮箱为 `orf-admin-apply-forbidden-e2e@orf.local` 的管理员用户默认团队成员关系", object: "db.user", operator: "delete_memberships", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-8", method: "prisma" }, id: "db.admin_user.delete", title: "删除邮箱为 `orf-admin-apply-forbidden-e2e@orf.local` 的管理员用户", object: "db.user", operator: "delete", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-9", method: "prisma" }, id: "db.objective.absent", title: "应不存在 标题为 `E2E-APPLY-FORBIDDEN: 管理员不可申请挑战` 的测试目标", object: "db.objective", operator: "absent", params: { idFrom: "data.objectiveId", titleFrom: "data.objectiveTitle" } },
      { source: { caseStepId: "Clean-10", method: "api" }, id: "ory.admin_identity.absent", title: "邮箱为 `orf-admin-apply-forbidden-e2e@orf.local` 的管理员登录身份 应不存在", object: "ory.identity", operator: "absent", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-11", method: "prisma" }, id: "db.admin_user.absent", title: "邮箱为 `orf-admin-apply-forbidden-e2e@orf.local` 的管理员用户 应不存在", object: "db.user", operator: "absent", params: { emailFrom: "data.email" } },
    ],
  },
} satisfies StateCaseSpec<ReviewApplicationAdminApplyForbiddenCaseData>;
