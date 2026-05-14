import { clsx } from "clsx";
import { ChevronDown, ChevronRight, Copy, Edit3, GripVertical, MessageSquare, Plus, Trash2, type LucideIcon } from "lucide-react";
import { HIERARCHY_TREE_METRICS } from "../../../components/OrfHierarchyTree";
import type { ChallengeRowAction, DragItem } from "../model/types";

const actionItems: { action: ChallengeRowAction; icon: LucideIcon; label: string }[] = [
  { action: "copyLink", label: "复制链接", icon: Copy },
  { action: "edit", label: "编辑", icon: Edit3 },
  { action: "comment", label: "评论", icon: MessageSquare },
  { action: "delete", label: "删除", icon: Trash2 },
];

export const rowActionLeft = {
  objective: 20,
  bounty: HIERARCHY_TREE_METRICS.disclosureLeftByDepth[1],
  action: HIERARCHY_TREE_METRICS.disclosureLeftByDepth[2],
  subAction: HIERARCHY_TREE_METRICS.disclosureLeftByDepth[3],
} as const;

export function ChallengeRowActions({
  actionId,
  activeActionId,
  addLabel,
  dragItem,
  left,
  onAction,
  onActiveActionChange,
  onAdd,
  onDragEnd,
  onDragStart,
  onOpenActionChange,
  openActionId,
}: {
  actionId: string;
  activeActionId: string | null;
  addLabel: string;
  dragItem?: DragItem;
  left: number;
  onAction: (action: ChallengeRowAction) => void;
  onActiveActionChange: (id: string | null) => void;
  onAdd: () => void;
  onDragEnd?: () => void;
  onDragStart?: (item: DragItem) => void;
  onOpenActionChange: (id: string | null) => void;
  openActionId: string | null;
}) {
  const open = openActionId === actionId;
  const visible = open || (!openActionId && activeActionId === actionId);

  return (
    <div
      className="orf-block-actions pointer-events-none absolute top-1/2 z-40 flex -translate-x-full -translate-y-1/2 items-center gap-px p-0.5 transition"
      data-challenge-row-actions="true"
      data-open={open ? "true" : undefined}
      data-visible={visible ? "true" : undefined}
      onPointerEnter={() => onActiveActionChange(actionId)}
      style={{ left, zIndex: open ? 100 : 40 }}
    >
      <button
        type="button"
        aria-label={addLabel}
        className="orf-block-action-button pointer-events-auto flex h-7 w-7 items-center justify-center rounded text-[#667085] transition hover:bg-[var(--orf-bg-muted)] hover:text-[#1d2939]"
        onClick={onAdd}
        title={addLabel}
      >
        <Plus className="h-4 w-4" />
      </button>
      <div className="relative">
        <button
          type="button"
          aria-label={dragItem ? "按住拖拽，点击打开块菜单" : "打开块菜单"}
          className={clsx(
            "orf-block-action-button pointer-events-auto flex h-7 w-7 items-center justify-center rounded text-[#98a2b3] transition hover:bg-[var(--orf-bg-muted)] hover:text-[#1d2939]",
            dragItem && "orf-block-drag-handle",
          )}
          draggable={Boolean(dragItem)}
          onClick={() => {
            onActiveActionChange(actionId);
            onOpenActionChange(open ? null : actionId);
          }}
          onDragEnd={onDragEnd}
          onDragStart={(event) => {
            if (!dragItem) return;
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("application/x-orf-block", `${dragItem.type}:${dragItem.id}`);
            onDragStart?.(dragItem);
          }}
          title={dragItem ? "按住拖拽 / 点击菜单" : "块菜单"}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        {open && (
          <div className="orf-popover orf-block-menu pointer-events-auto absolute left-0 top-9 z-50 w-40 p-1">
            {actionItems.map((item) => {
              const Icon = item.icon;

              return (
                <button
                  key={item.action}
                  type="button"
                  className={clsx(
                    "orf-block-menu-item flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition hover:bg-[var(--orf-bg-muted)]",
                    item.action === "delete" ? "text-[#d92d20]" : "text-[#344054]",
                  )}
                  onClick={() => {
                    onAction(item.action);
                    onOpenActionChange(null);
                  }}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function DisclosureAction({
  actionId,
  activeActionId,
  className,
  expanded,
  label,
  left,
  onActiveActionChange,
  onOpenActionChange,
  onToggle,
  openActionId,
}: {
  actionId: string;
  activeActionId: string | null;
  className?: string;
  expanded: boolean;
  label: string;
  left?: number;
  onActiveActionChange: (id: string | null) => void;
  onOpenActionChange: (id: string | null) => void;
  onToggle: () => void;
  openActionId: string | null;
}) {
  const open = openActionId === actionId;
  const visible = open || (!openActionId && activeActionId === actionId);

  return (
    <button
      type="button"
      aria-label={label}
      className={clsx("orf-disclosure-action z-[70] flex h-6 w-6 shrink-0 items-center justify-center rounded text-[#344054] transition hover:bg-[var(--orf-bg-card)]", className)}
      data-challenge-disclosure-action="true"
      data-visible={visible ? "true" : undefined}
      onClick={() => {
        onActiveActionChange(actionId);
        onOpenActionChange(null);
        onToggle();
      }}
      onPointerEnter={() => onActiveActionChange(actionId)}
      style={left === undefined ? undefined : { left }}
      title={label}
    >
      {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
    </button>
  );
}
