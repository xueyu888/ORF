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

function renderChallengeTree(openActionId: string | null): string {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(ChallengeTree, {
        emptyText: "暂无目标",
        groups: challengeGroups(),
        handlers: rowHandlers(openActionId),
        now: new Date(`${date}T00:00:00.000Z`),
        scope: "all",
      }),
    ),
  );
}

function objectivePanels(html: string): string[] {
  return html.match(/<section\b[\s\S]*?<\/section>/g) ?? [];
}

function rowHandlers(openActionId: string | null) {
  const noop = () => {};
  const noopAsync = async () => false;

  return {
    activeActionId: null,
    collapsedActionIds: new Set<string>(),
    collapsedBountyIds: new Set<string>(),
    commentCounts: new Map<string, number>(),
    contributionReviews: [],
    canManageFlow: false,
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
    linkedResultId: "res-alpha",
    checklist: [{ id: "check-alpha", label: "Alpha checklist", done: false, updatedAt: date }],
  });

  return [
    group(
      objective({ id: "obj-alpha", title: "Alpha Objective", resultIds: ["res-alpha"], taskIds: ["task-alpha"] }),
      bounty(result({ id: "res-alpha", objectiveId: "obj-alpha", title: "Alpha Metric" }), [alphaTask]),
    ),
    group(objective({ id: "obj-beta", title: "Beta Objective" })),
  ];
}

function group(objectiveItem: Objective, ...bounties: BountyNode[]): ObjectiveNode {
  return {
    objective: objectiveItem,
    bounties,
    challengers: [],
    deadline: objectiveItem.finalDueAt,
  };
}

function bounty(resultItem: Result, actions: Task[] = []): BountyNode {
  return {
    actions,
    deadline: date,
    difficulty: "3 星",
    progress: 25,
    result: resultItem,
    status: "active",
    updatedAt: date,
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
    feedbackIds: [],
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
    uncertaintyScore: 30,
    acceptedResult: "unreviewed",
    evidenceIds: [],
    taskIds: [],
    feedbackIds: [],
    trend: [],
    reviewCadence: "Weekly",
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
    linkedResultId: "res-alpha",
    dueDate: date,
    tags: [],
    checklist: [],
    createdAt: date,
    updatedAt: date,
    ...overrides,
  };
}
