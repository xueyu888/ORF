import { expect, test } from "@playwright/test";
import { initialOrfState } from "../../src/data/initialOrfState";
import type { BountyHallData } from "../../src/state/apiClient";
import type { Evidence, Feedback, Objective, OrfState, Result, Task } from "../../src/types/orf";

function taskManagementData(tasks: Task[] = initialOrfState.tasks) {
  return {
    objectives: initialOrfState.objectives,
    results: initialOrfState.results,
    tasks,
    evidence: initialOrfState.evidence,
    feedback: initialOrfState.feedback,
    comments: initialOrfState.comments,
    permissionRules: initialOrfState.permissionRules,
  };
}

function taskManagementDataWith(overrides: Partial<Pick<OrfState, "objectives" | "results" | "tasks" | "evidence" | "feedback" | "comments" | "permissionRules">>) {
  return {
    objectives: initialOrfState.objectives,
    results: initialOrfState.results,
    tasks: initialOrfState.tasks,
    evidence: initialOrfState.evidence,
    feedback: initialOrfState.feedback,
    comments: initialOrfState.comments,
    permissionRules: initialOrfState.permissionRules,
    ...overrides,
  };
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());

  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({ json: { authenticated: true, user: initialOrfState.users[0] } });
  });
  await page.route("**/api/permissions", async (route) => {
    await route.fulfill({ json: { permissionRules: initialOrfState.permissionRules } });
  });
  await page.route("**/api/users", async (route) => {
    await route.fulfill({ json: { users: initialOrfState.users } });
  });
});

test("does not show bundled business data when task data API fails", async ({ page }) => {
  await page.route("**/api/tasks-page", async (route) => {
    await route.fulfill({ status: 503, json: { error: "task data unavailable" } });
  });
  await page.route("**/api/bounties", async (route) => {
    await route.fulfill({ status: 503, json: { error: "bounty data unavailable" } });
  });

  await page.goto("/bounties");

  await expect(page.getByRole("heading", { name: "悬赏大厅" })).toBeVisible();
  await expect(page.getByText("RAG 检索 Recall@5 达到 85%")).toHaveCount(0);
  await expect(page.getByText("当前周期 · 暂无周期")).toBeVisible();
  await expect(page.getByText("当前周期 · 全部周期")).toHaveCount(0);
  await expect(page.getByText("悬赏目标 0 条")).toBeVisible();
  await expect(page.getByText("当前没有可申请或待接受的悬赏目标")).toBeVisible();
});

test("bounty hall summarizes cycles from API objectives", async ({ page }) => {
  const q1Objective: Objective = {
    ...initialOrfState.objectives[0]!,
    id: "objective-bounty-q1",
    title: "真实大厅 Q1",
    cycle: "2999 Q1",
  };
  const q2Objective: Objective = {
    ...initialOrfState.objectives[0]!,
    id: "objective-bounty-q2",
    title: "真实大厅 Q2",
    cycle: "2999 Q2",
  };
  const bounties: BountyHallData = {
    availableItems: [],
    recruitmentItems: [],
    objectiveOptions: [q1Objective, q2Objective],
    contribution: { points: 0 },
  };

  await page.route("**/api/tasks-page", async (route) => {
    await route.fulfill({ json: taskManagementDataWith({ objectives: [], results: [], tasks: [], feedback: [] }) });
  });
  await page.route("**/api/bounties", async (route) => {
    await route.fulfill({ json: bounties });
  });

  await page.goto("/bounties");

  await expect(page.getByRole("heading", { name: "悬赏大厅" })).toBeVisible();
  await expect(page.getByText("当前周期 · 2999 Q2 等 2 个周期")).toBeVisible();
  await expect(page.getByText("当前周期 · 2999 Q1")).toHaveCount(0);
});

test("reports page shows an empty leaderboard state without point ledger", async ({ page }) => {
  await page.route("**/api/tasks-page", async (route) => {
    await route.fulfill({ json: taskManagementDataWith({ objectives: [], results: [], tasks: [], feedback: [] }) });
  });

  await page.goto("/reports");

  await expect(page.getByRole("heading", { name: "ORF 飞升战力榜" })).toBeVisible();
  await expect(page.getByText("暂无积分记录")).toBeVisible();
});

