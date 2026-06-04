import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { ChallengeTree } from "../src/features/challenge/components/ChallengeTree";
import type { BountyNode, ChallengeRowAction, ChallengeTarget, ObjectiveNode } from "../src/features/challenge/model/types";
import type { Objective, Result, Task } from "../src/types/orf";

const date = "2026-05-20";
const metricUpdatedDate = "2026-05-21";

test("open row menu marks only its owning objective panel as foreground", () => {
  assert.doesNotMatch(renderChallengeTree(null), /data-has-open-row-menu/);

  const html = renderChallengeTree("subAction:task-alpha:check-alpha");
  const panels = objectivePanels(html);

  assert.equal(panels.length, 2);
  assert.match(panels[0]!, /Alpha Objective/);
  assert.match(panels[0]!, /data-has-open-row-menu="true"/);
  assert.match(panels[0]!, /复制链接/);

  assert.match(panels[1]!, /Beta Objective/);
  assert.doesNotMatch(panels[1]!, /data-has-open-row-menu/);
});

test("open row menu foreground state is backed by the objective panel layer rule", () => {
  const css = readFileSync("src/styles.css", "utf8");

  assert.match(
    css,
    /\.orf-objective-panel\[data-has-open-row-menu="true"\]\s*{[^}]*\bz-index:\s*\d+/s,
    "Opening a row menu must raise the whole objective panel, not only the local menu.",
  );
});

test("challenge tree renders project sections above objective panels", () => {
  const html = renderChallengeTree(null);

  assert.match(html, /class="[^"]*orf-project-header/);
  assert.match(html, /项目/);
  assert.match(html, /Alpha Project/);
  assert.match(html, /1 个目标/);
  assert.match(html, /1 个指标/);
  assert.equal(objectivePanels(html).length, 2);
});

