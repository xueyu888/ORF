import { clsx } from "clsx";
import {
  ChevronRight,
  ExternalLink,
  ListChecks,
  ListTodo,
  Plus,
  Search,
  X,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { IconButton } from "../../components/ui";
import { isObjectiveChallenger } from "../../domain/orfObjectiveParticipants";
import type { Objective, OrfUser, Task, TaskChecklistItem } from "../../types/orf";
import { buildChallengeTree } from "../challenge/model/challengeTreeModel";
import {
  challengeStatusFilterOptions,
  filterChallengeGroups,
  normalizeChallengeStatusFilterSelection,
  sortChallengeGroups,
  type ChallengeProjectFilter,
  type ChallengeStatusFilter,
} from "../challenge/model/challengeFilters";
import type { ObjectiveNode } from "../challenge/model/types";
import {
  workItemMutationAccessForObjective,
  workItemMutationUnavailableMessage,
} from "../challenge/model/orfFlowCapabilities";
import { useOrf } from "../../state/OrfProvider";
import { workspaceSelectionKey, type WorkspaceSelection } from "./workspaceTypes";
import { workspaceSelectionPath } from "./workspaceLinks";

type ChallengeWorkspacePanelProps = {
  onClose: () => void;
  selection: WorkspaceSelection | null;
};

type AddActionDraft = {
  objectiveId: string;
  title: string;
};

export function ChallengeWorkspacePanel({ onClose, selection }: ChallengeWorkspacePanelProps) {
  const {
    createTask,
    currentUser,
    notify,
    setTaskCompletion,
    state,
    updateTaskChecklistItem,
  } = useOrf();
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState<ChallengeProjectFilter>("all");
  const [statusFilter, setStatusFilter] = useState<ChallengeStatusFilter>("all");
  const [mineOnly, setMineOnly] = useState(false);
  const [addActionDraft, setAddActionDraft] = useState<AddActionDraft | null>(null);
  const [pendingCompletionKey, setPendingCompletionKey] = useState("");
  const [highlightedKey, setHighlightedKey] = useState("");
  const highlightTimerRef = useRef<number | null>(null);
  const selectionKey = workspaceSelectionKey(selection);

  const allGroups = useMemo(
    () => sortChallengeGroups(buildChallengeTree({
      evidence: state.evidence,
      objectives: state.objectives,
      results: state.results,
      tasks: state.tasks,
    })),
    [state.evidence, state.objectives, state.results, state.tasks],
  );
  const projectOptions = useMemo(() => {
    const usedProjectIds = new Set(allGroups.map((group) => group.objective.projectId ?? "unassigned"));
    const options = state.projects
      .filter((project) => usedProjectIds.has(project.id))
      .map((project) => ({ label: project.name, value: project.id }));
    if (usedProjectIds.has("unassigned")) options.unshift({ label: "未归属", value: "unassigned" });
    return options;
  }, [allGroups, state.projects]);
  const filteredGroups = useMemo(() => {
    const filtered = filterChallengeGroups(allGroups, {
      cycle: "all",
      member: "all",
      project: projectFilter,
      status: normalizeChallengeStatusFilterSelection(statusFilter),
    }).filter((group) => !mineOnly || isObjectiveChallenger(group.objective, currentUser?.id));
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return filtered;
    return filtered.filter((group) => groupMatchesQuery(group, normalizedQuery));
  }, [allGroups, currentUser?.id, mineOnly, projectFilter, query, statusFilter]);

  useEffect(() => {
    if (!selection) return;
    setQuery("");
    setProjectFilter("all");
    setStatusFilter("all");
    setMineOnly(false);
  }, [selectionKey]);

  useEffect(() => {
    if (!selection) return undefined;
    const id = window.requestAnimationFrame(() => {
      const element = document.getElementById(workspaceTargetDomId(selection));
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedKey(selectionKey);
      if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = window.setTimeout(() => setHighlightedKey(""), 2200);
    });
    return () => window.cancelAnimationFrame(id);
  }, [selection, selectionKey]);

  useEffect(() => () => {
    if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
  }, []);

  const createAction = async (event: FormEvent<HTMLFormElement>, objective: Objective) => {
    event.preventDefault();
    const title = addActionDraft?.title.trim() ?? "";
    if (!currentUser || !title) return;
    const access = workItemMutationAccessForObjective({ objective, currentUser });
    if (access.status !== "allowed") {
      notify(workItemMutationUnavailableMessage(access));
      return;
    }
    const task = await createTask({
      assigneeUserId: currentUser.id,
      description: "",
      linkedObjectiveId: objective.id,
      priority: "Medium",
      title,
    });
    if (task) setAddActionDraft(null);
  };

  const setActionDone = async (action: Task, done: boolean) => {
    const objective = state.objectives.find((item) => item.id === action.linkedObjectiveId);
    const access = workItemMutationAccessForObjective({ objective, currentUser });
    if (access.status !== "allowed") {
      notify(workItemMutationUnavailableMessage(access));
      return;
    }
    const key = `action:${action.id}`;
    setPendingCompletionKey(key);
    try {
      await setTaskCompletion(action.id, done);
    } finally {
      setPendingCompletionKey((current) => current === key ? "" : current);
    }
  };

  const setSubActionDone = async (action: Task, item: TaskChecklistItem, done: boolean) => {
    const objective = state.objectives.find((current) => current.id === action.linkedObjectiveId);
    const access = workItemMutationAccessForObjective({ objective, currentUser });
    if (access.status !== "allowed") {
      notify(workItemMutationUnavailableMessage(access));
      return;
    }
    const key = `subAction:${item.id}`;
    setPendingCompletionKey(key);
    try {
      await updateTaskChecklistItem(action.id, item.id, done);
    } finally {
      setPendingCompletionKey((current) => current === key ? "" : current);
    }
  };

  return (
    <section className="orf-workspace-challenge-panel" aria-label="目标和行动项">
      <header className="orf-workspace-panel-header">
        <div>
          <span className="orf-workspace-panel-eyebrow">Workspace</span>
          <h2>目标 / 行动项</h2>
        </div>
        <div className="orf-workspace-panel-header-actions">
          <Link className="orf-workspace-panel-open-full" to={selection ? workspaceSelectionPath(selection) : "/tasks"}>
            <ExternalLink className="h-4 w-4" />
            完整页
          </Link>
          <IconButton icon={X} label="关闭目标面板" onClick={onClose} />
        </div>
      </header>

      <div className="orf-workspace-panel-toolbar">
        <label className="orf-workspace-panel-search">
          <Search className="h-4 w-4" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索目标、指标或行动项" />
        </label>
        <div className="orf-workspace-panel-filters">
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ChallengeStatusFilter)} aria-label="状态筛选">
            {challengeStatusFilterOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value as ChallengeProjectFilter)} aria-label="项目筛选">
            <option value="all">全部项目</option>
            {projectOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <button type="button" className={mineOnly ? "active" : ""} onClick={() => setMineOnly((value) => !value)}>
            只看我的
          </button>
        </div>
      </div>

      <div className="orf-workspace-challenge-list">
        {filteredGroups.map((group) => (
          <article
            className={clsx("orf-workspace-objective-card", highlightedKey === `objective:${group.objective.id}` && "is-highlighted")}
            id={workspaceTargetDomId({ type: "objective", id: group.objective.id })}
            key={group.objective.id}
          >
            <div className="orf-workspace-objective-head">
              <div className="orf-workspace-objective-title">
                <ListChecks className="h-4 w-4" />
                <h3>{group.objective.title}</h3>
              </div>
              <Link to={workspaceSelectionPath({ type: "objective", id: group.objective.id })} aria-label="打开目标完整页">
                <ExternalLink className="h-4 w-4" />
              </Link>
            </div>
            <div className="orf-workspace-objective-meta">
              <span>{objectiveStatusLabel(group.objective)}</span>
              <span>{group.deadline || "未设置截止"}</span>
              <span>{group.actions.length} 个行动项</span>
            </div>
            {group.bounties.length > 0 && (
              <div className="orf-workspace-metric-list" aria-label="指标">
                {group.bounties.slice(0, 4).map((bounty) => (
                  <span key={bounty.result.id}>{bounty.result.title}</span>
                ))}
                {group.bounties.length > 4 && <span>+{group.bounties.length - 4}</span>}
              </div>
            )}
            <div className="orf-workspace-action-list">
              {group.actions.map((action) => (
                <WorkspaceActionRow
                  action={action}
                  currentUser={currentUser}
                  highlightedKey={highlightedKey}
                  key={action.id}
                  objective={group.objective}
                  onDoneChange={setActionDone}
                  onSubActionDoneChange={setSubActionDone}
                  pendingCompletionKey={pendingCompletionKey}
                />
              ))}
              {group.actions.length === 0 && <div className="orf-workspace-empty-actions">还没有行动项。</div>}
            </div>
            <AddActionControl
              accessMessage={workItemMutationUnavailableMessage(workItemMutationAccessForObjective({ objective: group.objective, currentUser }))}
              canAdd={workItemMutationAccessForObjective({ objective: group.objective, currentUser }).status === "allowed"}
              draft={addActionDraft?.objectiveId === group.objective.id ? addActionDraft.title : ""}
              isAdding={addActionDraft?.objectiveId === group.objective.id}
              objective={group.objective}
              onCancel={() => setAddActionDraft(null)}
              onDraftChange={(title) => setAddActionDraft({ objectiveId: group.objective.id, title })}
              onStart={() => setAddActionDraft({ objectiveId: group.objective.id, title: "" })}
              onSubmit={createAction}
            />
          </article>
        ))}
        {filteredGroups.length === 0 && (
          <div className="orf-workspace-challenge-empty">
            没有匹配的目标或行动项。
          </div>
        )}
      </div>
    </section>
  );
}

