import type { FastifyInstance } from "fastify";
import { publishNotificationEvent } from "../../messageSystem/notificationPublisher";
import { deliverTestdResult } from "./delivery";
import { readGitlabCommitAuthorEmail } from "./gitlab-author";
import { readResultConfig } from "./model";
import { resolveTestdRecipientUserIds } from "./recipients";
import { registerTestdResultRoute } from "./route";

export function registerTestdResults(app: FastifyInstance) {
  const config = readResultConfig(process.env);
  if (!config) return;
  registerTestdResultRoute(app, config, input => deliverTestdResult(input, {
    readCommitAuthor: (projectId, sha) => readGitlabCommitAuthorEmail(config, projectId, sha),
    resolveRecipients: emails => resolveTestdRecipientUserIds(config.teamId, emails),
    async publishNotification({ event, body, recipientUserIds, sourceEventKey }) {
      const gateState = event.gate.state;
      const notifications = await publishNotificationEvent({
        actorName: "TestD",
        body,
        kind: "testd.mr.gate-result",
        metadata: { gateState, sourceSha: event.mergeRequest.sourceSha, taskId: event.taskId },
        recipientUserIds,
        sourceEventKey,
        targetHref: event.mergeRequest.url,
        targetId: event.eventId,
        targetType: "testdResult",
        teamId: config.teamId,
        title: `TestD MR !${event.mergeRequest.iid} 门禁${gateState === "failed" ? "未通过" : "通过"}`,
      });
      if (notifications.length !== recipientUserIds.length) throw new Error("TestD 系统通知收件记录不完整");
      const notificationId = notifications[0]?.id;
      if (!notificationId) throw new Error("TestD 系统通知未创建");
      return notificationId;
    },
  }));
}
