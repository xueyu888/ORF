import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { canShowFrontendPath } from "../config/frontendVisibility";
import { quickCommands } from "../config/navigation";
import { hasPermission } from "../config/permissions";
import type { PermissionKey } from "../config/permissions";
import {
  filterFeedbackForVisibleObjectives,
  filterResultsForVisibleObjectives,
  filterTasksForVisibleObjectives,
  visibleObjectiveIdsForUser,
  visibleObjectivesForUser,
} from "../features/challenge/model/objectiveVisibility";
import { useDraggableFloating } from "../hooks/useDraggableFloating";
import { useOrf } from "../state/OrfProvider";
import { commandTypeLabel } from "../utils/labels";

export function CommandMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { currentUser, openModal, state } = useOrf();
  const [query, setQuery] = useState("");
  const drag = useDraggableFloating<HTMLDivElement>({ disabled: !open, resetKey: open ? "open" : "closed" });

  const items = useMemo(() => {
    const visibleObjectiveIds = visibleObjectiveIdsForUser(state.objectives, currentUser);
    const visibleObjectives = visibleObjectivesForUser(state.objectives, currentUser);
    const visibleResults = filterResultsForVisibleObjectives(state.results, visibleObjectiveIds, currentUser);
    const visibleTasks = filterTasksForVisibleObjectives(state.tasks, visibleObjectiveIds, currentUser);
    const visibleFeedback = filterFeedbackForVisibleObjectives(state.feedback, visibleObjectiveIds, currentUser);
    const commandItems = quickCommands
      .filter((item) =>
        item.kind === "action"
          ? hasPermission(currentUser, state.permissionRules, item.permission as PermissionKey)
          : canShowFrontendPath(currentUser, item.path),
      )
      .map((item) =>
        item.kind === "action"
          ? { label: item.label, action: item.action, type: "Action" as const }
          : { label: item.label, path: item.path, type: "Page" as const },
      );
    const objectiveItems = visibleObjectives.map((item) => ({ label: item.title, path: `/objectives/${item.id}`, type: "Objective" }));
    const resultItems = visibleResults.map((item) => ({ label: item.title, path: `/objectives/${item.objectiveId}/results/${item.id}`, type: "Result" }));
    const taskItems = visibleTasks.map((item) => ({ label: `${item.id} ${item.title}`, path: "/tasks", type: "Task" }));
    const feedbackItems = visibleFeedback.map((item) => ({ label: item.phenomenon, path: `/feedback/${item.id}`, type: "Feedback" }));

    return [...commandItems, ...objectiveItems, ...resultItems, ...taskItems, ...feedbackItems].filter((item) =>
      `${item.label} ${item.type}`.toLowerCase().includes(query.toLowerCase()),
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
          <input value={query} onChange={(event) => setQuery(event.target.value)} autoFocus className="orf-text-primary flex-1 bg-transparent text-sm outline-none placeholder:text-[color:var(--orf-text-faint)]" placeholder="搜索页面、目标、指标、行动项、反馈..." />
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
                  if (item.action === "newObjective") openModal({ type: "newObjective" });
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
          {items.length === 0 && <div className="orf-text-muted px-3 py-8 text-center text-sm">没有匹配的页面或 ORF 对象。</div>}
        </div>
      </div>
    </div>
  );
}
