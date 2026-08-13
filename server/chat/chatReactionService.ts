import type { ChatMessage } from "../../src/types/orf";
import { setChatReaction as setChatReactionState } from "../repositories/chatRepository";
import { storageTeamId, type ChatActor, type Outcome } from "../repositories/chatRepositoryModel";
import {
  buildChatReactionNotificationPlan,
  publishChatReactionNotification,
} from "./chatReactionNotification";

export async function setChatReaction(
  input: { channelId: string; emojiName: string; messageId: string; reacting: boolean },
  actor: ChatActor,
): Promise<Outcome<{ message: ChatMessage }>> {
  const outcome = await setChatReactionState(input, actor);
  if (outcome.status !== "ok") return outcome;

  const notification = buildChatReactionNotificationPlan({
    actorName: actor.name,
    actorUserId: actor.id,
    emojiName: input.emojiName,
    message: outcome.message,
    reacting: input.reacting,
    reactionChanged: outcome.reactionChanged,
    teamId: storageTeamId(actor),
  });
  if (notification) await publishChatReactionNotification(notification);
  return { status: "ok", message: outcome.message };
}
