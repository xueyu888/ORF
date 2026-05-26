import { STATE_CASE_MODEL, type StateCaseSpec } from "../../_framework/types";
import type { FrozenMemberProposalCaseData } from "./_support/member-cannot-propose-result-frozen.context";

export const memberCannotProposeResultFrozenCase = {
  id: "implementation.result.propose.member.frozen.denied",
  title: "实施阶段成员不可提出指标",
  model: STATE_CASE_MODEL,
  tags: ["implementation", "results", "member", "frozen", "negative"],

  data: {
    email: "orf-member-e2e@orf.local",
    password: "OrfMemberE2E!2026",
    name: "ORF Member E2E",
    role: "member",
    resultTitle: "E2E-FROZEN-PROPOSE: 实施阶段成员不可提出指标",
    metricName: "E2E 实施阶段成员提出指标完成率",
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
      {
        id: "db.frozen_proposal_target.available",
        title: "存在可构造实施阶段成员不可提出指标起点的目标",
        object: "db.frozen_proposal_target",
        operator: "available",
      },
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
    description: "准备实施阶段目标，登录普通成员并进入挑战工作台",
    steps: [
      { id: "browser.clear", title: "清理浏览器状态", object: "browser", operator: "clear_state" },
      {
        id: "db.frozen_proposal_target.select",
        title: "选择可构造实施阶段成员不可提出指标起点的目标",
        object: "db.frozen_proposal_target",
        operator: "select",
        params: { saveAs: "frozenProposalTarget" },
      },
      {
        id: "db.frozen_proposal_target.original_state_recorded",
        title: "记录目标原始状态",
        object: "db.frozen_proposal_target",
        operator: "original_state_recorded",
        params: { targetFrom: "runtime.frozenProposalTarget" },
      },
      {
        id: "db.frozen_proposal_target.prepare",
        title: "准备目标为实施阶段",
        object: "db.frozen_proposal_target",
        operator: "prepare",
        params: { targetFrom: "runtime.frozenProposalTarget", memberNameFrom: "data.name" },
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
    description: "普通成员已登录并位于挑战工作台，目标已冻结且提出指标操作不可用",
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
        id: "frozen_proposal_target.visible",
        title: "目标面板可见",
        object: "page.frozen_proposal_target",
        operator: "visible",
        params: { targetFrom: "runtime.frozenProposalTarget" },
      },
      {
        id: "frozen_proposal_target.propose_metric.absent",
        title: "目标提出指标操作不存在",
        object: "page.frozen_proposal_target",
        operator: "propose_metric_absent",
        params: { targetFrom: "runtime.frozenProposalTarget" },
      },
      {
        id: "db.frozen_proposal_target.frozen_for_member",
        title: "目标处于实施阶段且包含普通成员",
        object: "db.frozen_proposal_target",
        operator: "frozen_for_member",
        params: { targetFrom: "runtime.frozenProposalTarget", memberNameFrom: "data.name" },
      },
      {
        id: "db.target_result.absent",
        title: "目标不存在测试指标",
        object: "db.frozen_proposal_target",
        operator: "result_absent",
        params: { targetFrom: "runtime.frozenProposalTarget", titleFrom: "data.resultTitle" },
      },
    ],
  },

  Action: {
    description: "普通成员直接提交成员建议指标请求",
    steps: [
      {
        id: "api.result_create.submit_member_proposed",
        title: "提交成员建议指标请求",
        object: "api.result_create",
        operator: "submit_member_proposed",
        params: {
          targetFrom: "runtime.frozenProposalTarget",
          titleFrom: "data.resultTitle",
          metricNameFrom: "data.metricName",
          saveAs: "createResultResponse",
        },
      },
    ],
  },

  S1: {
    description: "新增指标请求被拒绝，目标未产生测试指标，普通成员仍保持登录",
    assertions: [
      {
        id: "create_result_response.rejected",
        title: "新增成员建议指标接口响应被拒绝",
        object: "api.result_create_response",
        operator: "rejected",
        params: { responseFrom: "runtime.createResultResponse", status: 403 },
      },
      {
        id: "db.target_result.still_absent",
        title: "目标仍不存在测试指标",
        object: "db.frozen_proposal_target",
        operator: "result_absent",
        params: { targetFrom: "runtime.frozenProposalTarget", titleFrom: "data.resultTitle" },
      },
      {
        id: "page.result.still_absent",
        title: "目标面板仍不显示测试指标",
        object: "page.frozen_proposal_target",
        operator: "result_absent",
        params: { targetFrom: "runtime.frozenProposalTarget", titleFrom: "data.resultTitle" },
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
    description: "删除同标题测试指标，恢复目标原始状态并退出登录",
    steps: [
      {
        id: "db.result.delete",
        title: "删除同标题测试指标",
        object: "db.result",
        operator: "delete",
        params: { titleFrom: "data.resultTitle" },
      },
      {
        id: "db.frozen_proposal_target.restore",
        title: "恢复目标原始状态",
        object: "db.frozen_proposal_target",
        operator: "restore",
        params: { targetFrom: "runtime.frozenProposalTarget" },
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
} satisfies StateCaseSpec<FrozenMemberProposalCaseData>;
