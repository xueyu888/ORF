import { STATE_CASE_MODEL, type StateCaseSpec } from "../../../../_framework/types";
import type { MemberLeaveCategorySubmitWorkLogCaseData } from "./_support/member-leave-category-submit-work-log.context";

export const memberLeaveCategorySubmitWorkLogCase = {
  id: "work-log.member-leave-category-submit-work-log",
  title: "普通成员可以选择请假分类提交日志且不需要目标和进度估计",
  model: STATE_CASE_MODEL,
  tags: ["work-log", "classification", "member", "leave", "submit"],

  data: {
    memberEmail: "orf-member-leave-category-work-log-e2e@orf.local",
    memberPassword: "OrfMemberLeaveCategoryWorkLogE2E!2026",
    memberName: "ORF Member Leave Category Work Log E2E",
    memberRole: "member",
    memberStatus: "active",
    logBodyMarker: "E2E-WORK-LOG-LEAVE-CATEGORY-BODY",
    logBody: "E2E-WORK-LOG-LEAVE-CATEGORY-BODY：普通成员请假一天，不关联目标和目标进度估计。",
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
    description: "准备普通成员并打开工作日志当天视图",
    steps: [
      { source: { caseStepId: "Setup-1", method: "prisma" }, id: "db.work_log.delete_residue", title: "删除 本用例残留的工作日志正文标记 `E2E-WORK-LOG-LEAVE-CATEGORY-BODY` 对应的工作日志", object: "db.work_log_entry", operator: "delete_by_body_marker", params: { bodyMarkerFrom: "data.logBodyMarker" } },
      { source: { caseStepId: "Setup-2", method: "api" }, id: "ory.member_identity.upsert", title: "准备邮箱为 `orf-member-leave-category-work-log-e2e@orf.local`、使用固定测试密码的成员登录身份", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.memberEmail", nameFrom: "data.memberName", passwordFrom: "data.memberPassword", saveAs: "memberIdentity" } },
      { source: { caseStepId: "Setup-3", method: "prisma" }, id: "db.member_user.upsert", title: "准备 角色为 `member`、状态为 `active`、名称为 `ORF Member Leave Category Work Log E2E` 的本用例成员用户", object: "db.user", operator: "upsert", params: { emailFrom: "data.memberEmail", nameFrom: "data.memberName", roleFrom: "data.memberRole", statusFrom: "data.memberStatus", identityIdFrom: "runtime.memberIdentity.id", saveAs: "memberUser" } },
      { source: { caseStepId: "Setup-4", method: "playwright" }, id: "auth.login.member", title: "使用 本用例成员账号 登录 ORF", object: "page.auth", operator: "login", params: { emailFrom: "data.memberEmail", passwordFrom: "data.memberPassword" } },
      { source: { caseStepId: "Setup-5", method: "playwright" }, id: "work_logs.open_today", title: "打开 工作日志页面的当天日志视图", object: "page.work_logs", operator: "open_today" },
    ],
  },

  S0: {
    description: "成员已登录，可选分类包含内置请假且当天日志尚无本用例记录",
    assertions: [
      { source: { caseStepId: "S0-1", method: "api" }, id: "session.authenticated", title: "当前会话 应为 已登录", object: "auth.session", operator: "authenticated" },
      { source: { caseStepId: "S0-2", method: "api" }, id: "session.email", title: "当前会话用户邮箱 应为 `orf-member-leave-category-work-log-e2e@orf.local`", object: "auth.session.user_email", operator: "equals", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "S0-3", method: "api" }, id: "session.role", title: "当前会话用户角色 应为 `member`", object: "auth.session.user_role", operator: "equals", params: { roleFrom: "data.memberRole" } },
      { source: { caseStepId: "S0-4", method: "api" }, id: "session.status", title: "当前会话用户状态 应为 `active`", object: "auth.session.user_status", operator: "equals", params: { statusFrom: "data.memberStatus" } },
      { source: { caseStepId: "S0-5", method: "api" }, id: "session.name", title: "当前会话用户名称 应为 `ORF Member Leave Category Work Log E2E`", object: "auth.session.user_name", operator: "equals", params: { nameFrom: "data.memberName" } },
      { source: { caseStepId: "S0-6", method: "api" }, id: "work_log.categories.contains_leave", title: "工作日志可选分类 应包含内置分类 `请假`", object: "api.work_log.categories", operator: "contains_built_in", params: { name: "请假" } },
      { source: { caseStepId: "S0-7", method: "api" }, id: "work_log.categories.leave_source", title: "工作日志可选分类中的分类 `请假` 的来源 应为 `builtIn`", object: "api.work_log.categories", operator: "source_equals", params: { name: "请假", source: "builtIn" } },
      { source: { caseStepId: "S0-8", method: "api" }, id: "work_log.my_day.not_contains_marker", title: "当天工作日志数据 应不包含正文标记 `E2E-WORK-LOG-LEAVE-CATEGORY-BODY`", object: "api.work_log.my_day", operator: "not_contains_body_marker", params: { bodyMarkerFrom: "data.logBodyMarker" } },
      { source: { caseStepId: "S0-9", method: "prisma" }, id: "db.work_log.absent_today", title: "应不存在 本用例成员在测试执行当天提交的正文标记为 `E2E-WORK-LOG-LEAVE-CATEGORY-BODY` 的工作日志", object: "db.work_log_entry", operator: "absent_by_body_marker", params: { bodyMarkerFrom: "data.logBodyMarker" } },
      { source: { caseStepId: "S0-10", method: "playwright" }, id: "work_logs.page.visible", title: "页面 应进入 工作日志", object: "page.work_logs", operator: "visible" },
      { source: { caseStepId: "S0-11", method: "playwright" }, id: "work_logs.today_tab.selected", title: "\"日志\" 视图 应处于选中状态", object: "page.work_logs.view_tab", operator: "selected", params: { label: "日志" } },
      { source: { caseStepId: "S0-12", method: "playwright" }, id: "work_logs.editor.visible", title: "\"我的日志\" 面板 应可见", object: "page.work_logs.editor_panel", operator: "visible" },
      { source: { caseStepId: "S0-13", method: "playwright" }, id: "work_logs.classification.visible", title: "\"日志归类\" 控件 应可见", object: "page.work_logs.classification", operator: "visible" },
      { source: { caseStepId: "S0-14", method: "playwright" }, id: "work_logs.submit.disabled", title: "\"提交日志\" 操作 应不可点击", object: "page.work_logs.submit_action", operator: "disabled" },
    ],
  },

  Action: {
    description: "成员选择请假分类，填写正文并提交当天日志",
    steps: [
      { source: { caseStepId: "Action-1", method: "playwright" }, id: "work_logs.select_leave_category", title: "在 \"日志归类\" 控件中选择分类 `请假`", object: "page.work_logs.classification", operator: "select_category", params: { categoryName: "请假" } },
      { source: { caseStepId: "Action-2", method: "playwright" }, id: "work_logs.classification.displays_leave", title: "\"日志归类\" 控件 应显示分类 `请假`", object: "page.work_logs.classification", operator: "displays_category", params: { categoryName: "请假" } },
      { source: { caseStepId: "Action-3", method: "playwright" }, id: "work_logs.progress_input.disabled", title: "\"目标进度估计百分比\" 输入框 应不可用", object: "page.work_logs.progress_estimate_input", operator: "disabled" },
      { source: { caseStepId: "Action-4", method: "playwright" }, id: "work_logs.duration_input.absent", title: "\"记录时间分钟数\" 输入框 应不存在", object: "page.work_logs.duration_input", operator: "absent" },
      { source: { caseStepId: "Action-5", method: "playwright" }, id: "work_logs.fill_body", title: "在工作日志正文编辑器输入 `E2E-WORK-LOG-LEAVE-CATEGORY-BODY：普通成员请假一天，不关联目标和目标进度估计。`", object: "page.work_logs.body_editor", operator: "fill", params: { valueFrom: "data.logBody" } },
      { source: { caseStepId: "Action-6", method: "playwright" }, id: "work_logs.submit", title: "点击 \"提交日志\" 操作", object: "page.work_logs.submit_action", operator: "submit" },
    ],
  },

  S1: {
    description: "当天记录、接口和数据库均包含本用例提交的请假分类工作日志且目标与进度估计为空",
    assertions: [
      { source: { caseStepId: "S1-1", method: "playwright" }, id: "work_logs.toast.submitted", title: "页面 应提示 `工作日志已提交`", object: "page.work_logs.toast", operator: "visible", params: { text: "工作日志已提交" } },
      { source: { caseStepId: "S1-2", method: "playwright" }, id: "work_logs.history.body", title: "\"当天记录\" 区域 应显示日志正文 `E2E-WORK-LOG-LEAVE-CATEGORY-BODY：普通成员请假一天，不关联目标和目标进度估计。`", object: "page.work_logs.history", operator: "contains_body", params: { bodyMarkerFrom: "data.logBodyMarker", bodyFrom: "data.logBody" } },
      { source: { caseStepId: "S1-3", method: "playwright" }, id: "work_logs.history.category", title: "\"当天记录\" 区域 应显示分类 `请假`", object: "page.work_logs.history", operator: "contains_category", params: { bodyMarkerFrom: "data.logBodyMarker", categoryName: "请假" } },
      { source: { caseStepId: "S1-4", method: "playwright" }, id: "work_logs.history.duration_empty", title: "\"当天记录\" 区域中的本用例工作日志 应不显示记录时间", object: "page.work_logs.history", operator: "not_contains_duration", params: { bodyMarkerFrom: "data.logBodyMarker" } },
      { source: { caseStepId: "S1-5", method: "playwright" }, id: "work_logs.history.no_progress", title: "\"当天记录\" 区域 应不显示目标进度", object: "page.work_logs.history", operator: "not_contains_progress", params: { bodyMarkerFrom: "data.logBodyMarker" } },
      { source: { caseStepId: "S1-6", method: "api" }, id: "work_log.my_day.contains_body", title: "当天工作日志数据 应包含正文为 `E2E-WORK-LOG-LEAVE-CATEGORY-BODY：普通成员请假一天，不关联目标和目标进度估计。` 的工作日志", object: "api.work_log.my_day", operator: "contains_body", params: { bodyMarkerFrom: "data.logBodyMarker" } },
      { source: { caseStepId: "S1-7", method: "api" }, id: "work_log.my_day.category_id", title: "当天工作日志数据中的本用例工作日志分类 ID 快照 应为 `builtin:leave`", object: "api.work_log.my_day", operator: "category_id_snapshot", params: { bodyMarkerFrom: "data.logBodyMarker", value: "builtin:leave" } },
      { source: { caseStepId: "S1-8", method: "api" }, id: "work_log.my_day.category_name", title: "当天工作日志数据中的本用例工作日志分类名称快照 应为 `请假`", object: "api.work_log.my_day", operator: "category_name_snapshot", params: { bodyMarkerFrom: "data.logBodyMarker", value: "请假" } },
      { source: { caseStepId: "S1-9", method: "api" }, id: "work_log.my_day.objective_id_empty", title: "当天工作日志数据中的本用例工作日志目标 ID 快照 应为空", object: "api.work_log.my_day", operator: "objective_id_snapshot_empty", params: { bodyMarkerFrom: "data.logBodyMarker" } },
      { source: { caseStepId: "S1-10", method: "api" }, id: "work_log.my_day.objective_title_empty", title: "当天工作日志数据中的本用例工作日志目标标题快照 应为空", object: "api.work_log.my_day", operator: "objective_title_snapshot_empty", params: { bodyMarkerFrom: "data.logBodyMarker" } },
      { source: { caseStepId: "S1-11", method: "api" }, id: "work_log.my_day.duration_empty", title: "当天工作日志数据中的本用例工作日志记录时间分钟数 应为空", object: "api.work_log.my_day", operator: "duration_minutes_empty", params: { bodyMarkerFrom: "data.logBodyMarker" } },
      { source: { caseStepId: "S1-12", method: "api" }, id: "work_log.my_day.remaining_estimate_empty", title: "当天工作日志数据中的本用例工作日志剩余进度估计百分比 应为空", object: "api.work_log.my_day", operator: "remaining_estimate_percent_empty", params: { bodyMarkerFrom: "data.logBodyMarker" } },
      { source: { caseStepId: "S1-13", method: "prisma" }, id: "db.work_log.exists_today", title: "应存在 本用例成员在测试执行当天提交的正文标记为 `E2E-WORK-LOG-LEAVE-CATEGORY-BODY` 的工作日志", object: "db.work_log_entry", operator: "exists_today_for_member", params: { bodyMarkerFrom: "data.logBodyMarker", memberEmailFrom: "data.memberEmail", saveAs: "submittedWorkLogEntry" } },
      { source: { caseStepId: "S1-14", method: "prisma" }, id: "db.work_log.category_id", title: "本用例工作日志的分类 ID 快照 应为 `builtin:leave`", object: "db.work_log_entry.category_id_snapshot", operator: "equals", params: { entryFrom: "runtime.submittedWorkLogEntry", value: "builtin:leave" } },
      { source: { caseStepId: "S1-15", method: "prisma" }, id: "db.work_log.category_name", title: "本用例工作日志的分类名称快照 应为 `请假`", object: "db.work_log_entry.category_name_snapshot", operator: "equals", params: { entryFrom: "runtime.submittedWorkLogEntry", value: "请假" } },
      { source: { caseStepId: "S1-16", method: "prisma" }, id: "db.work_log.objective_id_empty", title: "本用例工作日志的目标 ID 快照 应为空", object: "db.work_log_entry.objective_id_snapshot", operator: "empty", params: { entryFrom: "runtime.submittedWorkLogEntry" } },
      { source: { caseStepId: "S1-17", method: "prisma" }, id: "db.work_log.objective_title_empty", title: "本用例工作日志的目标标题快照 应为空", object: "db.work_log_entry.objective_title_snapshot", operator: "empty", params: { entryFrom: "runtime.submittedWorkLogEntry" } },
      { source: { caseStepId: "S1-18", method: "prisma" }, id: "db.work_log.duration_empty", title: "本用例工作日志的记录时间分钟数 应为空", object: "db.work_log_entry.duration_minutes", operator: "empty", params: { entryFrom: "runtime.submittedWorkLogEntry" } },
      { source: { caseStepId: "S1-19", method: "prisma" }, id: "db.work_log.remaining_estimate_empty", title: "本用例工作日志的剩余进度估计百分比 应为空", object: "db.work_log_entry.remaining_estimate_percent", operator: "empty", params: { entryFrom: "runtime.submittedWorkLogEntry" } },
    ],
  },

  Clean: {
    description: "删除本用例日志、成员身份并清空登录态",
    steps: [
      { source: { caseStepId: "Clean-1", method: "prisma" }, id: "db.work_log.delete_created", title: "删除 本用例创建的工作日志正文标记 `E2E-WORK-LOG-LEAVE-CATEGORY-BODY` 对应的工作日志", object: "db.work_log_entry", operator: "delete_by_body_marker", params: { bodyMarkerFrom: "data.logBodyMarker" } },
      { source: { caseStepId: "Clean-2", method: "api" }, id: "auth.logout", title: "注销当前成员登录会话", object: "auth", operator: "logout" },
      { source: { caseStepId: "Clean-3", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Clean-4", method: "api" }, id: "ory.member_identity.delete", title: "删除 本用例成员登录身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-5", method: "prisma" }, id: "db.member_user.delete", title: "删除 本用例成员用户", object: "db.user", operator: "delete", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-6", method: "prisma" }, id: "db.work_log.absent", title: "应不存在 正文标记为 `E2E-WORK-LOG-LEAVE-CATEGORY-BODY` 的工作日志", object: "db.work_log_entry", operator: "absent_by_body_marker", params: { bodyMarkerFrom: "data.logBodyMarker" } },
      { source: { caseStepId: "Clean-7", method: "api" }, id: "ory.member_identity.absent", title: "邮箱为 `orf-member-leave-category-work-log-e2e@orf.local` 的成员登录身份 应不存在", object: "ory.identity", operator: "absent", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-8", method: "prisma" }, id: "db.member_user.absent", title: "邮箱为 `orf-member-leave-category-work-log-e2e@orf.local` 的成员用户 应不存在", object: "db.user", operator: "absent", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-9", method: "api" }, id: "session.unauthenticated", title: "当前会话 应为 未登录", object: "auth.session", operator: "unauthenticated" },
    ],
  },
} satisfies StateCaseSpec<MemberLeaveCategorySubmitWorkLogCaseData>;
