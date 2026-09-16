import { closeDb } from "../server/db/client";
import { ensureOrfChatBotActor, ensureOrfChatNamedChannel } from "../server/integrations/orf-chat-delivery";
import { getVisibleChatChannel } from "../server/repositories/chatRepository";
import { testdBot } from "../server/integrations/testd-results";

// Explicit deployment action, never run from server startup or webhook handling.
const teamId = process.env.TESTD_RESULTS_TEAM_ID?.trim();
if (!teamId || !process.argv.includes("--apply")) throw new Error("需明确设置 TESTD_RESULTS_TEAM_ID 并传入 --apply；此操作会创建机器人和公开频道");
try {
  const actor = await ensureOrfChatBotActor({ ...testdBot, teamId });
  const result = await ensureOrfChatNamedChannel({ actor, teamId, name: "testd-test-results", displayName: "TestD 测试通知", type: "public", purpose: "TestD 按计划运行的结果通知" });
  const channel = await getVisibleChatChannel(actor, result.channelId);
  if (!channel || channel.type !== "public" || channel.systemKind || channel.integrationProvider) throw new Error("已有同名频道不是普通公开频道，请人工处理；未转换频道类型");
  console.log(JSON.stringify({ teamId, channelId: result.channelId, created: result.created }));
} finally { await closeDb(); }
