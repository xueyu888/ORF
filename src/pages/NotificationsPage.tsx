import { CheckCheck, ExternalLink, Inbox, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { clsx } from "clsx";
import { PageScaffold } from "../components/PageScaffold";
import { formatNotificationTime } from "../components/NotificationBell";
import { Button } from "../components/ui";
import { notificationTargetHref } from "../features/notifications/notificationTargets";
import type { AppNotification } from "../types/orf";
import { useOrf } from "../state/OrfProvider";

type NotificationFilter = "all" | "unread" | "read";
type ConfirmAction = "delete-selected" | "clear-all";

const notificationFilterLabels: Record<NotificationFilter, string> = {
  all: "全部",
  unread: "未读",
  read: "已读",
};

export function NotificationsPage() {
  const navigate = useNavigate();
  const {
    clearAllNotifications,
    deleteNotifications,
    markAllNotificationsRead,
    markNotificationRead,
    notifications,
    unreadNotificationCount,
  } = useOrf();
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const readNotificationCount = Math.max(0, notifications.length - unreadNotificationCount);
  const filterCounts: Record<NotificationFilter, number> = {
    all: notifications.length,
    unread: unreadNotificationCount,
    read: readNotificationCount,
  };
  const filteredNotifications = useMemo(
    () =>
      notifications.filter((notification) => {
        if (filter === "unread") return !notification.readAt;
        if (filter === "read") return Boolean(notification.readAt);
        return true;
      }),
    [filter, notifications],
  );
  const visibleIds = filteredNotifications.map((notification) => notification.id);
  const selectedVisibleIds = selectedIds.filter((id) => visibleIds.includes(id));
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleIds.length === visibleIds.length;

  useEffect(() => {
    setSelectedIds((items) => items.filter((id) => notifications.some((notification) => notification.id === id)));
  }, [notifications]);

  const openNotification = async (notification: AppNotification) => {
    if (!notification.readAt) {
      await markNotificationRead(notification.id);
    }
    navigate(notificationTargetHref(notification));
  };

  const toggleSelected = (notificationId: string) => {
    setSelectedIds((items) => (items.includes(notificationId) ? items.filter((id) => id !== notificationId) : [...items, notificationId]));
  };

  const toggleVisibleSelected = () => {
    if (allVisibleSelected) {
      setSelectedIds((items) => items.filter((id) => !visibleIds.includes(id)));
      return;
    }
    setSelectedIds((items) => Array.from(new Set([...items, ...visibleIds])));
  };

  const confirmDangerAction = async () => {
    if (!confirmAction || submitting) {
      return;
    }

    setSubmitting(true);
    try {
      const ok =
        confirmAction === "delete-selected"
          ? await deleteNotifications(selectedIds)
          : await clearAllNotifications();
      if (ok) {
        setSelectedIds([]);
        setConfirmAction(null);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageScaffold title="消息" subtitle="系统流程事件和历史提醒。">
      <section className="orf-notifications-shell">
        <div className="orf-notifications-toolbar">
          <div className="orf-notifications-filter-tabs" role="tablist" aria-label="消息筛选">
            {(Object.keys(notificationFilterLabels) as NotificationFilter[]).map((item) => (
              <button
                key={item}
                type="button"
                className={clsx("orf-notifications-filter-button", filter === item && "is-active")}
                aria-selected={filter === item}
                role="tab"
                onClick={() => setFilter(item)}
              >
                <span>{notificationFilterLabels[item]}</span>
                <span className="orf-notifications-filter-count">{filterCounts[item]}</span>
              </button>
            ))}
          </div>
          <div className="orf-notifications-actions">
            <Button variant="secondary" disabled={unreadNotificationCount === 0 || submitting} onClick={() => void markAllNotificationsRead()}>
              <CheckCheck className="h-4 w-4" />
              全部已读
            </Button>
            <Button
              variant="secondary"
              disabled={selectedIds.length === 0 || submitting}
              onClick={() => setConfirmAction("delete-selected")}
            >
              <Trash2 className="h-4 w-4" />
              删除所选
            </Button>
            <Button variant="danger" disabled={notifications.length === 0 || submitting} onClick={() => setConfirmAction("clear-all")}>
              <Trash2 className="h-4 w-4" />
              清空
            </Button>
          </div>
        </div>

        <div className="orf-notifications-list" aria-label="消息列表" role="list">
          <div className="orf-notifications-list-header">
            <label className="orf-notifications-select-all">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                disabled={visibleIds.length === 0}
                aria-label="选择当前筛选下的全部消息"
                onChange={toggleVisibleSelected}
              />
              <span>{selectedIds.length > 0 ? `已选 ${selectedIds.length} 条` : `${filteredNotifications.length} 条消息`}</span>
            </label>
            <span>{unreadNotificationCount > 0 ? `${unreadNotificationCount} 条未读` : "没有未读消息"}</span>
          </div>

          {filteredNotifications.map((notification) => (
            <NotificationListItem
              key={notification.id}
              notification={notification}
              selected={selectedIds.includes(notification.id)}
              onOpen={() => void openNotification(notification)}
              onToggleSelected={() => toggleSelected(notification.id)}
            />
          ))}

          {filteredNotifications.length === 0 && (
            <div className="orf-notifications-empty">
              <Inbox className="h-6 w-6" />
              <div className="text-sm font-semibold orf-text-primary">暂无消息</div>
              <div className="text-sm orf-text-secondary">当前筛选下没有系统流程提醒。</div>
            </div>
          )}
        </div>
      </section>

      {confirmAction && (
        <NotificationConfirmDialog
          count={confirmAction === "delete-selected" ? selectedIds.length : notifications.length}
          kind={confirmAction}
          submitting={submitting}
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => void confirmDangerAction()}
        />
      )}
    </PageScaffold>
  );
}

function NotificationListItem({
  notification,
  onOpen,
  onToggleSelected,
  selected,
}: {
  notification: AppNotification;
  onOpen: () => void;
  onToggleSelected: () => void;
  selected: boolean;
}) {
  const unread = !notification.readAt;

  return (
    <article className={clsx("orf-notification-list-item", unread && "is-unread", selected && "is-selected")} role="listitem">
      <label className="orf-notification-row-check">
        <input
          type="checkbox"
          checked={selected}
          aria-label={`选择消息：${notification.title}`}
          onChange={onToggleSelected}
        />
      </label>
      <span className={unread ? "orf-notification-dot-unread" : "orf-notification-dot-read"} aria-hidden="true" />
      <button type="button" className="orf-notification-row-main" onClick={onOpen}>
        <span className="orf-notification-row-heading">
          <span className="orf-notification-row-title">{notification.title}</span>
          {unread && <span className="orf-notification-unread-pill">未读</span>}
        </span>
        <span className="orf-notification-row-body">{notification.body}</span>
        <span className="orf-notification-row-meta">
          <span>{notification.actorName || "系统"}</span>
          <span>{formatNotificationTime(notification.createdAt)}</span>
        </span>
      </button>
      <button type="button" className="orf-notification-open-button" aria-label={`打开消息：${notification.title}`} title="打开关联位置" onClick={onOpen}>
        <ExternalLink className="h-4 w-4" />
      </button>
    </article>
  );
}

function NotificationConfirmDialog({
  count,
  kind,
  onCancel,
  onConfirm,
  submitting,
}: {
  count: number;
  kind: ConfirmAction;
  onCancel: () => void;
  onConfirm: () => void;
  submitting: boolean;
}) {
  const title = kind === "delete-selected" ? "删除所选消息" : "清空全部消息";
  const description =
    kind === "delete-selected"
      ? `将删除当前用户收件箱中的 ${count} 条消息，不影响关联目标、挑战或评论。`
      : "将清空当前用户当前团队下的全部消息，包括未加载的历史消息，不影响关联目标、挑战或评论。";

  return (
    <div className="orf-notification-confirm-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        aria-labelledby="orf-notification-confirm-title"
        aria-modal="true"
        className="orf-notification-confirm-dialog"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="orf-notification-confirm-icon">
          <Trash2 className="h-4 w-4" />
        </div>
        <div>
          <h2 id="orf-notification-confirm-title">{title}</h2>
          <p>{description}</p>
        </div>
        <div className="orf-notification-confirm-actions">
          <Button type="button" variant="secondary" disabled={submitting} onClick={onCancel}>
            取消
          </Button>
          <Button type="button" variant="danger" disabled={submitting || count === 0} onClick={onConfirm}>
            {submitting ? "删除中" : "确认删除"}
          </Button>
        </div>
      </div>
    </div>
  );
}
