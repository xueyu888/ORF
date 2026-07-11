import { STATE_CASE_MODEL, type StateCaseSpec } from "../../../../_framework/types";
import type { MemberAcceptanceAlignmentRequestCaseData } from "./_support/member-acceptance-alignment-request.context";

export const memberAcceptanceAlignmentRequestCase = {
  id: "target.member-acceptance-alignment-request",
  title: "普通成员在待验收阶段可申请验收对齐",
  model: STATE_CASE_MODEL,
  tags: ["target", "loot", "acceptance", "alignment-request", "member"],

  data: {
    memberEmail: "orf-member-acceptance-alignment-request-e2e@orf.local",
    memberPassword: "OrfMemberAcceptanceAlignmentRequestE2E!2026",
    memberName: "ORF Member Acceptance Alignment Request E2E",
    memberRole: "member",
    memberStatus: "active",
    adminEmail: "orf-admin-acceptance-alignment-request-e2e@orf.local",
    adminPassword: "OrfAdminAcceptanceAlignmentRequestE2E!2026",
    adminName: "ORF Admin Acceptance Alignment Request E2E",
    adminRole: "admin",
    adminStatus: "active",
    targetPrefix: "E2E-TARGET-ACCEPTANCE-ALIGNMENT-REQUEST",
    target: {
      title: "E2E-TARGET-ACCEPTANCE-ALIGNMENT-REQUEST",
      stage: "goalFrozen",
      flowStatus: "submitted",
      finalDueOffsetDays: 8,
    },
    metric: {
      title: "E2E-METRIC-ACCEPTANCE-ALIGNMENT-REQUEST",
      difficulty: "进阶",
      score: 30,
      claim: "completed",
      finalEvidence: "E2E-ACCEPTANCE-ALIGNMENT-EVIDENCE：https://example.test/acceptance-alignment-request",
    },
    finalLoot: {
      body: "E2E-ACCEPTANCE-ALIGNMENT-LOOT-BODY：普通成员已正式提交验收材料。",
      selfTestReportBody: "E2E-ACCEPTANCE-ALIGNMENT-SELF-TEST：正式验收前已完成自测。",
    },
    alignmentKind: "acceptance",
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
      { source: { caseStepId: "Setup-1", method: "prisma" }, id: "db.objectives.delete_residue", title: "删除 本用例残留的目标标题前缀 `E2E-TARGET-ACCEPTANCE-ALIGNMENT-REQUEST` 对应的目标及其派生数据", object: "db.objectives_by_prefix", operator: "delete", params: { prefixFrom: "data.targetPrefix" } },
      { source: { caseStepId: "Setup-2", method: "api" }, id: "ory.member_identity.upsert", title: "准备邮箱为 `orf-member-acceptance-alignment-request-e2e@orf.local`、使用固定测试密码的普通成员登录身份", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.memberEmail", nameFrom: "data.memberName", passwordFrom: "data.memberPassword", saveAs: "memberIdentity" } },
      { source: { caseStepId: "Setup-3", method: "prisma" }, id: "db.member_user.upsert", title: "准备 角色为 `member`、状态为 `active`、名称为 `ORF Member Acceptance Alignment Request E2E` 的本用例普通成员用户", object: "db.user", operator: "upsert", params: { emailFrom: "data.memberEmail", nameFrom: "data.memberName", roleFrom: "data.memberRole", statusFrom: "data.memberStatus", identityIdFrom: "runtime.memberIdentity.id", saveAs: "memberUser" } },
      { source: { caseStepId: "Setup-4", method: "api" }, id: "ory.admin_identity.upsert", title: "准备邮箱为 `orf-admin-acceptance-alignment-request-e2e@orf.local`、使用固定测试密码的管理员登录身份", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.adminEmail", nameFrom: "data.adminName", passwordFrom: "data.adminPassword", saveAs: "adminIdentity" } },
      { source: { caseStepId: "Setup-5", method: "prisma" }, id: "db.admin_user.upsert", title: "准备 角色为 `admin`、状态为 `active`、名称为 `ORF Admin Acceptance Alignment Request E2E` 的本用例管理员用户", object: "db.user", operator: "upsert", params: { emailFrom: "data.adminEmail", nameFrom: "data.adminName", roleFrom: "data.adminRole", statusFrom: "data.adminStatus", identityIdFrom: "runtime.adminIdentity.id", saveAs: "adminUser" } },
      { source: { caseStepId: "Setup-6", method: "prisma" }, id: "db.submitted_objective.prepare", title: "准备 标题为 `E2E-TARGET-ACCEPTANCE-ALIGNMENT-REQUEST`、阶段为 `goalFrozen`、流转状态为 `submitted`、最终验收截止日为运行时当前日期后 `8` 天、冻结时间存在、战利品提交时间存在、当前挑战者包含本用例普通成员的目标", object: "db.submitted_objective_fixture", operator: "prepare", params: { adminUserFrom: "runtime.adminUser", memberUserFrom: "runtime.memberUser", targetFrom: "data.target", saveAs: "objective" } },
      { source: { caseStepId: "Setup-7", method: "prisma" }, id: "db.metric.prepare_calibrated", title: "准备 归属于目标 `E2E-TARGET-ACCEPTANCE-ALIGNMENT-REQUEST`、口径为 `E2E-METRIC-ACCEPTANCE-ALIGNMENT-REQUEST`、等级积分等级为 `进阶`、等级积分为 `30` 的指标", object: "db.metric", operator: "prepare_calibrated", params: { targetFrom: "data.target", metricFrom: "data.metric", memberUserFrom: "runtime.memberUser", sortOrder: 0, saveAs: "metric" } },
      { source: { caseStepId: "Setup-8", method: "prisma" }, id: "db.objective_loot.prepare_final", title: "准备 归属于目标 `E2E-TARGET-ACCEPTANCE-ALIGNMENT-REQUEST`、提交人为本用例普通成员、完成说明为 `E2E-ACCEPTANCE-ALIGNMENT-LOOT-BODY：普通成员已正式提交验收材料。`、自测报告为 `E2E-ACCEPTANCE-ALIGNMENT-SELF-TEST：正式验收前已完成自测。`、指标 `E2E-METRIC-ACCEPTANCE-ALIGNMENT-REQUEST` 的完成主张为 `completed`、证据为 `E2E-ACCEPTANCE-ALIGNMENT-EVIDENCE：https://example.test/acceptance-alignment-request` 的战利品正式提交记录", object: "db.objective_loot", operator: "prepare_final", params: { targetFrom: "data.target", metricFrom: "data.metric", finalLootFrom: "data.finalLoot", memberUserFrom: "runtime.memberUser", saveAs: "objectiveLoot" } },
      { source: { caseStepId: "Setup-9", method: "prisma" }, id: "db.alignment_request.delete_open", title: "确保 归属于目标 `E2E-TARGET-ACCEPTANCE-ALIGNMENT-REQUEST`、类型为 `acceptance`、状态为 `requested` 或 `scheduled` 的阶段对齐申请不存在", object: "db.objective_alignment_request", operator: "delete_open", params: { targetFrom: "data.target", kindFrom: "data.alignmentKind" } },
      { source: { caseStepId: "Setup-10", method: "playwright" }, id: "auth.login.member", title: "使用 本用例普通成员账号 登录 ORF", object: "page.auth", operator: "login", params: { emailFrom: "data.memberEmail", passwordFrom: "data.memberPassword" } },
    ],
  },

  S0: {
    description: "Action 前状态",
    assertions: [
      { source: { caseStepId: "S0-1", method: "api" }, id: "session.authenticated", title: "当前会话 应为 已登录", object: "auth.session", operator: "authenticated" },
      { source: { caseStepId: "S0-2", method: "api" }, id: "session.email", title: "当前会话用户邮箱 应为 `orf-member-acceptance-alignment-request-e2e@orf.local`", object: "auth.session.user_email", operator: "equals", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "S0-3", method: "api" }, id: "session.role", title: "当前会话用户角色 应为 `member`", object: "auth.session.user_role", operator: "equals", params: { roleFrom: "data.memberRole" } },
      { source: { caseStepId: "S0-4", method: "api" }, id: "session.name", title: "当前会话用户名称 应为 `ORF Member Acceptance Alignment Request E2E`", object: "auth.session.user_name", operator: "equals", params: { nameFrom: "data.memberName" } },
      { source: { caseStepId: "S0-5", method: "prisma" }, id: "db.submitted_objective.exists", title: "应存在 标题为 `E2E-TARGET-ACCEPTANCE-ALIGNMENT-REQUEST`、阶段为 `goalFrozen`、流转状态为 `submitted` 的目标", object: "db.submitted_objective_fixture", operator: "exists", params: { targetFrom: "data.target" } },
      { source: { caseStepId: "S0-6", method: "prisma" }, id: "db.submitted_objective.challenger_contains", title: "目标 `E2E-TARGET-ACCEPTANCE-ALIGNMENT-REQUEST` 的当前挑战者 应包含本用例普通成员", object: "db.submitted_objective_fixture", operator: "challenger_contains", params: { targetFrom: "data.target", memberUserFrom: "runtime.memberUser" } },
      { source: { caseStepId: "S0-7", method: "prisma" }, id: "db.submitted_objective.confirmed_at", title: "目标 `E2E-TARGET-ACCEPTANCE-ALIGNMENT-REQUEST` 的冻结时间 应存在", object: "db.submitted_objective_fixture", operator: "confirmed_at_exists", params: { targetFrom: "data.target" } },
      { source: { caseStepId: "S0-8", method: "prisma" }, id: "db.submitted_objective.loot_submitted_at", title: "目标 `E2E-TARGET-ACCEPTANCE-ALIGNMENT-REQUEST` 的战利品提交时间 应存在", object: "db.submitted_objective_fixture", operator: "loot_submitted_at_exists", params: { targetFrom: "data.target" } },
      { source: { caseStepId: "S0-9", method: "prisma" }, id: "db.metric.exists", title: "应存在 归属于目标 `E2E-TARGET-ACCEPTANCE-ALIGNMENT-REQUEST`、口径为 `E2E-METRIC-ACCEPTANCE-ALIGNMENT-REQUEST`、等级积分等级为 `进阶`、等级积分为 `30` 的指标", object: "db.metric", operator: "exists_with_score", params: { targetFrom: "data.target", titleFrom: "data.metric.title", difficultyFrom: "data.metric.difficulty", scoreFrom: "data.metric.score" } },
      { source: { caseStepId: "S0-10", method: "prisma" }, id: "db.objective_loot.exists", title: "应存在 归属于目标 `E2E-TARGET-ACCEPTANCE-ALIGNMENT-REQUEST`、提交人为本用例普通成员、完成说明为 `E2E-ACCEPTANCE-ALIGNMENT-LOOT-BODY：普通成员已正式提交验收材料。` 的战利品正式提交记录", object: "db.objective_loot", operator: "exists", params: { targetFrom: "data.target", finalLootFrom: "data.finalLoot", memberUserFrom: "runtime.memberUser" } },
      { source: { caseStepId: "S0-11", method: "prisma" }, id: "db.objective_loot.self_test", title: "目标 `E2E-TARGET-ACCEPTANCE-ALIGNMENT-REQUEST` 的战利品正式提交记录 应包含自测报告 `E2E-ACCEPTANCE-ALIGNMENT-SELF-TEST：正式验收前已完成自测。`", object: "db.objective_loot", operator: "self_test", params: { targetFrom: "data.target", selfTestReportBodyFrom: "data.finalLoot.selfTestReportBody" } },
      { source: { caseStepId: "S0-12", method: "prisma" }, id: "db.objective_loot.metric_claim", title: "目标 `E2E-TARGET-ACCEPTANCE-ALIGNMENT-REQUEST` 的战利品正式提交记录 应包含指标 `E2E-METRIC-ACCEPTANCE-ALIGNMENT-REQUEST` 的完成主张 `completed` 和证据 `E2E-ACCEPTANCE-ALIGNMENT-EVIDENCE：https://example.test/acceptance-alignment-request`", object: "db.objective_loot", operator: "metric_claim", params: { targetFrom: "data.target", metricFrom: "data.metric" } },
      { source: { caseStepId: "S0-13", method: "prisma" }, id: "db.alignment_request.open_count_zero", title: "目标 `E2E-TARGET-ACCEPTANCE-ALIGNMENT-REQUEST` 的 `acceptance` 类型待处理阶段对齐申请数量 应为 `0`", object: "db.objective_alignment_request", operator: "open_count", params: { targetFrom: "data.target", kindFrom: "data.alignmentKind", count: 0 } },
    ],
  },

  Action: {
    description: "被测业务动作",
    steps: [
      { source: { caseStepId: "Action-1", method: "playwright" }, id: "member.open_my_challenges", title: "普通成员打开 我的挑战", object: "page.challenge", operator: "open_my_challenges" },
      { source: { caseStepId: "Action-2", method: "playwright" }, id: "objective.visible", title: "我的挑战列表 应显示目标 `E2E-TARGET-ACCEPTANCE-ALIGNMENT-REQUEST`", object: "page.challenge_objectives", operator: "visible_title", params: { titleFrom: "data.target.title" } },
      { source: { caseStepId: "Action-3", method: "playwright" }, id: "objective.status.submitted", title: "目标 `E2E-TARGET-ACCEPTANCE-ALIGNMENT-REQUEST` 的状态 应显示为 待验收", object: "page.challenge_objective", operator: "status_visible", params: { titleFrom: "data.target.title", statusLabel: "待验收" } },
      { source: { caseStepId: "Action-4", method: "playwright" }, id: "alignment.action.enabled", title: "目标 `E2E-TARGET-ACCEPTANCE-ALIGNMENT-REQUEST` 的 \"申请验收对齐\" 操作 应可见且可点击", object: "page.objective_alignment", operator: "request_acceptance_enabled", params: { targetTitleFrom: "data.target.title" } },
      { source: { caseStepId: "Action-5", method: "playwright" }, id: "alignment.request.click", title: "点击目标 `E2E-TARGET-ACCEPTANCE-ALIGNMENT-REQUEST` 的 \"申请验收对齐\" 操作", object: "page.objective_alignment", operator: "request_acceptance", params: { targetTitleFrom: "data.target.title" } },
    ],
  },

  S1: {
    description: "Action 后状态",
    assertions: [
      { source: { caseStepId: "S1-1", method: "playwright" }, id: "toast.acceptance_alignment_requested", title: "页面 应提示 已申请验收对齐，请约时间并定好会议室", object: "page.challenge_toast", operator: "acceptance_alignment_requested" },
      { source: { caseStepId: "S1-2", method: "playwright" }, id: "challenge.page.url", title: "页面 应进入 我的挑战", object: "page.challenge", operator: "url" },
      { source: { caseStepId: "S1-3", method: "playwright" }, id: "scope.mine.selected", title: "\"我的挑战\" 视图 应处于选中状态", object: "page.challenge_scope", operator: "selected", params: { label: "我的挑战" } },
      { source: { caseStepId: "S1-4", method: "playwright" }, id: "objective.visible", title: "我的挑战列表 应显示目标 `E2E-TARGET-ACCEPTANCE-ALIGNMENT-REQUEST`", object: "page.challenge_objectives", operator: "visible_title", params: { titleFrom: "data.target.title" } },
      { source: { caseStepId: "S1-5", method: "playwright" }, id: "objective.status.submitted", title: "目标 `E2E-TARGET-ACCEPTANCE-ALIGNMENT-REQUEST` 的状态 应显示为 待验收", object: "page.challenge_objective", operator: "status_visible", params: { titleFrom: "data.target.title", statusLabel: "待验收" } },
      { source: { caseStepId: "S1-6", method: "playwright" }, id: "alignment.action.hidden", title: "目标 `E2E-TARGET-ACCEPTANCE-ALIGNMENT-REQUEST` 的 \"申请验收对齐\" 操作 应不可见", object: "page.objective_alignment", operator: "request_acceptance_hidden", params: { targetTitleFrom: "data.target.title" } },
      { source: { caseStepId: "S1-7", method: "api" }, id: "api.my_challenges.contains_objective", title: "我的挑战数据 应包含目标 `E2E-TARGET-ACCEPTANCE-ALIGNMENT-REQUEST`", object: "api.my_challenges", operator: "contains_objective", params: { titleFrom: "data.target.title" } },
      { source: { caseStepId: "S1-8", method: "api" }, id: "api.my_challenges.objective_stage_flow", title: "我的挑战数据中目标 `E2E-TARGET-ACCEPTANCE-ALIGNMENT-REQUEST` 的阶段 应为 `goalFrozen`，流转状态 应为 `submitted`", object: "api.my_challenges", operator: "objective_stage_flow", params: { targetFrom: "data.target" } },
      { source: { caseStepId: "S1-9", method: "api" }, id: "api.my_challenges.contains_alignment", title: "我的挑战数据中目标 `E2E-TARGET-ACCEPTANCE-ALIGNMENT-REQUEST` 应包含 `acceptance` 类型、状态为 `requested`、申请人为本用例普通成员的阶段对齐申请", object: "api.my_challenges", operator: "contains_alignment_request", params: { targetTitleFrom: "data.target.title", kindFrom: "data.alignmentKind", statusFrom: "data.alignmentStatus", memberUserFrom: "runtime.memberUser" } },
      { source: { caseStepId: "S1-10", method: "api" }, id: "api.my_challenges.alignment_proposed_at", title: "我的挑战数据中目标 `E2E-TARGET-ACCEPTANCE-ALIGNMENT-REQUEST` 的 `acceptance` 类型阶段对齐申请发起时间 应存在", object: "api.my_challenges", operator: "alignment_request_proposed_at_exists", params: { targetTitleFrom: "data.target.title", kindFrom: "data.alignmentKind", statusFrom: "data.alignmentStatus", memberUserFrom: "runtime.memberUser" } },
      { source: { caseStepId: "S1-11", method: "api" }, id: "api.my_challenges.contains_objective_loot", title: "我的挑战数据中目标 `E2E-TARGET-ACCEPTANCE-ALIGNMENT-REQUEST` 应包含提交人为本用例普通成员、完成说明为 `E2E-ACCEPTANCE-ALIGNMENT-LOOT-BODY：普通成员已正式提交验收材料。` 的战利品正式提交记录", object: "api.my_challenges", operator: "contains_objective_loot", params: { targetTitleFrom: "data.target.title", finalLootFrom: "data.finalLoot", memberUserFrom: "runtime.memberUser" } },
      { source: { caseStepId: "S1-12", method: "prisma" }, id: "db.submitted_objective.exists", title: "标题为 `E2E-TARGET-ACCEPTANCE-ALIGNMENT-REQUEST` 的目标阶段 应为 `goalFrozen`，流转状态 应为 `submitted`", object: "db.submitted_objective_fixture", operator: "exists", params: { targetFrom: "data.target" } },
      { source: { caseStepId: "S1-13", method: "prisma" }, id: "db.submitted_objective.loot_submitted_at", title: "目标 `E2E-TARGET-ACCEPTANCE-ALIGNMENT-REQUEST` 的战利品提交时间 应存在", object: "db.submitted_objective_fixture", operator: "loot_submitted_at_exists", params: { targetFrom: "data.target" } },
      { source: { caseStepId: "S1-14", method: "prisma" }, id: "db.alignment_request.exists", title: "应存在 归属于目标 `E2E-TARGET-ACCEPTANCE-ALIGNMENT-REQUEST`、类型为 `acceptance`、状态为 `requested`、申请人为本用例普通成员的阶段对齐申请", object: "db.objective_alignment_request", operator: "exists", params: { targetFrom: "data.target", kindFrom: "data.alignmentKind", statusFrom: "data.alignmentStatus", memberUserFrom: "runtime.memberUser" } },
      { source: { caseStepId: "S1-15", method: "prisma" }, id: "db.alignment_request.proposed_at", title: "目标 `E2E-TARGET-ACCEPTANCE-ALIGNMENT-REQUEST` 的 `acceptance` 类型阶段对齐申请发起时间 应存在", object: "db.objective_alignment_request", operator: "proposed_at_exists", params: { targetFrom: "data.target", kindFrom: "data.alignmentKind", statusFrom: "data.alignmentStatus", memberUserFrom: "runtime.memberUser" } },
      { source: { caseStepId: "S1-16", method: "prisma" }, id: "db.alignment_request.open_count_one", title: "目标 `E2E-TARGET-ACCEPTANCE-ALIGNMENT-REQUEST` 的 `acceptance` 类型待处理阶段对齐申请数量 应为 `1`", object: "db.objective_alignment_request", operator: "open_count", params: { targetFrom: "data.target", kindFrom: "data.alignmentKind", count: 1 } },
      { source: { caseStepId: "S1-17", method: "prisma" }, id: "db.objective_loot.exists", title: "应存在 归属于目标 `E2E-TARGET-ACCEPTANCE-ALIGNMENT-REQUEST`、提交人为本用例普通成员、完成说明为 `E2E-ACCEPTANCE-ALIGNMENT-LOOT-BODY：普通成员已正式提交验收材料。` 的战利品正式提交记录", object: "db.objective_loot", operator: "exists", params: { targetFrom: "data.target", finalLootFrom: "data.finalLoot", memberUserFrom: "runtime.memberUser" } },
      { source: { caseStepId: "S1-18", method: "prisma" }, id: "db.objective_loot.metric_claim", title: "目标 `E2E-TARGET-ACCEPTANCE-ALIGNMENT-REQUEST` 的战利品正式提交记录 应包含指标 `E2E-METRIC-ACCEPTANCE-ALIGNMENT-REQUEST` 的完成主张 `completed` 和证据 `E2E-ACCEPTANCE-ALIGNMENT-EVIDENCE：https://example.test/acceptance-alignment-request`", object: "db.objective_loot", operator: "metric_claim", params: { targetFrom: "data.target", metricFrom: "data.metric" } },
      { source: { caseStepId: "S1-19", method: "prisma" }, id: "db.submitted_objective.challenger_still_contains", title: "目标 `E2E-TARGET-ACCEPTANCE-ALIGNMENT-REQUEST` 的当前挑战者 应仍包含本用例普通成员", object: "db.submitted_objective_fixture", operator: "challenger_contains", params: { targetFrom: "data.target", memberUserFrom: "runtime.memberUser" } },
    ],
  },

  Clean: {
    description: "恢复 B",
    steps: [
      { source: { caseStepId: "Clean-1", method: "prisma" }, id: "db.objectives.delete_created", title: "删除 本用例创建的目标标题前缀 `E2E-TARGET-ACCEPTANCE-ALIGNMENT-REQUEST` 对应的目标及其派生数据", object: "db.objectives_by_prefix", operator: "delete", params: { prefixFrom: "data.targetPrefix" } },
      { source: { caseStepId: "Clean-2", method: "api" }, id: "auth.logout", title: "注销当前普通成员登录会话", object: "auth", operator: "logout" },
      { source: { caseStepId: "Clean-3", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Clean-4", method: "api" }, id: "ory.member_identity.delete", title: "删除 本用例普通成员登录身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-5", method: "api" }, id: "ory.admin_identity.delete", title: "删除 本用例管理员登录身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-6", method: "prisma" }, id: "db.member_user.delete", title: "删除 本用例普通成员用户", object: "db.user", operator: "delete", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-7", method: "prisma" }, id: "db.admin_user.delete", title: "删除 本用例管理员用户", object: "db.user", operator: "delete", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-8", method: "prisma" }, id: "db.objectives.absent", title: "应不存在 标题前缀为 `E2E-TARGET-ACCEPTANCE-ALIGNMENT-REQUEST` 的目标", object: "db.objectives_by_prefix", operator: "absent", params: { prefixFrom: "data.targetPrefix" } },
      { source: { caseStepId: "Clean-9", method: "prisma" }, id: "db.metric.absent", title: "应不存在 口径为 `E2E-METRIC-ACCEPTANCE-ALIGNMENT-REQUEST` 的指标", object: "db.metric", operator: "absent", params: { titleFrom: "data.metric.title" } },
      { source: { caseStepId: "Clean-10", method: "api" }, id: "ory.member_identity.absent", title: "邮箱为 `orf-member-acceptance-alignment-request-e2e@orf.local` 的普通成员登录身份 应不存在", object: "ory.identity", operator: "absent", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-11", method: "api" }, id: "ory.admin_identity.absent", title: "邮箱为 `orf-admin-acceptance-alignment-request-e2e@orf.local` 的管理员登录身份 应不存在", object: "ory.identity", operator: "absent", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-12", method: "prisma" }, id: "db.member_user.absent", title: "邮箱为 `orf-member-acceptance-alignment-request-e2e@orf.local` 的普通成员用户 应不存在", object: "db.user", operator: "absent", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-13", method: "prisma" }, id: "db.admin_user.absent", title: "邮箱为 `orf-admin-acceptance-alignment-request-e2e@orf.local` 的管理员用户 应不存在", object: "db.user", operator: "absent", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-14", method: "api" }, id: "session.unauthenticated", title: "当前会话 应为 未登录", object: "auth.session", operator: "unauthenticated" },
    ],
  },
} satisfies StateCaseSpec<MemberAcceptanceAlignmentRequestCaseData>;
