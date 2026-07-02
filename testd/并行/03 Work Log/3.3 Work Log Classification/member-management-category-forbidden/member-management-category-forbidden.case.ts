import { STATE_CASE_MODEL, type StateCaseSpec } from "../../../../_framework/types";
import type { MemberManagementCategoryForbiddenCaseData } from "./_support/member-management-category-forbidden.context";

export const memberManagementCategoryForbiddenCase = {
  id: "work-log.member-management-category-forbidden",
  title: "普通成员不能使用管理事务分类",
  model: STATE_CASE_MODEL,
  tags: ["work-log", "classification", "member", "permission", "forbidden"],

  data: {
    adminEmail: "orf-admin-management-category-work-log-e2e@orf.local",
    adminPassword: "OrfAdminManagementCategoryWorkLogE2E!2026",
    adminName: "ORF Admin Management Category Work Log E2E",
    adminRole: "admin",
    adminStatus: "active",
    memberEmail: "orf-member-management-category-work-log-e2e@orf.local",
    memberPassword: "OrfMemberManagementCategoryWorkLogE2E!2026",
    memberName: "ORF Member Management Category Work Log E2E",
    memberRole: "member",
    memberStatus: "active",
    logBodyMarker: "E2E-WORK-LOG-MANAGEMENT-CATEGORY-FORBIDDEN-BODY",
    logBody: "E2E-WORK-LOG-MANAGEMENT-CATEGORY-FORBIDDEN-BODY：普通成员不能使用管理事务分类。",
    expectedCategoryForbiddenMessage: "当前账号不能使用该工作日志分类",
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
    description: "准备管理员、普通成员和管理事务分类并打开普通成员工作日志当天视图",
    steps: [
      { source: { caseStepId: "Setup-1", method: "prisma" }, id: "db.work_log.delete_residue", title: "删除 本用例残留的工作日志正文标记 `E2E-WORK-LOG-MANAGEMENT-CATEGORY-FORBIDDEN-BODY` 对应的工作日志", object: "db.work_log_entry", operator: "delete_by_body_marker", params: { bodyMarkerFrom: "data.logBodyMarker" } },
      { source: { caseStepId: "Setup-2", method: "api" }, id: "ory.admin_identity.upsert", title: "准备邮箱为 `orf-admin-management-category-work-log-e2e@orf.local`、使用固定测试密码的管理员登录身份", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.adminEmail", nameFrom: "data.adminName", passwordFrom: "data.adminPassword", saveAs: "adminIdentity" } },
      { source: { caseStepId: "Setup-3", method: "prisma" }, id: "db.admin_user.upsert", title: "准备 角色为 `admin`、状态为 `active`、名称为 `ORF Admin Management Category Work Log E2E` 的本用例管理员用户", object: "db.user", operator: "upsert", params: { emailFrom: "data.adminEmail", nameFrom: "data.adminName", roleFrom: "data.adminRole", statusFrom: "data.adminStatus", identityIdFrom: "runtime.adminIdentity.id", saveAs: "adminUser" } },
      { source: { caseStepId: "Setup-4", method: "api" }, id: "ory.member_identity.upsert", title: "准备邮箱为 `orf-member-management-category-work-log-e2e@orf.local`、使用固定测试密码的成员登录身份", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.memberEmail", nameFrom: "data.memberName", passwordFrom: "data.memberPassword", saveAs: "memberIdentity" } },
      { source: { caseStepId: "Setup-5", method: "prisma" }, id: "db.member_user.upsert", title: "准备 角色为 `member`、状态为 `active`、名称为 `ORF Member Management Category Work Log E2E`、与本用例管理员属于同一团队的本用例成员用户", object: "db.user", operator: "upsert", params: { emailFrom: "data.memberEmail", nameFrom: "data.memberName", roleFrom: "data.memberRole", statusFrom: "data.memberStatus", identityIdFrom: "runtime.memberIdentity.id", saveAs: "memberUser" } },
      { source: { caseStepId: "Setup-6", method: "prisma" }, id: "db.work_log_category.upsert_management", title: "准备 名称为 `管理事务`、属于本用例成员团队、由本用例管理员创建的工作日志管理分类", object: "db.work_log_category", operator: "upsert_management", params: { categoryName: "管理事务", teamIdFrom: "runtime.memberUser.teamId", createdByUserIdFrom: "runtime.adminUser.userId", saveAs: "managementCategory" } },
      { source: { caseStepId: "Setup-7", method: "playwright" }, id: "auth.login.member", title: "使用 本用例成员账号 登录 ORF", object: "page.auth", operator: "login", params: { emailFrom: "data.memberEmail", passwordFrom: "data.memberPassword" } },
      { source: { caseStepId: "Setup-8", method: "playwright" }, id: "work_logs.open_today", title: "打开 工作日志页面的当天日志视图", object: "page.work_logs", operator: "open_today" },
    ],
  },

  S0: {
    description: "普通成员已登录，管理事务分类存在但不在普通成员可选分类中",
    assertions: [
      { source: { caseStepId: "S0-1", method: "api" }, id: "session.authenticated", title: "当前会话 应为 已登录", object: "auth.session", operator: "authenticated" },
      { source: { caseStepId: "S0-2", method: "api" }, id: "session.email", title: "当前会话用户邮箱 应为 `orf-member-management-category-work-log-e2e@orf.local`", object: "auth.session.user_email", operator: "equals", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "S0-3", method: "api" }, id: "session.role", title: "当前会话用户角色 应为 `member`", object: "auth.session.user_role", operator: "equals", params: { roleFrom: "data.memberRole" } },
      { source: { caseStepId: "S0-4", method: "api" }, id: "session.status", title: "当前会话用户状态 应为 `active`", object: "auth.session.user_status", operator: "equals", params: { statusFrom: "data.memberStatus" } },
      { source: { caseStepId: "S0-5", method: "api" }, id: "session.name", title: "当前会话用户名称 应为 `ORF Member Management Category Work Log E2E`", object: "auth.session.user_name", operator: "equals", params: { nameFrom: "data.memberName" } },
      { source: { caseStepId: "S0-6", method: "prisma" }, id: "db.work_log_category.exists", title: "应存在 名称为 `管理事务`、属于本用例成员团队的工作日志管理分类", object: "db.work_log_category", operator: "exists_in_team", params: { categoryName: "管理事务", teamIdFrom: "runtime.memberUser.teamId" } },
      { source: { caseStepId: "S0-7", method: "api" }, id: "work_log.categories.not_contains_management", title: "工作日志可选分类 应不包含管理分类 `管理事务`", object: "api.work_log.categories", operator: "not_contains", params: { name: "管理事务" } },
      { source: { caseStepId: "S0-8", method: "api" }, id: "work_log.categories.contains_leave", title: "工作日志可选分类 应包含内置分类 `请假`", object: "api.work_log.categories", operator: "contains_built_in", params: { name: "请假" } },
      { source: { caseStepId: "S0-9", method: "api" }, id: "work_log.my_day.not_contains_marker", title: "当天工作日志数据 应不包含正文标记 `E2E-WORK-LOG-MANAGEMENT-CATEGORY-FORBIDDEN-BODY`", object: "api.work_log.my_day", operator: "not_contains_body_marker", params: { bodyMarkerFrom: "data.logBodyMarker" } },
      { source: { caseStepId: "S0-10", method: "prisma" }, id: "db.work_log.absent_today_by_marker", title: "应不存在 本用例成员在测试执行当天提交的正文标记为 `E2E-WORK-LOG-MANAGEMENT-CATEGORY-FORBIDDEN-BODY` 的工作日志", object: "db.work_log_entry", operator: "absent_today_for_member_by_marker", params: { bodyMarkerFrom: "data.logBodyMarker", memberEmailFrom: "data.memberEmail" } },
      { source: { caseStepId: "S0-11", method: "playwright" }, id: "work_logs.page.visible", title: "页面 应进入 工作日志", object: "page.work_logs", operator: "visible" },
      { source: { caseStepId: "S0-12", method: "playwright" }, id: "work_logs.today_tab.selected", title: "\"日志\" 视图 应处于选中状态", object: "page.work_logs.view_tab", operator: "selected", params: { label: "日志" } },
      { source: { caseStepId: "S0-13", method: "playwright" }, id: "work_logs.editor.visible", title: "\"我的日志\" 面板 应可见", object: "page.work_logs.editor_panel", operator: "visible" },
      { source: { caseStepId: "S0-14", method: "playwright" }, id: "work_logs.classification.visible", title: "\"日志归类\" 控件 应可见", object: "page.work_logs.classification", operator: "visible" },
      { source: { caseStepId: "S0-15", method: "playwright" }, id: "work_logs.submit.disabled", title: "\"提交日志\" 操作 应不可点击", object: "page.work_logs.submit_action", operator: "disabled" },
    ],
  },

  Action: {
    description: "普通成员搜索管理事务分类并直接提交管理分类保存请求",
    steps: [
      { source: { caseStepId: "Action-1", method: "playwright" }, id: "work_logs.classification.open", title: "打开 \"日志归类\" 控件", object: "page.work_logs.classification", operator: "open" },
      { source: { caseStepId: "Action-2", method: "playwright" }, id: "work_logs.classification.search_management", title: "在 \"日志归类\" 控件的搜索输入框输入 `管理事务`", object: "page.work_logs.classification", operator: "search", params: { query: "管理事务" } },
      { source: { caseStepId: "Action-3", method: "api" }, id: "work_log.my_day.submit_management_category", title: "提交 带分类名称 `管理事务`、正文标记为 `E2E-WORK-LOG-MANAGEMENT-CATEGORY-FORBIDDEN-BODY` 的当天工作日志保存请求", object: "api.work_log.my_day", operator: "submit_management_category", params: { categoryName: "管理事务", bodyMarkdownFrom: "data.logBody", saveAs: "managementCategorySubmitResult" } },
    ],
  },

  S1: {
    description: "页面不暴露管理事务分类，接口拒绝保存且数据库无成员管理分类日志",
    assertions: [
      { source: { caseStepId: "S1-1", method: "playwright" }, id: "work_logs.classification.management_not_visible", title: "\"日志归类\" 控件的搜索结果 应不显示分类 `管理事务`", object: "page.work_logs.classification", operator: "search_result_not_visible", params: { categoryName: "管理事务" } },
      { source: { caseStepId: "S1-2", method: "playwright" }, id: "work_logs.classification.management_not_selected", title: "\"日志归类\" 控件 应不显示已选分类 `管理事务`", object: "page.work_logs.classification", operator: "not_displays_category", params: { categoryName: "管理事务" } },
      { source: { caseStepId: "S1-3", method: "api" }, id: "work_log.save_result.status", title: "当天工作日志保存请求结果状态 应为 `400`", object: "api.work_log.save_result", operator: "status", params: { resultFrom: "runtime.managementCategorySubmitResult", value: 400 } },
      { source: { caseStepId: "S1-4", method: "api" }, id: "work_log.save_result.error", title: "当天工作日志保存请求错误信息 应为 `当前账号不能使用该工作日志分类`", object: "api.work_log.save_result", operator: "error_message", params: { resultFrom: "runtime.managementCategorySubmitResult", valueFrom: "data.expectedCategoryForbiddenMessage" } },
      { source: { caseStepId: "S1-5", method: "api" }, id: "work_log.my_day.not_contains_marker", title: "当天工作日志数据 应不包含正文标记 `E2E-WORK-LOG-MANAGEMENT-CATEGORY-FORBIDDEN-BODY`", object: "api.work_log.my_day", operator: "not_contains_body_marker", params: { bodyMarkerFrom: "data.logBodyMarker" } },
      { source: { caseStepId: "S1-6", method: "prisma" }, id: "db.work_log.absent_today_by_marker", title: "应不存在 本用例成员在测试执行当天提交的正文标记为 `E2E-WORK-LOG-MANAGEMENT-CATEGORY-FORBIDDEN-BODY` 的工作日志", object: "db.work_log_entry", operator: "absent_today_for_member_by_marker", params: { bodyMarkerFrom: "data.logBodyMarker", memberEmailFrom: "data.memberEmail" } },
      { source: { caseStepId: "S1-7", method: "prisma" }, id: "db.work_log.absent_today_by_category", title: "应不存在 本用例成员在测试执行当天提交的分类名称快照为 `管理事务` 的工作日志", object: "db.work_log_entry", operator: "absent_today_for_member_by_category", params: { categoryName: "管理事务", memberEmailFrom: "data.memberEmail" } },
      { source: { caseStepId: "S1-8", method: "prisma" }, id: "db.work_log_category.still_exists", title: "名称为 `管理事务` 的工作日志管理分类 应仍属于本用例成员团队", object: "db.work_log_category", operator: "exists_by_fixture", params: { categoryFrom: "runtime.managementCategory" } },
    ],
  },

  Clean: {
    description: "删除本用例日志、管理分类、成员身份并清空登录态",
    steps: [
      { source: { caseStepId: "Clean-1", method: "prisma" }, id: "db.work_log.delete_created", title: "删除 本用例创建的工作日志正文标记 `E2E-WORK-LOG-MANAGEMENT-CATEGORY-FORBIDDEN-BODY` 对应的工作日志", object: "db.work_log_entry", operator: "delete_by_body_marker", params: { bodyMarkerFrom: "data.logBodyMarker" } },
      { source: { caseStepId: "Clean-2", method: "prisma" }, id: "db.work_log_category.delete_created", title: "删除 本用例创建的工作日志管理分类 `管理事务`", object: "db.work_log_category", operator: "delete_by_fixture", params: { categoryFrom: "runtime.managementCategory" } },
      { source: { caseStepId: "Clean-3", method: "api" }, id: "auth.logout", title: "注销当前成员登录会话", object: "auth", operator: "logout" },
      { source: { caseStepId: "Clean-4", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Clean-5", method: "api" }, id: "ory.admin_identity.delete", title: "删除 本用例管理员登录身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-6", method: "api" }, id: "ory.member_identity.delete", title: "删除 本用例成员登录身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-7", method: "prisma" }, id: "db.admin_user.delete", title: "删除 本用例管理员用户", object: "db.user", operator: "delete", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-8", method: "prisma" }, id: "db.member_user.delete", title: "删除 本用例成员用户", object: "db.user", operator: "delete", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-9", method: "prisma" }, id: "db.work_log.absent", title: "应不存在 正文标记为 `E2E-WORK-LOG-MANAGEMENT-CATEGORY-FORBIDDEN-BODY` 的工作日志", object: "db.work_log_entry", operator: "absent_by_body_marker", params: { bodyMarkerFrom: "data.logBodyMarker" } },
      { source: { caseStepId: "Clean-10", method: "prisma" }, id: "db.work_log_category.absent", title: "应不存在 本用例创建的工作日志管理分类 `管理事务`", object: "db.work_log_category", operator: "absent_by_fixture", params: { categoryFrom: "runtime.managementCategory" } },
      { source: { caseStepId: "Clean-11", method: "api" }, id: "ory.admin_identity.absent", title: "邮箱为 `orf-admin-management-category-work-log-e2e@orf.local` 的管理员登录身份 应不存在", object: "ory.identity", operator: "absent", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-12", method: "api" }, id: "ory.member_identity.absent", title: "邮箱为 `orf-member-management-category-work-log-e2e@orf.local` 的成员登录身份 应不存在", object: "ory.identity", operator: "absent", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-13", method: "prisma" }, id: "db.admin_user.absent", title: "邮箱为 `orf-admin-management-category-work-log-e2e@orf.local` 的管理员用户 应不存在", object: "db.user", operator: "absent", params: { emailFrom: "data.adminEmail" } },
      { source: { caseStepId: "Clean-14", method: "prisma" }, id: "db.member_user.absent", title: "邮箱为 `orf-member-management-category-work-log-e2e@orf.local` 的成员用户 应不存在", object: "db.user", operator: "absent", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-15", method: "api" }, id: "session.unauthenticated", title: "当前会话 应为 未登录", object: "auth.session", operator: "unauthenticated" },
    ],
  },
} satisfies StateCaseSpec<MemberManagementCategoryForbiddenCaseData>;
