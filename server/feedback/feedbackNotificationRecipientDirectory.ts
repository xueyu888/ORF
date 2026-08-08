import type { FeedbackNotificationRecipientDirectory } from "@orf/feedback-module/server";
import {
  getActiveAdminNotificationRecipients,
  getActiveMemberNotificationRecipientsByIds,
} from "../repositories/notificationRepository";

export const feedbackNotificationRecipientDirectory: FeedbackNotificationRecipientDirectory = {
  getActiveAdminUserIds: getActiveAdminNotificationRecipients,
  getActiveMemberUserIdsByIds: getActiveMemberNotificationRecipientsByIds,
};
