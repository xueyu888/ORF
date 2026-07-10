import { STATE_CASE_MODEL, type StateCaseSpec } from "../../../../_framework/types";
import type { MemberTargetMutationForbiddenAllStagesCaseData } from "./_support/member-target-mutation-forbidden-all-stages.context";

export const memberTargetMutationForbiddenAllStagesCase = {
  id: "target.member-target-mutation-forbidden-all-stages",
  title: "普通用户在任何阶段都不允许修改删除目标",
  model: STATE_CASE_MODEL,
  tags: ["target", "edit", "delete", "member", "permission", "forbidden"],

  data: {
    memberEmail: "orf-member-target-mutation-forbidden-e2e@orf.local",
    memberPassword: "OrfMemberTargetMutationForbiddenE2E!2026",
    memberName: "ORF Member Target Mutation Forbidden E2E",
    memberRole: "member",
    memberStatus: "active",
    targetPrefix: "E2E-TARGET-MEMBER-MUTATION-FORBIDDEN",
    modifiedObjectiveTitle: "E2E-TARGET-MEMBER-MUTATION-FORBIDDEN-MODIFIED",
    deleteObjectivePermissionKey: "objective.delete",
    stageTargets: [
      {
        key: "goalSetting",
        title: "E2E-TARGET-MEMBER-MUTATION-FORBIDDEN-GOAL-SETTING",
        stage: "goalSetting",
        flowStatus: "candidate",
      },
      {
        key: "resultClaiming",
        title: "E2E-TARGET-MEMBER-MUTATION-FORBIDDEN-RESULT-CLAIMING",
        stage: "resultClaiming",
        flowStatus: "open",
      },
      {
        key: "orfReestimate",
        title: "E2E-TARGET-MEMBER-MUTATION-FORBIDDEN-ORF-REESTIMATE",
        stage: "orfReestimate",
        flowStatus: "reestimating",
      },
      {
        key: "goalFrozen",
        title: "E2E-TARGET-MEMBER-MUTATION-FORBIDDEN-GOAL-FROZEN",
        stage: "goalFrozen",
        flowStatus: "frozen",
      },
    ],
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
      { source: { caseStepId: "Setup-1", method: "prisma" }, id: "db.objectives.delete_residue", title: "删除 本用例残留的目标标题前缀 `E2E-TARGET-MEMBER-MUTATION-FORBIDDEN` 对应的目标及其派生数据", object: "db.objectives_by_prefix", operator: "delete", params: { prefixFrom: "data.targetPrefix", legacyPrefixFrom: "data.targetTitlePrefix" } },
      { source: { caseStepId: "Setup-2", method: "api" }, id: "permissions.member.record", title: "记录 成员角色的当前权限配置", object: "api.permissions", operator: "record_member", params: { saveAs: "memberPermissionSnapshot" } },
      { source: { caseStepId: "Setup-3", method: "api" }, id: "permissions.member.remove_delete", title: "设置 成员角色权限不包含 `objective.delete`", object: "api.permissions", operator: "update_member", params: { withoutPermissionFrom: "data.deleteObjectivePermissionKey" } },
      { source: { caseStepId: "Setup-4", method: "api" }, id: "ory.member_identity.upsert", title: "准备邮箱为 `orf-member-target-mutation-forbidden-e2e@orf.local`、使用固定测试密码的普通用户登录身份", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.memberEmail", nameFrom: "data.memberName", passwordFrom: "data.memberPassword", saveAs: "memberIdentity" } },
      { source: { caseStepId: "Setup-5", method: "prisma" }, id: "db.member_user.upsert", title: "准备 角色为 `member`、状态为 `active`、名称为 `ORF Member Target Mutation Forbidden E2E` 的本用例普通用户", object: "db.user", operator: "upsert", params: { emailFrom: "data.memberEmail", nameFrom: "data.memberName", roleFrom: "data.memberRole", statusFrom: "data.memberStatus", identityIdFrom: "runtime.memberIdentity.id", saveAs: "memberUser" } },
      { source: { caseStepId: "Setup-6", method: "prisma" }, id: "db.goal_setting_objective.prepare", title: "准备 标题为 `E2E-TARGET-MEMBER-MUTATION-FORBIDDEN-GOAL-SETTING`、阶段为 `goalSetting`、流转状态为 `candidate`、当前挑战者包含本用例普通用户的目标", object: "db.objective_stage_fixture", operator: "prepare", params: { memberUserFrom: "runtime.memberUser", targetFrom: "data.stageTargets.0", saveAs: "goalSettingObjective" } },
      { source: { caseStepId: "Setup-7", method: "prisma" }, id: "db.result_claiming_objective.prepare", title: "准备 标题为 `E2E-TARGET-MEMBER-MUTATION-FORBIDDEN-RESULT-CLAIMING`、阶段为 `resultClaiming`、流转状态为 `open`、当前挑战者包含本用例普通用户的目标", object: "db.objective_stage_fixture", operator: "prepare", params: { memberUserFrom: "runtime.memberUser", targetFrom: "data.stageTargets.1", saveAs: "resultClaimingObjective" } },
      { source: { caseStepId: "Setup-8", method: "prisma" }, id: "db.orf_reestimate_objective.prepare", title: "准备 标题为 `E2E-TARGET-MEMBER-MUTATION-FORBIDDEN-ORF-REESTIMATE`、阶段为 `orfReestimate`、流转状态为 `reestimating`、当前挑战者包含本用例普通用户的目标", object: "db.objective_stage_fixture", operator: "prepare", params: { memberUserFrom: "runtime.memberUser", targetFrom: "data.stageTargets.2", saveAs: "orfReestimateObjective" } },
      { source: { caseStepId: "Setup-9", method: "prisma" }, id: "db.goal_frozen_objective.prepare", title: "准备 标题为 `E2E-TARGET-MEMBER-MUTATION-FORBIDDEN-GOAL-FROZEN`、阶段为 `goalFrozen`、流转状态为 `frozen`、当前挑战者包含本用例普通用户的目标", object: "db.objective_stage_fixture", operator: "prepare", params: { memberUserFrom: "runtime.memberUser", targetFrom: "data.stageTargets.3", saveAs: "goalFrozenObjective" } },
      { source: { caseStepId: "Setup-10", method: "playwright" }, id: "auth.login.member", title: "使用 本用例普通用户账号 登录 ORF", object: "page.auth", operator: "login", params: { emailFrom: "data.memberEmail", passwordFrom: "data.memberPassword" } },
    ],
  },

  S0: {
    description: "Action 前状态",
    assertions: [
      { source: { caseStepId: "S0-1", method: "api" }, id: "session.authenticated", title: "当前会话 应为 已登录", object: "auth.session", operator: "authenticated" },
      { source: { caseStepId: "S0-2", method: "api" }, id: "session.email", title: "当前会话用户邮箱 应为 `orf-member-target-mutation-forbidden-e2e@orf.local`", object: "auth.session.user_email", operator: "equals", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "S0-3", method: "api" }, id: "session.role", title: "当前会话用户角色 应为 `member`", object: "auth.session.user_role", operator: "equals", params: { roleFrom: "data.memberRole" } },
      { source: { caseStepId: "S0-4", method: "api" }, id: "session.name", title: "当前会话用户名称 应为 `ORF Member Target Mutation Forbidden E2E`", object: "auth.session.user_name", operator: "equals", params: { nameFrom: "data.memberName" } },
      { source: { caseStepId: "S0-5", method: "api" }, id: "permission.objective_content_edit.denied", title: "当前普通用户的目标内容编辑权限 应为 未授权", object: "api.objective_content_edit_permission", operator: "member_denied" },
      { source: { caseStepId: "S0-6", method: "api" }, id: "permission.delete.denied", title: "当前普通用户的目标删除权限 应为 未授权", object: "api.permissions", operator: "member_denied", params: { permissionKeyFrom: "data.deleteObjectivePermissionKey" } },
      { source: { caseStepId: "S0-7", method: "prisma" }, id: "db.goal_setting_objective.exists", title: "应存在 标题为 `E2E-TARGET-MEMBER-MUTATION-FORBIDDEN-GOAL-SETTING`、阶段为 `goalSetting`、流转状态为 `candidate` 的目标", object: "db.objective_stage_fixture", operator: "exists", params: { targetFrom: "data.stageTargets.0" } },
      { source: { caseStepId: "S0-8", method: "prisma" }, id: "db.result_claiming_objective.exists", title: "应存在 标题为 `E2E-TARGET-MEMBER-MUTATION-FORBIDDEN-RESULT-CLAIMING`、阶段为 `resultClaiming`、流转状态为 `open` 的目标", object: "db.objective_stage_fixture", operator: "exists", params: { targetFrom: "data.stageTargets.1" } },
      { source: { caseStepId: "S0-9", method: "prisma" }, id: "db.orf_reestimate_objective.exists", title: "应存在 标题为 `E2E-TARGET-MEMBER-MUTATION-FORBIDDEN-ORF-REESTIMATE`、阶段为 `orfReestimate`、流转状态为 `reestimating` 的目标", object: "db.objective_stage_fixture", operator: "exists", params: { targetFrom: "data.stageTargets.2" } },
      { source: { caseStepId: "S0-10", method: "prisma" }, id: "db.goal_frozen_objective.exists", title: "应存在 标题为 `E2E-TARGET-MEMBER-MUTATION-FORBIDDEN-GOAL-FROZEN`、阶段为 `goalFrozen`、流转状态为 `frozen` 的目标", object: "db.objective_stage_fixture", operator: "exists", params: { targetFrom: "data.stageTargets.3" } },
      { source: { caseStepId: "S0-11", method: "prisma" }, id: "db.modified_objective.absent", title: "应不存在 标题为 `E2E-TARGET-MEMBER-MUTATION-FORBIDDEN-MODIFIED` 的目标", object: "db.objective", operator: "absent", params: { titleFrom: "data.modifiedObjectiveTitle" } },
    ],
  },

  Action: {
    description: "被测业务动作",
    steps: [
      { source: { caseStepId: "Action-1", method: "playwright" }, id: "member.open_my_challenges", title: "普通用户打开 我的挑战", object: "page.challenge", operator: "open_my_challenges" },
      { source: { caseStepId: "Action-2", method: "playwright" }, id: "member.click_all_edit", title: "普通用户点击 本用例所有阶段目标的 \"编辑\" 操作", object: "page.challenge_objectives", operator: "click_all_edit", params: { targetsFrom: "data.stageTargets", saveAs: "objectiveEditUiResult" } },
      { source: { caseStepId: "Action-3", method: "playwright" }, id: "member.click_all_delete", title: "普通用户点击 本用例所有阶段目标的 \"删除\" 操作", object: "page.challenge_objectives", operator: "click_all_delete", params: { targetsFrom: "data.stageTargets", saveAs: "objectiveDeleteUiResult" } },
      { source: { caseStepId: "Action-4", method: "api" }, id: "api.objectives.patch_titles", title: "普通用户请求 将本用例所有阶段目标标题修改为 `E2E-TARGET-MEMBER-MUTATION-FORBIDDEN-MODIFIED`", object: "api.objective_mutation", operator: "patch_titles_forbidden", params: { targetsFrom: "data.stageTargets", modifiedTitleFrom: "data.modifiedObjectiveTitle", saveAs: "objectivePatchResults" } },
      { source: { caseStepId: "Action-5", method: "api" }, id: "api.objectives.delete", title: "普通用户请求 删除本用例所有阶段目标", object: "api.objective_mutation", operator: "delete_forbidden", params: { targetsFrom: "data.stageTargets", saveAs: "objectiveDeleteApiResults" } },
    ],
  },

  S1: {
    description: "Action 后状态",
    assertions: [
      { source: { caseStepId: "S1-1", method: "playwright" }, id: "challenge.page.url", title: "页面 应进入 我的挑战", object: "page.challenge", operator: "url" },
      { source: { caseStepId: "S1-2", method: "playwright" }, id: "scope.mine.selected", title: "\"我的挑战\" 视图 应处于选中状态", object: "page.challenge_scope", operator: "selected", params: { label: "我的挑战" } },
      { source: { caseStepId: "S1-3", method: "playwright" }, id: "goal_setting_objective.visible", title: "我的挑战列表 应显示目标 `E2E-TARGET-MEMBER-MUTATION-FORBIDDEN-GOAL-SETTING`", object: "page.challenge_objectives", operator: "visible_title", params: { titleFrom: "data.stageTargets.0.title" } },
      { source: { caseStepId: "S1-4", method: "playwright" }, id: "result_claiming_objective.visible", title: "我的挑战列表 应显示目标 `E2E-TARGET-MEMBER-MUTATION-FORBIDDEN-RESULT-CLAIMING`", object: "page.challenge_objectives", operator: "visible_title", params: { titleFrom: "data.stageTargets.1.title" } },
      { source: { caseStepId: "S1-5", method: "playwright" }, id: "orf_reestimate_objective.visible", title: "我的挑战列表 应显示目标 `E2E-TARGET-MEMBER-MUTATION-FORBIDDEN-ORF-REESTIMATE`", object: "page.challenge_objectives", operator: "visible_title", params: { titleFrom: "data.stageTargets.2.title" } },
      { source: { caseStepId: "S1-6", method: "playwright" }, id: "goal_frozen_objective.visible", title: "我的挑战列表 应显示目标 `E2E-TARGET-MEMBER-MUTATION-FORBIDDEN-GOAL-FROZEN`", object: "page.challenge_objectives", operator: "visible_title", params: { titleFrom: "data.stageTargets.3.title" } },
      { source: { caseStepId: "S1-7", method: "playwright" }, id: "edit_ui_results.forbidden", title: "本用例所有阶段目标的编辑页面操作结果 应为 权限不足", object: "page.objective_edit_ui_result", operator: "all_forbidden", params: { resultFrom: "runtime.objectiveEditUiResult" } },
      { source: { caseStepId: "S1-8", method: "playwright" }, id: "objective_title_editor.hidden", title: "本用例所有阶段目标的标题编辑输入框 应不可见", object: "page.objective_title_editor", operator: "hidden" },
      { source: { caseStepId: "S1-9", method: "playwright" }, id: "delete_ui_results.forbidden", title: "本用例所有阶段目标的删除页面操作结果 应为 权限不足", object: "page.objective_delete_ui_result", operator: "all_forbidden", params: { resultFrom: "runtime.objectiveDeleteUiResult" } },
      { source: { caseStepId: "S1-10", method: "playwright" }, id: "delete_confirm.absent", title: "删除目标确认弹窗 应不可见", object: "page.objective_delete_confirm", operator: "absent", params: { resultFrom: "runtime.objectiveDeleteUiResult" } },
      { source: { caseStepId: "S1-11", method: "api" }, id: "api.patch_results.forbidden", title: "本用例所有阶段目标的标题修改请求结果 应为 权限不足", object: "api.objective_mutation", operator: "all_forbidden", params: { resultsFrom: "runtime.objectivePatchResults" } },
      { source: { caseStepId: "S1-12", method: "api" }, id: "api.delete_results.forbidden", title: "本用例所有阶段目标的删除请求结果 应为 权限不足", object: "api.objective_mutation", operator: "all_forbidden", params: { resultsFrom: "runtime.objectiveDeleteApiResults" } },
      { source: { caseStepId: "S1-13", method: "api" }, id: "permission.objective_content_edit.still_denied", title: "当前普通用户的目标内容编辑权限 应仍为 未授权", object: "api.objective_content_edit_permission", operator: "member_denied" },
      { source: { caseStepId: "S1-14", method: "api" }, id: "permission.delete.still_denied", title: "当前普通用户的目标删除权限 应仍为 未授权", object: "api.permissions", operator: "member_denied", params: { permissionKeyFrom: "data.deleteObjectivePermissionKey" } },
      { source: { caseStepId: "S1-15", method: "prisma" }, id: "db.goal_setting_objective.unchanged", title: "标题为 `E2E-TARGET-MEMBER-MUTATION-FORBIDDEN-GOAL-SETTING` 的目标阶段 应仍为 `goalSetting`，流转状态 应仍为 `candidate`", object: "db.objective_stage_fixture", operator: "unchanged", params: { targetFrom: "data.stageTargets.0" } },
      { source: { caseStepId: "S1-16", method: "prisma" }, id: "db.result_claiming_objective.unchanged", title: "标题为 `E2E-TARGET-MEMBER-MUTATION-FORBIDDEN-RESULT-CLAIMING` 的目标阶段 应仍为 `resultClaiming`，流转状态 应仍为 `open`", object: "db.objective_stage_fixture", operator: "unchanged", params: { targetFrom: "data.stageTargets.1" } },
      { source: { caseStepId: "S1-17", method: "prisma" }, id: "db.orf_reestimate_objective.unchanged", title: "标题为 `E2E-TARGET-MEMBER-MUTATION-FORBIDDEN-ORF-REESTIMATE` 的目标阶段 应仍为 `orfReestimate`，流转状态 应仍为 `reestimating`", object: "db.objective_stage_fixture", operator: "unchanged", params: { targetFrom: "data.stageTargets.2" } },
      { source: { caseStepId: "S1-18", method: "prisma" }, id: "db.goal_frozen_objective.unchanged", title: "标题为 `E2E-TARGET-MEMBER-MUTATION-FORBIDDEN-GOAL-FROZEN` 的目标阶段 应仍为 `goalFrozen`，流转状态 应仍为 `frozen`", object: "db.objective_stage_fixture", operator: "unchanged", params: { targetFrom: "data.stageTargets.3" } },
      { source: { caseStepId: "S1-19", method: "prisma" }, id: "db.modified_objective.still_absent", title: "应不存在 标题为 `E2E-TARGET-MEMBER-MUTATION-FORBIDDEN-MODIFIED` 的目标", object: "db.objective", operator: "absent", params: { titleFrom: "data.modifiedObjectiveTitle" } },
      { source: { caseStepId: "S1-20", method: "prisma" }, id: "db.objectives_by_prefix.count", title: "标题前缀为 `E2E-TARGET-MEMBER-MUTATION-FORBIDDEN` 的本用例目标数量 应为 `4`", object: "db.objectives_by_prefix", operator: "count", params: { prefixFrom: "data.targetPrefix", legacyPrefixFrom: "data.targetTitlePrefix", count: 4 } },
    ],
  },

  Clean: {
    description: "恢复 B",
    steps: [
      { source: { caseStepId: "Clean-1", method: "prisma" }, id: "db.objectives.delete_created", title: "删除 本用例创建的目标标题前缀 `E2E-TARGET-MEMBER-MUTATION-FORBIDDEN` 对应的目标及其派生数据", object: "db.objectives_by_prefix", operator: "delete", params: { prefixFrom: "data.targetPrefix", legacyPrefixFrom: "data.targetTitlePrefix" } },
      { source: { caseStepId: "Clean-2", method: "api" }, id: "auth.logout", title: "注销当前普通用户登录会话", object: "auth", operator: "logout" },
      { source: { caseStepId: "Clean-3", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Clean-4", method: "api" }, id: "ory.member_identity.delete", title: "删除 本用例普通用户登录身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-5", method: "prisma" }, id: "db.member_user.delete", title: "删除 本用例普通用户", object: "db.user", operator: "delete", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-6", method: "api" }, id: "permissions.member.restore", title: "恢复 成员角色为 Setup 前记录的权限配置", object: "api.permissions", operator: "restore_member", params: { snapshotFrom: "runtime.memberPermissionSnapshot" } },
      { source: { caseStepId: "Clean-7", method: "prisma" }, id: "db.objectives.absent", title: "应不存在 标题前缀为 `E2E-TARGET-MEMBER-MUTATION-FORBIDDEN` 的目标", object: "db.objectives_by_prefix", operator: "absent", params: { prefixFrom: "data.targetPrefix", legacyPrefixFrom: "data.targetTitlePrefix" } },
      { source: { caseStepId: "Clean-8", method: "api" }, id: "ory.member_identity.absent", title: "邮箱为 `orf-member-target-mutation-forbidden-e2e@orf.local` 的普通用户登录身份 应不存在", object: "ory.identity", operator: "absent", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-9", method: "prisma" }, id: "db.member_user.absent", title: "邮箱为 `orf-member-target-mutation-forbidden-e2e@orf.local` 的普通用户 应不存在", object: "db.user", operator: "absent", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-10", method: "api" }, id: "session.unauthenticated", title: "当前会话 应为 未登录", object: "auth.session", operator: "unauthenticated" },
    ],
  },
} satisfies StateCaseSpec<MemberTargetMutationForbiddenAllStagesCaseData>;
