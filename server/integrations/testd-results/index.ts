import type { FastifyInstance } from "fastify";
import { createDirectChannel, getVisibleChatChannel, listChatUsers, sendChatMessage } from "../../repositories/chatRepository";
import { readOrfChatBotActor } from "../orf-chat-delivery";
import { deliverTestdResult } from "./delivery";
import { readGitlabCommitAuthorEmail } from "./gitlab-author";
import { readResultConfig } from "./model";
import { registerTestdResultRoute } from "./route";

export const testdBot = { botEmail: "testd@orf.local", botName: "TestD" };

export function registerTestdResults(app: FastifyInstance) {
  const config = readResultConfig(process.env);
  if (!config) return;
  registerTestdResultRoute(app, config, async input => {
    const actor = await readOrfChatBotActor({ ...testdBot, teamId: config.teamId });
    if (!actor) throw new Error("TestD 机器人未配置");
    return deliverTestdResult(input, config, {
      async sendPublic(message) {
        const channel = await getVisibleChatChannel(actor, config.channelId);
        if (!channel || channel.type !== "public" || channel.systemKind || channel.archivedAt || channel.integrationProvider) throw new Error("TestD 目标必须是独立普通公开频道");
        const result = await sendChatMessage({ ...message, channelId: config.channelId }, actor);
        if (result.status !== "ok") throw new Error(`TestD 公开频道投递失败：${result.status}`);
        return result.message.id;
      },
      readCommitAuthor: (projectId, sha) => readGitlabCommitAuthorEmail(config, projectId, sha),
      async sendDirect(message) {
        const users = (await listChatUsers(actor)).filter(user => user.email.trim().toLowerCase() === message.recipientEmail);
        if (users.length !== 1) throw new Error("Git 提交作者未匹配到唯一的活动 ORF 团队成员");
        const direct = await createDirectChannel({ userIds: [users[0]!.id] }, actor);
        if (direct.status !== "ok" || direct.channel.type !== "direct") throw new Error(`TestD 私聊会话不可用：${direct.status}`);
        const result = await sendChatMessage({ body: message.body, messageId: message.messageId, channelId: direct.channel.id }, actor);
        if (result.status !== "ok") throw new Error(`TestD 私聊投递失败：${result.status}`);
      },
    });
  });
}
