import { STATE_CASE_MODEL, type StateCaseSpec } from "../../../../_framework/types";
import type { AdminManagementAffairsCategorySubmitWorkLogCaseData } from "./_support/admin-management-affairs-category-submit-work-log.context";

export const adminManagementAffairsCategorySubmitWorkLogCase = {
  id: "work-log.admin-management-affairs-category-submit-work-log",
  title: "验证管理员可以使用管理事务分类提交工作日志",
  model: STATE_CASE_MODEL,
  tags: ["work-log", "classification", "admin", "managed-category", "submit"],

  data: {
    adminEmail: "orf-admin-use-management-category-work-log-e2e@orf.local",
    adminPassword: "OrfAdminUseManagementCategoryWorkLogE2E!2026",
    adminName: "ORF Admin Use Management Category Work Log E2E",
    adminRole: "admin",
    adminStatus: "active",
    teamId: "team-testd-admin-management-affairs-category-submit-work-log",
    teamName: "TestD Admin Management Category Submit Work Log Team",
    logBodyMarker: "E2E-WORK-LOG-ADMIN-MANAGEMENT-CATEGORY-BODY",
    logBody: "E2E-WORK-LOG-ADMIN-MANAGEMENT-CATEGORY-BODY：管理员处理管理事务，不关联目标和目标进度估计。",
    durationMinutes: 120,
    expectedDurationLabel: "2h",
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
    description: "准备管理员和管理事务分类并打开工作日志当天视图",
    steps: [
      { source: { caseStepId: "Setup-1", method: "prisma" }, id: "db.work_log.delete_residue", title: "删除 本用例残留的工作日志正文标记 `E2E-WORK-LOG-ADMIN-MANAGEMENT-CATEGORY-BODY` 对应的工作日志", object: "db.work_log_entry", operator: "delete_by_body_marker", params: { bodyMarkerFrom: "data.logBodyMarker" } },
      { source: { caseStepId: "Setup-2", method: "api" }, id: "ory.admin_identity.upsert", title: "准备邮箱为 `orf-admin-use-management-category-work-log-e2e@orf.local`、使用固定测试密码的管理员登录身份", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.adminEmail", nameFrom: "data.adminName", passwordFrom: "data.adminPassword", saveAs: "adminIdentity" } },
      { source: { caseStepId: "Setup-3", method: "prisma" }, id: "db.admin_user.upsert", title: "准备 角色为 `admin`、状态为 `active`、名称为 `ORF Admin Use Management Category Work Log E2E` 的本用例管理员用户", object: "db.user", operator: "upsert", params: { emailFrom: "data.adminEmail", nameFrom: "data.adminName", roleFrom: "data.adminRole", statusFrom: "data.adminStatus", identityIdFrom: "runtime.adminIdentity.id", saveAs: "adminUser" } },
      { source: { caseStepId: "Setup-4", method: "prisma" }, id: "db.work_log_category.upsert_management", title: "准备 名称为 `管理事务`、属于本用例管理员团队、由本用例管理员创建的工作日志管理分类", object: "db.work_log_category", operator: "upsert_management", params: { categoryName: "管理事务", teamIdFrom: "data.teamId", teamNameFrom: "data.teamName", createdByUserIdFrom: "runtime.adminUser.userId", saveAs: "managementCategory" } },
      { source: { caseStepId: "Setup-5", method: "playwright" }, id: "auth.login.admin", title: "使用 本用例管理员账号 登录 ORF", object: "page.auth", operator: "login", params: { emailFrom: "data.adminEmail", passwordFrom: "data.adminPassword" } },
      { source: { caseStepId: "Setup-6", method: "playwright" }, id: "work_logs.open_today", title: "打开 工作日志页面的当天日志视图", object: "page.work_logs", operator: "open_today" },
    ],
  },

  S0: {
    description: "管理员已登录，管理事务分类存在且在管理员可选分类中",
    assertions: [
      { source: { caseStepId: "S0-1", method: "api" }, id: "session.authenticated", title: "当前会话 应为 已登录", object: "auth.session", operator: "authenticated" },
      { source: { caseStepId: "S0-2", method: "api" }, id: "session.email", title: "当前会话用户邮箱 应为 `orf-admin-use-management-category-work-log-e2e@orf.local`", object: "auth.session.user_email", operator: "equals", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "S0-3", method: "api" }, id: "session.role", title: "当前会话用户角色 应为 `admin`", object: "auth.session.user_role", operator: "equals", params: { roleFrom: "data.adminRole" } },
      { source: { caseStepId: "S0-4", method: "api" }, id: "session.status", title: "当前会话用户状态 应为 `active`", object: "auth.session.user_status", operator: "equals", params: { statusFrom: "data.adminStatus" } },
      { source: { caseStepId: "S0-5", method: "api" }, id: "session.name", title: "当前会话用户名称 应为 `ORF Admin Use Management Category Work Log E2E`", object: "auth.session.user_name", operator: "equals", params: { nameFrom: "data.adminName" } },
      { source: { caseStepId: "S0-6", method: "prisma" }, id: "db.work_log_category.exists", title: "应存在 名称为 `管理事务`、属于本用例管理员团队的工作日志管理分类", object: "db.work_log_category", operator: "exists_in_team", params: { categoryName: "管理事务", teamIdFrom: "data.teamId" } },
      { source: { caseStepId: "S0-7", method: "api" }, id: "work_log.categories.contains_management", title: "工作日志可选分类 应包含管理分类 `管理事务`", object: "api.work_log.categories", operator: "contains_managed", params: { name: "管理事务" } },
      { source: { caseStepId: "S0-8", method: "api" }, id: "work_log.categories.management_source", title: "工作日志可选分类中的分类 `管理事务` 的来源 应为 `managed`", object: "api.work_log.categories", operator: "source_equals", params: { name: "管理事务", source: "managed" } },
      { source: { caseStepId: "S0-9", method: "api" }, id: "work_log.my_day.not_contains_marker", title: "当天工作日志数据 应不包含正文标记 `E2E-WORK-LOG-ADMIN-MANAGEMENT-CATEGORY-BODY`", object: "api.work_log.my_day", operator: "not_contains_body_marker", params: { bodyMarkerFrom: "data.logBodyMarker" } },
      { source: { caseStepId: "S0-10", method: "prisma" }, id: "db.work_log.absent_today_by_marker", title: "应不存在 本用例管理员在测试执行当天提交的正文标记为 `E2E-WORK-LOG-ADMIN-MANAGEMENT-CATEGORY-BODY` 的工作日志", object: "db.work_log_entry", operator: "absent_today_for_admin_by_marker", params: { bodyMarkerFrom: "data.logBodyMarker", adminEmailFrom: "data.adminEmail" } },
      { source: { caseStepId: "S0-11", method: "playwright" }, id: "work_logs.page.visible", title: "页面 应进入 工作日志", object: "page.work_logs", operator: "visible" },
      { source: { caseStepId: "S0-12", method: "playwright" }, id: "work_logs.today_tab.selected", title: "\"日志\" 视图 应处于选中状态", object: "page.work_logs.view_tab", operator: "selected", params: { label: "日志" } },
      { source: { caseStepId: "S0-13", method: "playwright" }, id: "work_logs.editor.visible", title: "\"我的日志\" 面板 应可见", object: "page.work_logs.editor_panel", operator: "visible" },
      { source: { caseStepId: "S0-14", method: "playwright" }, id: "work_logs.classification.visible", title: "\"日志归类\" 控件 应可见", object: "page.work_logs.classification", operator: "visible" },
      { source: { caseStepId: "S0-15", method: "playwright" }, id: "work_logs.submit.disabled", title: "\"提交日志\" 操作 应不可点击", object: "page.work_logs.submit_action", operator: "disabled" },
    ],
  },

  Action: {
    description: "管理员选择管理事务分类，填写记录时间和正文并提交当天日志",
    steps: [
      { source: { caseStepId: "Action-1", method: "playwright" }, id: "work_logs.select_management_category", title: "在 \"日志归类\" 控件中选择分类 `管理事务`", object: "page.work_logs.classification", operator: "select_category", params: { categoryName: "管理事务" } },
      { source: { caseStepId: "Action-2", method: "playwright" }, id: "work_logs.classification.displays_management", title: "\"日志归类\" 控件 应显示分类 `管理事务`", object: "page.work_logs.classification", operator: "displays_category", params: { categoryName: "管理事务" } },
      { source: { caseStepId: "Action-3", method: "playwright" }, id: "work_logs.progress_input.disabled", title: "\"目标进度估计百分比\" 输入框 应不可用", object: "page.work_logs.progress_estimate_input", operator: "disabled" },
      { source: { caseStepId: "Action-4", method: "playwright" }, id: "work_logs.fill_duration", title: "在 \"记录时间分钟数\" 输入框输入 `120`", object: "page.work_logs.duration_input", operator: "fill", params: { valueFrom: "data.durationMinutes" } },
      { source: { caseStepId: "Action-5", method: "playwright" }, id: "work_logs.fill_body", title: "在工作日志正文编辑器输入 `E2E-WORK-LOG-ADMIN-MANAGEMENT-CATEGORY-BODY：管理员处理管理事务，不关联目标和目标进度估计。`", object: "page.work_logs.body_editor", operator: "fill", params: { valueFrom: "data.logBody" } },
      { source: { caseStepId: "Action-6", method: "playwright" }, id: "work_logs.submit", title: "点击 \"提交日志\" 操作", object: "page.work_logs.submit_action", operator: "submit" },
    ],
  },

  S1: {
    description: "当天记录、接口和数据库均包含管理员提交的管理事务分类工作日志且目标与进度估计为空",
    assertions: [
      { source: { caseStepId: "S1-1", method: "playwright" }, id: "work_logs.toast.submitted", title: "页面 应提示 `工作日志已提交`", object: "page.work_logs.toast", operator: "visible", params: { text: "工作日志已提交" } },
      { source: { caseStepId: "S1-2", method: "playwright" }, id: "work_logs.history.body", title: "\"当天记录\" 区域 应显示日志正文 `E2E-WORK-LOG-ADMIN-MANAGEMENT-CATEGORY-BODY：管理员处理管理事务，不关联目标和目标进度估计。`", object: "page.work_logs.history", operator: "contains_body", params: { bodyMarkerFrom: "data.logBodyMarker", bodyFrom: "data.logBody" } },
      { source: { caseStepId: "S1-3", method: "playwright" }, id: "work_logs.history.category", title: "\"当天记录\" 区域 应显示分类 `管理事务`", object: "page.work_logs.history", operator: "contains_category", params: { bodyMarkerFrom: "data.logBodyMarker", categoryName: "管理事务" } },
      { source: { caseStepId: "S1-4", method: "playwright" }, id: "work_logs.history.duration", title: "\"当天记录\" 区域 应显示记录时间 `2h`", object: "page.work_logs.history", operator: "contains_duration", params: { bodyMarkerFrom: "data.logBodyMarker", durationLabelFrom: "data.expectedDurationLabel" } },
      { source: { caseStepId: "S1-5", method: "playwright" }, id: "work_logs.history.no_progress", title: "\"当天记录\" 区域 应不显示目标进度", object: "page.work_logs.history", operator: "not_contains_progress", params: { bodyMarkerFrom: "data.logBodyMarker" } },
      { source: { caseStepId: "S1-6", method: "api" }, id: "work_log.my_day.contains_body", title: "当天工作日志数据 应包含正文为 `E2E-WORK-LOG-ADMIN-MANAGEMENT-CATEGORY-BODY：管理员处理管理事务，不关联目标和目标进度估计。` 的工作日志", object: "api.work_log.my_day", operator: "contains_body", params: { bodyMarkerFrom: "data.logBodyMarker" } },
      { source: { caseStepId: "S1-7", method: "api" }, id: "work_log.my_day.category_id", title: "当天工作日志数据中的本用例工作日志分类 ID 快照 应为 本用例工作日志管理分类 ID", object: "api.work_log.my_day", operator: "category_id_snapshot", params: { bodyMarkerFrom: "data.logBodyMarker", valueFrom: "runtime.managementCategory.id" } },
      { source: { caseStepId: "S1-8", method: "api" }, id: "work_log.my_day.category_name", title: "当天工作日志数据中的本用例工作日志分类名称快照 应为 `管理事务`", object: "api.work_log.my_day", operator: "category_name_snapshot", params: { bodyMarkerFrom: "data.logBodyMarker", value: "管理事务" } },
      { source: { caseStepId: "S1-9", method: "api" }, id: "work_log.my_day.objective_id_empty", title: "当天工作日志数据中的本用例工作日志目标 ID 快照 应为空", object: "api.work_log.my_day", operator: "objective_id_snapshot_empty", params: { bodyMarkerFrom: "data.logBodyMarker" } },
      { source: { caseStepId: "S1-10", method: "api" }, id: "work_log.my_day.objective_title_empty", title: "当天工作日志数据中的本用例工作日志目标标题快照 应为空", object: "api.work_log.my_day", operator: "objective_title_snapshot_empty", params: { bodyMarkerFrom: "data.logBodyMarker" } },
      { source: { caseStepId: "S1-11", method: "api" }, id: "work_log.my_day.duration", title: "当天工作日志数据中的本用例工作日志记录时间分钟数 应为 `120`", object: "api.work_log.my_day", operator: "duration_minutes", params: { bodyMarkerFrom: "data.logBodyMarker", valueFrom: "data.durationMinutes" } },
      { source: { caseStepId: "S1-12", method: "api" }, id: "work_log.my_day.remaining_estimate_empty", title: "当天工作日志数据中的本用例工作日志剩余进度估计百分比 应为空", object: "api.work_log.my_day", operator: "remaining_estimate_percent_empty", params: { bodyMarkerFrom: "data.logBodyMarker" } },
      { source: { caseStepId: "S1-13", method: "prisma" }, id: "db.work_log.exists_today", title: "应存在 本用例管理员在测试执行当天提交的正文标记为 `E2E-WORK-LOG-ADMIN-MANAGEMENT-CATEGORY-BODY` 的工作日志", object: "db.work_log_entry", operator: "exists_today_for_admin", params: { bodyMarkerFrom: "data.logBodyMarker", adminEmailFrom: "data.adminEmail", saveAs: "submittedWorkLogEntry" } },
      { source: { caseStepId: "S1-14", method: "prisma" }, id: "db.work_log.category_id", title: "本用例工作日志的分类 ID 快照 应为 本用例工作日志管理分类 ID", object: "db.work_log_entry.category_id_snapshot", operator: "equals", params: { entryFrom: "runtime.submittedWorkLogEntry", valueFrom: "runtime.managementCategory.id" } },
      { source: { caseStepId: "S1-15", method: "prisma" }, id: "db.work_log.category_name", title: "本用例工作日志的分类名称快照 应为 `管理事务`", object: "db.work_log_entry.category_name_snapshot", operator: "equals", params: { entryFrom: "runtime.submittedWorkLogEntry", value: "管理事务" } },
      { source: { caseStepId: "S1-16", method: "prisma" }, id: "db.work_log.objective_id_empty", title: "本用例工作日志的目标 ID 快照 应为空", object: "db.work_log_entry.objective_id_snapshot", operator: "empty", params: { entryFrom: "runtime.submittedWorkLogEntry" } },
      { source: { caseStepId: "S1-17", method: "prisma" }, id: "db.work_log.objective_title_empty", title: "本用例工作日志的目标标题快照 应为空", object: "db.work_log_entry.objective_title_snapshot", operator: "empty", params: { entryFrom: "runtime.submittedWorkLogEntry" } },
      { source: { caseStepId: "S1-18", method: "prisma" }, id: "db.work_log.duration", title: "本用例工作日志的记录时间分钟数 应为 `120`", object: "db.work_log_entry.duration_minutes", operator: "equals", params: { entryFrom: "runtime.submittedWorkLogEntry", valueFrom: "data.durationMinutes" } },
      { source: { caseStepId: "S1-19", method: "prisma" }, id: "db.work_log.remaining_estimate_empty", title: "本用例工作日志的剩余进度估计百分比 应为空", object: "db.work_log_entry.remaining_estimate_percent", operator: "empty", params: { entryFrom: "runtime.submittedWorkLogEntry" } },
      { source: { caseStepId: "S1-20", method: "prisma" }, id: "db.work_log_category.still_exists", title: "名称为 `管理事务` 的工作日志管理分类 应仍属于本用例管理员团队", object: "db.work_log_category", operator: "exists_by_fixture", params: { categoryFrom: "runtime.managementCategory" } },
    ],
  },

  Clean: {
    description: "删除本用例日志、管理分类、管理员身份并清空登录态",
    steps: [
      { source: { caseStepId: "Clean-1", method: "prisma" }, id: "db.work_log.delete_created", title: "删除 本用例创建的工作日志正文标记 `E2E-WORK-LOG-ADMIN-MANAGEMENT-CATEGORY-BODY` 对应的工作日志", object: "db.work_log_entry", operator: "delete_by_body_marker", params: { bodyMarkerFrom: "data.logBodyMarker" } },
      { source: { caseStepId: "Clean-2", method: "prisma" }, id: "db.work_log_category.delete_created", title: "删除 本用例创建的工作日志管理分类 `管理事务`", object: "db.work_log_category", operator: "delete_by_fixture", params: { categoryFrom: "runtime.managementCategory" } },
      { source: { caseStepId: "Clean-3", method: "api" }, id: "auth.logout", title: "注销当前管理员登录会话", object: "auth", operator: "logout" },
      { source: { caseStepId: "Clean-4", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Clean-5", method: "api" }, id: "ory.admin_identity.delete", title: "删除 本用例管理员登录身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-6", method: "prisma" }, id: "db.admin_user.delete", title: "删除 本用例管理员用户", object: "db.user", operator: "delete", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-7", method: "prisma" }, id: "db.work_log.absent", title: "应不存在 正文标记为 `E2E-WORK-LOG-ADMIN-MANAGEMENT-CATEGORY-BODY` 的工作日志", object: "db.work_log_entry", operator: "absent_by_body_marker", params: { bodyMarkerFrom: "data.logBodyMarker" } },
      { source: { caseStepId: "Clean-8", method: "prisma" }, id: "db.work_log_category.absent", title: "应不存在 本用例创建的工作日志管理分类 `管理事务`", object: "db.work_log_category", operator: "absent_by_fixture", params: { categoryFrom: "runtime.managementCategory" } },
      { source: { caseStepId: "Clean-9", method: "api" }, id: "ory.admin_identity.absent", title: "邮箱为 `orf-admin-use-management-category-work-log-e2e@orf.local` 的管理员登录身份 应不存在", object: "ory.identity", operator: "absent", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-10", method: "prisma" }, id: "db.admin_user.absent", title: "邮箱为 `orf-admin-use-management-category-work-log-e2e@orf.local` 的管理员用户 应不存在", object: "db.user", operator: "absent", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-11", method: "api" }, id: "session.unauthenticated", title: "当前会话 应为 未登录", object: "auth.session", operator: "unauthenticated" },
    ],
  },
} satisfies StateCaseSpec<AdminManagementAffairsCategorySubmitWorkLogCaseData>;
