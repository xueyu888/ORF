import type { WorkLogClassificationKind } from "../../src/types/orf";
import { publishNotificationEvent } from "../notifications/publisher";
import { getActiveTeamNotificationRecipients } from "../repositories/notificationRepository";

export type WorkLogSubmissionNotificationInput = {
  authorName: string;
  authorUserId: string;
  classificationKind: WorkLogClassificationKind;
  classificationTitle: string;
  entryId: string;
  teamId: string;
  workDate: string;
};

export async function notifyTeamOfWorkLogSubmission(input: WorkLogSubmissionNotificationInput) {
  const classificationTitle = input.classificationTitle.trim() || "未归类";
  const targetTitle = `${input.workDate} ${input.authorName} 工作日志`;
  await publishNotificationEvent({
    actorName: input.authorName,
    actorUserId: input.authorUserId,
    body: `${input.authorName} 提交了 ${input.workDate} 的工作日志：${classificationTitle}。`,
    kind: "worklog.submitted",
    metadata: {
      authorName: input.authorName,
      authorUserId: input.authorUserId,
      classificationKind: input.classificationKind,
      classificationTitle,
      targetTitle,
      workDate: input.workDate,
    },
    recipientUserIds: await getActiveTeamNotificationRecipients(input.teamId),
    targetHref: `/work-logs?date=${encodeURIComponent(input.workDate)}&view=today`,
    targetId: input.entryId,
    targetType: "workLog",
    teamId: input.teamId,
    title: "新的工作日志",
  });
}
