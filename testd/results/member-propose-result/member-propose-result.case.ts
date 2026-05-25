import { STATE_CASE_MODEL, type StateCaseSpec } from "../../_framework/types";
import type { MemberProposeResultCaseData } from "./_support/member-propose-result.context";

export const memberProposeResultCase = {
  id: "results.propose.member",
  title: "成员可以提出指标",
  model: STATE_CASE_MODEL,
  tags: ["results", "propose", "member", "happy-path"],

  data: {
    email: "orf-member-e2e@orf.local",
    password: "OrfMemberE2E!2026",
    name: "ORF Member E2E",
    role: "member",
    resultTitle: "E2E-RESULT-PROPOSE: 成员提出指标",
    metricName: "E2E 成员提出指标完成率",
  },

  B: {
    description: "系统服务、Ory、数据库和预置普通成员可用，当前浏览器未登录且测试指标不存在",
    assertions: [
      { id: "backend.ready", title: "后端服务可用", object: "api.health", operator: "ok" },
      { id: "db.ready", title: "数据库可连接", object: "db", operator: "ready" },
      { id: "ory.ready", title: "Ory Admin API 可用", object: "ory.admin", operator: "ready" },
      {
        id: "ory.member_identity.exists",
        title: "普通成员 Ory 身份存在",
        object: "ory.identity",
        operator: "exists",
        params: { emailFrom: "data.email" },
      },
      { id: "db.member.active", title: "预置普通成员账号可用", object: "db.member", operator: "active", params: { emailFrom: "data.email" } },
      { id: "db.proposal_target.available", title: "存在可构造成员提出指标起点的目标", object: "db.proposal_target", operator: "available" },
      {
        id: "db.test_result.absent",
        title: "测试指标不存在",
        object: "db.result",
        operator: "absent",
        params: { titleFrom: "data.resultTitle" },
      },
      { id: "session.unauthenticated", title: "后端 session 未登录", object: "auth.session", operator: "unauthenticated" },
      { id: "cookie.absent", title: "浏览器不存在登录 cookie", object: "browser.cookie", operator: "absent" },
      { id: "storage.empty", title: "浏览器 storage 不含登录态", object: "browser.auth_storage", operator: "empty" },
    ],
  },

  Setup: {
    description: "准备可提出指标的重估目标，登录普通成员并进入挑战工作台",
    steps: [
      { id: "browser.clear", title: "清理浏览器状态", object: "browser", operator: "clear_state" },
      {
        id: "db.proposal_target.select",
        title: "选择可构造成员提出指标起点的目标",
        object: "db.proposal_target",
        operator: "select",
        params: { saveAs: "proposalTarget" },
      },
      {
        id: "db.proposal_target.original_state_recorded",
        title: "记录目标原始状态",
        object: "db.proposal_target",
        operator: "original_state_recorded",
        params: { targetFrom: "runtime.proposalTarget" },
      },
      {
        id: "db.proposal_target.prepare",
        title: "准备目标为普通成员可提出指标状态",
        object: "db.proposal_target",
        operator: "prepare",
        params: { targetFrom: "runtime.proposalTarget", memberNameFrom: "data.name" },
      },
      { id: "page.goto.auth", title: "打开登录页", object: "page", operator: "goto", params: { path: "/auth" } },
      { id: "fill.email", title: "输入普通成员邮箱", object: "page", operator: "fill", params: { label: "Email", valueFrom: "data.email" } },
      {
        id: "fill.password",
        title: "输入普通成员密码",
        object: "page",
        operator: "fill",
        params: { label: "Password", exact: true, valueFrom: "data.password" },
      },
      { id: "click.sign_in", title: "点击登录按钮", object: "page", operator: "click", params: { role: "button", name: "Sign In" } },
      {
        id: "session.member.authenticated",
        title: "等待普通成员 session 已登录",
        object: "auth.session",
        operator: "authenticated",
        params: { emailFrom: "data.email", roleFrom: "data.role", status: "active" },
      },
      { id: "page.goto.tasks", title: "打开挑战工作台", object: "page", operator: "goto", params: { path: "/tasks" } },
    ],
  },

  S0: {
    description: "普通成员已登录并位于挑战工作台，目标可见且提出指标操作可用",
    assertions: [
      {
        id: "session.member.authenticated",
        title: "后端 session 已登录",
        object: "auth.session",
        operator: "authenticated",
        params: { emailFrom: "data.email", roleFrom: "data.role", status: "active" },
      },
      { id: "url.tasks", title: "当前页面是挑战工作台", object: "page.url", operator: "match", params: { pattern: "/tasks$" } },
      {
        id: "proposal_target.visible",
        title: "目标面板可见",
        object: "page.proposal_target",
        operator: "visible",
        params: { targetFrom: "runtime.proposalTarget" },
      },
      {
        id: "proposal_target.propose_metric.enabled",
        title: "目标提出指标操作可点击",
        object: "page.proposal_target",
        operator: "propose_metric_enabled",
        params: { targetFrom: "runtime.proposalTarget" },
      },
      {
        id: "db.proposal_target.can_propose",
        title: "目标允许普通成员提出指标",
        object: "db.proposal_target",
        operator: "can_propose_result",
        params: { targetFrom: "runtime.proposalTarget", memberNameFrom: "data.name" },
      },
      {
        id: "db.target_result.absent",
        title: "目标不存在测试指标",
        object: "db.proposal_target",
        operator: "result_absent",
        params: { targetFrom: "runtime.proposalTarget", titleFrom: "data.resultTitle" },
      },
    ],
  },

  Action: {
    description: "普通成员通过页面为目标提出测试指标",
    steps: [
      {
        id: "click.propose_metric",
        title: "点击提出指标",
        object: "page.proposal_target",
        operator: "propose_metric",
        params: { targetFrom: "runtime.proposalTarget" },
      },
      {
        id: "modal.visible",
        title: "提出指标弹窗可见",
        object: "page.result_modal",
        operator: "visible",
      },
      {
        id: "fill.result_title",
        title: "输入指标标题",
        object: "page",
        operator: "fill",
        params: { label: "指标标题", valueFrom: "data.resultTitle" },
      },
      {
        id: "fill.metric_name",
        title: "输入衡量指标",
        object: "page",
        operator: "fill",
        params: { label: "衡量指标", valueFrom: "data.metricName" },
      },
      {
        id: "capture.create_result_response",
        title: "监听新增指标请求",
        object: "api",
        operator: "capture_response",
        params: { urlEndsWith: "/api/results", method: "POST", saveAs: "createResultResponse" },
      },
      {
        id: "click.submit_result",
        title: "点击提交指标",
        object: "page",
        operator: "click",
        params: { role: "button", name: "提交指标" },
      },
      {
        id: "create_result_response.record",
        title: "记录提出的指标",
        object: "api.result_create_response",
        operator: "record_result",
        params: { responseFrom: "runtime.createResultResponse", saveAs: "createdResult" },
      },
    ],
  },

  S1: {
    description: "测试指标已经持久化并显示在目标面板中，普通成员仍保持登录",
    assertions: [
      {
        id: "create_result_response.ok",
        title: "新增指标接口响应成功",
        object: "api.response",
        operator: "ok",
        params: { responseFrom: "runtime.createResultResponse", status: 200 },
      },
      {
        id: "created_result.matches",
        title: "新增指标接口返回内容正确",
        object: "api.result_create_response",
        operator: "matches",
        params: {
          resultFrom: "runtime.createdResult",
          targetFrom: "runtime.proposalTarget",
          titleFrom: "data.resultTitle",
          metricNameFrom: "data.metricName",
          source: "memberProposed",
          definerFrom: "data.name",
        },
      },
      {
        id: "db.created_result.present",
        title: "数据库存在测试指标",
        object: "db.proposal_target",
        operator: "result_present",
        params: {
          targetFrom: "runtime.proposalTarget",
          titleFrom: "data.resultTitle",
          metricNameFrom: "data.metricName",
          memberNameFrom: "data.name",
        },
      },
      {
        id: "page.created_result.visible",
        title: "目标面板显示测试指标",
        object: "page.proposal_target",
        operator: "result_visible",
        params: { targetFrom: "runtime.proposalTarget", resultFrom: "runtime.createdResult" },
      },
      {
        id: "session.member.still_authenticated",
        title: "普通成员仍保持登录",
        object: "auth.session",
        operator: "authenticated",
        params: { emailFrom: "data.email", roleFrom: "data.role", status: "active" },
      },
    ],
  },

  Clean: {
    description: "删除测试指标，恢复目标原始状态并退出登录",
    steps: [
      {
        id: "db.result.delete",
        title: "删除测试指标",
        object: "db.result",
        operator: "delete",
        params: { titleFrom: "data.resultTitle", resultFrom: "runtime.createdResult" },
      },
      {
        id: "db.proposal_target.restore",
        title: "恢复目标原始状态",
        object: "db.proposal_target",
        operator: "restore",
        params: { targetFrom: "runtime.proposalTarget" },
      },
      { id: "auth.logout", title: "退出当前登录态", object: "auth", operator: "logout" },
      { id: "browser.clear", title: "清理浏览器状态", object: "browser", operator: "clear_state" },
      {
        id: "ory.member_identity.exists",
        title: "普通成员 Ory 身份仍然存在",
        object: "ory.identity",
        operator: "exists",
        params: { emailFrom: "data.email" },
      },
      { id: "db.member.active", title: "预置普通成员账号仍然可用", object: "db.member", operator: "active", params: { emailFrom: "data.email" } },
    ],
  },
} satisfies StateCaseSpec<MemberProposeResultCaseData>;
