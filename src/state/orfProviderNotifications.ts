import { useCallback, useState } from "react";
import type { AppNotification } from "../types/orf";
import {
  getNotifications,
  markAllNotificationsReadRequest,
  markNotificationReadRequest,
  type NotificationsResponse,
} from "./apiClient";

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

  const markNotificationRead = useCallback(async (notificationId: string) => {
    const data = await markNotificationReadRequest(notificationId);
    setNotifications((items) => items.map((item) => item.id === data.notification.id ? data.notification : item));
    setUnreadNotificationCount(data.unreadCount);
    return data.notification;
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    const data = await markAllNotificationsReadRequest();
    const readAt = new Date().toISOString();
    setNotifications((items) => items.map((item) => item.readAt ? item : { ...item, readAt }));
    setUnreadNotificationCount(data.unreadCount);
    return data.updated;
  }, []);

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
    markAllNotificationsRead,
    markNotificationRead,
    notifications,
    receiveNotification,
    refreshNotifications,
    resetNotificationState,
    unreadNotificationCount,
  };
}
