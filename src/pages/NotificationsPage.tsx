import { Bell, CheckCheck, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageScaffold } from "../components/PageScaffold";
import { formatNotificationTime } from "../components/NotificationBell";
import { Button, Card, EmptyState } from "../components/ui";
import type { AppNotification } from "../types/orf";
import { useOrf } from "../state/OrfProvider";

export function NotificationsPage() {
  const navigate = useNavigate();
  const { markAllNotificationsRead, markNotificationRead, notifications, unreadNotificationCount } = useOrf();

  const openNotification = async (notification: AppNotification) => {
    if (!notification.readAt) {
      await markNotificationRead(notification.id);
    }
    navigate(notification.targetHref);
  };

  return (
    <PageScaffold
      title="消息"
      subtitle="集中查看系统流程里的待处理事件和历史提醒。"
      action={
        <Button variant="secondary" disabled={unreadNotificationCount === 0} onClick={() => void markAllNotificationsRead()}>
          <CheckCheck className="h-4 w-4" />
          全部已读
        </Button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="grid gap-3">
          {notifications.map((notification) => (
            <NotificationRow key={notification.id} notification={notification} onOpen={() => void openNotification(notification)} />
          ))}
          {notifications.length === 0 && <EmptyState title="暂无消息" description="挑战申请、征召和战利品提交等流程事件会出现在这里。" />}
        </div>
        <Card className="orf-card-padding h-fit">
          <div className="flex items-center gap-2 text-sm font-semibold orf-text-primary">
            <Bell className="h-4 w-4" />
            消息状态
          </div>
          <div className="mt-4 grid gap-2 text-sm">
            <Stat label="未读" value={unreadNotificationCount.toString()} />
            <Stat label="总数" value={notifications.length.toString()} />
          </div>
          <div className="mt-4 text-xs leading-5 orf-text-secondary">消息只保存系统内流程事件；外部 Mattermost 或邮件是补充通道，不替代这里的已读和跳转状态。</div>
        </Card>
      </div>
    </PageScaffold>
  );
}

function NotificationRow({ notification, onOpen }: { notification: AppNotification; onOpen: () => void }) {
  return (
    <Card className={`orf-notification-row-card orf-card-padding ${notification.readAt ? "is-read" : "is-unread"}`}>
      <button type="button" className="orf-notification-row flex w-full items-start gap-4 text-left" onClick={onOpen}>
        <span className={notification.readAt ? "orf-notification-dot-read mt-1" : "orf-notification-dot-unread mt-1"} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="orf-notification-row-title text-base font-semibold orf-text-primary">{notification.title}</span>
            {!notification.readAt && <span className="orf-notification-unread-tag orf-status-tag px-2 py-0.5 text-[11px] font-bold">未读</span>}
          </span>
          <span className="orf-notification-row-body mt-2 block text-sm orf-text-secondary">{notification.body}</span>
          <span className="orf-notification-row-meta mt-3 flex flex-wrap items-center gap-3 text-xs orf-text-muted">
            <span>{notification.actorName || "系统"}</span>
            <span>{formatNotificationTime(notification.createdAt)}</span>
            <span className="inline-flex items-center gap-1">
              打开关联位置
              <ExternalLink className="h-3 w-3" />
            </span>
          </span>
        </span>
      </button>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md orf-surface-muted px-3 py-2">
      <span className="orf-text-secondary">{label}</span>
      <span className="font-semibold orf-text-primary">{value}</span>
    </div>
  );
}