function WorkspaceActionRow({
  action,
  currentUser,
  highlightedKey,
  objective,
  onDoneChange,
  onSubActionDoneChange,
  pendingCompletionKey,
}: {
  action: Task;
  currentUser: OrfUser | null;
  highlightedKey: string;
  objective: Objective;
  onDoneChange: (action: Task, done: boolean) => void;
  onSubActionDoneChange: (action: Task, item: TaskChecklistItem, done: boolean) => void;
  pendingCompletionKey: string;
}) {
  const access = workItemMutationAccessForObjective({ objective, currentUser });
  const disabled = access.status !== "allowed";
  const done = action.status === "Done";
  return (
    <div
      className={clsx("orf-workspace-action-row", done && "is-done", highlightedKey === `action:${action.id}` && "is-highlighted")}
      id={workspaceTargetDomId({ type: "action", id: action.id })}
    >
      <label title={disabled ? workItemMutationUnavailableMessage(access) : undefined}>
        <input
          checked={done}
          disabled={disabled || pendingCompletionKey === `action:${action.id}`}
          onChange={(event) => onDoneChange(action, event.target.checked)}
          type="checkbox"
        />
        <span>{action.title}</span>
      </label>
      <Link to={workspaceSelectionPath({ type: "action", id: action.id })} aria-label="打开行动项完整页">
        <ChevronRight className="h-4 w-4" />
      </Link>
      {action.checklist.length > 0 && (
        <div className="orf-workspace-subaction-list">
          {action.checklist.map((item) => (
            <label
              className={clsx("orf-workspace-subaction-row", item.done && "is-done", highlightedKey === `subAction:${item.id}` && "is-highlighted")}
              id={workspaceTargetDomId({ type: "subAction", id: item.id })}
              key={item.id}
              title={disabled ? workItemMutationUnavailableMessage(access) : undefined}
            >
              <input
                checked={item.done}
                disabled={disabled || pendingCompletionKey === `subAction:${item.id}`}
                onChange={(event) => onSubActionDoneChange(action, item, event.target.checked)}
                type="checkbox"
              />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function AddActionControl({
  accessMessage,
  canAdd,
  draft,
  isAdding,
  objective,
  onCancel,
  onDraftChange,
  onStart,
  onSubmit,
}: {
  accessMessage: string;
  canAdd: boolean;
  draft: string;
  isAdding: boolean;
  objective: Objective;
  onCancel: () => void;
  onDraftChange: (title: string) => void;
  onStart: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>, objective: Objective) => void;
}) {
  if (!isAdding) {
    return (
      <button className="orf-workspace-add-action-trigger" disabled={!canAdd} title={!canAdd ? accessMessage : undefined} type="button" onClick={onStart}>
        <Plus className="h-4 w-4" />
        新增行动项
      </button>
    );
  }

  return (
    <form className="orf-workspace-add-action-form" onSubmit={(event) => onSubmit(event, objective)}>
      <ListTodo className="h-4 w-4" />
      <input autoFocus value={draft} onChange={(event) => onDraftChange(event.target.value)} placeholder="行动项标题" />
      <button type="submit" disabled={!draft.trim()}>添加</button>
      <button type="button" onClick={onCancel}>取消</button>
    </form>
  );
}

function workspaceTargetDomId(selection: WorkspaceSelection) {
  return `orf-workspace-target-${selection.type}-${selection.id}`;
}

function groupMatchesQuery(group: ObjectiveNode, query: string) {
  const fields = [
    group.objective.title,
    group.objective.cycle,
    group.objective.challengers.join(" "),
    ...group.bounties.map((bounty) => bounty.result.title),
    ...group.actions.flatMap((action) => [action.title, ...action.checklist.map((item) => item.label)]),
  ];
  return fields.some((field) => field.toLowerCase().includes(query));
}

function objectiveStatusLabel(objective: Objective) {
  if (objective.flowStatus === "settled") return "已结算";
  if (objective.flowStatus === "accepted") return "已验收";
  if (objective.flowStatus === "submitted") return "待验收";
  if (objective.flowStatus === "revisionRequired") return "待返工";
  if (objective.flowStatus === "frozen") return "执行中";
  if (objective.flowStatus === "reestimating") return "待重估";
  return "未分配";
}
