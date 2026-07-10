import { STATE_CASE_MODEL, type StateCaseSpec } from "../../../../_framework/types";
import type { MemberReestimateCompleteRequestCaseData } from "./_support/member-reestimate-complete-request.context";

export const memberReestimateCompleteRequestCase = {
  id: "target.member-reestimate-complete-request",
  title: "参与的普通成员可在重估中阶段维护指标口径和等级积分并申请完成重估",
  model: STATE_CASE_MODEL,
  tags: ["target", "reestimate", "member", "alignment-request", "metric"],

  data: {
    memberEmail: "orf-member-reestimate-complete-e2e@orf.local",
    memberPassword: "OrfMemberReestimateCompleteE2E!2026",
    memberName: "ORF Member Reestimate Complete E2E",
    memberRole: "member",
    memberStatus: "active",
    targetPrefix: "E2E-TARGET-MEMBER-REESTIMATE-COMPLETE",
    target: {
      title: "E2E-TARGET-MEMBER-REESTIMATE-COMPLETE",
      stage: "orfReestimate",
      flowStatus: "reestimating",
    },
    metricTitle: "E2E-METRIC-MEMBER-REESTIMATE-COMPLETE",
    metricDifficulty: "进阶",
    metricScore: 30,
    alignmentKind: "reestimateCompletion",
    alignmentStatus: "requested",
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
      { source: { caseStepId: "Setup-1", method: "prisma" }, id: "db.objectives.delete_residue", title: "删除 本用例残留的目标标题前缀 `E2E-TARGET-MEMBER-REESTIMATE-COMPLETE` 对应的目标及其派生数据", object: "db.objectives_by_prefix", operator: "delete", params: { prefixFrom: "data.targetPrefix" } },
      { source: { caseStepId: "Setup-2", method: "api" }, id: "ory.member_identity.upsert", title: "准备邮箱为 `orf-member-reestimate-complete-e2e@orf.local`、使用固定测试密码的普通成员登录身份", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.memberEmail", nameFrom: "data.memberName", passwordFrom: "data.memberPassword", saveAs: "memberIdentity" } },
      { source: { caseStepId: "Setup-3", method: "prisma" }, id: "db.member_user.upsert", title: "准备 角色为 `member`、状态为 `active`、名称为 `ORF Member Reestimate Complete E2E` 的本用例普通成员用户", object: "db.user", operator: "upsert", params: { emailFrom: "data.memberEmail", nameFrom: "data.memberName", roleFrom: "data.memberRole", statusFrom: "data.memberStatus", identityIdFrom: "runtime.memberIdentity.id", saveAs: "memberUser" } },
      { source: { caseStepId: "Setup-4", method: "prisma" }, id: "db.reestimate_objective.prepare", title: "准备 标题为 `E2E-TARGET-MEMBER-REESTIMATE-COMPLETE`、阶段为 `orfReestimate`、流转状态为 `reestimating`、重估截止时间晚于当前时间、当前挑战者包含本用例普通成员的目标", object: "db.reestimate_objective_fixture", operator: "prepare", params: { memberUserFrom: "runtime.memberUser", targetFrom: "data.target", saveAs: "objective" } },
      { source: { caseStepId: "Setup-5", method: "playwright" }, id: "auth.login.member", title: "使用 本用例普通成员账号 登录 ORF", object: "page.auth", operator: "login", params: { emailFrom: "data.memberEmail", passwordFrom: "data.memberPassword" } },
    ],
  },

  S0: {
    description: "Action 前状态",
    assertions: [
      { source: { caseStepId: "S0-1", method: "api" }, id: "session.authenticated", title: "当前会话 应为 已登录", object: "auth.session", operator: "authenticated" },
      { source: { caseStepId: "S0-2", method: "api" }, id: "session.email", title: "当前会话用户邮箱 应为 `orf-member-reestimate-complete-e2e@orf.local`", object: "auth.session.user_email", operator: "equals", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "S0-3", method: "api" }, id: "session.role", title: "当前会话用户角色 应为 `member`", object: "auth.session.user_role", operator: "equals", params: { roleFrom: "data.memberRole" } },
      { source: { caseStepId: "S0-4", method: "api" }, id: "session.name", title: "当前会话用户名称 应为 `ORF Member Reestimate Complete E2E`", object: "auth.session.user_name", operator: "equals", params: { nameFrom: "data.memberName" } },
      { source: { caseStepId: "S0-5", method: "prisma" }, id: "db.reestimate_objective.exists", title: "应存在 标题为 `E2E-TARGET-MEMBER-REESTIMATE-COMPLETE`、阶段为 `orfReestimate`、流转状态为 `reestimating` 的目标", object: "db.reestimate_objective_fixture", operator: "exists", params: { targetFrom: "data.target" } },
      { source: { caseStepId: "S0-6", method: "prisma" }, id: "db.reestimate_objective.challenger_contains", title: "目标 `E2E-TARGET-MEMBER-REESTIMATE-COMPLETE` 的当前挑战者 应包含本用例普通成员", object: "db.reestimate_objective_fixture", operator: "challenger_contains", params: { targetFrom: "data.target", memberUserFrom: "runtime.memberUser" } },
      { source: { caseStepId: "S0-7", method: "prisma" }, id: "db.reestimate_objective.due_future", title: "目标 `E2E-TARGET-MEMBER-REESTIMATE-COMPLETE` 的重估截止时间 应晚于当前时间", object: "db.reestimate_objective_fixture", operator: "reestimate_due_future", params: { targetFrom: "data.target" } },
      { source: { caseStepId: "S0-8", method: "prisma" }, id: "db.metric.absent", title: "应不存在 标题为 `E2E-METRIC-MEMBER-REESTIMATE-COMPLETE` 的指标", object: "db.metric", operator: "absent", params: { titleFrom: "data.metricTitle" } },
      { source: { caseStepId: "S0-9", method: "prisma" }, id: "db.alignment_request.absent", title: "目标 `E2E-TARGET-MEMBER-REESTIMATE-COMPLETE` 应不存在 `reestimateCompletion` 类型的待处理阶段对齐申请", object: "db.objective_alignment_request", operator: "open_absent", params: { targetFrom: "data.target", kindFrom: "data.alignmentKind" } },
    ],
  },

  Action: {
    description: "被测业务动作",
    steps: [
      { source: { caseStepId: "Action-1", method: "playwright" }, id: "member.open_my_challenges", title: "普通成员打开 我的挑战", object: "page.challenge", operator: "open_my_challenges" },
      { source: { caseStepId: "Action-2", method: "playwright" }, id: "metric.add.click", title: "点击目标 `E2E-TARGET-MEMBER-REESTIMATE-COMPLETE` 的 \"提出指标\" 操作", object: "page.challenge_metric", operator: "click_add", params: { targetTitleFrom: "data.target.title" } },
      { source: { caseStepId: "Action-3", method: "playwright" }, id: "metric.title.fill", title: "在新增指标口径输入框输入 `E2E-METRIC-MEMBER-REESTIMATE-COMPLETE`", object: "page.metric_title_editor", operator: "fill", params: { titleFrom: "data.metricTitle" } },
      { source: { caseStepId: "Action-4", method: "playwright" }, id: "metric.title.submit", title: "提交 新增指标口径", object: "page.metric_title_editor", operator: "submit", params: { titleFrom: "data.metricTitle", saveAs: "metric" } },
      { source: { caseStepId: "Action-5", method: "playwright" }, id: "metric.difficulty.select", title: "将指标 `E2E-METRIC-MEMBER-REESTIMATE-COMPLETE` 的等级积分等级选择为 `进阶`", object: "page.metric_difficulty", operator: "select", params: { metricTitleFrom: "data.metricTitle", difficultyFrom: "data.metricDifficulty" } },
      { source: { caseStepId: "Action-6", method: "playwright" }, id: "alignment.request.click", title: "点击目标 `E2E-TARGET-MEMBER-REESTIMATE-COMPLETE` 的 \"申请完成重估\" 操作", object: "page.objective_alignment", operator: "request_reestimate_completion", params: { targetTitleFrom: "data.target.title" } },
    ],
  },

  S1: {
    description: "Action 后状态",
    assertions: [
      { source: { caseStepId: "S1-1", method: "playwright" }, id: "challenge.page.url", title: "页面 应进入 我的挑战", object: "page.challenge", operator: "url" },
      { source: { caseStepId: "S1-2", method: "playwright" }, id: "scope.mine.selected", title: "\"我的挑战\" 视图 应处于选中状态", object: "page.challenge_scope", operator: "selected", params: { label: "我的挑战" } },
      { source: { caseStepId: "S1-3", method: "playwright" }, id: "alignment.toast.requested", title: "页面 应提示 已申请重估对齐", object: "page.challenge_toast", operator: "reestimate_alignment_requested" },
      { source: { caseStepId: "S1-4", method: "playwright" }, id: "objective.visible", title: "我的挑战列表 应显示目标 `E2E-TARGET-MEMBER-REESTIMATE-COMPLETE`", object: "page.challenge_objectives", operator: "visible_title", params: { titleFrom: "data.target.title" } },
      { source: { caseStepId: "S1-5", method: "playwright" }, id: "objective.status.reestimating", title: "目标 `E2E-TARGET-MEMBER-REESTIMATE-COMPLETE` 的状态 应显示为 重估中", object: "page.challenge_objective", operator: "status_visible", params: { titleFrom: "data.target.title", statusLabel: "重估中" } },
      { source: { caseStepId: "S1-6", method: "playwright" }, id: "metric.visible", title: "目标 `E2E-TARGET-MEMBER-REESTIMATE-COMPLETE` 下 应显示指标口径 `E2E-METRIC-MEMBER-REESTIMATE-COMPLETE`", object: "page.challenge_metric", operator: "visible_under_objective", params: { targetTitleFrom: "data.target.title", metricTitleFrom: "data.metricTitle" } },
      { source: { caseStepId: "S1-7", method: "playwright" }, id: "metric.difficulty.visible", title: "指标 `E2E-METRIC-MEMBER-REESTIMATE-COMPLETE` 的等级积分等级 应显示为 `进阶`", object: "page.metric_difficulty", operator: "visible", params: { metricTitleFrom: "data.metricTitle", difficultyFrom: "data.metricDifficulty" } },
      { source: { caseStepId: "S1-8", method: "playwright" }, id: "alignment.action.hidden", title: "目标 `E2E-TARGET-MEMBER-REESTIMATE-COMPLETE` 的 \"申请完成重估\" 操作 应不可见", object: "page.objective_alignment", operator: "request_reestimate_completion_hidden", params: { targetTitleFrom: "data.target.title" } },
      { source: { caseStepId: "S1-9", method: "api" }, id: "api.my_challenges.contains_objective", title: "我的挑战数据 应包含目标 `E2E-TARGET-MEMBER-REESTIMATE-COMPLETE`", object: "api.my_challenges", operator: "contains_objective", params: { titleFrom: "data.target.title" } },
      { source: { caseStepId: "S1-10", method: "api" }, id: "api.my_challenges.contains_metric", title: "我的挑战数据中目标 `E2E-TARGET-MEMBER-REESTIMATE-COMPLETE` 应包含口径为 `E2E-METRIC-MEMBER-REESTIMATE-COMPLETE`、等级积分等级为 `进阶`、等级积分为 `30` 的指标", object: "api.my_challenges", operator: "contains_metric_with_difficulty", params: { targetTitleFrom: "data.target.title", metricTitleFrom: "data.metricTitle", difficultyFrom: "data.metricDifficulty", scoreFrom: "data.metricScore" } },
      { source: { caseStepId: "S1-11", method: "api" }, id: "api.my_challenges.contains_alignment", title: "我的挑战数据中目标 `E2E-TARGET-MEMBER-REESTIMATE-COMPLETE` 应包含 `reestimateCompletion` 类型的待处理阶段对齐申请", object: "api.my_challenges", operator: "contains_open_alignment_request", params: { targetTitleFrom: "data.target.title", kindFrom: "data.alignmentKind" } },
      { source: { caseStepId: "S1-12", method: "prisma" }, id: "db.metric.exists", title: "应存在 归属于目标 `E2E-TARGET-MEMBER-REESTIMATE-COMPLETE`、口径为 `E2E-METRIC-MEMBER-REESTIMATE-COMPLETE`、等级积分等级为 `进阶`、等级积分为 `30` 的指标", object: "db.metric", operator: "exists_with_difficulty", params: { targetFrom: "data.target", titleFrom: "data.metricTitle", difficultyFrom: "data.metricDifficulty", scoreFrom: "data.metricScore" } },
      { source: { caseStepId: "S1-13", method: "prisma" }, id: "db.alignment_request.exists", title: "应存在 归属于目标 `E2E-TARGET-MEMBER-REESTIMATE-COMPLETE`、类型为 `reestimateCompletion`、状态为 `requested`、申请人为本用例普通成员的阶段对齐申请", object: "db.objective_alignment_request", operator: "exists", params: { targetFrom: "data.target", kindFrom: "data.alignmentKind", statusFrom: "data.alignmentStatus", memberUserFrom: "runtime.memberUser" } },
      { source: { caseStepId: "S1-14", method: "prisma" }, id: "db.reestimate_objective.unchanged", title: "标题为 `E2E-TARGET-MEMBER-REESTIMATE-COMPLETE` 的目标阶段 应仍为 `orfReestimate`，流转状态 应仍为 `reestimating`", object: "db.reestimate_objective_fixture", operator: "unchanged", params: { targetFrom: "data.target" } },
      { source: { caseStepId: "S1-15", method: "prisma" }, id: "db.reestimate_objective.challenger_still_contains", title: "目标 `E2E-TARGET-MEMBER-REESTIMATE-COMPLETE` 的当前挑战者 应仍包含本用例普通成员", object: "db.reestimate_objective_fixture", operator: "challenger_contains", params: { targetFrom: "data.target", memberUserFrom: "runtime.memberUser" } },
      { source: { caseStepId: "S1-16", method: "prisma" }, id: "db.alignment_request.count", title: "目标 `E2E-TARGET-MEMBER-REESTIMATE-COMPLETE` 的 `reestimateCompletion` 类型待处理阶段对齐申请数量 应为 `1`", object: "db.objective_alignment_request", operator: "open_count", params: { targetFrom: "data.target", kindFrom: "data.alignmentKind", count: 1 } },
    ],
  },

  Clean: {
    description: "恢复 B",
    steps: [
      { source: { caseStepId: "Clean-1", method: "prisma" }, id: "db.objectives.delete_created", title: "删除 本用例创建的目标标题前缀 `E2E-TARGET-MEMBER-REESTIMATE-COMPLETE` 对应的目标及其派生数据", object: "db.objectives_by_prefix", operator: "delete", params: { prefixFrom: "data.targetPrefix" } },
      { source: { caseStepId: "Clean-2", method: "api" }, id: "auth.logout", title: "注销当前普通成员登录会话", object: "auth", operator: "logout" },
      { source: { caseStepId: "Clean-3", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Clean-4", method: "api" }, id: "ory.member_identity.delete", title: "删除 本用例普通成员登录身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-5", method: "prisma" }, id: "db.member_user.delete", title: "删除 本用例普通成员用户", object: "db.user", operator: "delete", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-6", method: "prisma" }, id: "db.objectives.absent", title: "应不存在 标题前缀为 `E2E-TARGET-MEMBER-REESTIMATE-COMPLETE` 的目标", object: "db.objectives_by_prefix", operator: "absent", params: { prefixFrom: "data.targetPrefix" } },
      { source: { caseStepId: "Clean-7", method: "prisma" }, id: "db.metric.absent", title: "应不存在 标题为 `E2E-METRIC-MEMBER-REESTIMATE-COMPLETE` 的指标", object: "db.metric", operator: "absent", params: { titleFrom: "data.metricTitle" } },
      { source: { caseStepId: "Clean-8", method: "api" }, id: "ory.member_identity.absent", title: "邮箱为 `orf-member-reestimate-complete-e2e@orf.local` 的普通成员登录身份 应不存在", object: "ory.identity", operator: "absent", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-9", method: "prisma" }, id: "db.member_user.absent", title: "邮箱为 `orf-member-reestimate-complete-e2e@orf.local` 的普通成员用户 应不存在", object: "db.user", operator: "absent", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-10", method: "api" }, id: "session.unauthenticated", title: "当前会话 应为 未登录", object: "auth.session", operator: "unauthenticated" },
    ],
  },
} satisfies StateCaseSpec<MemberReestimateCompleteRequestCaseData>;
