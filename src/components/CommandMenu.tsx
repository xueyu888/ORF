import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { quickPages } from "../config/navigation";
import { useDraggableFloating } from "../hooks/useDraggableFloating";
import { useOrf } from "../state/OrfProvider";
import { commandTypeLabel } from "../utils/labels";

export function CommandMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { state } = useOrf();
  const [query, setQuery] = useState("");
  const drag = useDraggableFloating<HTMLDivElement>({ disabled: !open, resetKey: open ? "open" : "closed" });

  const items = useMemo(() => {
    const pageItems = quickPages.map((item) => ({ label: item.label, path: item.path, type: "Page" }));
    const objectiveItems = state.objectives.map((item) => ({ label: item.title, path: `/objectives/${item.id}`, type: "Objective" }));
    const resultItems = state.results.map((item) => ({ label: item.title, path: `/objectives/${item.objectiveId}/results/${item.id}`, type: "Result" }));
    const taskItems = state.tasks.map((item) => ({ label: `${item.id} ${item.title}`, path: "/tasks", type: "Task" }));
    const feedbackItems = state.feedback.map((item) => ({ label: item.phenomenon, path: `/feedback/${item.id}`, type: "Feedback" }));

    return [...pageItems, ...objectiveItems, ...resultItems, ...taskItems, ...feedbackItems].filter((item) =>
      `${item.label} ${item.type}`.toLowerCase().includes(query.toLowerCase()),
    );
  }, [query, state]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[12vh]" onMouseDown={onClose}>
      <div ref={drag.ref} style={drag.style} className="orf-card orf-draggable-floating w-full max-w-2xl overflow-hidden rounded-xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="orf-drag-handle flex items-center gap-3 border-b orf-border px-4 py-3" {...drag.handleProps}>
          <Search className="orf-text-muted h-4 w-4" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} autoFocus className="orf-text-primary flex-1 bg-transparent text-sm outline-none placeholder:text-[color:var(--orf-text-faint)]" placeholder="搜索页面、目标、结果、任务、反馈..." />
          <button onClick={onClose} className="orf-text-muted orf-hover-text">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[420px] overflow-auto p-2">
          {items.slice(0, 16).map((item) => (
            <button
              key={`${item.type}-${item.path}-${item.label}`}
              onClick={() => {
                navigate(item.path);
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
