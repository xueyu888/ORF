import { useCallback, useState } from "react";
import type { AppNotification } from "../types/orf";
import {
  getNotifications,
  markAllNotificationsReadRequest,
  markNotificationReadRequest,
  type NotificationsResponse,
} from "./apiClient";

export function useNotificationState(failureMessage: (error: unknown, fallback: string) => string, notify: (message: string) => void) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);

  const applyNotifications = useCallback((data: NotificationsResponse) => {
    setNotifications(data.notifications);
    setUnreadNotificationCount(data.unreadCount);
  }, []);

  const refreshNotifications = useCallback(async () => {
    applyNotifications(await getNotifications());
  }, [applyNotifications]);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
    setUnreadNotificationCount(0);
  }, []);

  const markNotificationRead = useCallback(
    async (notificationId: string) => {
      try {
        const data = await markNotificationReadRequest(notificationId);
        setNotifications((items) => items.map((item) => (item.id === data.notification.id ? data.notification : item)));
        setUnreadNotificationCount(data.unreadCount);
        return true;
      } catch (error) {
        notify(failureMessage(error, "消息状态更新失败"));
        void refreshNotifications().catch(() => undefined);
        return false;
      }
    },
    [failureMessage, notify, refreshNotifications],
  );

  const markAllNotificationsRead = useCallback(async () => {
    try {
      await markAllNotificationsReadRequest();
      setNotifications((items) => items.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
      setUnreadNotificationCount(0);
      return true;
    } catch (error) {
      notify(failureMessage(error, "消息状态更新失败"));
      void refreshNotifications().catch(() => undefined);
      return false;
    }
  }, [failureMessage, notify, refreshNotifications]);

  return {
    clearNotifications,
    markAllNotificationsRead,
    markNotificationRead,
    notifications,
    refreshNotifications,
    unreadNotificationCount,
  };
}
