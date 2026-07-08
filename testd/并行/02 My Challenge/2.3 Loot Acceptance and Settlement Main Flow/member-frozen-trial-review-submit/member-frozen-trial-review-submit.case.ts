import { STATE_CASE_MODEL, type StateCaseSpec } from "../../../../_framework/types";
import type { MemberFrozenTrialReviewSubmitCaseData } from "./_support/member-frozen-trial-review-submit.context";

export const memberFrozenTrialReviewSubmitCase = {
  id: "target.member-frozen-trial-review-submit",
  title: "普通成员在已冻结阶段可填写完整战利品并提交试验收",
  model: STATE_CASE_MODEL,
  tags: ["target", "loot", "trial-review", "frozen", "member"],

  data: {
    memberEmail: "orf-member-frozen-trial-review-e2e@orf.local",
    memberPassword: "OrfMemberFrozenTrialReviewE2E!2026",
    memberName: "ORF Member Frozen Trial Review E2E",
    memberRole: "member",
    memberStatus: "active",
    targetPrefix: "E2E-TARGET-MEMBER-FROZEN-TRIAL-REVIEW",
    target: {
      title: "E2E-TARGET-MEMBER-FROZEN-TRIAL-REVIEW",
      stage: "goalFrozen",
      flowStatus: "frozen",
      finalDueOffsetDays: 8,
    },
    metrics: [
      {
        title: "E2E-METRIC-FROZEN-TRIAL-REVIEW-A",
        difficulty: "进阶",
        score: 30,
        claim: "completed",
        evidence: "E2E-TRIAL-REVIEW-EVIDENCE-A：https://example.test/evidence-a",
      },
      {
        title: "E2E-METRIC-FROZEN-TRIAL-REVIEW-B",
        difficulty: "破局",
        score: 50,
        claim: "completed",
        evidence: "E2E-TRIAL-REVIEW-EVIDENCE-B：https://example.test/evidence-b",
      },
    ],
    trialReview: {
      body: "E2E-TRIAL-REVIEW-BODY：普通成员提交完整试验收材料。",
      selfTestReportBody: "E2E-TRIAL-REVIEW-SELF-TEST：已完成核心路径自测并记录风险说明。",
      status: "requested",
    },
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
      { source: { caseStepId: "Setup-1", method: "prisma" }, id: "db.objectives.delete_residue", title: "删除 本用例残留的目标标题前缀 `E2E-TARGET-MEMBER-FROZEN-TRIAL-REVIEW` 对应的目标及其派生数据", object: "db.objectives_by_prefix", operator: "delete", params: { prefixFrom: "data.targetPrefix" } },
      { source: { caseStepId: "Setup-2", method: "api" }, id: "ory.member_identity.upsert", title: "准备邮箱为 `orf-member-frozen-trial-review-e2e@orf.local`、使用固定测试密码的普通成员登录身份", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.memberEmail", nameFrom: "data.memberName", passwordFrom: "data.memberPassword", saveAs: "memberIdentity" } },
      { source: { caseStepId: "Setup-3", method: "prisma" }, id: "db.member_user.upsert", title: "准备 角色为 `member`、状态为 `active`、名称为 `ORF Member Frozen Trial Review E2E` 的本用例普通成员用户", object: "db.user", operator: "upsert", params: { emailFrom: "data.memberEmail", nameFrom: "data.memberName", roleFrom: "data.memberRole", statusFrom: "data.memberStatus", identityIdFrom: "runtime.memberIdentity.id", saveAs: "memberUser" } },
      { source: { caseStepId: "Setup-4", method: "prisma" }, id: "db.frozen_objective.prepare", title: "准备 标题为 `E2E-TARGET-MEMBER-FROZEN-TRIAL-REVIEW`、阶段为 `goalFrozen`、流转状态为 `frozen`、最终验收截止日为运行时当前日期后 `8` 天、冻结时间存在、当前挑战者包含本用例普通成员的目标", object: "db.frozen_objective_fixture", operator: "prepare", params: { memberUserFrom: "runtime.memberUser", targetFrom: "data.target", saveAs: "objective" } },
      { source: { caseStepId: "Setup-5", method: "prisma" }, id: "db.metric_a.prepare_calibrated", title: "准备 归属于目标 `E2E-TARGET-MEMBER-FROZEN-TRIAL-REVIEW`、口径为 `E2E-METRIC-FROZEN-TRIAL-REVIEW-A`、等级积分等级为 `进阶`、等级积分为 `30` 的指标", object: "db.metric", operator: "prepare_calibrated", params: { targetFrom: "data.target", metricFrom: "data.metrics.0", memberUserFrom: "runtime.memberUser", sortOrder: 0, saveAs: "metricA" } },
      { source: { caseStepId: "Setup-6", method: "prisma" }, id: "db.metric_b.prepare_calibrated", title: "准备 归属于目标 `E2E-TARGET-MEMBER-FROZEN-TRIAL-REVIEW`、口径为 `E2E-METRIC-FROZEN-TRIAL-REVIEW-B`、等级积分等级为 `破局`、等级积分为 `50` 的指标", object: "db.metric", operator: "prepare_calibrated", params: { targetFrom: "data.target", metricFrom: "data.metrics.1", memberUserFrom: "runtime.memberUser", sortOrder: 1, saveAs: "metricB" } },
      { source: { caseStepId: "Setup-7", method: "prisma" }, id: "db.trial_review.delete_by_target", title: "确保 归属于目标 `E2E-TARGET-MEMBER-FROZEN-TRIAL-REVIEW` 的试验收记录不存在", object: "db.objective_trial_review", operator: "delete_by_target", params: { targetFrom: "data.target" } },
      { source: { caseStepId: "Setup-8", method: "prisma" }, id: "db.objective_loot.delete_by_target", title: "确保 归属于目标 `E2E-TARGET-MEMBER-FROZEN-TRIAL-REVIEW` 的战利品正式提交记录不存在", object: "db.objective_loot", operator: "delete_by_target", params: { targetFrom: "data.target" } },
      { source: { caseStepId: "Setup-9", method: "playwright" }, id: "auth.login.member", title: "使用 本用例普通成员账号 登录 ORF", object: "page.auth", operator: "login", params: { emailFrom: "data.memberEmail", passwordFrom: "data.memberPassword" } },
    ],
  },

  S0: {
    description: "Action 前状态",
    assertions: [
      { source: { caseStepId: "S0-1", method: "api" }, id: "session.authenticated", title: "当前会话 应为 已登录", object: "auth.session", operator: "authenticated" },
      { source: { caseStepId: "S0-2", method: "api" }, id: "session.email", title: "当前会话用户邮箱 应为 `orf-member-frozen-trial-review-e2e@orf.local`", object: "auth.session.user_email", operator: "equals", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "S0-3", method: "api" }, id: "session.role", title: "当前会话用户角色 应为 `member`", object: "auth.session.user_role", operator: "equals", params: { roleFrom: "data.memberRole" } },
      { source: { caseStepId: "S0-4", method: "api" }, id: "session.name", title: "当前会话用户名称 应为 `ORF Member Frozen Trial Review E2E`", object: "auth.session.user_name", operator: "equals", params: { nameFrom: "data.memberName" } },
      { source: { caseStepId: "S0-5", method: "prisma" }, id: "db.frozen_objective.exists", title: "应存在 标题为 `E2E-TARGET-MEMBER-FROZEN-TRIAL-REVIEW`、阶段为 `goalFrozen`、流转状态为 `frozen` 的目标", object: "db.frozen_objective_fixture", operator: "exists", params: { targetFrom: "data.target" } },
      { source: { caseStepId: "S0-6", method: "prisma" }, id: "db.frozen_objective.challenger_contains", title: "目标 `E2E-TARGET-MEMBER-FROZEN-TRIAL-REVIEW` 的当前挑战者 应包含本用例普通成员", object: "db.frozen_objective_fixture", operator: "challenger_contains", params: { targetFrom: "data.target", memberUserFrom: "runtime.memberUser" } },
      { source: { caseStepId: "S0-7", method: "prisma" }, id: "db.frozen_objective.confirmed_at", title: "目标 `E2E-TARGET-MEMBER-FROZEN-TRIAL-REVIEW` 的冻结时间 应存在", object: "db.frozen_objective_fixture", operator: "confirmed_at_exists", params: { targetFrom: "data.target" } },
      { source: { caseStepId: "S0-8", method: "prisma" }, id: "db.frozen_objective.loot_submitted_at_empty", title: "目标 `E2E-TARGET-MEMBER-FROZEN-TRIAL-REVIEW` 的战利品提交时间 应为空", object: "db.frozen_objective_fixture", operator: "loot_submitted_at_empty", params: { targetFrom: "data.target" } },
      { source: { caseStepId: "S0-9", method: "prisma" }, id: "db.metric_a.exists", title: "应存在 归属于目标 `E2E-TARGET-MEMBER-FROZEN-TRIAL-REVIEW`、口径为 `E2E-METRIC-FROZEN-TRIAL-REVIEW-A`、等级积分等级为 `进阶`、等级积分为 `30` 的指标", object: "db.metric", operator: "exists_with_score", params: { targetFrom: "data.target", titleFrom: "data.metrics.0.title", difficultyFrom: "data.metrics.0.difficulty", scoreFrom: "data.metrics.0.score" } },
      { source: { caseStepId: "S0-10", method: "prisma" }, id: "db.metric_b.exists", title: "应存在 归属于目标 `E2E-TARGET-MEMBER-FROZEN-TRIAL-REVIEW`、口径为 `E2E-METRIC-FROZEN-TRIAL-REVIEW-B`、等级积分等级为 `破局`、等级积分为 `50` 的指标", object: "db.metric", operator: "exists_with_score", params: { targetFrom: "data.target", titleFrom: "data.metrics.1.title", difficultyFrom: "data.metrics.1.difficulty", scoreFrom: "data.metrics.1.score" } },
      { source: { caseStepId: "S0-11", method: "prisma" }, id: "db.trial_review.count_zero", title: "目标 `E2E-TARGET-MEMBER-FROZEN-TRIAL-REVIEW` 的试验收记录数量 应为 `0`", object: "db.objective_trial_review", operator: "count", params: { targetFrom: "data.target", count: 0 } },
      { source: { caseStepId: "S0-12", method: "prisma" }, id: "db.objective_loot.count_zero", title: "目标 `E2E-TARGET-MEMBER-FROZEN-TRIAL-REVIEW` 的战利品正式提交记录数量 应为 `0`", object: "db.objective_loot", operator: "count", params: { targetFrom: "data.target", count: 0 } },
    ],
  },

  Action: {
    description: "被测业务动作",
    steps: [
      { source: { caseStepId: "Action-1", method: "playwright" }, id: "member.open_my_challenges", title: "普通成员打开 我的挑战", object: "page.challenge", operator: "open_my_challenges" },
      { source: { caseStepId: "Action-2", method: "playwright" }, id: "loot.open_from_my_challenges", title: "点击目标 `E2E-TARGET-MEMBER-FROZEN-TRIAL-REVIEW` 的 \"提交战利品\" 操作", object: "page.loot_submission", operator: "open_from_my_challenges", params: { targetTitleFrom: "data.target.title" } },
      { source: { caseStepId: "Action-3", method: "playwright" }, id: "loot.page.loaded", title: "等待 提交战利品页面加载完成", object: "page.loot_submission", operator: "loaded", params: { targetTitleFrom: "data.target.title" } },
      { source: { caseStepId: "Action-4", method: "playwright" }, id: "loot.body.fill", title: "在 \"完成说明\" 输入框输入 `E2E-TRIAL-REVIEW-BODY：普通成员提交完整试验收材料。`", object: "page.loot_submission", operator: "fill_body", params: { bodyFrom: "data.trialReview.body" } },
      { source: { caseStepId: "Action-5", method: "playwright" }, id: "loot.metric_a.claim.select", title: "在指标 `E2E-METRIC-FROZEN-TRIAL-REVIEW-A` 的 \"完成主张\" 控件中选择 `完成`", object: "page.loot_submission", operator: "select_metric_claim", params: { metricTitleFrom: "data.metrics.0.title", claimLabel: "完成" } },
      { source: { caseStepId: "Action-6", method: "playwright" }, id: "loot.metric_a.evidence.fill", title: "在指标 `E2E-METRIC-FROZEN-TRIAL-REVIEW-A` 的 \"证据、数据或链接\" 输入框输入 `E2E-TRIAL-REVIEW-EVIDENCE-A：https://example.test/evidence-a`", object: "page.loot_submission", operator: "fill_metric_evidence", params: { metricTitleFrom: "data.metrics.0.title", evidenceFrom: "data.metrics.0.evidence" } },
      { source: { caseStepId: "Action-7", method: "playwright" }, id: "loot.metric_b.claim.select", title: "在指标 `E2E-METRIC-FROZEN-TRIAL-REVIEW-B` 的 \"完成主张\" 控件中选择 `完成`", object: "page.loot_submission", operator: "select_metric_claim", params: { metricTitleFrom: "data.metrics.1.title", claimLabel: "完成" } },
      { source: { caseStepId: "Action-8", method: "playwright" }, id: "loot.metric_b.evidence.fill", title: "在指标 `E2E-METRIC-FROZEN-TRIAL-REVIEW-B` 的 \"证据、数据或链接\" 输入框输入 `E2E-TRIAL-REVIEW-EVIDENCE-B：https://example.test/evidence-b`", object: "page.loot_submission", operator: "fill_metric_evidence", params: { metricTitleFrom: "data.metrics.1.title", evidenceFrom: "data.metrics.1.evidence" } },
      { source: { caseStepId: "Action-9", method: "playwright" }, id: "loot.self_test.fill", title: "在 \"自测报告\" 输入框输入 `E2E-TRIAL-REVIEW-SELF-TEST：已完成核心路径自测并记录风险说明。`", object: "page.loot_submission", operator: "fill_self_test_report", params: { selfTestReportBodyFrom: "data.trialReview.selfTestReportBody" } },
      { source: { caseStepId: "Action-10", method: "playwright" }, id: "loot.trial_review.submit", title: "点击 \"提交试验收\" 操作", object: "page.loot_submission", operator: "submit_trial_review", params: { targetFrom: "data.target", trialReviewFrom: "data.trialReview" } },
    ],
  },

  S1: {
    description: "Action 后状态",
    assertions: [
      { source: { caseStepId: "S1-1", method: "playwright" }, id: "toast.trial_review_submitted", title: "页面 应提示 试验收已提交", object: "page.challenge_toast", operator: "trial_review_submitted" },
      { source: { caseStepId: "S1-2", method: "playwright" }, id: "challenge.page.url", title: "页面 应进入 我的挑战", object: "page.challenge", operator: "url" },
      { source: { caseStepId: "S1-3", method: "playwright" }, id: "scope.mine.selected", title: "\"我的挑战\" 视图 应处于选中状态", object: "page.challenge_scope", operator: "selected", params: { label: "我的挑战" } },
      { source: { caseStepId: "S1-4", method: "playwright" }, id: "objective.visible", title: "我的挑战列表 应显示目标 `E2E-TARGET-MEMBER-FROZEN-TRIAL-REVIEW`", object: "page.challenge_objectives", operator: "visible_title", params: { titleFrom: "data.target.title" } },
      { source: { caseStepId: "S1-5", method: "playwright" }, id: "objective.status.frozen", title: "目标 `E2E-TARGET-MEMBER-FROZEN-TRIAL-REVIEW` 的状态 应显示为 已冻结", object: "page.challenge_objective", operator: "status_visible", params: { titleFrom: "data.target.title", statusLabel: "已冻结" } },
      { source: { caseStepId: "S1-6", method: "api" }, id: "api.my_challenges.contains_objective", title: "我的挑战数据 应包含目标 `E2E-TARGET-MEMBER-FROZEN-TRIAL-REVIEW`", object: "api.my_challenges", operator: "contains_objective", params: { titleFrom: "data.target.title" } },
      { source: { caseStepId: "S1-7", method: "api" }, id: "api.my_challenges.objective_stage_flow", title: "我的挑战数据中目标 `E2E-TARGET-MEMBER-FROZEN-TRIAL-REVIEW` 的阶段 应为 `goalFrozen`，流转状态 应为 `frozen`", object: "api.my_challenges", operator: "objective_stage_flow", params: { targetFrom: "data.target" } },
      { source: { caseStepId: "S1-8", method: "api" }, id: "api.my_challenges.contains_trial_review", title: "我的挑战数据中目标 `E2E-TARGET-MEMBER-FROZEN-TRIAL-REVIEW` 应包含状态为 `requested`、申请人为本用例普通成员、完成说明为 `E2E-TRIAL-REVIEW-BODY：普通成员提交完整试验收材料。` 的试验收记录", object: "api.my_challenges", operator: "contains_trial_review", params: { targetTitleFrom: "data.target.title", statusFrom: "data.trialReview.status", bodyFrom: "data.trialReview.body", memberUserFrom: "runtime.memberUser" } },
      { source: { caseStepId: "S1-9", method: "api" }, id: "api.my_challenges.trial_review_self_test", title: "我的挑战数据中目标 `E2E-TARGET-MEMBER-FROZEN-TRIAL-REVIEW` 的试验收记录 应包含自测报告 `E2E-TRIAL-REVIEW-SELF-TEST：已完成核心路径自测并记录风险说明。`", object: "api.my_challenges", operator: "trial_review_self_test", params: { targetTitleFrom: "data.target.title", selfTestReportBodyFrom: "data.trialReview.selfTestReportBody" } },
      { source: { caseStepId: "S1-10", method: "api" }, id: "api.my_challenges.metric_a_claim", title: "我的挑战数据中目标 `E2E-TARGET-MEMBER-FROZEN-TRIAL-REVIEW` 的试验收记录 应包含指标 `E2E-METRIC-FROZEN-TRIAL-REVIEW-A` 的完成主张 `completed` 和证据 `E2E-TRIAL-REVIEW-EVIDENCE-A：https://example.test/evidence-a`", object: "api.my_challenges", operator: "trial_review_metric_claim", params: { targetTitleFrom: "data.target.title", metricFrom: "data.metrics.0" } },
      { source: { caseStepId: "S1-11", method: "api" }, id: "api.my_challenges.metric_b_claim", title: "我的挑战数据中目标 `E2E-TARGET-MEMBER-FROZEN-TRIAL-REVIEW` 的试验收记录 应包含指标 `E2E-METRIC-FROZEN-TRIAL-REVIEW-B` 的完成主张 `completed` 和证据 `E2E-TRIAL-REVIEW-EVIDENCE-B：https://example.test/evidence-b`", object: "api.my_challenges", operator: "trial_review_metric_claim", params: { targetTitleFrom: "data.target.title", metricFrom: "data.metrics.1" } },
      { source: { caseStepId: "S1-12", method: "prisma" }, id: "db.frozen_objective.exists", title: "标题为 `E2E-TARGET-MEMBER-FROZEN-TRIAL-REVIEW` 的目标阶段 应为 `goalFrozen`，流转状态 应为 `frozen`", object: "db.frozen_objective_fixture", operator: "exists", params: { targetFrom: "data.target" } },
      { source: { caseStepId: "S1-13", method: "prisma" }, id: "db.frozen_objective.loot_submitted_at_empty", title: "目标 `E2E-TARGET-MEMBER-FROZEN-TRIAL-REVIEW` 的战利品提交时间 应为空", object: "db.frozen_objective_fixture", operator: "loot_submitted_at_empty", params: { targetFrom: "data.target" } },
      { source: { caseStepId: "S1-14", method: "prisma" }, id: "db.trial_review.exists", title: "应存在 归属于目标 `E2E-TARGET-MEMBER-FROZEN-TRIAL-REVIEW`、状态为 `requested`、申请人为本用例普通成员、完成说明为 `E2E-TRIAL-REVIEW-BODY：普通成员提交完整试验收材料。` 的试验收记录", object: "db.objective_trial_review", operator: "exists", params: { targetFrom: "data.target", trialReviewFrom: "data.trialReview", memberUserFrom: "runtime.memberUser" } },
      { source: { caseStepId: "S1-15", method: "prisma" }, id: "db.trial_review.self_test", title: "目标 `E2E-TARGET-MEMBER-FROZEN-TRIAL-REVIEW` 的试验收记录 应包含自测报告 `E2E-TRIAL-REVIEW-SELF-TEST：已完成核心路径自测并记录风险说明。`", object: "db.objective_trial_review", operator: "self_test", params: { targetFrom: "data.target", selfTestReportBodyFrom: "data.trialReview.selfTestReportBody" } },
      { source: { caseStepId: "S1-16", method: "prisma" }, id: "db.trial_review.metric_a_claim", title: "目标 `E2E-TARGET-MEMBER-FROZEN-TRIAL-REVIEW` 的试验收记录 应包含指标 `E2E-METRIC-FROZEN-TRIAL-REVIEW-A` 的完成主张 `completed` 和证据 `E2E-TRIAL-REVIEW-EVIDENCE-A：https://example.test/evidence-a`", object: "db.objective_trial_review", operator: "metric_claim", params: { targetFrom: "data.target", metricFrom: "data.metrics.0" } },
      { source: { caseStepId: "S1-17", method: "prisma" }, id: "db.trial_review.metric_b_claim", title: "目标 `E2E-TARGET-MEMBER-FROZEN-TRIAL-REVIEW` 的试验收记录 应包含指标 `E2E-METRIC-FROZEN-TRIAL-REVIEW-B` 的完成主张 `completed` 和证据 `E2E-TRIAL-REVIEW-EVIDENCE-B：https://example.test/evidence-b`", object: "db.objective_trial_review", operator: "metric_claim", params: { targetFrom: "data.target", metricFrom: "data.metrics.1" } },
      { source: { caseStepId: "S1-18", method: "prisma" }, id: "db.trial_review.count_one", title: "目标 `E2E-TARGET-MEMBER-FROZEN-TRIAL-REVIEW` 的试验收记录数量 应为 `1`", object: "db.objective_trial_review", operator: "count", params: { targetFrom: "data.target", count: 1 } },
      { source: { caseStepId: "S1-19", method: "prisma" }, id: "db.objective_loot.count_zero", title: "目标 `E2E-TARGET-MEMBER-FROZEN-TRIAL-REVIEW` 的战利品正式提交记录数量 应为 `0`", object: "db.objective_loot", operator: "count", params: { targetFrom: "data.target", count: 0 } },
      { source: { caseStepId: "S1-20", method: "prisma" }, id: "db.frozen_objective.challenger_still_contains", title: "目标 `E2E-TARGET-MEMBER-FROZEN-TRIAL-REVIEW` 的当前挑战者 应仍包含本用例普通成员", object: "db.frozen_objective_fixture", operator: "challenger_contains", params: { targetFrom: "data.target", memberUserFrom: "runtime.memberUser" } },
    ],
  },

  Clean: {
    description: "恢复 B",
    steps: [
      { source: { caseStepId: "Clean-1", method: "prisma" }, id: "db.objectives.delete_created", title: "删除 本用例创建的目标标题前缀 `E2E-TARGET-MEMBER-FROZEN-TRIAL-REVIEW` 对应的目标及其派生数据", object: "db.objectives_by_prefix", operator: "delete", params: { prefixFrom: "data.targetPrefix" } },
      { source: { caseStepId: "Clean-2", method: "api" }, id: "auth.logout", title: "注销当前普通成员登录会话", object: "auth", operator: "logout" },
      { source: { caseStepId: "Clean-3", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Clean-4", method: "api" }, id: "ory.member_identity.delete", title: "删除 本用例普通成员登录身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-5", method: "prisma" }, id: "db.member_user.delete", title: "删除 本用例普通成员用户", object: "db.user", operator: "delete", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-6", method: "prisma" }, id: "db.objectives.absent", title: "应不存在 标题前缀为 `E2E-TARGET-MEMBER-FROZEN-TRIAL-REVIEW` 的目标", object: "db.objectives_by_prefix", operator: "absent", params: { prefixFrom: "data.targetPrefix" } },
      { source: { caseStepId: "Clean-7", method: "prisma" }, id: "db.metric_a.absent", title: "应不存在 口径为 `E2E-METRIC-FROZEN-TRIAL-REVIEW-A` 的指标", object: "db.metric", operator: "absent", params: { titleFrom: "data.metrics.0.title" } },
      { source: { caseStepId: "Clean-8", method: "prisma" }, id: "db.metric_b.absent", title: "应不存在 口径为 `E2E-METRIC-FROZEN-TRIAL-REVIEW-B` 的指标", object: "db.metric", operator: "absent", params: { titleFrom: "data.metrics.1.title" } },
      { source: { caseStepId: "Clean-9", method: "api" }, id: "ory.member_identity.absent", title: "邮箱为 `orf-member-frozen-trial-review-e2e@orf.local` 的普通成员登录身份 应不存在", object: "ory.identity", operator: "absent", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-10", method: "prisma" }, id: "db.member_user.absent", title: "邮箱为 `orf-member-frozen-trial-review-e2e@orf.local` 的普通成员用户 应不存在", object: "db.user", operator: "absent", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-11", method: "api" }, id: "session.unauthenticated", title: "当前会话 应为 未登录", object: "auth.session", operator: "unauthenticated" },
    ],
  },
} satisfies StateCaseSpec<MemberFrozenTrialReviewSubmitCaseData>;