test("command menu does not expose the auth route inside the authenticated app", async ({ page }) => {
  await page.route("**/api/tasks-page", async (route) => {
    await route.fulfill({ json: taskManagementDataWith({ objectives: [], results: [], tasks: [], feedback: [] }) });
  });

  await page.goto("/tasks");
  await page.getByRole("button", { name: "搜索目标、指标、行动项、反馈..." }).click();

  const menu = page.locator(".orf-draggable-floating");
  await expect(menu).toBeVisible();
  await expect(menu.getByText("悬赏大厅")).toBeVisible();
  await expect(menu.getByText("注册登录")).toHaveCount(0);
});

test("ignores stale business data in legacy localStorage", async ({ page }) => {
  await page.addInitScript((state) => {
    window.localStorage.setItem("orf-flow-state-v3", JSON.stringify(state));
  }, initialOrfState);
  await page.route("**/api/tasks-page", async (route) => {
    await route.fulfill({ status: 503, json: { error: "task data unavailable" } });
  });
  await page.route("**/api/bounties", async (route) => {
    await route.fulfill({ status: 503, json: { error: "bounty data unavailable" } });
  });

  await page.goto("/bounties");

  await expect(page.getByRole("heading", { name: "悬赏大厅" })).toBeVisible();
  await expect(page.getByText("RAG 检索 Recall@5 达到 85%")).toHaveCount(0);
  await expect(page.getByText("悬赏目标 0 条")).toBeVisible();
  await expect(page.getByText("当前没有可申请或待接受的悬赏目标")).toBeVisible();
});

test("keeps task status unchanged until the API write succeeds and refreshed data arrives", async ({ page }) => {
  let tasks = structuredClone(initialOrfState.tasks);
  let failNextStatusWrite = true;

  await page.route("**/api/tasks-page", async (route) => {
    await route.fulfill({ json: taskManagementData(tasks) });
  });
  await page.route("**/api/tasks/ORF-128/status", async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.fallback();
      return;
    }

    if (failNextStatusWrite) {
      failNextStatusWrite = false;
      await route.fulfill({ status: 500, json: { error: "forced status failure" } });
      return;
    }

    const body = route.request().postDataJSON() as { status: Task["status"] };
    tasks = tasks.map((task) => (task.id === "ORF-128" ? { ...task, status: body.status, updatedAt: "2026-05-14" } : task));
    await route.fulfill({ json: { ok: true } });
  });

  await page.goto("/objectives/obj-engineering/results/res-rag-recall");

  const taskRow = page.locator(".orf-table-row", { hasText: "构建 RAG 召回评估脚本" });
  const statusSelect = taskRow.locator("select");
  await expect(statusSelect).toHaveValue("In Progress");

  await statusSelect.selectOption("Done");
  await expect(statusSelect).toHaveValue("In Progress");
  await expect(page.getByText("forced status failure")).toBeVisible();

  await statusSelect.selectOption("Done");
  await expect(statusSelect).toHaveValue("Done");
});

test("dashboard renders only API-derived state without demo offsets", async ({ page }) => {
  const user = initialOrfState.users[0]!;
  const feedback: Feedback = {
    ...initialOrfState.feedback[0]!,
    id: "feedback-live-dashboard",
    status: "New",
    impact: "High",
    causeCategories: ["真实风险原因"],
    linkedObjectiveId: "objective-missing-from-dashboard",
    linkedResultId: "result-missing-from-dashboard",
  };
  const task: Task = {
    ...initialOrfState.tasks[0]!,
    id: "task-live-dashboard",
    title: "处理真实 Dashboard 待办",
    assignee: user.name,
    status: "Todo",
    dueDate: "2999-01-10",
  };

  await page.route("**/api/tasks-page", async (route) => {
    await route.fulfill({
      json: taskManagementDataWith({
        objectives: [],
        results: [],
        tasks: [task],
        feedback: [feedback],
      }),
    });
  });

  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "ORF 仪表盘" })).toBeVisible();
  await expect(page.getByText("暂无周期")).toBeVisible();
  await expect(page.getByText("2026 Q2")).toHaveCount(0);
  const metricSection = page.locator("section").first();
  await expect(metricSection.locator(".orf-card-padding", { hasText: "待处理反馈" }).locator(".text-3xl")).toHaveText("1");
  await expect(metricSection.locator(".orf-card-padding", { hasText: "工程信心" }).locator(".text-3xl")).toHaveText("0%");
  await expect(page.getByText("1 个高影响信号")).toBeVisible();
  await expect(page.getByText("真实风险原因")).toHaveCount(2);
  await expect(page.getByText("处理真实 Dashboard 待办")).toBeVisible();
  await expect(page.getByText("NaN%")).toHaveCount(0);
  await expect(page.getByText("较上周减少 2 个")).toHaveCount(0);
  await expect(page.getByText("较上次周度更新 +6%")).toHaveCount(0);
  await expect(page.getByText("更新 2 个指标")).toHaveCount(0);
  await expect(page.getByText("评审 3 条反馈")).toHaveCount(0);
  await expect(page.getByText("关闭 4 个行动项")).toHaveCount(0);
  await expect(page.getByText("准备周度更新")).toHaveCount(0);
});

