import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { canShowFrontendPath } from "../config/frontendVisibility";
import { quickCommands } from "../config/navigation";
import { hasPermission } from "../config/permissions";
import type { PermissionKey } from "../config/permissions";
import { challengePathForTarget } from "../features/challenge/model/challengeLinks";
import {
  filterResultsForVisibleObjectives,
  filterTasksForVisibleObjectives,
  visibleObjectivesForUser,
  visibleObjectiveIdsForUser,
} from "../features/challenge/model/objectiveVisibility";
import { useDraggableFloating } from "../hooks/useDraggableFloating";
import { useOrf } from "../state/OrfProvider";
import { commandTypeLabel } from "../utils/labels";

type CommandMenuItem =
  | { action: "createObjective"; label: string; searchText: string; type: "Action" }
  | { label: string; path: string; searchText: string; type: "Metric" | "Objective" | "Page" | "Subtask" | "Task" };

export function CommandMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { currentUser, state } = useOrf();
  const [query, setQuery] = useState("");
  const drag = useDraggableFloating<HTMLDivElement>({ disabled: !open, resetKey: open ? "open" : "closed" });

  const items = useMemo(() => {
    const visibleObjectives = visibleObjectivesForUser(state.objectives, currentUser);
    const visibleObjectiveIds = visibleObjectiveIdsForUser(state.objectives, currentUser);
    const visibleResults = filterResultsForVisibleObjectives(state.results, visibleObjectiveIds, currentUser);
    const visibleTasks = filterTasksForVisibleObjectives(state.tasks, visibleObjectiveIds, currentUser);
    const commandItems = quickCommands
      .filter((item) =>
        item.kind === "action"
          ? hasPermission(currentUser, state.permissionRules, item.permission as PermissionKey)
          : canShowFrontendPath(currentUser, item.path),
      )
      .map((item) =>
        item.kind === "action"
          ? { label: item.label, action: item.action, searchText: item.label, type: "Action" as const }
          : { label: item.label, path: item.path, searchText: `${item.label} ${item.path}`, type: "Page" as const },
      );
    const objectiveItems = visibleObjectives.map((objective) => ({
      label: objective.title,
      path: challengePathForTarget({ type: "objective", id: objective.id }),
      searchText: [
        objective.title,
        objective.description,
        objective.whyItMatters,
        objective.boundary,
        objective.successDefinition,
        objective.cycle,
        objective.status,
        objective.flowStatus,
        ...objective.challengers,
        ...objective.assignedChallengers,
      ].join(" "),
      type: "Objective" as const,
    }));
    const metricItems = visibleResults.map((result) => ({
      label: result.title,
      path: challengePathForTarget({ type: "bounty", id: result.id }),
      searchText: [
        result.title,
        result.detail,
        result.definer,
        result.unit,
        result.reviewCadence,
        result.status,
      ].join(" "),
      type: "Metric" as const,
    }));
    const taskItems = visibleTasks.map((item) => ({
      label: `${item.id} ${item.title}`,
      path: challengePathForTarget({ type: "action", id: item.id }),
      searchText: [
        item.id,
        item.title,
        item.description,
        item.assignee,
        item.priority,
        item.status,
        ...item.tags,
      ].join(" "),
      type: "Task" as const,
    }));
    const subtaskItems = visibleTasks.flatMap((task) =>
      task.checklist.map((item) => ({
        label: item.label,
        path: challengePathForTarget({ type: "subAction", id: item.id }),
        searchText: `${item.label} ${task.id} ${task.title}`,
        type: "Subtask" as const,
      })),
    );
    const allItems: CommandMenuItem[] = [
      ...commandItems,
      ...objectiveItems,
      ...metricItems,
      ...taskItems,
      ...subtaskItems,
    ];

    const normalizedQuery = query.trim().toLowerCase();
    return allItems.filter((item) =>
      !normalizedQuery || `${item.label} ${item.searchText} ${item.type}`.toLowerCase().includes(normalizedQuery),
    );
  }, [currentUser, query, state]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[12vh]" onMouseDown={onClose}>
      <div ref={drag.ref} style={drag.style} className="orf-card orf-draggable-floating w-full max-w-2xl overflow-hidden rounded-xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="orf-drag-handle flex items-center gap-3 border-b orf-border px-4 py-3" {...drag.handleProps}>
          <Search className="orf-text-muted h-4 w-4" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} autoFocus className="orf-text-primary flex-1 bg-transparent text-sm outline-none placeholder:text-[color:var(--orf-text-faint)]" placeholder="搜索目标、指标、任务" />
          <button onClick={onClose} className="orf-text-muted orf-hover-text">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[420px] overflow-auto p-2">
          {items.slice(0, 16).map((item) => (
            <button
              key={`${item.type}-${"path" in item ? item.path : item.action}-${item.label}`}
              onClick={() => {
                if ("action" in item) {
                  if (item.action === "createObjective") navigate("/tasks?create=objective");
                } else {
                  navigate(item.path);
                }
                onClose();
              }}
              className="orf-hover-muted flex w-full items-center justify-between rounded-md px-3 py-2 text-left"
            >
              <span className="orf-text-primary truncate text-sm">{item.label}</span>
              <span className="orf-text-muted ml-4 orf-status-tag border orf-border px-2 py-0.5 text-xs">{commandTypeLabel[item.type]}</span>
            </button>
          ))}
          {items.length === 0 && <div className="orf-text-muted px-3 py-8 text-center text-sm">没有匹配的目标、指标或任务。</div>}
        </div>
      </div>
    </div>
  );
}
