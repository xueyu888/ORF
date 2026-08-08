import {
  getActiveAdminNotificationRecipients,
  getActiveMemberNotificationRecipientsByIds,
} from "../repositories/notificationRepository";

export const feedbackNotificationRecipientDirectory = {
  getActiveAdminUserIds: getActiveAdminNotificationRecipients,
  getActiveMemberUserIdsByIds: getActiveMemberNotificationRecipientsByIds,
} satisfies {
  getActiveAdminUserIds(teamId: string): Promise<string[]>;
  getActiveMemberUserIdsByIds(teamId: string, userIds: string[]): Promise<string[]>;
};
