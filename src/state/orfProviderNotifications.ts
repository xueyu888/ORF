import { useCallback, useState } from "react";
import type { AppNotification } from "../types/orf";
import { getNotifications, type NotificationsResponse } from "./apiClient";

export function useNotificationState() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);

  const applyNotifications = useCallback((data: NotificationsResponse) => {
    setNotifications(data.notifications);
    setUnreadNotificationCount(data.unreadCount);
  }, []);

  const refreshNotifications = useCallback(async () => {
    applyNotifications(await getNotifications());
  }, [applyNotifications]);

  const receiveNotification = useCallback((notification: AppNotification) => {
    setNotifications((items) => {
      if (items.some((item) => item.id === notification.id)) {
        return items;
      }

      const nextItems = [notification, ...items].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      setUnreadNotificationCount(nextItems.filter((item) => !item.readAt).length);
      return nextItems;
    });
  }, []);

  const resetNotificationState = useCallback(() => {
    setNotifications([]);
    setUnreadNotificationCount(0);
  }, []);

  return {
    receiveNotification,
    refreshNotifications,
    resetNotificationState,
    unreadNotificationCount,
  };
}
