import { STATE_CASE_MODEL, type StateCaseSpec } from "../../../../_framework/types";
import type { MemberEditObjectiveForbiddenCaseData } from "./_support/member-edit-objective-forbidden.context";

export const memberEditObjectiveForbiddenCase = {
  id: "target.member-edit-objective-forbidden",
  title: "非指挥官不允许进入编辑修改目标",
  model: STATE_CASE_MODEL,
  tags: ["target", "edit", "member", "permission", "negative-path"],

  data: {
    memberEmail: "orf-member-edit-objective-forbidden-e2e@orf.local",
    memberPassword: "OrfMemberEditObjectiveForbiddenE2E!2026",
    memberName: "ORF Member Edit Objective Forbidden E2E",
    memberRole: "member",
    objectiveId: "obj-testd-member-edit-objective-forbidden",
    objectiveTitle: "E2E-TARGET-MEMBER-EDIT-FORBIDDEN",
    editedObjectiveTitle: "E2E-TARGET-MEMBER-EDIT-FORBIDDEN-EDITED",
    objectiveStatus: "Draft",
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
    description: "准备普通成员和其参与的执行中目标，并登录进入我的挑战执行中视图",
    steps: [
      { source: { caseStepId: "Setup-1", method: "prisma" }, id: "db.objective.delete_residue", title: "删除 本用例残留的目标 `E2E-TARGET-MEMBER-EDIT-FORBIDDEN` 及其派生数据", object: "db.objective", operator: "delete_by_title", params: { titleFrom: "data.objectiveTitle" } },
      { source: { caseStepId: "Setup-2", method: "prisma" }, id: "db.objective.delete_edited_residue", title: "删除 本用例残留的目标 `E2E-TARGET-MEMBER-EDIT-FORBIDDEN-EDITED` 及其派生数据", object: "db.objective", operator: "delete_by_title", params: { titleFrom: "data.editedObjectiveTitle" } },
      { source: { caseStepId: "Setup-3", method: "api" }, id: "ory.member_identity.upsert", title: "准备邮箱为 `orf-member-edit-objective-forbidden-e2e@orf.local`、使用固定测试密码的普通成员登录身份", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.memberEmail", nameFrom: "data.memberName", passwordFrom: "data.memberPassword", saveAs: "memberIdentity" } },
      { source: { caseStepId: "Setup-4", method: "prisma" }, id: "db.member_user.upsert", title: "准备 角色为 `member`、状态为 `active` 的本用例普通成员用户", object: "db.user", operator: "upsert", params: { emailFrom: "data.memberEmail", nameFrom: "data.memberName", roleFrom: "data.memberRole", status: "active", identityIdFrom: "runtime.memberIdentity.id", saveAs: "memberUser" } },
      { source: { caseStepId: "Setup-5", method: "prisma" }, id: "db.member_objective.upsert_active", title: "准备 标题为 `E2E-TARGET-MEMBER-EDIT-FORBIDDEN`、流转状态为 `frozen`、挑战者包含本用例普通成员的执行中目标", object: "db.member_challenge_objective", operator: "upsert_active", params: { idFrom: "data.objectiveId", titleFrom: "data.objectiveTitle", teamIdFrom: "runtime.memberUser.teamId", memberNameFrom: "data.memberName", memberUserIdFrom: "runtime.memberUser.userId", statusFrom: "data.objectiveStatus", saveAs: "fixtureObjective" } },
      { source: { caseStepId: "Setup-6", method: "api" }, id: "ory.member_sessions.revoke", title: "撤销本用例普通成员登录身份可能残留的登录会话", object: "ory.sessions", operator: "revoke_by_email", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Setup-7", method: "playwright" }, id: "auth.logout", title: "注销当前登录会话", object: "auth", operator: "logout" },
      { source: { caseStepId: "Setup-8", method: "playwright" }, id: "page.runtime.stop", title: "离开当前 ORF 前端页面", object: "page.runtime", operator: "stop" },
      { source: { caseStepId: "Setup-9", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Setup-10", method: "playwright" }, id: "page.goto.auth", title: "打开 ORF 登录页", object: "page", operator: "goto", params: { path: "/auth" } },
      { source: { caseStepId: "Setup-11", method: "playwright" }, id: "fill.email", title: "在邮箱输入框输入本用例普通成员固定测试邮箱", object: "page", operator: "fill", params: { label: "Email", valueFrom: "data.memberEmail" } },
      { source: { caseStepId: "Setup-12", method: "playwright" }, id: "fill.password", title: "在密码输入框输入本用例普通成员固定测试密码", object: "page", operator: "fill", params: { label: "Password", exact: true, valueFrom: "data.memberPassword" } },
      { source: { caseStepId: "Setup-13", method: "playwright" }, id: "click.sign_in", title: "点击 \"Sign In\" 登录操作", object: "page.login_form", operator: "submit", params: { saveAs: "memberLoginResponse" } },
      { source: { caseStepId: "Setup-14", method: "playwright" }, id: "page.goto.tasks", title: "打开 我的挑战", object: "page", operator: "goto", params: { path: "/tasks" } },
      { source: { caseStepId: "Setup-15", method: "playwright" }, id: "challenge.scope.mine", title: "切换到 \"我的挑战\" 视图", object: "page.challenge_scope", operator: "select", params: { label: "我的挑战" } },
      { source: { caseStepId: "Setup-16", method: "playwright" }, id: "challenge.status.active", title: "将状态筛选切换到 \"执行中\"", object: "page.challenge_status_filter", operator: "select", params: { label: "执行中" } },
    ],
  },

  S0: {
    description: "普通成员已登录并看到自己参与的执行中目标，但尚未进入目标编辑态",
    assertions: [
      { source: { caseStepId: "S0-1", method: "api" }, id: "session.authenticated", title: "当前会话 应为 已登录", object: "auth.session", operator: "authenticated" },
      { source: { caseStepId: "S0-2", method: "api" }, id: "session.email", title: "当前会话用户邮箱 应为 `orf-member-edit-objective-forbidden-e2e@orf.local`", object: "auth.session.user_email", operator: "equals", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "S0-3", method: "api" }, id: "session.role", title: "当前会话用户角色 应为 `member`", object: "auth.session.user_role", operator: "equals", params: { roleFrom: "data.memberRole" } },
      { source: { caseStepId: "S0-4", method: "api" }, id: "session.status", title: "当前会话用户状态 应为 `active`", object: "auth.session.user_status", operator: "equals", params: { status: "active" } },
      { source: { caseStepId: "S0-5", method: "prisma" }, id: "db.objective.flow_status", title: "目标 `E2E-TARGET-MEMBER-EDIT-FORBIDDEN` 的流转状态 应为 `frozen`", object: "db.member_challenge_objective", operator: "flow_status", params: { objectiveFrom: "runtime.fixtureObjective", status: "frozen" } },
      { source: { caseStepId: "S0-6", method: "prisma" }, id: "db.objective.challenger_present", title: "目标 `E2E-TARGET-MEMBER-EDIT-FORBIDDEN` 的挑战者账号身份 应包含 本用例普通成员", object: "db.member_challenge_objective", operator: "challenger_present", params: { objectiveFrom: "runtime.fixtureObjective", memberNameFrom: "data.memberName" } },
      { source: { caseStepId: "S0-7", method: "playwright" }, id: "url.tasks", title: "当前页面 应为 我的挑战", object: "page.url", operator: "match", params: { pattern: "/tasks$" } },
      { source: { caseStepId: "S0-8", method: "playwright" }, id: "scope.mine.selected", title: "\"我的挑战\" 视图 应处于选中状态", object: "page.challenge_scope", operator: "selected", params: { label: "我的挑战" } },
      { source: { caseStepId: "S0-9", method: "playwright" }, id: "status.active.selected", title: "\"执行中\" 状态筛选 应处于选中状态", object: "page.challenge_status_filter", operator: "selected", params: { label: "执行中" } },
      { source: { caseStepId: "S0-10", method: "playwright" }, id: "objective.visible", title: "我的挑战中应显示目标 `E2E-TARGET-MEMBER-EDIT-FORBIDDEN`", object: "page.challenge_objective", operator: "visible", params: { objectiveFrom: "runtime.fixtureObjective" } },
      { source: { caseStepId: "S0-11", method: "playwright" }, id: "objective.title_input.absent", title: "目标 `E2E-TARGET-MEMBER-EDIT-FORBIDDEN` 的标题编辑输入框 应不可见", object: "page.challenge_objective", operator: "title_input_absent" },
    ],
  },

  Action: {
    description: "普通成员触发目标编辑入口并提交目标详情修改请求",
    steps: [
      { source: { caseStepId: "Action-1", method: "playwright" }, id: "objective.title.double_click", title: "普通成员双击目标 `E2E-TARGET-MEMBER-EDIT-FORBIDDEN` 的标题", object: "page.challenge_objective", operator: "double_click_title", params: { objectiveFrom: "runtime.fixtureObjective" } },
      { source: { caseStepId: "Action-2", method: "api" }, id: "api.objective_update.submit", title: "普通成员调用目标详情修改接口提交新标题 `E2E-TARGET-MEMBER-EDIT-FORBIDDEN-EDITED`", object: "api.objective_update", operator: "submit_title", params: { objectiveFrom: "runtime.fixtureObjective", titleFrom: "data.editedObjectiveTitle", saveAs: "objectiveUpdateResponse" } },
    ],
  },

  S1: {
    description: "普通成员被阻止编辑目标，目标标题和会话角色保持不变",
    assertions: [
      { source: { caseStepId: "S1-1", method: "playwright" }, id: "toast.no_permission.visible", title: "页面 应显示 \"只有指挥官可以编辑目标\" 提示", object: "page.toast", operator: "visible", params: { message: "只有指挥官可以编辑目标" } },
      { source: { caseStepId: "S1-2", method: "playwright" }, id: "objective.title_input.still_absent", title: "目标 `E2E-TARGET-MEMBER-EDIT-FORBIDDEN` 的标题编辑输入框 应不可见", object: "page.challenge_objective", operator: "title_input_absent" },
      { source: { caseStepId: "S1-3", method: "playwright" }, id: "objective.still_visible", title: "我的挑战中应仍显示目标 `E2E-TARGET-MEMBER-EDIT-FORBIDDEN`", object: "page.challenge_objective", operator: "visible", params: { objectiveFrom: "runtime.fixtureObjective" } },
      { source: { caseStepId: "S1-4", method: "api" }, id: "api.objective_update.forbidden", title: "目标详情修改结果 应为 权限不足", object: "api.objective_update_result", operator: "forbidden", params: { responseFrom: "runtime.objectiveUpdateResponse" } },
      { source: { caseStepId: "S1-5", method: "prisma" }, id: "db.objective.title.unchanged", title: "目标 `E2E-TARGET-MEMBER-EDIT-FORBIDDEN` 的标题 应保持 `E2E-TARGET-MEMBER-EDIT-FORBIDDEN`", object: "db.member_challenge_objective", operator: "title_equals", params: { objectiveFrom: "runtime.fixtureObjective", titleFrom: "data.objectiveTitle" } },
      { source: { caseStepId: "S1-6", method: "prisma" }, id: "db.edited_objective.absent", title: "应不存在 标题为 `E2E-TARGET-MEMBER-EDIT-FORBIDDEN-EDITED` 的目标", object: "db.objective", operator: "absent", params: { titleFrom: "data.editedObjectiveTitle" } },
      { source: { caseStepId: "S1-7", method: "api" }, id: "session.role.still_member", title: "当前会话用户角色 应仍为 `member`", object: "auth.session.user_role", operator: "equals", params: { roleFrom: "data.memberRole" } },
    ],
  },

  Clean: {
    description: "删除本用例目标、普通成员身份和浏览器登录态",
    steps: [
      { source: { caseStepId: "Clean-1", method: "prisma" }, id: "db.objective.delete_created", title: "删除 本用例创建的目标 `E2E-TARGET-MEMBER-EDIT-FORBIDDEN` 及其派生数据", object: "db.objective", operator: "delete", params: { idFrom: "runtime.fixtureObjective.id", titleFrom: "data.objectiveTitle" } },
      { source: { caseStepId: "Clean-2", method: "prisma" }, id: "db.objective.delete_edited_residue", title: "删除 本用例残留的目标 `E2E-TARGET-MEMBER-EDIT-FORBIDDEN-EDITED` 及其派生数据", object: "db.objective", operator: "delete_by_title", params: { titleFrom: "data.editedObjectiveTitle" } },
      { source: { caseStepId: "Clean-3", method: "api" }, id: "auth.logout", title: "注销当前登录会话", object: "auth", operator: "logout" },
      { source: { caseStepId: "Clean-4", method: "playwright" }, id: "page.runtime.stop", title: "离开当前 ORF 前端页面", object: "page.runtime", operator: "stop" },
      { source: { caseStepId: "Clean-5", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Clean-6", method: "api" }, id: "ory.member_sessions.revoke", title: "撤销本用例普通成员登录身份的残留登录会话", object: "ory.sessions", operator: "revoke_by_email", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-7", method: "api" }, id: "ory.member_identity.delete", title: "删除 本用例普通成员登录身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-8", method: "prisma" }, id: "db.member_membership.delete", title: "删除 本用例普通成员用户默认团队成员关系", object: "db.user", operator: "delete_memberships", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-9", method: "prisma" }, id: "db.member_user.delete", title: "删除 本用例普通成员用户", object: "db.user", operator: "delete", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-10", method: "prisma" }, id: "db.objective.absent", title: "应不存在 标题为 `E2E-TARGET-MEMBER-EDIT-FORBIDDEN` 的目标", object: "db.objective", operator: "absent", params: { titleFrom: "data.objectiveTitle" } },
      { source: { caseStepId: "Clean-11", method: "prisma" }, id: "db.edited_objective.absent", title: "应不存在 标题为 `E2E-TARGET-MEMBER-EDIT-FORBIDDEN-EDITED` 的目标", object: "db.objective", operator: "absent", params: { titleFrom: "data.editedObjectiveTitle" } },
      { source: { caseStepId: "Clean-12", method: "api" }, id: "ory.member_identity.absent", title: "本用例普通成员登录身份 应不存在", object: "ory.identity", operator: "absent", params: { emailFrom: "data.memberEmail" } },
      { source: { caseStepId: "Clean-13", method: "prisma" }, id: "db.member_user.absent", title: "本用例普通成员用户 应不存在", object: "db.user", operator: "absent", params: { emailFrom: "data.memberEmail" } },
    ],
  },
} satisfies StateCaseSpec<MemberEditObjectiveForbiddenCaseData>;
