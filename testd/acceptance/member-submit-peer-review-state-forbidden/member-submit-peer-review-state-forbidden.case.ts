import { STATE_CASE_MODEL, type StateCaseSpec } from "../../_framework/types";
import type { MemberSubmitPeerReviewStateForbiddenCaseData } from "./_support/member-submit-peer-review-state-forbidden.context";

export const memberSubmitPeerReviewStateForbiddenCase = {
  id: "acceptance.member-submit-peer-review.state-forbidden",
  title: "成员提交匿名互评-非已验收状态不可互评",
  model: STATE_CASE_MODEL,
  tags: ["acceptance", "peer-review", "state", "negative-path"],

  data: {
    email: "orf-member-peer-review-state-forbidden-e2e@orf.local",
    password: "OrfMemberPeerReviewStateForbiddenE2E!2026",
    name: "ORF Member Peer Review State Forbidden E2E",
    role: "member",
    collaboratorName: "ORF Peer Review State Collaborator E2E",
    targets: {
      resultClaiming: {
        id: "obj-testd-peer-review-state-forbidden-result-claiming",
        title: "E2E-PEER-REVIEW-STATE-FORBIDDEN: 发布阶段目标",
        stage: "resultClaiming",
        flowStatus: "open",
        lootSubmittedAt: "absent",
      },
      reestimate: {
        id: "obj-testd-peer-review-state-forbidden-reestimate",
        title: "E2E-PEER-REVIEW-STATE-FORBIDDEN: 评估阶段目标",
        stage: "orfReestimate",
        flowStatus: "reestimating",
        lootSubmittedAt: "absent",
      },
      frozen: {
        id: "obj-testd-peer-review-state-forbidden-frozen",
        title: "E2E-PEER-REVIEW-STATE-FORBIDDEN: 实施未提交战利品目标",
        stage: "goalFrozen",
        flowStatus: "frozen",
        lootSubmittedAt: "absent",
      },
      submitted: {
        id: "obj-testd-peer-review-state-forbidden-submitted",
        title: "E2E-PEER-REVIEW-STATE-FORBIDDEN: 待验收目标",
        stage: "goalFrozen",
        flowStatus: "submitted",
        lootSubmittedAt: "present",
      },
      settled: {
        id: "obj-testd-peer-review-state-forbidden-settled",
        title: "E2E-PEER-REVIEW-STATE-FORBIDDEN: 已结算目标",
        stage: "goalFrozen",
        flowStatus: "settled",
        lootSubmittedAt: "present",
      },
    },
    loot: {
      submitted: {
        body: "E2E-PEER-REVIEW-STATE-FORBIDDEN-LOOT: 待验收前置战利品",
        submittedBy: "ORF Member Peer Review State Forbidden E2E",
      },
      settled: {
        body: "E2E-PEER-REVIEW-STATE-FORBIDDEN-LOOT: 已结算前置战利品",
        submittedBy: "ORF Member Peer Review State Forbidden E2E",
      },
    },
  },

  B: {
    description: "系统服务可用，浏览器处于未登录基准状态",
    assertions: [
      { source: { caseStepId: "B-1", method: "api" }, id: "frontend.ready", title: "前端服务 应可用", object: "frontend.service", operator: "available" },
      { source: { caseStepId: "B-2", method: "api" }, id: "backend.ready", title: "后端服务 应可用", object: "api.health", operator: "ok" },
      { source: { caseStepId: "B-3", method: "api" }, id: "frontend.login_entry.accessible", title: "前端登录页入口 应可访问", object: "frontend.login_entry", operator: "accessible" },
      { source: { caseStepId: "B-4", method: "api" }, id: "session.endpoint.accessible", title: "当前会话查询能力 应可用", object: "auth.session", operator: "accessible" },
      { source: { caseStepId: "B-5", method: "prisma" }, id: "db.ready", title: "ORF 数据库 应可连接", object: "db", operator: "ready" },
      { source: { caseStepId: "B-6", method: "prisma" }, id: "db.schema.current", title: "ORF 数据库 schema 应为 当前测试版本", object: "db.schema", operator: "current" },
      { source: { caseStepId: "B-7", method: "api" }, id: "ory.admin_public.ready", title: "Ory/Kratos 认证服务的管理和公共访问能力 应可用", object: "ory.admin_public", operator: "ready" },
      { source: { caseStepId: "B-8", method: "api" }, id: "session.unauthenticated", title: "当前会话 应为 未登录", object: "auth.session", operator: "unauthenticated" },
      { source: { caseStepId: "B-9", method: "playwright" }, id: "cookie.absent", title: "当前浏览器 应不存在 Ory 登录会话 cookie", object: "browser.cookie", operator: "absent" },
      { source: { caseStepId: "B-10", method: "playwright" }, id: "storage.empty", title: "当前浏览器 应不保留本地登录态", object: "browser.auth_storage", operator: "empty" },
    ],
  },

  Setup: {
    description: "准备普通成员、五个非已验收状态目标及待验收和已结算目标前置战利品，并以普通成员身份完成登录",
    steps: [
      { source: { caseStepId: "Setup-1", method: "prisma" }, id: "db.state_peer_review.delete_residue", title: "删除 本用例残留的非已验收状态匿名互评记录", object: "db.state_peer_review", operator: "delete_residue" },
      { source: { caseStepId: "Setup-2", method: "prisma" }, id: "db.state_peer_review_loot.delete_residue", title: "删除 本用例残留的非已验收状态前置战利品", object: "db.state_peer_review_loot", operator: "delete_residue" },
      { source: { caseStepId: "Setup-3", method: "prisma" }, id: "db.state_peer_review_target.delete_residue", title: "删除 本用例残留的非已验收状态互评目标及其派生数据", object: "db.state_peer_review_target", operator: "delete_residue" },
      { source: { caseStepId: "Setup-4", method: "api" }, id: "ory.member_identity.upsert", title: "准备邮箱为 `orf-member-peer-review-state-forbidden-e2e@orf.local`、使用固定测试密码的普通成员登录身份", object: "ory.identity", operator: "upsert_password", params: { emailFrom: "data.email", nameFrom: "data.name", passwordFrom: "data.password", saveAs: "memberIdentity" } },
      { source: { caseStepId: "Setup-5", method: "prisma" }, id: "db.member.upsert", title: "准备邮箱为 `orf-member-peer-review-state-forbidden-e2e@orf.local`、角色为 `member`、状态为 `active` 的普通成员用户和默认团队成员关系", object: "db.user", operator: "upsert", params: { emailFrom: "data.email", nameFrom: "data.name", roleFrom: "data.role", status: "active", identityIdFrom: "runtime.memberIdentity.id", saveAs: "memberUser" } },
      { source: { caseStepId: "Setup-6", method: "prisma" }, id: "db.result_claiming_peer_review_target.upsert", title: "创建标题为 `E2E-PEER-REVIEW-STATE-FORBIDDEN: 发布阶段目标`、流转状态为 `open`、阶段为 `resultClaiming` 的本用例发布阶段互评目标", object: "db.state_peer_review_target", operator: "upsert", params: { fixtureFrom: "data.targets.resultClaiming", teamIdFrom: "runtime.memberUser.teamId", createdByFrom: "runtime.memberUser.userId", updatedByFrom: "runtime.memberUser.userId", saveAs: "resultClaimingTarget" } },
      { source: { caseStepId: "Setup-7", method: "prisma" }, id: "db.reestimate_peer_review_target.upsert", title: "创建标题为 `E2E-PEER-REVIEW-STATE-FORBIDDEN: 评估阶段目标`、流转状态为 `reestimating`、阶段为 `orfReestimate` 的本用例评估阶段互评目标", object: "db.state_peer_review_target", operator: "upsert", params: { fixtureFrom: "data.targets.reestimate", teamIdFrom: "runtime.memberUser.teamId", createdByFrom: "runtime.memberUser.userId", updatedByFrom: "runtime.memberUser.userId", saveAs: "reestimateTarget" } },
      { source: { caseStepId: "Setup-8", method: "prisma" }, id: "db.frozen_peer_review_target.upsert", title: "创建标题为 `E2E-PEER-REVIEW-STATE-FORBIDDEN: 实施未提交战利品目标`、流转状态为 `frozen`、阶段为 `goalFrozen` 的本用例实施未提交战利品互评目标", object: "db.state_peer_review_target", operator: "upsert", params: { fixtureFrom: "data.targets.frozen", teamIdFrom: "runtime.memberUser.teamId", createdByFrom: "runtime.memberUser.userId", updatedByFrom: "runtime.memberUser.userId", saveAs: "frozenTarget" } },
      { source: { caseStepId: "Setup-9", method: "prisma" }, id: "db.submitted_peer_review_target.upsert", title: "创建标题为 `E2E-PEER-REVIEW-STATE-FORBIDDEN: 待验收目标`、流转状态为 `submitted`、阶段为 `goalFrozen` 的本用例待验收互评目标", object: "db.state_peer_review_target", operator: "upsert", params: { fixtureFrom: "data.targets.submitted", teamIdFrom: "runtime.memberUser.teamId", createdByFrom: "runtime.memberUser.userId", updatedByFrom: "runtime.memberUser.userId", saveAs: "submittedTarget" } },
      { source: { caseStepId: "Setup-10", method: "prisma" }, id: "db.settled_peer_review_target.upsert", title: "创建标题为 `E2E-PEER-REVIEW-STATE-FORBIDDEN: 已结算目标`、流转状态为 `settled`、阶段为 `goalFrozen` 的本用例已结算互评目标", object: "db.state_peer_review_target", operator: "upsert", params: { fixtureFrom: "data.targets.settled", teamIdFrom: "runtime.memberUser.teamId", createdByFrom: "runtime.memberUser.userId", updatedByFrom: "runtime.memberUser.userId", saveAs: "settledTarget" } },
      { source: { caseStepId: "Setup-11", method: "prisma" }, id: "db.submitted_peer_review_loot.create", title: "为本用例待验收互评目标创建内容为 `E2E-PEER-REVIEW-STATE-FORBIDDEN-LOOT: 待验收前置战利品` 的前置战利品", object: "db.state_peer_review_loot", operator: "create", params: { targetFrom: "runtime.submittedTarget", lootFrom: "data.loot.submitted", saveAs: "submittedLoot" } },
      { source: { caseStepId: "Setup-12", method: "prisma" }, id: "db.settled_peer_review_loot.create", title: "为本用例已结算互评目标创建内容为 `E2E-PEER-REVIEW-STATE-FORBIDDEN-LOOT: 已结算前置战利品` 的前置战利品", object: "db.state_peer_review_loot", operator: "create", params: { targetFrom: "runtime.settledTarget", lootFrom: "data.loot.settled", saveAs: "settledLoot" } },
      { source: { caseStepId: "Setup-13", method: "api" }, id: "ory.member_sessions.revoke", title: "撤销普通成员登录身份的残留登录会话", object: "ory.sessions", operator: "revoke_by_email", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Setup-14", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Setup-15", method: "playwright" }, id: "page.goto.auth", title: "打开 ORF 登录页", object: "page", operator: "goto", params: { path: "/auth" } },
      { source: { caseStepId: "Setup-16", method: "playwright" }, id: "fill.member_email", title: "在邮箱输入框输入普通成员固定测试邮箱", object: "page", operator: "fill", params: { label: "Email", valueFrom: "data.email" } },
      { source: { caseStepId: "Setup-17", method: "playwright" }, id: "fill.member_password", title: "在密码输入框输入普通成员固定测试密码", object: "page", operator: "fill", params: { label: "Password", exact: true, valueFrom: "data.password" } },
      { source: { caseStepId: "Setup-18", method: "playwright" }, id: "click.member_sign_in", title: "点击 \"Sign In\" 登录操作", object: "page.state_peer_review_login", operator: "submit_member" },
    ],
  },

  S0: {
    description: "普通成员已登录，五个非已验收状态目标均包含该普通成员为挑战者",
    assertions: [
      { source: { caseStepId: "S0-1", method: "api" }, id: "session.member.authenticated", title: "当前会话 应为 邮箱为 `orf-member-peer-review-state-forbidden-e2e@orf.local`、角色为 `member`、状态为 `active` 的已登录会话", object: "auth.session", operator: "authenticated", params: { emailFrom: "data.email", roleFrom: "data.role", status: "active" } },
      { source: { caseStepId: "S0-2", method: "prisma" }, id: "state_targets.states", title: "五个本用例非已验收状态互评目标 应为 各自预设的流转状态、阶段、战利品提交时间和挑战者列表", object: "db.state_peer_review_target", operator: "states" },
      { source: { caseStepId: "S0-3", method: "prisma" }, id: "state_loot.present", title: "本用例待验收和已结算互评目标 应存在 各自前置战利品", object: "db.state_peer_review_loot", operator: "all_present" },
      { source: { caseStepId: "S0-4", method: "prisma" }, id: "state_peer_review.absent", title: "五个本用例非已验收状态互评目标 应不存在 普通成员提交的匿名互评", object: "db.state_peer_review", operator: "absent" },
    ],
  },

  Action: {
    description: "普通成员进入挑战工作台",
    steps: [
      { source: { caseStepId: "Action-1", method: "playwright" }, id: "page.goto.tasks", title: "普通成员打开 挑战工作台", object: "page", operator: "goto", params: { path: "/tasks" } },
    ],
  },

  S1: {
    description: "五个非已验收状态目标可见，但提交匿名互评入口不可见，数据库不新增匿名互评",
    assertions: [
      { source: { caseStepId: "S1-1", method: "playwright" }, id: "url.tasks", title: "当前页面 应为 挑战工作台", object: "page.url", operator: "match", params: { pattern: "/tasks$" } },
      { source: { caseStepId: "S1-2", method: "playwright" }, id: "my_challenges.view.available", title: "\"我的挑战\" 视图 应可用", object: "page", operator: "visible", params: { role: "button", name: "我的挑战" } },
      { source: { caseStepId: "S1-3", method: "playwright" }, id: "state_targets.visible", title: "五个本用例非已验收状态互评目标面板 应均可见", object: "page.state_peer_review_targets", operator: "visible" },
      { source: { caseStepId: "S1-4", method: "playwright" }, id: "state_targets.submit_action_absent", title: "五个本用例非已验收状态互评目标的 \"提交匿名互评\" 入口 应均不可见", object: "page.state_peer_review_targets", operator: "submit_action_absent" },
      { source: { caseStepId: "S1-5", method: "api" }, id: "member_workbench.targets_present", title: "普通成员挑战工作台数据 应包含 五个本用例非已验收状态互评目标", object: "api.state_peer_review_member_workbench", operator: "targets_present" },
      { source: { caseStepId: "S1-6", method: "prisma" }, id: "state_targets.states_unchanged", title: "五个本用例非已验收状态互评目标的流转状态、阶段、战利品提交时间和挑战者列表 应保持不变", object: "db.state_peer_review_target", operator: "states" },
      { source: { caseStepId: "S1-7", method: "prisma" }, id: "state_loot.still_present", title: "本用例待验收和已结算互评目标 应仍存在 各自前置战利品", object: "db.state_peer_review_loot", operator: "all_present" },
      { source: { caseStepId: "S1-8", method: "prisma" }, id: "state_peer_review.still_absent", title: "五个本用例非已验收状态互评目标 应仍不存在 普通成员提交的匿名互评", object: "db.state_peer_review", operator: "absent" },
      { source: { caseStepId: "S1-9", method: "api" }, id: "session.member.still_authenticated", title: "当前会话 应仍为 邮箱为 `orf-member-peer-review-state-forbidden-e2e@orf.local`、角色为 `member`、状态为 `active` 的已登录会话", object: "auth.session", operator: "authenticated", params: { emailFrom: "data.email", roleFrom: "data.role", status: "active" } },
    ],
  },

  Clean: {
    description: "删除非已验收状态互评目标、前置战利品、测试用户和浏览器运行态",
    steps: [
      { source: { caseStepId: "Clean-1", method: "prisma" }, id: "db.state_peer_review.delete", title: "删除 本用例残留的非已验收状态匿名互评记录", object: "db.state_peer_review", operator: "delete_residue" },
      { source: { caseStepId: "Clean-2", method: "prisma" }, id: "db.state_peer_review_loot.delete", title: "删除 本用例非已验收状态前置战利品", object: "db.state_peer_review_loot", operator: "delete_residue" },
      { source: { caseStepId: "Clean-3", method: "prisma" }, id: "db.state_peer_review_target.delete", title: "删除 本用例非已验收状态互评目标及其派生数据", object: "db.state_peer_review_target", operator: "delete_residue" },
      { source: { caseStepId: "Clean-4", method: "api" }, id: "auth.logout", title: "注销当前登录会话", object: "auth", operator: "logout" },
      { source: { caseStepId: "Clean-5", method: "playwright" }, id: "page.runtime.stop", title: "离开当前 ORF 前端页面", object: "page.runtime", operator: "stop" },
      { source: { caseStepId: "Clean-6", method: "playwright" }, id: "browser.clear", title: "移除当前浏览器中的残留登录态", object: "browser", operator: "clear_state" },
      { source: { caseStepId: "Clean-7", method: "api" }, id: "ory.member_sessions.revoke", title: "撤销普通成员登录身份的残留登录会话", object: "ory.sessions", operator: "revoke_by_email", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-8", method: "api" }, id: "ory.member_identity.delete", title: "删除邮箱为 `orf-member-peer-review-state-forbidden-e2e@orf.local` 的普通成员登录身份", object: "ory.identity", operator: "delete_by_email", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-9", method: "prisma" }, id: "db.member.delete_membership", title: "删除邮箱为 `orf-member-peer-review-state-forbidden-e2e@orf.local` 的普通成员默认团队成员关系", object: "db.user", operator: "delete_memberships", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-10", method: "prisma" }, id: "db.member.delete", title: "删除邮箱为 `orf-member-peer-review-state-forbidden-e2e@orf.local` 的普通成员用户", object: "db.user", operator: "delete", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-11", method: "prisma" }, id: "db.state_peer_review.absent", title: "应不存在 本用例非已验收状态匿名互评记录", object: "db.state_peer_review", operator: "absent" },
      { source: { caseStepId: "Clean-12", method: "prisma" }, id: "db.state_peer_review_loot.absent", title: "应不存在 本用例非已验收状态前置战利品", object: "db.state_peer_review_loot", operator: "absent" },
      { source: { caseStepId: "Clean-13", method: "prisma" }, id: "db.state_peer_review_target.absent", title: "应不存在 本用例非已验收状态互评目标", object: "db.state_peer_review_target", operator: "absent" },
      { source: { caseStepId: "Clean-14", method: "api" }, id: "ory.member_identity.absent", title: "邮箱为 `orf-member-peer-review-state-forbidden-e2e@orf.local` 的普通成员登录身份 应不存在", object: "ory.identity", operator: "absent", params: { emailFrom: "data.email" } },
      { source: { caseStepId: "Clean-15", method: "prisma" }, id: "db.member.absent", title: "邮箱为 `orf-member-peer-review-state-forbidden-e2e@orf.local` 的普通成员用户 应不存在", object: "db.user", operator: "absent", params: { emailFrom: "data.email" } },
    ],
  },
} satisfies StateCaseSpec<MemberSubmitPeerReviewStateForbiddenCaseData>;