test("AI evaluation summary does not render hardcoded metrics without eval runs", async ({ page }) => {
  await page.route("**/api/tasks-page", async (route) => {
    await route.fulfill({
      json: taskManagementDataWith({
        objectives: [],
        results: [],
        tasks: [],
        feedback: [],
      }),
    });
  });

  await page.goto("/ai-evaluation");

  await expect(page.getByRole("heading", { name: "AI 评估" })).toBeVisible();
  await expect(page.getByText("暂无评估运行。")).toBeVisible();
  await expect(page.getByText("暂无评估场景。")).toBeVisible();
  await expect(page.getByText("暂无失败样本。")).toBeVisible();
  await expect(page.getByText("4.2s")).toHaveCount(0);
  await expect(page.getByText("$0.038")).toHaveCount(0);
  await expect(page.getByText("82%")).toHaveCount(0);
  await expect(page.getByText("6.5%")).toHaveCount(0);
  await expect(page.getByText("91%")).toHaveCount(0);
});

test("objective evaluation tab does not render hardcoded metrics without eval runs", async ({ page }) => {
  const objective: Objective = {
    ...initialOrfState.objectives[0]!,
    id: "objective-eval-empty",
    title: "真实评估空态目标",
    resultIds: ["result-eval-empty"],
    feedbackIds: [],
    taskIds: [],
  };
  const result: Result = {
    ...initialOrfState.results[0]!,
    id: "result-eval-empty",
    objectiveId: objective.id,
    current: 1,
    target: 2,
    trend: [],
  };

  await page.route("**/api/tasks-page", async (route) => {
    await route.fulfill({
      json: taskManagementDataWith({
        objectives: [objective],
        results: [result],
        tasks: [],
        feedback: [],
      }),
    });
  });

  await page.goto(`/objectives/${objective.id}`);
  await page.getByRole("button", { name: "评估" }).click();

  await expect(page.getByText("暂无关联评估运行。")).toBeVisible();
  await expect(page.getByText("4.2s")).toHaveCount(0);
  await expect(page.getByText("$0.038")).toHaveCount(0);
  await expect(page.getByText("82%")).toHaveCount(0);
  await expect(page.getByText("6.5%")).toHaveCount(0);
});

test("objective overview shows an empty related AI systems state without linked records", async ({ page }) => {
  const objective: Objective = {
    ...initialOrfState.objectives[0]!,
    id: "objective-ai-system-empty",
    title: "真实 AI 系统空态目标",
    resultIds: ["result-ai-system-empty"],
    feedbackIds: [],
    taskIds: [],
  };
  const result: Result = {
    ...initialOrfState.results[0]!,
    id: "result-ai-system-empty",
    objectiveId: objective.id,
    title: "真实 AI 系统空态指标",
    evidenceIds: [],
    feedbackIds: [],
    taskIds: [],
  };

  await page.route("**/api/tasks-page", async (route) => {
    await route.fulfill({
      json: taskManagementDataWith({
        objectives: [objective],
        results: [result],
        tasks: [],
        evidence: [],
        feedback: [],
      }),
    });
  });

  await page.goto(`/objectives/${objective.id}`);

  await expect(page.getByText("暂无关联 AI 系统。")).toBeVisible();
  await expect(page.getByText("RAG 服务")).toHaveCount(0);
  await expect(page.getByText("Agent 运行时")).toHaveCount(0);
  await expect(page.getByText("评估流水线")).toHaveCount(0);
  await expect(page.getByText("权限审计")).toHaveCount(0);
});

