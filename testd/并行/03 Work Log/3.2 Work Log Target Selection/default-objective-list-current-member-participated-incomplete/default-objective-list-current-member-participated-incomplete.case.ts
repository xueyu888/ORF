import { STATE_CASE_MODEL, type StateCaseSpec } from "../../../../_framework/types";
import type { DefaultObjectiveListCurrentMemberParticipatedIncompleteCaseData } from "./_support/default-objective-list-current-member-participated-incomplete.context";

export const defaultObjectiveListCurrentMemberParticipatedIncompleteCase = {
  id: "work-log.default-objective-list-current-member-participated-incomplete",
  title: "默认目标列表仅展示当前成员参与且未完成的目标",
  model: STATE_CASE_MODEL,
  tags: ["work-log", "objective-selection", "member", "permissions", "default-list"],

  data: {
    memberEmail: "orf-member-work-log-default-objective-list-e2e@orf.local",
    memberPassword: "OrfMemberWorkLogDefaultObjectiveListE2E!2026",
    memberName: "ORF Member Work Log Default Objective List E2E",
    memberRole: "member",
    memberStatus: "active",
    otherMemberEmail: "orf-other-work-log-default-objective-list-e2e@orf.local",
    otherMemberName: "ORF Other Work Log Default Objective List E2E",
    otherMemberRole: "member",
    otherMemberStatus: "active",
    objectiveTitlePrefix: "E2E-TARGET-WORK-LOG-DEFAULT-LIST",
    participatedOpenObjectiveTitle: "E2E-TARGET-WORK-LOG-DEFAULT-LIST-PARTICIPATED-OPEN",
    otherOpenObjectiveTitle: "E2E-TARGET-WORK-LOG-DEFAULT-LIST-OTHER-OPEN",
    participatedAcceptedObjectiveTitle: "E2E-TARGET-WORK-LOG-DEFAULT-LIST-PARTICIPATED-ACCEPTED",
    openFlowStatus: "open",
    acceptedFlowStatus: "accepted",
    objectiveStage: "resultClaiming",
    objectiveStatus: "On Track",
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
    description: "准备当前成员、其他成员和三类目标并打开工作日志当天视图",
    steps: [
      { source: { caseStepId: "Setup-1", method: "prisma" }, id: "db.objectives.delete_residue", title: "删除 本用例残留的目标标题前缀 `E2E-TARGET-WORK-LOG-DEFAULT-LIST` 对应的目标及其派生数据", object: "db.objectives_by_prefix", operator: "delete", params: { prefixFrom: "data.objectiveTitlePrefix" } },
      { source: { caseStepId: "Setup-2", method: "api" }, id: "ory.member_identity.upsert", title: "准备邮箱为 `orf-member-work-log-default-objective-list-e2e@orf.local`、使用固定测试密码的成员登录身份", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.memberEmail", nameFrom: "data.memberName", passwordFrom: "data.memberPassword", saveAs: "memberIdentity" } },
      { source: { caseStepId: "Setup-3", method: "prisma" }, id: "db.member_user.upsert", title: "准备 角色为 `member`、状态为 `active`、名称为 `ORF Member Work Log Default Objective List E2E` 的本用例成员用户", object: "db.user", operator: "upsert", params: { emailFrom: "data.memberEmail", nameFrom: "data.memberName", roleFrom: "data.memberRole", statusFrom: "data.memberStatus", identityIdFrom: "runtime.memberIdentity.id", saveAs: "memberUser" } },
      { source: { caseStepId: "Setup-4", method: "prisma" }, id: "db.other_member_user.upsert", title: "准备 角色为 `member`、状态为 `active`、名称为 `ORF Other Work Log Default Objective List E2E` 的本用例其他成员用户", object: "db.user", operator: "upsert", params: { emailFrom: "data.otherMemberEmail", nameFrom: "data.otherMemberName", roleFrom: "data.otherMemberRole", statusFrom: "data.otherMemberStatus", saveAs: "otherMemberUser" } },
      { source: { caseStepId: "Setup-5", method: "prisma" }, id: "db.participated_open_objective.prepare", title: "准备 标题为 `E2E-TARGET-WORK-LOG-DEFAULT-LIST-PARTICIPATED-OPEN`、当前挑战者包含本用例成员、流转状态为 `open` 的未完成目标", object: "db.objective", operator: "upsert", params: { titleFrom: "data.participatedOpenObjectiveTitle", teamIdFrom: "runtime.memberUser.teamId", challengersFrom: "data.memberName", challengerUserIdsFrom: "runtime.memberUser.userId", flowStatusFrom: "data.openFlowStatus", stageFrom: "data.objectiveStage", statusFrom: "data.objectiveStatus", createdByFrom: "runtime.memberUser.userId", updatedByFrom: "runtime.memberUser.userId", saveAs: "participatedOpenObjective" } },
      { source: { caseStepId: "Setup-6", method: "prisma" }, id: "db.other_open_objective.prepare", title: "准备 标题为 `E2E-TARGET-WORK-LOG-DEFAULT-LIST-OTHER-OPEN`、当前挑战者包含本用例其他成员且不包含本用例成员、流转状态为 `open` 的未完成目标", object: "db.objective", operator: "upsert", params: { titleFrom: "data.otherOpenObjectiveTitle", teamIdFrom: "runtime.memberUser.teamId", challengersFrom: "data.otherMemberName", challengerUserIdsFrom: "runtime.otherMemberUser.userId", flowStatusFrom: "data.openFlowStatus", stageFrom: "data.objectiveStage", statusFrom: "data.objectiveStatus", createdByFrom: "runtime.memberUser.userId", updatedByFrom: "runtime.memberUser.userId", saveAs: "otherOpenObjective" } },
      { source: { caseStepId: "Setup-7", method: "prisma" }, id: "db.participated_accepted_objective.prepare", title: "准备 标题为 `E2E-TARGET-WORK-LOG-DEFAULT-LIST-PARTICIPATED-ACCEPTED`、当前挑战者包含本用例成员、流转状态为 `accepted` 的已完成目标", object: "db.objective", operator: "upsert", params: { titleFrom: "data.participatedAcceptedObjectiveTitle", teamIdFrom: "runtime.memberUser.teamId", challengersFrom: "data.memberName", challengerUserIdsFrom: "runtime.memberUser.userId", flowStatusFrom: "data.acceptedFlowStatus", stageFrom: "data.objectiveStage", statusFrom: "data.objectiveStatus", createdByFrom: "runtime.memberUser.userId", updatedByFrom: "runtime.memberUser.userId", saveAs: "participatedAcceptedObjective" } },
      { source: { caseStepId: "Setup-8", method: "playwright" }, id: "auth.login.member", title: "使用 本用例成员账号 登录 ORF", object: "page.auth", operator: "login", params: { emailFrom: "data.memberEmail", passwordFrom: "data.memberPassword" } },
      { source: { caseStepId: "Setup-9", method: "playwright" }, id: "work_logs.open_today", title: "打开 工作日志页面的当天日志视图", object: "page.work_logs", operator: "open_today" },
    ],
  },

  S0: {
    description: "三类目标已准备完成，默认目标列表接口已按当前成员参与和未完成状态过滤",
    assertions: [
      { source: { caseStepId: "S0-1", method: "api" }, id: "session.authenticated", title: "当前会话 应为 已登录", object: "auth.session", operator: "authenticated" },
      { source: { caseStepId: "S0-2", method: "api" }, id: "session.email", title: "当前会话用户邮箱 应为 `orf-member-work-log-default-objective-list-e2e@orf.local`", object: "auth.session.user_email", operator: "equals", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "S0-3", method: "api" }, id: "session.role", title: "当前会话用户角色 应为 `member`", object: "auth.session.user_role", operator: "equals", params: { roleFrom: "data.memberRole" } },
      { source: { caseStepId: "S0-4", method: "api" }, id: "session.name", title: "当前会话用户名称 应为 `ORF Member Work Log Default Objective List E2E`", object: "auth.session.user_name", operator: "equals", params: { nameFrom: "data.memberName" } },
      { source: { caseStepId: "S0-5", method: "prisma" }, id: "db.participated_open_objective.exists", title: "应存在 标题为 `E2E-TARGET-WORK-LOG-DEFAULT-LIST-PARTICIPATED-OPEN`、当前挑战者包含本用例成员、流转状态为 `open` 的目标", object: "db.work_log_objective_fixture", operator: "exists", params: { titleFrom: "data.participatedOpenObjectiveTitle", flowStatusFrom: "data.openFlowStatus", challengerUserIdFrom: "runtime.memberUser.userId" } },
      { source: { caseStepId: "S0-6", method: "prisma" }, id: "db.other_open_objective.exists", title: "应存在 标题为 `E2E-TARGET-WORK-LOG-DEFAULT-LIST-OTHER-OPEN`、当前挑战者不包含本用例成员、流转状态为 `open` 的目标", object: "db.work_log_objective_fixture", operator: "exists", params: { titleFrom: "data.otherOpenObjectiveTitle", flowStatusFrom: "data.openFlowStatus", challengerUserIdFrom: "runtime.otherMemberUser.userId", excludedChallengerUserIdFrom: "runtime.memberUser.userId" } },
      { source: { caseStepId: "S0-7", method: "prisma" }, id: "db.participated_accepted_objective.exists", title: "应存在 标题为 `E2E-TARGET-WORK-LOG-DEFAULT-LIST-PARTICIPATED-ACCEPTED`、当前挑战者包含本用例成员、流转状态为 `accepted` 的目标", object: "db.work_log_objective_fixture", operator: "exists", params: { titleFrom: "data.participatedAcceptedObjectiveTitle", flowStatusFrom: "data.acceptedFlowStatus", challengerUserIdFrom: "runtime.memberUser.userId" } },
      { source: { caseStepId: "S0-8", method: "playwright" }, id: "work_logs.page.visible", title: "页面 应进入 工作日志", object: "page.work_logs", operator: "visible" },
      { source: { caseStepId: "S0-9", method: "playwright" }, id: "work_logs.today_tab.selected", title: "\"日志\" 视图 应处于选中状态", object: "page.work_logs.view_tab", operator: "selected", params: { label: "日志" } },
      { source: { caseStepId: "S0-10", method: "playwright" }, id: "work_logs.editor.visible", title: "\"我的日志\" 面板 应可见", object: "page.work_logs.editor_panel", operator: "visible" },
      { source: { caseStepId: "S0-11", method: "playwright" }, id: "work_logs.classification.visible", title: "\"日志归类\" 控件 应可见", object: "page.work_logs.classification", operator: "visible" },
      { source: { caseStepId: "S0-12", method: "api" }, id: "work_log.default_objectives.contains_participated_open", title: "工作日志默认目标列表 应包含目标 `E2E-TARGET-WORK-LOG-DEFAULT-LIST-PARTICIPATED-OPEN`", object: "api.work_log.default_objectives", operator: "contains_title", params: { titleFrom: "data.participatedOpenObjectiveTitle" } },
      { source: { caseStepId: "S0-13", method: "api" }, id: "work_log.default_objectives.excludes_other_open", title: "工作日志默认目标列表 应不包含目标 `E2E-TARGET-WORK-LOG-DEFAULT-LIST-OTHER-OPEN`", object: "api.work_log.default_objectives", operator: "not_contains_title", params: { titleFrom: "data.otherOpenObjectiveTitle" } },
      { source: { caseStepId: "S0-14", method: "api" }, id: "work_log.default_objectives.excludes_participated_accepted", title: "工作日志默认目标列表 应不包含目标 `E2E-TARGET-WORK-LOG-DEFAULT-LIST-PARTICIPATED-ACCEPTED`", object: "api.work_log.default_objectives", operator: "not_contains_title", params: { titleFrom: "data.participatedAcceptedObjectiveTitle" } },
      { source: { caseStepId: "S0-15", method: "api" }, id: "work_log.default_objectives.current_challenger", title: "工作日志默认目标列表中的目标 `E2E-TARGET-WORK-LOG-DEFAULT-LIST-PARTICIPATED-OPEN` 对当前成员 应为 当前挑战者", object: "api.work_log.default_objectives", operator: "current_challenger", params: { titleFrom: "data.participatedOpenObjectiveTitle" } },
      { source: { caseStepId: "S0-16", method: "api" }, id: "work_log.default_objectives.flow_status_open", title: "工作日志默认目标列表中的目标 `E2E-TARGET-WORK-LOG-DEFAULT-LIST-PARTICIPATED-OPEN` 流转状态 应为 `open`", object: "api.work_log.default_objectives", operator: "flow_status", params: { titleFrom: "data.participatedOpenObjectiveTitle", flowStatusFrom: "data.openFlowStatus" } },
    ],
  },

  Action: {
    description: "打开日志归类控件的默认目标列表",
    steps: [
      { source: { caseStepId: "Action-1", method: "playwright" }, id: "work_logs.classification.open_default_list", title: "打开 \"日志归类\" 控件的目标默认列表", object: "page.work_logs.classification", operator: "open_default_objective_list" },
    ],
  },

  S1: {
    description: "页面默认目标列表只显示当前成员参与且未完成的本用例目标",
    assertions: [
      { source: { caseStepId: "S1-1", method: "playwright" }, id: "default_list.participated_open.visible", title: "\"日志归类\" 控件的目标默认列表 应显示目标 `E2E-TARGET-WORK-LOG-DEFAULT-LIST-PARTICIPATED-OPEN`", object: "page.work_logs.default_objective_list", operator: "contains_title", params: { titleFrom: "data.participatedOpenObjectiveTitle" } },
      { source: { caseStepId: "S1-2", method: "playwright" }, id: "default_list.other_open.hidden", title: "\"日志归类\" 控件的目标默认列表 应不显示目标 `E2E-TARGET-WORK-LOG-DEFAULT-LIST-OTHER-OPEN`", object: "page.work_logs.default_objective_list", operator: "not_contains_title", params: { titleFrom: "data.otherOpenObjectiveTitle" } },
      { source: { caseStepId: "S1-3", method: "playwright" }, id: "default_list.participated_accepted.hidden", title: "\"日志归类\" 控件的目标默认列表 应不显示目标 `E2E-TARGET-WORK-LOG-DEFAULT-LIST-PARTICIPATED-ACCEPTED`", object: "page.work_logs.default_objective_list", operator: "not_contains_title", params: { titleFrom: "data.participatedAcceptedObjectiveTitle" } },
      { source: { caseStepId: "S1-4", method: "api" }, id: "work_log.default_objectives.prefix_only_participated_open", title: "工作日志默认目标列表 应包含且仅包含标题前缀为 `E2E-TARGET-WORK-LOG-DEFAULT-LIST` 的目标 `E2E-TARGET-WORK-LOG-DEFAULT-LIST-PARTICIPATED-OPEN`", object: "api.work_log.default_objectives", operator: "contains_only_title_for_prefix", params: { prefixFrom: "data.objectiveTitlePrefix", titleFrom: "data.participatedOpenObjectiveTitle" } },
    ],
  },

  Clean: {
    description: "删除本用例目标、成员身份并清空登录态",
    steps: [
      { source: { caseStepId: "Clean-1", method: "prisma" }, id: "db.objectives.delete_created", title: "删除 本用例创建的目标标题前缀 `E2E-TARGET-WORK-LOG-DEFAULT-LIST` 对应的目标及其派生数据", object: "db.objectives_by_prefix", operator: "delete", params: { prefixFrom: "data.objectiveTitlePrefix" } },
      { source: { caseStepId: "Clean-2", method: "api" }, id: "auth.logout", title: "注销当前成员登录会话", object: "auth", operator: "logout" },
      { source: { caseStepId: "Clean-3", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Clean-4", method: "api" }, id: "ory.member_identity.delete", title: "删除 本用例成员登录身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-5", method: "prisma" }, id: "db.member_user.delete", title: "删除 本用例成员用户", object: "db.user", operator: "delete", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-6", method: "prisma" }, id: "db.other_member_user.delete", title: "删除 本用例其他成员用户", object: "db.user", operator: "delete", params: { emailFrom: "data.otherMemberEmail" } },
      { source: { caseStepId: "Clean-7", method: "prisma" }, id: "db.objectives.absent", title: "应不存在 标题前缀为 `E2E-TARGET-WORK-LOG-DEFAULT-LIST` 的目标", object: "db.objectives_by_prefix", operator: "absent", params: { prefixFrom: "data.objectiveTitlePrefix" } },
      { source: { caseStepId: "Clean-8", method: "api" }, id: "ory.member_identity.absent", title: "邮箱为 `orf-member-work-log-default-objective-list-e2e@orf.local` 的成员登录身份 应不存在", object: "ory.identity", operator: "absent", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-9", method: "prisma" }, id: "db.member_user.absent", title: "邮箱为 `orf-member-work-log-default-objective-list-e2e@orf.local` 的成员用户 应不存在", object: "db.user", operator: "absent", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-10", method: "prisma" }, id: "db.other_member_user.absent", title: "名称为 `ORF Other Work Log Default Objective List E2E` 的本用例其他成员用户 应不存在", object: "db.user_by_name", operator: "absent", params: { nameFrom: "data.otherMemberName" } },
      { source: { caseStepId: "Clean-11", method: "api" }, id: "session.unauthenticated", title: "当前会话 应为 未登录", object: "auth.session", operator: "unauthenticated" },
    ],
  },
} satisfies StateCaseSpec<DefaultObjectiveListCurrentMemberParticipatedIncompleteCaseData>;
