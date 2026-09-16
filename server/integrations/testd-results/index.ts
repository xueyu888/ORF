import type { FastifyInstance } from "fastify";
import { getVisibleChatChannel, sendChatMessage } from "../../repositories/chatRepository";
import { readOrfChatBotActor } from "../orf-chat-delivery";
import { readResultConfig } from "./model";
import { registerTestdResultRoute } from "./route";

export const testdBot = { botEmail: "testd@orf.local", botName: "TestD" };

export function registerTestdResults(app: FastifyInstance) {
  const config = readResultConfig(process.env);
  if (!config) return;
  registerTestdResultRoute(app, config, async input => {
    const actor = await readOrfChatBotActor({ ...testdBot, teamId: config.teamId });
    if (!actor) throw new Error("TestD 机器人未配置");
    const channel = await getVisibleChatChannel(actor, config.channelId);
    if (!channel || channel.type !== "public" || channel.systemKind || channel.archivedAt || channel.integrationProvider) throw new Error("TestD 目标必须是独立普通公开频道");
    const result = await sendChatMessage({ ...input, channelId: config.channelId }, actor);
    if (result.status !== "ok") throw new Error("TestD 聊天投递失败");
    return result.message.id;
  });
}