test("objective overview derives related AI systems from linked evidence", async ({ page }) => {
  const objective: Objective = {
    ...initialOrfState.objectives[0]!,
    id: "objective-ai-system-live",
    title: "真实 AI 系统关联目标",
    resultIds: ["result-ai-system-live"],
    feedbackIds: [],
    taskIds: [],
  };
  const result: Result = {
    ...initialOrfState.results[0]!,
    id: "result-ai-system-live",
    objectiveId: objective.id,
    title: "真实 AI 系统关联指标",
    evidenceIds: ["evidence-ai-system-live", "evidence-ai-system-log"],
    feedbackIds: [],
    taskIds: [],
  };
  const evidence: Evidence[] = [
    {
      ...initialOrfState.evidence[0]!,
      id: "evidence-ai-system-live",
      title: "真实评估证据",
      linkedResultId: result.id,
      source: "真实评估流水线",
    },
    {
      ...initialOrfState.evidence[0]!,
      id: "evidence-ai-system-log",
      title: "真实日志证据",
      linkedResultId: result.id,
      source: "真实日志平台",
    },
    {
      ...initialOrfState.evidence[0]!,
      id: "evidence-ai-system-unrelated",
      title: "无关证据",
      linkedResultId: "result-ai-system-unrelated",
      source: "无关演示系统",
    },
  ];

  await page.route("**/api/tasks-page", async (route) => {
    await route.fulfill({
      json: taskManagementDataWith({
        objectives: [objective],
        results: [result],
        tasks: [],
        evidence,
        feedback: [],
      }),
    });
  });

  await page.goto(`/objectives/${objective.id}`);

  await expect(page.getByText("真实评估流水线")).toBeVisible();
  await expect(page.getByText("真实日志平台")).toBeVisible();
  await expect(page.getByText("无关演示系统")).toHaveCount(0);
  await expect(page.getByText("RAG 服务")).toHaveCount(0);
  await expect(page.getByText("Agent 运行时")).toHaveCount(0);
  await expect(page.getByText("权限审计")).toHaveCount(0);
});

test("objective detail tabs show explicit empty states for empty live records", async ({ page }) => {
  const objective: Objective = {
    ...initialOrfState.objectives[0]!,
    id: "objective-detail-empty-states",
    title: "真实详情空态目标",
    resultIds: [],
    feedbackIds: [],
    taskIds: [],
  };

  await page.route("**/api/tasks-page", async (route) => {
    await route.fulfill({
      json: taskManagementDataWith({
        objectives: [objective],
        results: [],
        tasks: [],
        evidence: [],
        feedback: [],
      }),
    });
  });

  await page.goto(`/objectives/${objective.id}`);

  await expect(page.getByText("暂无指标。")).toBeVisible();
  await expect(page.getByText("暂无反馈记录。")).toBeVisible();
  await expect(page.getByText("暂无开放风险。")).toBeVisible();

  await page.getByRole("button", { name: "指标", exact: true }).click();
  await expect(page.getByText("暂无指标。")).toBeVisible();

  await page.getByRole("button", { name: "行动项", exact: true }).click();
  await expect(page.getByText("暂无行动项。")).toBeVisible();

  await page.getByRole("button", { name: "反馈", exact: true }).click();
  await expect(page.getByText("暂无反馈。", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "决策", exact: true }).click();
  await expect(page.getByText("暂无决策记录。")).toBeVisible();
});

