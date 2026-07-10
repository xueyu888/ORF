import { STATE_CASE_MODEL, type StateCaseSpec } from "../../../../_framework/types";
import type { AdminRejectUncalibratedReestimateObjectiveCaseData } from "./_support/admin-reject-uncalibrated-reestimate-objective.context";

export const adminRejectUncalibratedReestimateObjectiveCase = {
  id: "target.admin-reject-uncalibrated-reestimate-objective",
  title: "管理员在指标未校准时不可完成冻结可打回重估",
  model: STATE_CASE_MODEL,
  tags: ["target", "reestimate", "freeze", "admin", "alignment-request", "metric", "negative"],

  data: {
    adminEmail: "orf-admin-reject-uncalibrated-reestimate-e2e@orf.local",
    adminPassword: "OrfAdminRejectUncalibratedReestimateE2E!2026",
    adminName: "ORF Admin Reject Uncalibrated Reestimate E2E",
    adminRole: "admin",
    adminStatus: "active",
    memberEmail: "orf-member-reject-uncalibrated-reestimate-e2e@orf.local",
    memberPassword: "OrfMemberRejectUncalibratedReestimateE2E!2026",
    memberName: "ORF Member Reject Uncalibrated Reestimate E2E",
    memberRole: "member",
    memberStatus: "active",
    targetPrefix: "E2E-TARGET-ADMIN-REJECT-UNCALIBRATED-REESTIMATE",
    target: {
      title: "E2E-TARGET-ADMIN-REJECT-UNCALIBRATED-REESTIMATE",
      stage: "orfReestimate",
      flowStatus: "reestimating",
    },
    metric: {
      title: "E2E-METRIC-ADMIN-REJECT-UNCALIBRATED-REESTIMATE",
    },
    alignmentKind: "reestimateCompletion",
    requestedStatus: "requested",
    needsWorkStatus: "needsWork",
  },

  B: {
    description: "基准状态",
    assertions: [
      { source: { caseStepId: "B-1", method: "api" }, id: "frontend.ready", title: "前端服务 应可用", object: "frontend.service", operator: "available" },
      { source: { caseStepId: "B-2", method: "api" }, id: "backend.ready", title: "后端服务 应可用", object: "api.health", operator: "ok" },
      { source: { caseStepId: "B-3", method: "prisma" }, id: "db.ready", title: "ORF 数据库 应可连接", object: "db", operator: "ready" },
      { source: { caseStepId: "B-4", method: "api" }, id: "session.unauthenticated", title: "当前会话 应为 未登录", object: "auth.session", operator: "unauthenticated" },
      { source: { caseStepId: "B-5", method: "playwright" }, id: "storage.empty", title: "当前浏览器 应不保留本地登录态", object: "browser.auth_storage", operator: "empty" },
    ],
  },

  Setup: {
    description: "构造 S0",
    steps: [
      { source: { caseStepId: "Setup-1", method: "prisma" }, id: "db.objectives.delete_residue", title: "删除 本用例残留的目标标题前缀 `E2E-TARGET-ADMIN-REJECT-UNCALIBRATED-REESTIMATE` 对应的目标及其派生数据", object: "db.objectives_by_prefix", operator: "delete", params: { prefixFrom: "data.targetPrefix" } },
      { source: { caseStepId: "Setup-2", method: "api" }, id: "ory.admin_identity.upsert", title: "准备邮箱为 `orf-admin-reject-uncalibrated-reestimate-e2e@orf.local`、使用固定测试密码的管理员登录身份", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.adminEmail", nameFrom: "data.adminName", passwordFrom: "data.adminPassword", saveAs: "adminIdentity" } },
      { source: { caseStepId: "Setup-3", method: "api" }, id: "ory.member_identity.upsert", title: "准备邮箱为 `orf-member-reject-uncalibrated-reestimate-e2e@orf.local`、使用固定测试密码的普通成员登录身份", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.memberEmail", nameFrom: "data.memberName", passwordFrom: "data.memberPassword", saveAs: "memberIdentity" } },
      { source: { caseStepId: "Setup-4", method: "prisma" }, id: "db.admin_user.upsert", title: "准备 角色为 `admin`、状态为 `active`、名称为 `ORF Admin Reject Uncalibrated Reestimate E2E` 的本用例管理员用户", object: "db.user", operator: "upsert", params: { emailFrom: "data.adminEmail", nameFrom: "data.adminName", roleFrom: "data.adminRole", statusFrom: "data.adminStatus", identityIdFrom: "runtime.adminIdentity.id", saveAs: "adminUser" } },
      { source: { caseStepId: "Setup-5", method: "prisma" }, id: "db.member_user.upsert", title: "准备 角色为 `member`、状态为 `active`、名称为 `ORF Member Reject Uncalibrated Reestimate E2E` 的本用例普通成员用户", object: "db.user", operator: "upsert", params: { emailFrom: "data.memberEmail", nameFrom: "data.memberName", roleFrom: "data.memberRole", statusFrom: "data.memberStatus", identityIdFrom: "runtime.memberIdentity.id", saveAs: "memberUser" } },
      { source: { caseStepId: "Setup-6", method: "prisma" }, id: "db.reestimate_objective.prepare", title: "准备 标题为 `E2E-TARGET-ADMIN-REJECT-UNCALIBRATED-REESTIMATE`、阶段为 `orfReestimate`、流转状态为 `reestimating`、当前挑战者包含本用例普通成员的目标", object: "db.reestimate_objective_fixture", operator: "prepare", params: { adminUserFrom: "runtime.adminUser", memberUserFrom: "runtime.memberUser", targetFrom: "data.target", saveAs: "objective" } },
      { source: { caseStepId: "Setup-7", method: "prisma" }, id: "db.metric.prepare_uncalibrated", title: "准备 归属于目标 `E2E-TARGET-ADMIN-REJECT-UNCALIBRATED-REESTIMATE`、口径为 `E2E-METRIC-ADMIN-REJECT-UNCALIBRATED-REESTIMATE`、等级积分未校准的指标", object: "db.metric", operator: "prepare_uncalibrated", params: { targetFrom: "data.target", metricFrom: "data.metric", memberUserFrom: "runtime.memberUser", saveAs: "metric" } },
      { source: { caseStepId: "Setup-8", method: "prisma" }, id: "db.alignment_request.prepare", title: "准备 归属于目标 `E2E-TARGET-ADMIN-REJECT-UNCALIBRATED-REESTIMATE`、类型为 `reestimateCompletion`、状态为 `requested`、申请人为本用例普通成员的阶段对齐申请", object: "db.objective_alignment_request", operator: "prepare", params: { targetFrom: "data.target", kindFrom: "data.alignmentKind", statusFrom: "data.requestedStatus", memberUserFrom: "runtime.memberUser", saveAs: "alignmentRequest" } },
      { source: { caseStepId: "Setup-9", method: "playwright" }, id: "auth.login.admin", title: "使用 本用例管理员账号 登录 ORF", object: "page.auth", operator: "login", params: { emailFrom: "data.adminEmail", passwordFrom: "data.adminPassword" } },
      { source: { caseStepId: "Setup-10", method: "playwright" }, id: "admin.open_my_challenges", title: "管理员打开 我的挑战", object: "page.challenge", operator: "open_my_challenges" },
      { source: { caseStepId: "Setup-11", method: "playwright" }, id: "admin.select_all_scope", title: "管理员切换到 \"所有挑战\" 视图", object: "page.challenge_scope", operator: "select", params: { label: "所有挑战" } },
    ],
  },

  S0: {
    description: "Action 前状态",
    assertions: [
      { source: { caseStepId: "S0-1", method: "api" }, id: "session.authenticated", title: "当前会话 应为 已登录", object: "auth.session", operator: "authenticated" },
      { source: { caseStepId: "S0-2", method: "api" }, id: "session.email", title: "当前会话用户邮箱 应为 `orf-admin-reject-uncalibrated-reestimate-e2e@orf.local`", object: "auth.session.user_email", operator: "equals", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "S0-3", method: "api" }, id: "session.role", title: "当前会话用户角色 应为 `admin`", object: "auth.session.user_role", operator: "equals", params: { roleFrom: "data.adminRole" } },
      { source: { caseStepId: "S0-4", method: "api" }, id: "session.name", title: "当前会话用户名称 应为 `ORF Admin Reject Uncalibrated Reestimate E2E`", object: "auth.session.user_name", operator: "equals", params: { nameFrom: "data.adminName" } },
      { source: { caseStepId: "S0-5", method: "playwright" }, id: "challenge.page.url", title: "页面 应进入 我的挑战", object: "page.challenge", operator: "url" },
      { source: { caseStepId: "S0-6", method: "playwright" }, id: "scope.all.selected", title: "\"所有挑战\" 视图 应处于选中状态", object: "page.challenge_scope", operator: "selected", params: { label: "所有挑战" } },
      { source: { caseStepId: "S0-7", method: "playwright" }, id: "objective.visible", title: "我的挑战列表 应显示目标 `E2E-TARGET-ADMIN-REJECT-UNCALIBRATED-REESTIMATE`", object: "page.challenge_objectives", operator: "visible_title", params: { titleFrom: "data.target.title" } },
      { source: { caseStepId: "S0-8", method: "playwright" }, id: "alignment.complete_not_clickable", title: "目标 `E2E-TARGET-ADMIN-REJECT-UNCALIBRATED-REESTIMATE` 的 \"完成并冻结\" 操作 应不可点击", object: "page.objective_alignment", operator: "complete_and_freeze_not_clickable", params: { targetTitleFrom: "data.target.title" } },
      { source: { caseStepId: "S0-9", method: "playwright" }, id: "alignment.reject.enabled", title: "目标 `E2E-TARGET-ADMIN-REJECT-UNCALIBRATED-REESTIMATE` 的 \"打回重估\" 操作 应可点击", object: "page.objective_alignment", operator: "reject_reestimate_enabled", params: { targetTitleFrom: "data.target.title" } },
      { source: { caseStepId: "S0-10", method: "prisma" }, id: "db.reestimate_objective.exists", title: "应存在 标题为 `E2E-TARGET-ADMIN-REJECT-UNCALIBRATED-REESTIMATE`、阶段为 `orfReestimate`、流转状态为 `reestimating` 的目标", object: "db.reestimate_objective_fixture", operator: "exists", params: { targetFrom: "data.target" } },
      { source: { caseStepId: "S0-11", method: "prisma" }, id: "db.reestimate_objective.challenger_contains", title: "目标 `E2E-TARGET-ADMIN-REJECT-UNCALIBRATED-REESTIMATE` 的当前挑战者 应包含本用例普通成员", object: "db.reestimate_objective_fixture", operator: "challenger_contains", params: { targetFrom: "data.target", memberUserFrom: "runtime.memberUser" } },
      { source: { caseStepId: "S0-12", method: "prisma" }, id: "db.metric.uncalibrated_exists", title: "应存在 归属于目标 `E2E-TARGET-ADMIN-REJECT-UNCALIBRATED-REESTIMATE`、口径为 `E2E-METRIC-ADMIN-REJECT-UNCALIBRATED-REESTIMATE`、等级积分未校准的指标", object: "db.metric", operator: "exists_uncalibrated", params: { targetFrom: "data.target", titleFrom: "data.metric.title" } },
      { source: { caseStepId: "S0-13", method: "prisma" }, id: "db.alignment_request.exists", title: "应存在 归属于目标 `E2E-TARGET-ADMIN-REJECT-UNCALIBRATED-REESTIMATE`、类型为 `reestimateCompletion`、状态为 `requested`、申请人为本用例普通成员的阶段对齐申请", object: "db.objective_alignment_request", operator: "exists", params: { targetFrom: "data.target", kindFrom: "data.alignmentKind", statusFrom: "data.requestedStatus", memberUserFrom: "runtime.memberUser" } },
      { source: { caseStepId: "S0-14", method: "prisma" }, id: "db.alignment_request.open_count", title: "目标 `E2E-TARGET-ADMIN-REJECT-UNCALIBRATED-REESTIMATE` 的 `reestimateCompletion` 类型待处理阶段对齐申请数量 应为 `1`", object: "db.objective_alignment_request", operator: "open_count", params: { targetFrom: "data.target", kindFrom: "data.alignmentKind", count: 1 } },
    ],
  },

  Action: {
    description: "被测业务动作",
    steps: [
      { source: { caseStepId: "Action-1", method: "playwright" }, id: "alignment.reject_reestimate.click", title: "点击目标 `E2E-TARGET-ADMIN-REJECT-UNCALIBRATED-REESTIMATE` 的 \"打回重估\" 操作", object: "page.objective_alignment", operator: "reject_reestimate", params: { targetTitleFrom: "data.target.title" } },
    ],
  },

  S1: {
    description: "Action 后状态",
    assertions: [
      { source: { caseStepId: "S1-1", method: "playwright" }, id: "challenge.page.url", title: "页面 应进入 我的挑战", object: "page.challenge", operator: "url" },
      { source: { caseStepId: "S1-2", method: "playwright" }, id: "scope.all.selected", title: "\"所有挑战\" 视图 应处于选中状态", object: "page.challenge_scope", operator: "selected", params: { label: "所有挑战" } },
      { source: { caseStepId: "S1-3", method: "playwright" }, id: "alignment.toast.feedback_submitted", title: "页面 应提示 对齐反馈已提交", object: "page.challenge_toast", operator: "alignment_feedback_submitted" },
      { source: { caseStepId: "S1-4", method: "playwright" }, id: "objective.visible", title: "我的挑战列表 应显示目标 `E2E-TARGET-ADMIN-REJECT-UNCALIBRATED-REESTIMATE`", object: "page.challenge_objectives", operator: "visible_title", params: { titleFrom: "data.target.title" } },
      { source: { caseStepId: "S1-5", method: "playwright" }, id: "objective.status.reestimating", title: "目标 `E2E-TARGET-ADMIN-REJECT-UNCALIBRATED-REESTIMATE` 的状态 应显示为 重估中", object: "page.challenge_objective", operator: "status_visible", params: { titleFrom: "data.target.title", statusLabel: "重估中" } },
      { source: { caseStepId: "S1-6", method: "playwright" }, id: "alignment.complete_not_clickable", title: "目标 `E2E-TARGET-ADMIN-REJECT-UNCALIBRATED-REESTIMATE` 的 \"完成并冻结\" 操作 应不可点击", object: "page.objective_alignment", operator: "complete_and_freeze_not_clickable", params: { targetTitleFrom: "data.target.title" } },
      { source: { caseStepId: "S1-7", method: "playwright" }, id: "alignment.reject.hidden", title: "目标 `E2E-TARGET-ADMIN-REJECT-UNCALIBRATED-REESTIMATE` 的 \"打回重估\" 操作 应不可见", object: "page.objective_alignment", operator: "reject_reestimate_hidden", params: { targetTitleFrom: "data.target.title" } },
      { source: { caseStepId: "S1-8", method: "playwright" }, id: "metric.visible", title: "目标 `E2E-TARGET-ADMIN-REJECT-UNCALIBRATED-REESTIMATE` 下 应显示指标口径 `E2E-METRIC-ADMIN-REJECT-UNCALIBRATED-REESTIMATE`", object: "page.challenge_metric", operator: "visible_under_objective", params: { targetTitleFrom: "data.target.title", metricTitleFrom: "data.metric.title" } },
      { source: { caseStepId: "S1-9", method: "playwright" }, id: "metric.uncalibrated.visible", title: "指标 `E2E-METRIC-ADMIN-REJECT-UNCALIBRATED-REESTIMATE` 的等级积分状态 应显示为 待校准", object: "page.metric_difficulty", operator: "uncalibrated_visible", params: { metricTitleFrom: "data.metric.title" } },
      { source: { caseStepId: "S1-10", method: "api" }, id: "api.all_challenges.contains_objective", title: "所有挑战数据 应包含目标 `E2E-TARGET-ADMIN-REJECT-UNCALIBRATED-REESTIMATE`", object: "api.all_challenges", operator: "contains_objective", params: { titleFrom: "data.target.title" } },
      { source: { caseStepId: "S1-11", method: "api" }, id: "api.all_challenges.objective_stage_flow", title: "所有挑战数据中目标 `E2E-TARGET-ADMIN-REJECT-UNCALIBRATED-REESTIMATE` 的阶段 应为 `orfReestimate`，流转状态 应为 `reestimating`", object: "api.all_challenges", operator: "objective_stage_flow", params: { targetFrom: "data.target" } },
      { source: { caseStepId: "S1-12", method: "api" }, id: "api.all_challenges.contains_uncalibrated_metric", title: "所有挑战数据中目标 `E2E-TARGET-ADMIN-REJECT-UNCALIBRATED-REESTIMATE` 应包含口径为 `E2E-METRIC-ADMIN-REJECT-UNCALIBRATED-REESTIMATE`、等级积分未校准的指标", object: "api.all_challenges", operator: "contains_uncalibrated_metric", params: { targetTitleFrom: "data.target.title", metricTitleFrom: "data.metric.title" } },
      { source: { caseStepId: "S1-13", method: "api" }, id: "api.all_challenges.contains_needs_work_alignment", title: "所有挑战数据中目标 `E2E-TARGET-ADMIN-REJECT-UNCALIBRATED-REESTIMATE` 应包含 `reestimateCompletion` 类型的已打回阶段对齐申请", object: "api.all_challenges", operator: "contains_alignment_request_status", params: { targetTitleFrom: "data.target.title", kindFrom: "data.alignmentKind", statusFrom: "data.needsWorkStatus" } },
      { source: { caseStepId: "S1-14", method: "prisma" }, id: "db.reestimate_objective.still_reestimating", title: "标题为 `E2E-TARGET-ADMIN-REJECT-UNCALIBRATED-REESTIMATE` 的目标阶段 应仍为 `orfReestimate`，流转状态 应仍为 `reestimating`", object: "db.reestimate_objective_fixture", operator: "exists", params: { targetFrom: "data.target" } },
      { source: { caseStepId: "S1-15", method: "prisma" }, id: "db.reestimate_objective.confirmed_at_absent", title: "标题为 `E2E-TARGET-ADMIN-REJECT-UNCALIBRATED-REESTIMATE` 的目标冻结时间 应不存在", object: "db.reestimate_objective_fixture", operator: "confirmed_at_absent", params: { targetFrom: "data.target" } },
      { source: { caseStepId: "S1-16", method: "prisma" }, id: "db.alignment_request.needs_work", title: "应存在 归属于目标 `E2E-TARGET-ADMIN-REJECT-UNCALIBRATED-REESTIMATE`、类型为 `reestimateCompletion`、状态为 `needsWork`、申请人为本用例普通成员、审核人为本用例管理员的阶段对齐申请", object: "db.objective_alignment_request", operator: "exists", params: { targetFrom: "data.target", kindFrom: "data.alignmentKind", statusFrom: "data.needsWorkStatus", memberUserFrom: "runtime.memberUser", adminUserFrom: "runtime.adminUser" } },
      { source: { caseStepId: "S1-17", method: "prisma" }, id: "db.alignment_request.open_count_zero", title: "目标 `E2E-TARGET-ADMIN-REJECT-UNCALIBRATED-REESTIMATE` 的 `reestimateCompletion` 类型待处理阶段对齐申请数量 应为 `0`", object: "db.objective_alignment_request", operator: "open_count", params: { targetFrom: "data.target", kindFrom: "data.alignmentKind", count: 0 } },
      { source: { caseStepId: "S1-18", method: "prisma" }, id: "db.reestimate_objective.challenger_contains", title: "目标 `E2E-TARGET-ADMIN-REJECT-UNCALIBRATED-REESTIMATE` 的当前挑战者 应仍包含本用例普通成员", object: "db.reestimate_objective_fixture", operator: "challenger_contains", params: { targetFrom: "data.target", memberUserFrom: "runtime.memberUser" } },
      { source: { caseStepId: "S1-19", method: "prisma" }, id: "db.metric.still_uncalibrated", title: "应存在 归属于目标 `E2E-TARGET-ADMIN-REJECT-UNCALIBRATED-REESTIMATE`、口径为 `E2E-METRIC-ADMIN-REJECT-UNCALIBRATED-REESTIMATE`、等级积分未校准的指标", object: "db.metric", operator: "exists_uncalibrated", params: { targetFrom: "data.target", titleFrom: "data.metric.title" } },
    ],
  },

  Clean: {
    description: "恢复 B",
    steps: [
      { source: { caseStepId: "Clean-1", method: "prisma" }, id: "db.objectives.delete_created", title: "删除 本用例创建的目标标题前缀 `E2E-TARGET-ADMIN-REJECT-UNCALIBRATED-REESTIMATE` 对应的目标及其派生数据", object: "db.objectives_by_prefix", operator: "delete", params: { prefixFrom: "data.targetPrefix" } },
      { source: { caseStepId: "Clean-2", method: "api" }, id: "auth.logout", title: "注销当前管理员登录会话", object: "auth", operator: "logout" },
      { source: { caseStepId: "Clean-3", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Clean-4", method: "api" }, id: "ory.admin_identity.delete", title: "删除 本用例管理员登录身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-5", method: "api" }, id: "ory.member_identity.delete", title: "删除 本用例普通成员登录身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-6", method: "prisma" }, id: "db.admin_user.delete", title: "删除 本用例管理员用户", object: "db.user", operator: "delete", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-7", method: "prisma" }, id: "db.member_user.delete", title: "删除 本用例普通成员用户", object: "db.user", operator: "delete", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-8", method: "prisma" }, id: "db.objectives.absent", title: "应不存在 标题前缀为 `E2E-TARGET-ADMIN-REJECT-UNCALIBRATED-REESTIMATE` 的目标", object: "db.objectives_by_prefix", operator: "absent", params: { prefixFrom: "data.targetPrefix" } },
      { source: { caseStepId: "Clean-9", method: "prisma" }, id: "db.metric.absent", title: "应不存在 标题为 `E2E-METRIC-ADMIN-REJECT-UNCALIBRATED-REESTIMATE` 的指标", object: "db.metric", operator: "absent", params: { titleFrom: "data.metric.title" } },
      { source: { caseStepId: "Clean-10", method: "api" }, id: "ory.admin_identity.absent", title: "邮箱为 `orf-admin-reject-uncalibrated-reestimate-e2e@orf.local` 的管理员登录身份 应不存在", object: "ory.identity", operator: "absent", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-11", method: "api" }, id: "ory.member_identity.absent", title: "邮箱为 `orf-member-reject-uncalibrated-reestimate-e2e@orf.local` 的普通成员登录身份 应不存在", object: "ory.identity", operator: "absent", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-12", method: "prisma" }, id: "db.admin_user.absent", title: "邮箱为 `orf-admin-reject-uncalibrated-reestimate-e2e@orf.local` 的管理员用户 应不存在", object: "db.user", operator: "absent", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-13", method: "prisma" }, id: "db.member_user.absent", title: "邮箱为 `orf-member-reject-uncalibrated-reestimate-e2e@orf.local` 的普通成员用户 应不存在", object: "db.user", operator: "absent", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-14", method: "api" }, id: "session.unauthenticated", title: "当前会话 应为 未登录", object: "auth.session", operator: "unauthenticated" },
    ],
  },
} satisfies StateCaseSpec<AdminRejectUncalibratedReestimateObjectiveCaseData>;
