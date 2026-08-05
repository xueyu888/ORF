import {
  AlertCircle,
  AtSign,
  BellRing,
  ChevronDown,
  Clock3,
  CheckCheck,
  Inbox,
  type LucideIcon,
  MessageCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useWorkbenchNavigation } from "../workbench-navigation";
import { useOrf } from "../../state/OrfProvider";
import type { AttentionItem, AttentionLevel } from "./attentionTypes";

const fallbackAttentionTargetPath = "/chat/system/personalNotifications";

export function AttentionWorkbar({ collapsed }: { collapsed: boolean }) {
  const { attentionState, markAllNotificationsRead, markNotificationRead, notify } = useOrf();
  const workbenchNavigation = useWorkbenchNavigation();
  const [open, setOpen] = useState(false);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [openingItemId, setOpeningItemId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const countLabel = attentionState.count > 99 ? "99+" : String(attentionState.count);
  const hasItems = attentionState.items.length > 0;
  const hasNotificationItems = attentionState.items.some((item) => item.source === "notification");
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

  if (attentionState.count <= 0) {
    return null;
  }

  const openTarget = (targetPath: string) => {
    workbenchNavigation.open(targetPath, { source: "notification" });
    setOpen(false);
  };

  const openItem = async (item: AttentionItem) => {
    setOpeningItemId(item.eventId);
    try {
      if (item.source === "notification") {
        await markNotificationRead(item.eventId);
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "标记通知已读失败");
    } finally {
      openTarget(item.targetPath);
      setOpeningItemId(null);
    }
  };

  const markNotificationsRead = async () => {
    if (markingAllRead) return;
    setMarkingAllRead(true);
    try {
      const updated = await markAllNotificationsRead();
      notify(updated > 0 ? `已将 ${updated} 条通知标为已读` : "没有新的未读通知");
    } catch (error) {
      notify(error instanceof Error ? error.message : "通知全部已读失败");
    } finally {
      setMarkingAllRead(false);
    }
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
        <div className="orf-attention-panel" role="dialog" aria-label="待我处理">
          <div className="orf-attention-panel-header">
            <span>待处理提醒</span>
            {hasNotificationItems && (
              <button
                type="button"
                className="orf-attention-panel-mark-all"
                disabled={markingAllRead}
                title="通知全部已读"
                onClick={(event) => {
                  event.stopPropagation();
                  void markNotificationsRead();
                }}
              >
                <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                <span>全部已读</span>
              </button>
            )}
          </div>
          {attentionState.items.map((item) => (
            <AttentionPanelItem
              key={item.eventId}
              disabled={openingItemId === item.eventId}
              item={item}
              onOpen={(nextItem) => void openItem(nextItem)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AttentionPanelItem({
  disabled,
  item,
  onOpen,
}: {
  disabled: boolean;
  item: AttentionItem;
  onOpen: (item: AttentionItem) => void;
}) {
  const Icon = iconForAttentionItem(item);
  return (
    <button
      type="button"
      className="orf-attention-panel-item"
      data-level={item.level}
      disabled={disabled}
      onClick={() => onOpen(item)}
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