test("feedback inbox derives insights from API feedback instead of bundled categories", async ({ page }) => {
  const objective: Objective = {
    ...initialOrfState.objectives[0]!,
    id: "objective-feedback-live",
    title: "真实反馈目标",
    resultIds: ["result-feedback-live"],
    feedbackIds: ["feedback-live-risk", "feedback-live-empty", "feedback-live-closed"],
    taskIds: [],
  };
  const result: Result = {
    ...initialOrfState.results[0]!,
    id: "result-feedback-live",
    objectiveId: objective.id,
    title: "真实反馈指标",
    feedbackIds: objective.feedbackIds,
  };
  const feedback: Feedback[] = [
    {
      ...initialOrfState.feedback[0]!,
      id: "feedback-live-risk",
      phenomenon: "真实高影响反馈",
      impact: "High",
      status: "New",
      causeCategories: ["真实风险原因"],
      linkedObjectiveId: objective.id,
      linkedResultId: result.id,
    },
    {
      ...initialOrfState.feedback[0]!,
      id: "feedback-live-empty",
      phenomenon: "真实未分类反馈",
      impact: "Medium",
      status: "Reviewing",
      causeCategories: [],
      linkedObjectiveId: objective.id,
      linkedResultId: result.id,
    },
    {
      ...initialOrfState.feedback[0]!,
      id: "feedback-live-closed",
      phenomenon: "真实已关闭反馈",
      impact: "Critical",
      status: "Closed",
      causeCategories: ["真实风险原因", "真实系统原因"],
      linkedObjectiveId: objective.id,
      linkedResultId: result.id,
      createdAt: "2999-01-01T00:00:00.000Z",
      updatedAt: "2999-01-02T12:00:00.000Z",
    },
  ];

  await page.route("**/api/tasks-page", async (route) => {
    await route.fulfill({
      json: taskManagementDataWith({
        objectives: [objective],
        results: [result],
        tasks: [],
        feedback,
      }),
    });
  });

  await page.goto("/feedback");

  await expect(page.getByRole("heading", { name: "反馈收件箱" })).toBeVisible();
  const insights = page.locator(".orf-card-padding", { hasText: "洞察面板" });
  await expect(insights.getByText("高影响反馈")).toBeVisible();
  await expect(insights.getByText("平均响应时间")).toBeVisible();
  await expect(insights.getByText("36h")).toBeVisible();
  await expect(insights.locator("span.font-medium", { hasText: "真实风险原因" })).toBeVisible();
  await expect(page.getByText("18h")).toHaveCount(0);
  await expect(page.getByText("检索问题")).toHaveCount(0);

  await page.locator("select").first().selectOption("真实系统原因");
  await expect(page.getByText("真实已关闭反馈")).toBeVisible();
  await expect(page.getByText("真实高影响反馈")).toHaveCount(0);
});

test("strategy map renders only API-derived strategy nodes", async ({ page }) => {
  const objective: Objective = {
    ...initialOrfState.objectives[0]!,
    id: "objective-strategy-live",
    title: "真实策略目标",
    cycle: "2999 Q3",
    progress: 80,
    challengers: ["真实挑战者"],
    resultIds: ["result-strategy-live"],
    taskIds: ["task-strategy-live"],
  };
  const result: Result = {
    ...initialOrfState.results[0]!,
    id: "result-strategy-live",
    objectiveId: objective.id,
    title: "真实策略指标",
    confidence: 70,
  };
  const task: Task = {
    ...initialOrfState.tasks[0]!,
    id: "task-strategy-live",
    title: "真实策略行动项",
    linkedObjectiveId: objective.id,
    linkedResultId: result.id,
    status: "In Review",
  };

  await page.route("**/api/tasks-page", async (route) => {
    await route.fulfill({
      json: taskManagementDataWith({
        objectives: [objective],
        results: [result],
        tasks: [task],
        feedback: [],
      }),
    });
  });

  await page.goto("/strategy-map");

  await expect(page.getByRole("heading", { name: "策略地图" })).toBeVisible();
  await expect(page.getByText("建立可靠的 AI 应用交付能力")).toHaveCount(0);
  await expect(page.getByText("评估优先")).toHaveCount(0);
  await expect(page.getByText("真实策略目标")).toBeVisible();
  await expect(page.getByText("真实策略指标")).toBeVisible();
  await page.getByRole("button", { name: /真实策略行动项/ }).click();
  await expect(page.locator(".orf-card-padding").last().getByText("80%")).toBeVisible();
  await expect(page.getByText("45%")).toHaveCount(0);
});

test("strategy map shows an empty state when the API has no strategy records", async ({ page }) => {
  await page.route("**/api/tasks-page", async (route) => {
    await route.fulfill({
      json: taskManagementDataWith({
        objectives: [],
        results: [],
        tasks: [],
        feedback: [],
      }),
    });
  });

  await page.goto("/strategy-map");

  await expect(page.getByRole("heading", { name: "策略地图" })).toBeVisible();
  await expect(page.getByText("暂无策略地图数据")).toBeVisible();
  await expect(page.getByText("建立可靠的 AI 应用交付能力")).toHaveCount(0);
  await expect(page.getByText("评估优先")).toHaveCount(0);
});

