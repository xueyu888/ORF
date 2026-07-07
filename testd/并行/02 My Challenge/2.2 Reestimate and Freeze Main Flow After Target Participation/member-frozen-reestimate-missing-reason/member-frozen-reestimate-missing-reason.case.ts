import { STATE_CASE_MODEL, type StateCaseSpec } from "../../../../_framework/types";
import type { MemberFrozenReestimateMissingReasonCaseData } from "./_support/member-frozen-reestimate-missing-reason.context";

export const memberFrozenReestimateMissingReasonCase = {
  id: "target.member-frozen-reestimate-missing-reason",
  title: "普通成员在已冻结阶段未填写重新重估理由时不可提交重开重估申请",
  model: STATE_CASE_MODEL,
  tags: ["target", "reestimate", "frozen", "member", "alignment-request", "negative", "metric"],

  data: {
    memberEmail: "orf-member-frozen-reestimate-missing-reason-e2e@orf.local",
    memberPassword: "OrfMemberFrozenReestimateMissingReasonE2E!2026",
    memberName: "ORF Member Frozen Reestimate Missing Reason E2E",
    memberRole: "member",
    memberStatus: "active",
    targetPrefix: "E2E-TARGET-MEMBER-FROZEN-REESTIMATE-MISSING-REASON",
    target: {
      title: "E2E-TARGET-MEMBER-FROZEN-REESTIMATE-MISSING-REASON",
      stage: "goalFrozen",
      flowStatus: "frozen",
      finalDueOffsetDays: 8,
    },
    metric: {
      title: "E2E-METRIC-MEMBER-FROZEN-REESTIMATE-MISSING-REASON",
      difficulty: "进阶",
      score: 30,
    },
    alignmentKind: "frozenReestimate",
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
      { source: { caseStepId: "Setup-1", method: "prisma" }, id: "db.objectives.delete_residue", title: "删除 本用例残留的目标标题前缀 `E2E-TARGET-MEMBER-FROZEN-REESTIMATE-MISSING-REASON` 对应的目标及其派生数据", object: "db.objectives_by_prefix", operator: "delete", params: { prefixFrom: "data.targetPrefix" } },
      { source: { caseStepId: "Setup-2", method: "api" }, id: "ory.member_identity.upsert", title: "准备邮箱为 `orf-member-frozen-reestimate-missing-reason-e2e@orf.local`、使用固定测试密码的普通成员登录身份", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.memberEmail", nameFrom: "data.memberName", passwordFrom: "data.memberPassword", saveAs: "memberIdentity" } },
      { source: { caseStepId: "Setup-3", method: "prisma" }, id: "db.member_user.upsert", title: "准备 角色为 `member`、状态为 `active`、名称为 `ORF Member Frozen Reestimate Missing Reason E2E` 的本用例普通成员用户", object: "db.user", operator: "upsert", params: { emailFrom: "data.memberEmail", nameFrom: "data.memberName", roleFrom: "data.memberRole", statusFrom: "data.memberStatus", identityIdFrom: "runtime.memberIdentity.id", saveAs: "memberUser" } },
      { source: { caseStepId: "Setup-4", method: "prisma" }, id: "db.frozen_objective.prepare", title: "准备 标题为 `E2E-TARGET-MEMBER-FROZEN-REESTIMATE-MISSING-REASON`、阶段为 `goalFrozen`、流转状态为 `frozen`、最终验收截止日为运行时当前日期后 `8` 天、冻结时间存在、当前挑战者包含本用例普通成员的目标", object: "db.frozen_objective_fixture", operator: "prepare", params: { memberUserFrom: "runtime.memberUser", targetFrom: "data.target", saveAs: "objective" } },
      { source: { caseStepId: "Setup-5", method: "prisma" }, id: "db.metric.prepare_calibrated", title: "准备 归属于目标 `E2E-TARGET-MEMBER-FROZEN-REESTIMATE-MISSING-REASON`、口径为 `E2E-METRIC-MEMBER-FROZEN-REESTIMATE-MISSING-REASON`、等级积分等级为 `进阶`、等级积分为 `30` 的指标", object: "db.metric", operator: "prepare_calibrated", params: { targetFrom: "data.target", metricFrom: "data.metric", memberUserFrom: "runtime.memberUser", saveAs: "metric" } },
      { source: { caseStepId: "Setup-6", method: "prisma" }, id: "db.alignment_request.ensure_open_absent", title: "确保 归属于目标 `E2E-TARGET-MEMBER-FROZEN-REESTIMATE-MISSING-REASON`、类型为 `frozenReestimate`、状态为 `requested` 或 `scheduled` 的阶段对齐申请不存在", object: "db.objective_alignment_request", operator: "delete_open", params: { targetFrom: "data.target", kindFrom: "data.alignmentKind" } },
      { source: { caseStepId: "Setup-7", method: "playwright" }, id: "auth.login.member", title: "使用 本用例普通成员账号 登录 ORF", object: "page.auth", operator: "login", params: { emailFrom: "data.memberEmail", passwordFrom: "data.memberPassword" } },
    ],
  },

  S0: {
    description: "Action 前状态",
    assertions: [
      { source: { caseStepId: "S0-1", method: "api" }, id: "session.authenticated", title: "当前会话 应为 已登录", object: "auth.session", operator: "authenticated" },
      { source: { caseStepId: "S0-2", method: "api" }, id: "session.email", title: "当前会话用户邮箱 应为 `orf-member-frozen-reestimate-missing-reason-e2e@orf.local`", object: "auth.session.user_email", operator: "equals", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "S0-3", method: "api" }, id: "session.role", title: "当前会话用户角色 应为 `member`", object: "auth.session.user_role", operator: "equals", params: { roleFrom: "data.memberRole" } },
      { source: { caseStepId: "S0-4", method: "api" }, id: "session.name", title: "当前会话用户名称 应为 `ORF Member Frozen Reestimate Missing Reason E2E`", object: "auth.session.user_name", operator: "equals", params: { nameFrom: "data.memberName" } },
      { source: { caseStepId: "S0-5", method: "prisma" }, id: "db.frozen_objective.exists", title: "应存在 标题为 `E2E-TARGET-MEMBER-FROZEN-REESTIMATE-MISSING-REASON`、阶段为 `goalFrozen`、流转状态为 `frozen` 的目标", object: "db.frozen_objective_fixture", operator: "exists", params: { targetFrom: "data.target" } },
      { source: { caseStepId: "S0-6", method: "prisma" }, id: "db.frozen_objective.challenger_contains", title: "目标 `E2E-TARGET-MEMBER-FROZEN-REESTIMATE-MISSING-REASON` 的当前挑战者 应包含本用例普通成员", object: "db.frozen_objective_fixture", operator: "challenger_contains", params: { targetFrom: "data.target", memberUserFrom: "runtime.memberUser" } },
      { source: { caseStepId: "S0-7", method: "prisma" }, id: "db.frozen_objective.confirmed_at", title: "目标 `E2E-TARGET-MEMBER-FROZEN-REESTIMATE-MISSING-REASON` 的冻结时间 应存在", object: "db.frozen_objective_fixture", operator: "confirmed_at_exists", params: { targetFrom: "data.target" } },
      { source: { caseStepId: "S0-8", method: "prisma" }, id: "db.metric.exists", title: "应存在 归属于目标 `E2E-TARGET-MEMBER-FROZEN-REESTIMATE-MISSING-REASON`、口径为 `E2E-METRIC-MEMBER-FROZEN-REESTIMATE-MISSING-REASON`、等级积分等级为 `进阶`、等级积分为 `30` 的指标", object: "db.metric", operator: "exists_with_score", params: { targetFrom: "data.target", titleFrom: "data.metric.title", difficultyFrom: "data.metric.difficulty", scoreFrom: "data.metric.score" } },
      { source: { caseStepId: "S0-9", method: "prisma" }, id: "db.alignment_request.open_count_zero", title: "目标 `E2E-TARGET-MEMBER-FROZEN-REESTIMATE-MISSING-REASON` 的 `frozenReestimate` 类型待处理阶段对齐申请数量 应为 `0`", object: "db.objective_alignment_request", operator: "open_count", params: { targetFrom: "data.target", kindFrom: "data.alignmentKind", count: 0 } },
    ],
  },

  Action: {
    description: "被测业务动作",
    steps: [
      { source: { caseStepId: "Action-1", method: "playwright" }, id: "member.open_my_challenges", title: "普通成员打开 我的挑战", object: "page.challenge", operator: "open_my_challenges" },
      { source: { caseStepId: "Action-2", method: "playwright" }, id: "frozen_reestimate.reason.clear", title: "清空目标 `E2E-TARGET-MEMBER-FROZEN-REESTIMATE-MISSING-REASON` 的 \"重新重估理由\" 输入框", object: "page.frozen_reestimate_request", operator: "clear_reason", params: { targetTitleFrom: "data.target.title" } },
    ],
  },

  S1: {
    description: "Action 后状态",
    assertions: [
      { source: { caseStepId: "S1-1", method: "playwright" }, id: "challenge.page.url", title: "页面 应进入 我的挑战", object: "page.challenge", operator: "url" },
      { source: { caseStepId: "S1-2", method: "playwright" }, id: "scope.mine.selected", title: "\"我的挑战\" 视图 应处于选中状态", object: "page.challenge_scope", operator: "selected", params: { label: "我的挑战" } },
      { source: { caseStepId: "S1-3", method: "playwright" }, id: "objective.visible", title: "我的挑战列表 应显示目标 `E2E-TARGET-MEMBER-FROZEN-REESTIMATE-MISSING-REASON`", object: "page.challenge_objectives", operator: "visible_title", params: { titleFrom: "data.target.title" } },
      { source: { caseStepId: "S1-4", method: "playwright" }, id: "objective.status.frozen", title: "目标 `E2E-TARGET-MEMBER-FROZEN-REESTIMATE-MISSING-REASON` 的状态 应显示为 已冻结", object: "page.challenge_objective", operator: "status_visible", params: { titleFrom: "data.target.title", statusLabel: "已冻结" } },
      { source: { caseStepId: "S1-5", method: "playwright" }, id: "frozen_reestimate.reason.empty", title: "目标 `E2E-TARGET-MEMBER-FROZEN-REESTIMATE-MISSING-REASON` 的 \"重新重估理由\" 输入框值 应为空", object: "page.frozen_reestimate_request", operator: "reason_empty", params: { targetTitleFrom: "data.target.title" } },
      { source: { caseStepId: "S1-6", method: "playwright" }, id: "frozen_reestimate.action.disabled", title: "目标 `E2E-TARGET-MEMBER-FROZEN-REESTIMATE-MISSING-REASON` 的 \"申请重新重估\" 操作 应不可点击", object: "page.frozen_reestimate_request", operator: "submit_disabled", params: { targetTitleFrom: "data.target.title" } },
      { source: { caseStepId: "S1-7", method: "playwright" }, id: "frozen_reestimate.toast.absent", title: "页面 应不提示 已申请重新重估，请等待指挥官审批", object: "page.challenge_toast", operator: "frozen_reestimate_requested_absent" },
      { source: { caseStepId: "S1-8", method: "playwright" }, id: "metric.visible", title: "目标 `E2E-TARGET-MEMBER-FROZEN-REESTIMATE-MISSING-REASON` 下 应显示指标口径 `E2E-METRIC-MEMBER-FROZEN-REESTIMATE-MISSING-REASON`", object: "page.challenge_metric", operator: "visible_under_objective", params: { targetTitleFrom: "data.target.title", metricTitleFrom: "data.metric.title" } },
      { source: { caseStepId: "S1-9", method: "playwright" }, id: "metric.difficulty.visible", title: "指标 `E2E-METRIC-MEMBER-FROZEN-REESTIMATE-MISSING-REASON` 的等级积分等级 应显示为 `进阶`", object: "page.metric_difficulty", operator: "visible", params: { metricTitleFrom: "data.metric.title", difficultyFrom: "data.metric.difficulty" } },
      { source: { caseStepId: "S1-10", method: "api" }, id: "api.my_challenges.contains_objective", title: "我的挑战数据 应包含目标 `E2E-TARGET-MEMBER-FROZEN-REESTIMATE-MISSING-REASON`", object: "api.my_challenges", operator: "contains_objective", params: { titleFrom: "data.target.title" } },
      { source: { caseStepId: "S1-11", method: "api" }, id: "api.my_challenges.objective_stage_flow", title: "我的挑战数据中目标 `E2E-TARGET-MEMBER-FROZEN-REESTIMATE-MISSING-REASON` 的阶段 应为 `goalFrozen`，流转状态 应为 `frozen`", object: "api.my_challenges", operator: "objective_stage_flow", params: { targetFrom: "data.target" } },
      { source: { caseStepId: "S1-12", method: "api" }, id: "api.my_challenges.lacks_open_alignment_request", title: "我的挑战数据中目标 `E2E-TARGET-MEMBER-FROZEN-REESTIMATE-MISSING-REASON` 应不包含 `frozenReestimate` 类型、状态为 `requested` 或 `scheduled` 的阶段对齐申请", object: "api.my_challenges", operator: "lacks_open_alignment_request", params: { targetTitleFrom: "data.target.title", kindFrom: "data.alignmentKind" } },
      { source: { caseStepId: "S1-13", method: "prisma" }, id: "db.frozen_objective.exists", title: "标题为 `E2E-TARGET-MEMBER-FROZEN-REESTIMATE-MISSING-REASON` 的目标阶段 应为 `goalFrozen`，流转状态 应为 `frozen`", object: "db.frozen_objective_fixture", operator: "exists", params: { targetFrom: "data.target" } },
      { source: { caseStepId: "S1-14", method: "prisma" }, id: "db.alignment_request.open_count_zero", title: "目标 `E2E-TARGET-MEMBER-FROZEN-REESTIMATE-MISSING-REASON` 的 `frozenReestimate` 类型待处理阶段对齐申请数量 应为 `0`", object: "db.objective_alignment_request", operator: "open_count", params: { targetFrom: "data.target", kindFrom: "data.alignmentKind", count: 0 } },
      { source: { caseStepId: "S1-15", method: "prisma" }, id: "db.frozen_objective.challenger_still_contains", title: "目标 `E2E-TARGET-MEMBER-FROZEN-REESTIMATE-MISSING-REASON` 的当前挑战者 应仍包含本用例普通成员", object: "db.frozen_objective_fixture", operator: "challenger_contains", params: { targetFrom: "data.target", memberUserFrom: "runtime.memberUser" } },
      { source: { caseStepId: "S1-16", method: "prisma" }, id: "db.metric.still_exists", title: "应存在 归属于目标 `E2E-TARGET-MEMBER-FROZEN-REESTIMATE-MISSING-REASON`、口径为 `E2E-METRIC-MEMBER-FROZEN-REESTIMATE-MISSING-REASON`、等级积分等级为 `进阶`、等级积分为 `30` 的指标", object: "db.metric", operator: "exists_with_score", params: { targetFrom: "data.target", titleFrom: "data.metric.title", difficultyFrom: "data.metric.difficulty", scoreFrom: "data.metric.score" } },
    ],
  },

  Clean: {
    description: "恢复 B",
    steps: [
      { source: { caseStepId: "Clean-1", method: "prisma" }, id: "db.objectives.delete_created", title: "删除 本用例创建的目标标题前缀 `E2E-TARGET-MEMBER-FROZEN-REESTIMATE-MISSING-REASON` 对应的目标及其派生数据", object: "db.objectives_by_prefix", operator: "delete", params: { prefixFrom: "data.targetPrefix" } },
      { source: { caseStepId: "Clean-2", method: "api" }, id: "auth.logout", title: "注销当前普通成员登录会话", object: "auth", operator: "logout" },
      { source: { caseStepId: "Clean-3", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Clean-4", method: "api" }, id: "ory.member_identity.delete", title: "删除 本用例普通成员登录身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-5", method: "prisma" }, id: "db.member_user.delete", title: "删除 本用例普通成员用户", object: "db.user", operator: "delete", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-6", method: "prisma" }, id: "db.objectives.absent", title: "应不存在 标题前缀为 `E2E-TARGET-MEMBER-FROZEN-REESTIMATE-MISSING-REASON` 的目标", object: "db.objectives_by_prefix", operator: "absent", params: { prefixFrom: "data.targetPrefix" } },
      { source: { caseStepId: "Clean-7", method: "prisma" }, id: "db.metric.absent", title: "应不存在 口径为 `E2E-METRIC-MEMBER-FROZEN-REESTIMATE-MISSING-REASON` 的指标", object: "db.metric", operator: "absent", params: { titleFrom: "data.metric.title" } },
      { source: { caseStepId: "Clean-8", method: "api" }, id: "ory.member_identity.absent", title: "邮箱为 `orf-member-frozen-reestimate-missing-reason-e2e@orf.local` 的普通成员登录身份 应不存在", object: "ory.identity", operator: "absent", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-9", method: "prisma" }, id: "db.member_user.absent", title: "邮箱为 `orf-member-frozen-reestimate-missing-reason-e2e@orf.local` 的普通成员用户 应不存在", object: "db.user", operator: "absent", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-10", method: "api" }, id: "session.unauthenticated", title: "当前会话 应为 未登录", object: "auth.session", operator: "unauthenticated" },
    ],
  },
} satisfies StateCaseSpec<MemberFrozenReestimateMissingReasonCaseData>;
