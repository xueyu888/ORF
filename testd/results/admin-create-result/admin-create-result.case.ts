import { STATE_CASE_MODEL, type StateCaseSpec } from "../../_framework/types";
import type { AdminCreateResultCaseData } from "./_support/admin-create-result.context";

export const adminCreateResultCase = {
  id: "results.create.admin",
  title: "管理员可以新增指标",
  model: STATE_CASE_MODEL,
  tags: ["results", "create", "admin", "happy-path"],

  data: {
    email: "zrx831@gmail.com",
    password: "123123123",
    role: "admin",
    resultTitle: "E2E-RESULT-CREATE: 管理员新增指标",
    metricName: "E2E 管理员新增指标完成率",
  },

  B: {
    description: "系统服务、Ory、数据库和预置管理员可用，当前浏览器未登录且测试指标不存在",
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
      { id: "db.result_target.available", title: "存在允许管理员新增指标的目标", object: "db.result_target", operator: "available" },
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
    description: "登录管理员，选择可新增指标的目标并进入所有挑战视图",
    steps: [
      { id: "browser.clear", title: "清理浏览器状态", object: "browser", operator: "clear_state" },
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
      {
        id: "db.result_target.select",
        title: "选择可新增指标的目标",
        object: "db.result_target",
        operator: "select",
        params: { saveAs: "resultTarget" },
      },
      { id: "page.goto.tasks", title: "打开挑战工作台", object: "page", operator: "goto", params: { path: "/tasks" } },
      { id: "scope.all", title: "切换到所有挑战视图", object: "page", operator: "click", params: { role: "button", name: "所有挑战" } },
    ],
  },

  S0: {
    description: "管理员已登录并位于挑战工作台，目标可见且新增指标操作可用",
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
        id: "result_target.visible",
        title: "目标面板可见",
        object: "page.result_target",
        operator: "visible",
        params: { targetFrom: "runtime.resultTarget" },
      },
      {
        id: "result_target.add_metric.enabled",
        title: "目标新增指标操作可点击",
        object: "page.result_target",
        operator: "add_metric_enabled",
        params: { targetFrom: "runtime.resultTarget" },
      },
      {
        id: "db.result_target.can_create",
        title: "目标允许新增指标",
        object: "db.result_target",
        operator: "can_create_result",
        params: { targetFrom: "runtime.resultTarget" },
      },
      {
        id: "db.target_result.absent",
        title: "目标不存在测试指标",
        object: "db.result_target",
        operator: "result_absent",
        params: { targetFrom: "runtime.resultTarget", titleFrom: "data.resultTitle" },
      },
    ],
  },

  Action: {
    description: "管理员通过页面为目标新增测试指标",
    steps: [
      {
        id: "click.add_metric",
        title: "点击新增指标",
        object: "page.result_target",
        operator: "add_metric",
        params: { targetFrom: "runtime.resultTarget" },
      },
      {
        id: "modal.visible",
        title: "新增指标弹窗可见",
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
        id: "click.save_result",
        title: "点击保存指标",
        object: "page",
        operator: "click",
        params: { role: "button", name: "保存指标" },
      },
      {
        id: "create_result_response.record",
        title: "记录新增的指标",
        object: "api.result_create_response",
        operator: "record_result",
        params: { responseFrom: "runtime.createResultResponse", saveAs: "createdResult" },
      },
    ],
  },

  S1: {
    description: "测试指标已经持久化并显示在目标面板中，管理员仍保持登录",
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
          targetFrom: "runtime.resultTarget",
          titleFrom: "data.resultTitle",
          metricNameFrom: "data.metricName",
          source: "managerDefined",
        },
      },
      {
        id: "db.created_result.present",
        title: "数据库存在测试指标",
        object: "db.result_target",
        operator: "result_present",
        params: { targetFrom: "runtime.resultTarget", titleFrom: "data.resultTitle", metricNameFrom: "data.metricName" },
      },
      {
        id: "page.created_result.visible",
        title: "目标面板显示测试指标",
        object: "page.result_target",
        operator: "result_visible",
        params: { targetFrom: "runtime.resultTarget", resultFrom: "runtime.createdResult" },
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
    description: "删除测试指标并退出登录",
    steps: [
      {
        id: "db.result.delete",
        title: "删除测试指标",
        object: "db.result",
        operator: "delete",
        params: { titleFrom: "data.resultTitle", resultFrom: "runtime.createdResult" },
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
      {
        id: "db.result_target.can_create",
        title: "目标仍允许新增指标",
        object: "db.result_target",
        operator: "can_create_result",
        params: { targetFrom: "runtime.resultTarget" },
      },
    ],
  },
} satisfies StateCaseSpec<AdminCreateResultCaseData>;