test("objectives page derives cycle filters from API objectives", async ({ page }) => {
  const q1Objective: Objective = {
    ...initialOrfState.objectives[0]!,
    id: "objective-cycle-q1",
    title: "真实 Q1 目标",
    cycle: "2999 Q1",
    resultIds: [],
    feedbackIds: [],
    taskIds: [],
  };
  const q2Objective: Objective = {
    ...initialOrfState.objectives[0]!,
    id: "objective-cycle-q2",
    title: "真实 Q2 目标",
    cycle: "2999 Q2",
    resultIds: [],
    feedbackIds: [],
    taskIds: [],
  };

  await page.route("**/api/tasks-page", async (route) => {
    await route.fulfill({
      json: taskManagementDataWith({
        objectives: [q1Objective, q2Objective],
        results: [],
        tasks: [],
        feedback: [],
      }),
    });
  });

  await page.goto("/objectives");

  await expect(page.getByRole("heading", { name: "目标" })).toBeVisible();
  await expect(page.getByText("2026 Q2")).toHaveCount(0);
  await expect(page.getByText("2026 Q3 Draft")).toHaveCount(0);
  await expect(page.getByText("真实 Q1 目标")).toBeVisible();
  await expect(page.getByText("真实 Q2 目标")).toBeVisible();

  await page.locator("select").nth(1).selectOption("2999 Q2");

  await expect(page.getByText("真实 Q2 目标")).toBeVisible();
  await expect(page.getByText("真实 Q1 目标")).toHaveCount(0);
});

test("result detail derives linked records and quality checks from API relations", async ({ page }) => {
  const objective: Objective = {
    ...initialOrfState.objectives[0]!,
    id: "objective-result-quality",
    title: "真实质量目标",
    resultIds: ["result-quality-live"],
    taskIds: [],
    feedbackIds: [],
  };
  const result: Result = {
    ...initialOrfState.results[0]!,
    id: "result-quality-live",
    objectiveId: objective.id,
    title: "真实质量指标",
    metricRequirement: "",
    statisticalObject: "",
    completionStandard: "",
    sampleSet: "",
    measurementScope: "",
    taskIds: [],
    feedbackIds: [],
  };
  const task: Task = {
    ...initialOrfState.tasks[0]!,
    id: "task-quality-live",
    title: "真实关联行动项",
    linkedObjectiveId: objective.id,
    linkedResultId: result.id,
  };
  const feedback: Feedback = {
    ...initialOrfState.feedback[0]!,
    id: "feedback-quality-live",
    phenomenon: "真实关联反馈",
    linkedObjectiveId: objective.id,
    linkedResultId: result.id,
  };

  await page.route("**/api/tasks-page", async (route) => {
    await route.fulfill({
      json: taskManagementDataWith({
        objectives: [objective],
        results: [result],
        tasks: [task],
        feedback: [feedback],
      }),
    });
  });

  await page.goto(`/objectives/${objective.id}/results/${result.id}`);

  await expect(page.getByRole("heading", { name: "真实质量指标" })).toBeVisible();
  await expect(page.getByText("真实关联行动项")).toBeVisible();
  await expect(page.getByText("真实关联反馈")).toBeVisible();
  const quality = page.locator(".orf-card-padding", { hasText: "ORF 质量检查" });
  await expect(quality.locator("div.flex", { hasText: "反馈已更新" }).getByText("通过")).toBeVisible();
  await expect(quality.locator("div.flex", { hasText: "有行动项支撑" }).getByText("通过")).toBeVisible();
  await expect(quality.locator("div.flex", { hasText: "口径清楚" }).getByText("待补")).toBeVisible();
});