test("fantasy select popovers escape challenge row stacking contexts", () => {
  const componentSource = readFileSync("src/components/FantasySelectMenu.tsx", "utf8");
  const css = readFileSync("src/styles.css", "utf8");

  assert.match(componentSource, /createPortal\(/, "Select menus must render their popover at the document root.");
  assert.match(css, /\.orf-fantasy-select-popover\s*{[^}]*\bposition:\s*fixed/s);
  assert.match(css, /\.orf-fantasy-select-popover\s*{[^}]*\bz-index:\s*1[2-9]\d/s);
});

test("objective deadline uses a custom ORF date picker as the edit affordance", () => {
  const html = renderChallengeTree(null, { status: "editable", mode: "edit" });
  const treeSource = readFileSync("src/features/challenge/components/ChallengeTree.tsx", "utf8");
  const pickerSource = readFileSync("src/components/FantasyDatePicker.tsx", "utf8");
  const css = readFileSync("src/styles.css", "utf8");

  assert.match(html, /role="button"/);
  assert.match(html, /title="点击修改目标截止日期"/);
  assert.match(html, /class="[^"]*orf-fantasy-date-picker/);
  assert.match(html, /aria-haspopup="dialog"/);
  assert.match(pickerSource, /createPortal\(/, "Deadline date picker popovers must escape challenge row stacking contexts.");
  assert.match(css, /\.orf-fantasy-date-popover\s*{[^}]*\bposition:\s*fixed/s);
  assert.match(css, /\.orf-fantasy-date-popover\s*{[^}]*\bz-index:\s*1[2-9]\d/s);
  assert.doesNotMatch(treeSource, /\.showPicker\(\)/);
  assert.doesNotMatch(html, /type="date"/);
  assert.doesNotMatch(html, /orf-objective-deadline-editor/);
  assert.doesNotMatch(html, /orf-objective-deadline-input/);
  assert.doesNotMatch(html, /lucide-pencil/);
});

test("result rows render updated time without a deadline-like date cell", () => {
  const treeSource = readFileSync("src/features/challenge/components/ChallengeTree.tsx", "utf8");
  const html = renderChallengeTree(null);

  assert.doesNotMatch(
    treeSource,
    /DateStack primary=\{bounty \? bounty\.updatedAt/,
    "Indicators must not project an update date as a deadline-like date cell.",
  );
  assert.match(
    treeSource,
    /<StatusChip tone=\{bounty \? bounty\.status : "open"\}>\{statusLabel\}<\/StatusChip>\s*<EmptySlot \/>\s*<TimeValue icon=\{Clock3\} value=\{bounty \? bounty\.updatedAt \|\| "未设置" : "未设置"\} \/>\s*<ProgressValue/,
    "Indicator rows should render their own updated time in the secondary time column.",
  );
  assert.match(html, new RegExp(metricUpdatedDate));
});

test("result rows use named difficulty levels and render an editable selector when allowed", () => {
  const html = renderChallengeTree(null);

  assert.match(html, /aria-label="编辑指标难度，当前 进阶"/);
  assert.match(html, /class="[^"]*orf-fantasy-select-menu-chip[^"]*orf-metric-difficulty-select/);
  assert.match(html, /data-no-row-edit="true"/);
  assert.match(html, /<span class="orf-fantasy-select-value">进阶<\/span>/);
  assert.doesNotMatch(html, /\d 星/);
});

test("result row difficulty display is permission-backed when editing is blocked", () => {
  const html = renderChallengeTree(null, { status: "blocked", reason: "noPermission" }, { status: "blocked", reason: "lifecycleLocked" });

  assert.doesNotMatch(html, /class="orf-metric-difficulty-select"/);
  assert.match(html, /title="指标已冻结，不能编辑"/);
  assert.match(html, /指标难度 进阶/);
});

test("hierarchy icon wrappers keep vertical anchors aligned", () => {
  const treeSource = readFileSync("src/features/challenge/components/ChallengeTree.tsx", "utf8");
  const sharedAnchorSlots = treeSource.match(/className="orf-hierarchy-anchor-slot flex h-7 w-7 shrink-0 items-center justify-center"/g) ?? [];
  const innerCircleOffsets = treeSource.match(/data-hierarchy-branch-end-offset="4"/g) ?? [];

  assert.equal(sharedAnchorSlots.length, 3);
  assert.equal(innerCircleOffsets.length, 2);

  assert.match(
    treeSource,
    /className="orf-hierarchy-anchor-slot flex h-7 w-7 shrink-0 items-center justify-center"[\s\S]*?data-hierarchy-branch-end-offset="0"[\s\S]*?<MetricSquareIcon/,
    "Metric anchors should use the shared hierarchy anchor slot.",
  );
  assert.match(
    treeSource,
    /className="orf-hierarchy-anchor-slot flex h-7 w-7 shrink-0 items-center justify-center"[\s\S]*?data-hierarchy-branch-end-offset="4"[\s\S]*?<CompletionCircleIcon/,
    "Action anchors should use the shared hierarchy anchor slot while ending at the inner icon center.",
  );
});

test("challenge workbench owns compact row typography through scoped CSS", () => {
  const css = readFileSync("src/styles.css", "utf8");
  const treeSource = readFileSync("src/features/challenge/components/ChallengeTree.tsx", "utf8");

  assert.match(
    css,
    /\.orf-challenge-workbench\s*{[^}]*--orf-challenge-objective-title-size:\s*16px;[^}]*--orf-challenge-row-title-size:\s*14px;/s,
    "Challenge workbench typography must stay scoped to the challenge page.",
  );
  assert.doesNotMatch(
    treeSource,
    /orf-(?:objective|result|task|subtask)-title[^"]*\btext-(?:lg|base|sm)\b/,
    "Challenge row title components must not hard-code large Tailwind font-size utilities.",
  );
});

function renderChallengeTree(
  openActionId: string | null,
  deadlineEditState = { status: "blocked", reason: "noPermission" } as const,
  metricEditAccess = { status: "allowed" } as const,
): string {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(ChallengeTree, {
        emptyText: "暂无目标",
        groups: challengeGroups(),
        handlers: rowHandlers(openActionId, deadlineEditState, metricEditAccess),
        now: new Date(`${date}T00:00:00.000Z`),
        scope: "all",
      }),
    ),
  );
}

function objectivePanels(html: string): string[] {
  return html.match(/<section\b[\s\S]*?<\/section>/g) ?? [];
}

function rowHandlers(
  openActionId: string | null,
  deadlineEditState: { status: "editable"; mode: "edit" } | { status: "blocked"; reason: "noPermission" },
  metricEditAccess: { status: "allowed" } | { status: "blocked"; reason: "notFound" | "lifecycleLocked" | "forbidden" },
) {
  const noop = () => {};
  const noopAsync = async () => false;
  const okAsync = async () => true;

  return {
    activeActionId: null,
    collapsedActionIds: new Set<string>(),
    collapsedBountyIds: new Set<string>(),
    commentCounts: new Map<string, number>(),
    trialReviews: [],
    canManageFlow: false,
    objectiveDeadlineEditState: () => deadlineEditState,
    metricEditAccess: () => metricEditAccess,
    canMutateMetrics: () => true,
    canMutateWorkItems: () => true,
    canRecruitObjective: () => false,
    currentUser: null,
    dragDrop: {
      dragItem: null,
      dropTarget: null,
      onDragEnd: noop,
      onDragStart: noop,
      onDrop: noop,
      onDropTargetChange: noop,
    },
    editingTarget: null,
    metricActionLabel: () => null,
    onActionDoneChange: noop,
    onActionRowAction: (_action: ChallengeRowAction, _target: ChallengeTarget) => {},
    onActiveActionChange: noop,
    onAddAction: noop,
    onAddBounty: noop,
    onAddSubAction: noop,
    onApproveApplication: noopAsync,
    onCancelEdit: noop,
    onEditTarget: noop,
    onFreezeObjective: noopAsync,
    onOpenActionChange: noop,
    onPublishObjective: noopAsync,
    onRecruitObjective: noop,
    onRejectApplication: noopAsync,
    onSaveObjectiveDeadline: noopAsync,
    onUnavailableObjectiveDeadline: noop,
    onSaveMetricDifficulty: okAsync,
    onUnavailableMetricEdit: noop,
    onSaveTitle: noop,
    onSubActionDoneChange: noop,
    onToggleAction: noop,
    onToggleBounty: noop,
    openActionId,
  };
}

function challengeGroups(): ObjectiveNode[] {
  const alphaTask = task({
    id: "task-alpha",
    linkedObjectiveId: "obj-alpha",
    checklist: [{ id: "check-alpha", label: "Alpha checklist", done: false, updatedAt: date }],
  });

  return [
    group(
      objective({ id: "obj-alpha", title: "Alpha Objective", projectId: "project-alpha", projectName: "Alpha Project", resultIds: ["res-alpha"], taskIds: ["task-alpha"] }),
      [alphaTask],
      bounty(result({ id: "res-alpha", objectiveId: "obj-alpha", title: "Alpha Metric" })),
    ),
    group(objective({ id: "obj-beta", title: "Beta Objective", projectId: "project-beta", projectName: "Beta Project" })),
  ];
}

function group(objectiveItem: Objective, actions: Task[] = [], ...bounties: BountyNode[]): ObjectiveNode {
  return {
    actions,
    objective: objectiveItem,
    bounties,
    challengers: [],
    deadline: objectiveItem.finalDueAt,
  };
}

function bounty(resultItem: Result): BountyNode {
  return {
    difficulty: resultItem.uncertaintyLevel ?? "待校准",
    progress: 25,
    result: resultItem,
    status: "active",
    updatedAt: metricUpdatedDate,
  };
}

function objective(overrides: Partial<Objective> = {}): Objective {
  return {
    id: "obj-alpha",
    title: "Objective",
    description: "",
    whyItMatters: "",
    cycle: "2026-Q2",
    stage: "orfReestimate",
    flowStatus: "reestimating",
    status: "On Track",
    confidence: 80,
    progress: 25,
    boundary: "",
    successDefinition: "",
    resultIds: [],
    taskIds: [],
    finalDueAt: date,
    challengers: [],
    assignedChallengers: [],
    challengeApplications: [],
    acceptedAt: null,
    confirmationDueAt: null,
    confirmedAt: null,
    lootSubmittedAt: null,
    acceptedResult: null,
    completionMultiplier: null,
    objectiveBasePoints: 0,
    objectiveSettlementPoints: null,
    createdAt: date,
    updatedAt: date,
    ...overrides,
  };
}

function result(overrides: Partial<Result> = {}): Result {
  return {
    id: "res-alpha",
    objectiveId: "obj-alpha",
    title: "Metric",
    description: "",
    metricName: "Accuracy",
    baseline: 0,
    current: 25,
    target: 100,
    unit: "%",
    direction: "increase",
    status: "On Track",
    confidence: 80,
    uncertaintyLevel: "进阶",
    uncertaintyScore: 30,
    acceptedResult: "unreviewed",
    evidenceIds: [],
    trend: [],
    reviewCadence: "Weekly",
    createdAt: date,
    updatedAt: date,
    ...overrides,
  };
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-alpha",
    title: "Action",
    description: "",
    status: "Todo",
    priority: "Medium",
    assignee: "Kai Wang",
    linkedObjectiveId: "obj-alpha",
    dueDate: date,
    tags: [],
    checklist: [],
    createdAt: date,
    updatedAt: date,
    ...overrides,
  };
}
