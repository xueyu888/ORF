import { STATE_CASE_MODEL, type StateCaseSpec } from "../../_framework/types";
import type { AdminFreezeObjectiveCaseData } from "./_support/admin-freeze-objective.context";

export const adminFreezeObjectiveCase = {
  id: "implementation.objective.freeze.admin",
  title: "管理员可以冻结目标进入实施阶段",
  model: STATE_CASE_MODEL,
  tags: ["implementation", "objective", "freeze", "admin", "happy-path"],

  data: {
    email: "zrx831@gmail.com",
    password: "123123123",
    role: "admin",
    freezeResultTitle: "E2E-FREEZE-RESULT: 冻结前置指标",
    freezeMetricName: "E2E 冻结目标前置指标完成率",
  },

  B: {
    description: "系统服务、Ory、数据库和预置管理员可用，当前浏览器未登录且冻结前置指标不存在",
    assertions: [
      { id: "backend.ready", title: "后端服务可用", object: "api.health", operator: "ok" },
      { id: "db.ready", title: "数据库可连接", object: "db", operator: "ready" },
      { id: "ory.ready", title: "Ory Admin API 可用", object: "ory.admin", operator: "ready" },
      {
        id: "ory.admin_identity.exists",
        title: "管理员 Ory 身份存在",
        object: "ory.identity",
        operator: "exists",
        params: { emailFrom: "data.email" },
      },
      { id: "db.admin.active", title: "预置管理员账号可用", object: "db.admin", operator: "active", params: { emailFrom: "data.email" } },
      { id: "db.freeze_target.available", title: "存在可构造冻结起点的目标", object: "db.freeze_target", operator: "available" },
      {
        id: "db.freeze_result.absent",
        title: "冻结前置指标不存在",
        object: "db.result",
        operator: "absent",
        params: { titleFrom: "data.freezeResultTitle" },
      },
      { id: "session.unauthenticated", title: "后端 session 未登录", object: "auth.session", operator: "unauthenticated" },
      { id: "cookie.absent", title: "浏览器不存在登录 cookie", object: "browser.cookie", operator: "absent" },
      { id: "storage.empty", title: "浏览器 storage 不含登录态", object: "browser.auth_storage", operator: "empty" },
    ],
  },

  Setup: {
    description: "准备可冻结的重估目标，登录管理员并进入所有挑战视图",
    steps: [
      { id: "browser.clear", title: "清理浏览器状态", object: "browser", operator: "clear_state" },
      {
        id: "db.freeze_target.select",
        title: "选择可构造冻结起点的目标",
        object: "db.freeze_target",
        operator: "select",
        params: { saveAs: "freezeTarget" },
      },
      {
        id: "db.freeze_target.original_state_recorded",
        title: "记录目标原始状态",
        object: "db.freeze_target",
        operator: "original_state_recorded",
        params: { targetFrom: "runtime.freezeTarget" },
      },
      {
        id: "db.freeze_target.prepare",
        title: "准备目标为重估状态",
        object: "db.freeze_target",
        operator: "prepare",
        params: { targetFrom: "runtime.freezeTarget" },
      },
      {
        id: "db.freeze_result.create",
        title: "准备冻结前置指标",
        object: "db.freeze_result",
        operator: "create",
        params: {
          targetFrom: "runtime.freezeTarget",
          titleFrom: "data.freezeResultTitle",
          metricNameFrom: "data.freezeMetricName",
          saveAs: "freezeResult",
        },
      },
      { id: "page.goto.auth", title: "打开登录页", object: "page", operator: "goto", params: { path: "/auth" } },
      { id: "fill.email", title: "输入管理员邮箱", object: "page", operator: "fill", params: { label: "Email", valueFrom: "data.email" } },
      {
        id: "fill.password",
        title: "输入管理员密码",
        object: "page",
        operator: "fill",
        params: { label: "Password", exact: true, valueFrom: "data.password" },
      },
      { id: "click.sign_in", title: "点击登录按钮", object: "page", operator: "click", params: { role: "button", name: "Sign In" } },
      {
        id: "session.admin.authenticated",
        title: "等待管理员 session 已登录",
        object: "auth.session",
        operator: "authenticated",
        params: { emailFrom: "data.email", roleFrom: "data.role", status: "active" },
      },
      { id: "page.goto.tasks", title: "打开挑战工作台", object: "page", operator: "goto", params: { path: "/tasks" } },
      { id: "scope.all", title: "切换到所有挑战视图", object: "page", operator: "click", params: { role: "button", name: "所有挑战" } },
    ],
  },

  S0: {
    description: "管理员已登录并位于挑战工作台，目标可见且冻结操作可用",
    assertions: [
      {
        id: "session.admin.authenticated",
        title: "后端 session 已登录",
        object: "auth.session",
        operator: "authenticated",
        params: { emailFrom: "data.email", roleFrom: "data.role", status: "active" },
      },
      { id: "url.tasks", title: "当前页面是挑战工作台", object: "page.url", operator: "match", params: { pattern: "/tasks$" } },
      {
        id: "freeze_target.visible",
        title: "目标面板可见",
        object: "page.freeze_target",
        operator: "visible",
        params: { targetFrom: "runtime.freezeTarget" },
      },
      {
        id: "freeze_target.freeze.enabled",
        title: "目标冻结操作可点击",
        object: "page.freeze_target",
        operator: "freeze_enabled",
        params: { targetFrom: "runtime.freezeTarget" },
      },
      {
        id: "db.freeze_target.reestimating",
        title: "目标处于重估状态",
        object: "db.freeze_target",
        operator: "reestimating",
        params: { targetFrom: "runtime.freezeTarget" },
      },
      {
        id: "db.freeze_result.present",
        title: "目标存在冻结前置指标",
        object: "db.freeze_result",
        operator: "present",
        params: { targetFrom: "runtime.freezeTarget", resultFrom: "runtime.freezeResult" },
      },
    ],
  },

  Action: {
    description: "管理员通过页面冻结目标",
    steps: [
      {
        id: "capture.freeze_response",
        title: "监听冻结目标请求",
        object: "api.objective_freeze",
        operator: "capture_response",
        params: { targetFrom: "runtime.freezeTarget", saveAs: "freezeResponse" },
      },
      {
        id: "click.freeze",
        title: "点击冻结目标",
        object: "page.freeze_target",
        operator: "freeze",
        params: { targetFrom: "runtime.freezeTarget" },
      },
      {
        id: "freeze_response.record",
        title: "记录冻结后的目标",
        object: "api.objective_freeze_response",
        operator: "record_objective",
        params: { responseFrom: "runtime.freezeResponse", saveAs: "frozenObjective" },
      },
    ],
  },

  S1: {
    description: "目标已经冻结并显示为实施阶段状态，管理员仍保持登录",
    assertions: [
      {
        id: "freeze_response.ok",
        title: "冻结目标接口响应成功",
        object: "api.response",
        operator: "ok",
        params: { responseFrom: "runtime.freezeResponse", status: 200 },
      },
      {
        id: "frozen_objective.matches",
        title: "冻结目标接口返回内容正确",
        object: "api.objective_freeze_response",
        operator: "matches",
        params: { objectiveFrom: "runtime.frozenObjective", targetFrom: "runtime.freezeTarget" },
      },
      {
        id: "db.freeze_target.frozen",
        title: "数据库中目标已冻结",
        object: "db.freeze_target",
        operator: "frozen",
        params: { targetFrom: "runtime.freezeTarget" },
      },
      {
        id: "page.freeze_target.frozen_status",
        title: "目标面板显示已冻结",
        object: "page.freeze_target",
        operator: "frozen_status_visible",
        params: { targetFrom: "runtime.freezeTarget" },
      },
      {
        id: "session.admin.still_authenticated",
        title: "管理员仍保持登录",
        object: "auth.session",
        operator: "authenticated",
        params: { emailFrom: "data.email", roleFrom: "data.role", status: "active" },
      },
    ],
  },

  Clean: {
    description: "删除冻结前置指标，恢复目标原始状态并退出登录",
    steps: [
      {
        id: "db.freeze_result.delete",
        title: "删除冻结前置指标",
        object: "db.freeze_result",
        operator: "delete",
        params: { titleFrom: "data.freezeResultTitle", resultFrom: "runtime.freezeResult" },
      },
      {
        id: "db.freeze_target.restore",
        title: "恢复目标原始状态",
        object: "db.freeze_target",
        operator: "restore",
        params: { targetFrom: "runtime.freezeTarget" },
      },
      { id: "auth.logout", title: "退出当前登录态", object: "auth", operator: "logout" },
      { id: "browser.clear", title: "清理浏览器状态", object: "browser", operator: "clear_state" },
      {
        id: "ory.admin_identity.exists",
        title: "管理员 Ory 身份仍然存在",
        object: "ory.identity",
        operator: "exists",
        params: { emailFrom: "data.email" },
      },
      { id: "db.admin.active", title: "预置管理员账号仍然可用", object: "db.admin", operator: "active", params: { emailFrom: "data.email" } },
    ],
  },
} satisfies StateCaseSpec<AdminFreezeObjectiveCaseData>;
