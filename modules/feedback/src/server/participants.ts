import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { feedbackParticipants } from "../infrastructure/database/schema";

export type FeedbackParticipantDatabase = Pick<NodePgDatabase<any>, "insert">;

function uniqueStrings(values: readonly string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export async function upsertFeedbackParticipants(
  database: FeedbackParticipantDatabase,
  input: {
    readonly feedbackId: string;
    readonly participatedAt: string;
    readonly teamId: string;
    readonly userIds: Array<string | null | undefined>;
  },
) {
  const rows = uniqueStrings(input.userIds.map((userId) => userId ?? "")).map((userId) => ({
    teamId: input.teamId,
    feedbackId: input.feedbackId,
    userId,
    firstParticipatedAt: input.participatedAt,
    lastParticipatedAt: input.participatedAt,
  }));
  if (rows.length === 0) return;

  await database
    .insert(feedbackParticipants)
    .values(rows)
    .onConflictDoUpdate({
      target: [feedbackParticipants.teamId, feedbackParticipants.feedbackId, feedbackParticipants.userId],
      set: { lastParticipatedAt: input.participatedAt },
    });
}