test("tasks page cycle filter is functional and API-derived", async ({ page }) => {
  const q1Objective: Objective = {
    ...initialOrfState.objectives[0]!,
    id: "objective-task-q1",
    title: "真实挑战 Q1",
    cycle: "2999 Q1",
    resultIds: ["result-task-q1"],
    taskIds: [],
    feedbackIds: [],
  };
  const q2Objective: Objective = {
    ...initialOrfState.objectives[0]!,
    id: "objective-task-q2",
    title: "真实挑战 Q2",
    cycle: "2999 Q2",
    resultIds: ["result-task-q2"],
    taskIds: [],
    feedbackIds: [],
  };
  const q1Result: Result = {
    ...initialOrfState.results[0]!,
    id: "result-task-q1",
    objectiveId: q1Objective.id,
    title: "真实挑战指标 Q1",
  };
  const q2Result: Result = {
    ...initialOrfState.results[0]!,
    id: "result-task-q2",
    objectiveId: q2Objective.id,
    title: "真实挑战指标 Q2",
  };
  const taskData = taskManagementDataWith({
    objectives: [q1Objective, q2Objective],
    results: [q1Result, q2Result],
    tasks: [],
    feedback: [],
  });

  await page.route("**/api/tasks-page", async (route) => {
    await route.fulfill({ json: taskData });
  });
  await page.route("**/api/my-challenges?scope=all", async (route) => {
    await route.fulfill({ json: taskData });
  });

  await page.goto("/tasks");

  await expect(page.getByRole("button", { name: "筛选" })).toHaveCount(0);
  await expect(page.getByText("真实挑战 Q1")).toBeVisible();
  await expect(page.getByText("真实挑战 Q2")).toBeVisible();

  await page.getByLabel("挑战周期").selectOption("2999 Q2");

  await expect(page.getByText("真实挑战 Q2")).toBeVisible();
  await expect(page.getByText("真实挑战 Q1")).toHaveCount(0);
});

test("feedback detail recommendation actions are real commands", async ({ page }) => {
  const objective: Objective = {
    ...initialOrfState.objectives[0]!,
    id: "objective-feedback-actions",
    title: "真实反馈动作目标",
    resultIds: ["result-feedback-actions"],
    feedbackIds: ["feedback-actions-live"],
    taskIds: [],
  };
  const result: Result = {
    ...initialOrfState.results[0]!,
    id: "result-feedback-actions",
    objectiveId: objective.id,
    title: "真实反馈动作指标",
    feedbackIds: ["feedback-actions-live"],
  };
  const feedback: Feedback = {
    ...initialOrfState.feedback[0]!,
    id: "feedback-actions-live",
    phenomenon: "真实反馈动作",
    linkedObjectiveId: objective.id,
    linkedResultId: result.id,
  };

  await page.route("**/api/tasks-page", async (route) => {
    await route.fulfill({
      json: taskManagementDataWith({
        objectives: [objective],
        results: [result],
        tasks: [],
        feedback: [feedback],
      }),
    });
  });

  await page.goto(`/feedback/${feedback.id}`);

  await expect(page.getByRole("heading", { name: feedback.id })).toBeVisible();
  await expect(page.getByText("补充回归样本")).toHaveCount(0);
  await page.getByRole("button", { name: "创建执行行动项" }).click();
  await expect(page.getByText("新建行动项")).toBeVisible();
});

test("feedback detail shows explicit empty states for sparse live records", async ({ page }) => {
  const feedback: Feedback = {
    ...initialOrfState.feedback[0]!,
    id: "feedback-empty-detail",
    phenomenon: "真实空态反馈",
    evidenceIds: [],
    causeCategories: [],
    linkedObjectiveId: "objective-missing-for-feedback",
    linkedResultId: "result-missing-for-feedback",
    suggestedAdjustment: "",
    activity: [],
  };

  await page.route("**/api/tasks-page", async (route) => {
    await route.fulfill({
      json: taskManagementDataWith({
        objectives: [],
        results: [],
        tasks: [],
        evidence: [],
        feedback: [feedback],
      }),
    });
  });

  await page.goto(`/feedback/${feedback.id}`);

  await expect(page.getByRole("heading", { name: feedback.id })).toBeVisible();
  await expect(page.getByText("暂无佐证材料。")).toBeVisible();
  await expect(page.getByText("暂无原因分类。")).toBeVisible();
  await expect(page.getByText("暂无建议调整。")).toBeVisible();
  await expect(page.getByText("暂无活动记录。")).toBeVisible();
  await expect(page.getByText("未找到关联目标")).toBeVisible();
  await expect(page.getByText("未找到关联指标")).toBeVisible();
});
