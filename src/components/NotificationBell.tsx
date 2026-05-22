import { Bell, CheckCheck, ExternalLink, Inbox } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AppNotification } from "../types/orf";
import { useOrf } from "../state/OrfProvider";

export function NotificationBell() {
  const navigate = useNavigate();
  const { markAllNotificationsRead, markNotificationRead, notifications, unreadNotificationCount } = useOrf();
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const recentNotifications = notifications.slice(0, 6);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (popoverRef.current?.contains(event.target as Node)) {
        return;
      }
      setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown, { capture: true });
    return () => document.removeEventListener("pointerdown", handlePointerDown, { capture: true });
  }, [open]);

  const openNotification = async (notification: AppNotification) => {
    if (!notification.readAt) {
      await markNotificationRead(notification.id);
    }
    setOpen(false);
    navigate(notification.targetHref);
  };

  return (
    <div ref={popoverRef} className="relative">
      <button
        type="button"
        className="orf-notification-trigger orf-control orf-ghost-action inline-flex h-10 w-10 items-center justify-center transition"
        data-unread={unreadNotificationCount > 0}
        aria-label={`消息${unreadNotificationCount > 0 ? `，${unreadNotificationCount} 条未读` : ""}`}
        title="消息"
        onClick={() => setOpen((current) => !current)}
      >
        <Bell className="h-4 w-4" />
        {unreadNotificationCount > 0 && <span className="orf-notification-badge">{unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}</span>}
      </button>

      {open && (
        <div className="orf-notification-popover orf-card absolute right-0 top-12 z-50 w-[360px] overflow-hidden">
          <div className="flex items-center justify-between border-b orf-border px-4 py-3">
            <div className="text-sm font-semibold orf-text-primary">消息</div>
            <button
              type="button"
              className="orf-text-muted orf-hover-text inline-flex items-center gap-1 text-xs"
              disabled={unreadNotificationCount === 0}
              onClick={() => void markAllNotificationsRead()}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              全部已读
            </button>
          </div>
          <div className="max-h-[360px] overflow-auto p-2">
            {recentNotifications.map((notification) => (
              <NotificationPreview key={notification.id} notification={notification} onOpen={() => void openNotification(notification)} />
            ))}
            {recentNotifications.length === 0 && (
              <div className="flex min-h-32 flex-col items-center justify-center gap-2 text-center text-sm orf-text-secondary">
                <Inbox className="h-5 w-5 orf-text-muted" />
                暂无消息
              </div>
            )}
          </div>
          <button
            type="button"
            className="orf-notification-footer-action flex w-full items-center justify-center gap-2 border-t orf-border px-4 py-3 text-sm font-medium orf-text-primary orf-hover-muted"
            onClick={() => {
              setOpen(false);
              navigate("/notifications");
            }}
          >
            查看全部消息
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function NotificationPreview({ notification, onOpen }: { notification: AppNotification; onOpen: () => void }) {
  return (
    <button
      type="button"
      className="orf-notification-preview orf-hover-muted flex w-full gap-3 rounded-md px-3 py-2 text-left"
      data-read={notification.readAt ? "true" : "false"}
      onClick={onOpen}
    >
      <span className={notification.readAt ? "orf-notification-dot-read" : "orf-notification-dot-unread"} />
      <span className="min-w-0 flex-1">
        <span className="orf-notification-preview-title block truncate text-sm font-medium orf-text-primary">{notification.title}</span>
        <span className="orf-notification-preview-body mt-1 block line-clamp-2 text-xs orf-text-secondary">{notification.body}</span>
        <span className="orf-notification-preview-time mt-2 block text-[11px] orf-text-muted">{formatNotificationTime(notification.createdAt)}</span>
      </span>
    </button>
  );
}

export function formatNotificationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  }).format(date);
}
