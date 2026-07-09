import {
  AlertCircle,
  AtSign,
  BellRing,
  ChevronDown,
  Clock3,
  Inbox,
  type LucideIcon,
  MessageCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOrf } from "../../state/OrfProvider";
import type { AttentionItem, AttentionLevel } from "./attentionTypes";

const fallbackAttentionTargetPath = "/chat/system/personalNotifications";

export function AttentionWorkbar({
  collapsed,
  onNavigateIntent,
}: {
  collapsed: boolean;
  onNavigateIntent?: (path: string) => void;
}) {
  const { attentionState } = useOrf();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const countLabel = attentionState.count > 99 ? "99+" : String(attentionState.count);
  const hasItems = attentionState.items.length > 0;
  const primaryTargetPath = attentionState.latestTargetPath ?? fallbackAttentionTargetPath;

  useEffect(() => {
    if (!open) return undefined;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointerDown);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!hasItems) setOpen(false);
  }, [hasItems]);

  const openTarget = (targetPath: string) => {
    onNavigateIntent?.(targetPath);
    navigate(targetPath);
    setOpen(false);
  };

  const handleTriggerClick = () => {
    if (!hasItems || collapsed) {
      openTarget(primaryTargetPath);
      return;
    }
    setOpen((current) => !current);
  };

  return (
    <div
      ref={containerRef}
      className="orf-attention-workbar"
      data-collapsed={collapsed ? "true" : "false"}
      data-level={attentionState.level}
    >
      <button
        type="button"
        className="orf-attention-workbar-trigger"
        aria-expanded={open}
        aria-label={attentionState.count > 0 ? `待我处理，${attentionState.count} 条提醒` : "待我处理"}
        title={attentionState.count > 0 ? `${attentionState.title}：${attentionState.body}` : "待我处理"}
        onClick={handleTriggerClick}
      >
        <span className="orf-attention-workbar-icon" aria-hidden="true">
          <Inbox className="h-4 w-4" />
          {attentionState.count > 0 && <span className="orf-attention-workbar-count">{countLabel}</span>}
        </span>
        <span className="orf-sidebar-label orf-attention-workbar-summary">
          <span className="orf-attention-workbar-title">待我处理</span>
          <span className="orf-attention-workbar-body">{attentionState.count > 0 ? attentionState.body : "没有待处理提醒"}</span>
        </span>
        {hasItems && <ChevronDown className="orf-sidebar-label orf-attention-workbar-chevron h-4 w-4" aria-hidden="true" />}
      </button>

      {open && hasItems && (
        <div className="orf-attention-panel" role="menu" aria-label="待我处理">
          {attentionState.items.map((item) => (
            <AttentionPanelItem
              key={item.eventId}
              item={item}
              onOpen={openTarget}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AttentionPanelItem({ item, onOpen }: { item: AttentionItem; onOpen: (targetPath: string) => void }) {
  const Icon = iconForAttentionItem(item);
  return (
    <button
      type="button"
      className="orf-attention-panel-item"
      data-level={item.level}
      role="menuitem"
      onClick={() => onOpen(item.targetPath)}
    >
      <span className="orf-attention-panel-item-icon" aria-hidden="true">
        <Icon className="h-4 w-4" />
      </span>
      <span className="orf-attention-panel-item-copy">
        <span className="orf-attention-panel-item-title">{item.title}</span>
        <span className="orf-attention-panel-item-body">{item.body}</span>
      </span>
      <span className="orf-attention-panel-level">{attentionLevelLabel(item.level)}</span>
    </button>
  );
}

function iconForAttentionItem(item: AttentionItem): LucideIcon {
  if (item.source === "worklog") return Clock3;
  if (item.kind === "chat.mention" || item.kind === "comment.mention.created") return AtSign;
  if (item.source === "chat" || String(item.kind).startsWith("comment.")) return MessageCircle;
  if (item.level === "urgent") return AlertCircle;
  if (item.level === "flash") return BellRing;
  return Inbox;
}

function attentionLevelLabel(level: Exclude<AttentionLevel, "none">) {
  if (level === "urgent") return "强";
  if (level === "flash") return "闪";
  if (level === "toast") return "新";
  return "未读";
}
