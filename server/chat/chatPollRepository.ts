import type { PoolClient } from "pg";
import type { ChatPoll, ChatPollParticipant, ChatPollSelectionMode, ChatPollVisibility } from "../../src/types/orf";
import { pool } from "../db/client";
import { avatarUrlForUser } from "../users/avatar/avatarRepository";
import { makeId, nowIso, iso } from "../repositories/chatRepositoryModel";
import { chatPollProjectionPolicy, normalizeChatPollVote, type NormalizedChatPollDraft } from "./chatPollModel";

type PollRow = {
  author_user_id: string;
  closed_at: Date | string | null;
  closed_by_user_id: string | null;
  message_id: string;
  participant_count: number;
  selection_mode: ChatPollSelectionMode;
  visibility: ChatPollVisibility;
};

type PollOptionRow = {
  id: string;
  label: string;
  poll_message_id: string;
  position: number;
  vote_count: number;
};

type CurrentVoteRow = {
  option_id: string;
  poll_message_id: string;
};

type ParticipantRow = {
  avatar_object_key: string | null;
  avatar_updated_at: Date | string | null;
  name: string;
  option_ids: string[];
  poll_message_id: string;
  user_id: string;
};

type PollMutationRow = {
  author_user_id: string;
  closed_at: Date | string | null;
  root_message_id: string | null;
  selection_mode: ChatPollSelectionMode;
  visibility: ChatPollVisibility;
};

export type ChatPollMutationResult =
  | { status: "ok"; rootMessageId: string | null; visibility: ChatPollVisibility }
  | { status: "notFound" | "forbidden" | "invalid" };

export async function insertChatPollRows(
  client: Pick<PoolClient, "query">,
  input: { draft: NormalizedChatPollDraft; messageId: string; createdAt: string },
) {
  await client.query(
    `
      INSERT INTO chat_polls (message_id, selection_mode, visibility, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $4)
    `,
    [input.messageId, input.draft.selectionMode, input.draft.visibility, input.createdAt],
  );
  await client.query(
    `
      INSERT INTO chat_poll_options (id, poll_message_id, label, position)
      SELECT option.id, $1, option.label, option.position
      FROM unnest($2::text[], $3::text[], $4::int[]) AS option(id, label, position)
    `,
    [
      input.messageId,
      input.draft.options.map(() => makeId("chat-poll-option")),
      input.draft.options,
      input.draft.options.map((_, position) => position),
    ],
  );
}

export async function loadChatPolls(messageIds: string[], actorUserId: string) {
  const result = new Map<string, ChatPoll>();
  if (messageIds.length === 0) return result;

  const [pollRowsResult, optionRowsResult, currentVoteRowsResult, participantRowsResult] = await Promise.all([
    pool.query<PollRow>(
      `
        SELECT poll.message_id, poll.selection_mode, poll.visibility, poll.closed_at,
               poll.closed_by_user_id, message.author_user_id,
               (
                 SELECT count(DISTINCT vote.voter_user_id)::int
                 FROM chat_poll_votes vote
                 WHERE vote.poll_message_id = poll.message_id
               ) AS participant_count
        FROM chat_polls poll
        INNER JOIN chat_messages message ON message.id = poll.message_id
        WHERE poll.message_id = ANY($1::text[])
      `,
      [messageIds],
    ),
    pool.query<PollOptionRow>(
      `
        SELECT option.poll_message_id, option.id, option.label, option.position,
               count(vote.option_id)::int AS vote_count
        FROM chat_poll_options option
        LEFT JOIN chat_poll_votes vote
          ON vote.poll_message_id = option.poll_message_id
         AND vote.option_id = option.id
        WHERE option.poll_message_id = ANY($1::text[])
        GROUP BY option.poll_message_id, option.id, option.label, option.position
        ORDER BY option.poll_message_id, option.position
      `,
      [messageIds],
    ),
    pool.query<CurrentVoteRow>(
      `
        SELECT poll_message_id, option_id
        FROM chat_poll_votes
        WHERE poll_message_id = ANY($1::text[])
          AND voter_user_id = $2
        ORDER BY poll_message_id, option_id
      `,
      [messageIds, actorUserId],
    ),
    pool.query<ParticipantRow>(
      `
        SELECT vote.poll_message_id, vote.voter_user_id AS user_id, participant.name,
               participant.avatar_object_key, participant.avatar_updated_at,
               array_agg(vote.option_id ORDER BY option.position) AS option_ids
        FROM chat_poll_votes vote
        INNER JOIN chat_polls poll
          ON poll.message_id = vote.poll_message_id
         AND poll.visibility = 'named'
        INNER JOIN chat_poll_options option
          ON option.poll_message_id = vote.poll_message_id
         AND option.id = vote.option_id
        INNER JOIN users participant ON participant.id = vote.voter_user_id
        WHERE vote.poll_message_id = ANY($1::text[])
        GROUP BY vote.poll_message_id, vote.voter_user_id, participant.name,
                 participant.avatar_object_key, participant.avatar_updated_at
        ORDER BY vote.poll_message_id, lower(participant.name), participant.name
      `,
      [messageIds],
    ),
  ]);

  const optionsByPoll = new Map<string, PollOptionRow[]>();
  for (const option of optionRowsResult.rows) {
    const options = optionsByPoll.get(option.poll_message_id) ?? [];
    options.push(option);
    optionsByPoll.set(option.poll_message_id, options);
  }
  const currentVotesByPoll = new Map<string, string[]>();
  for (const vote of currentVoteRowsResult.rows) {
    const optionIds = currentVotesByPoll.get(vote.poll_message_id) ?? [];
    optionIds.push(vote.option_id);
    currentVotesByPoll.set(vote.poll_message_id, optionIds);
  }
  const participantsByPoll = new Map<string, ChatPollParticipant[]>();
  for (const participant of participantRowsResult.rows) {
    const participants = participantsByPoll.get(participant.poll_message_id) ?? [];
    participants.push({
      avatarUrl: avatarUrlForUser({
        id: participant.user_id,
        avatarObjectKey: participant.avatar_object_key,
        avatarUpdatedAt: iso(participant.avatar_updated_at),
      }),
      name: participant.name,
      optionIds: participant.option_ids,
      userId: participant.user_id,
    });
    participantsByPoll.set(participant.poll_message_id, participants);
  }

  for (const poll of pollRowsResult.rows) {
    const closedAt = iso(poll.closed_at);
    const currentUserOptionIds = currentVotesByPoll.get(poll.message_id) ?? [];
    const projectionPolicy = chatPollProjectionPolicy({
      closedAt,
      currentUserOptionIds,
      visibility: poll.visibility,
    });
    const participants = projectionPolicy.includeParticipantIdentities
      ? participantsByPoll.get(poll.message_id) ?? []
      : null;
    const participantCount = projectionPolicy.resultsVisible ? Number(poll.participant_count) : null;
    const options = optionsByPoll.get(poll.message_id) ?? [];
    result.set(poll.message_id, {
      canClose: poll.author_user_id === actorUserId && !closedAt,
      closedAt,
      closedByUserId: poll.closed_by_user_id,
      currentUserOptionIds,
      options: options.map((option) => ({
        id: option.id,
        label: option.label,
        position: Number(option.position),
        voteCount: projectionPolicy.resultsVisible ? Number(option.vote_count) : 0,
      })),
      participantCount,
      participants,
      resultsVisible: projectionPolicy.resultsVisible,
      selectionMode: poll.selection_mode,
      visibility: poll.visibility,
    });
  }
  return result;
}

async function lockMutablePoll(
  client: Pick<PoolClient, "query">,
  input: { actorUserId: string; channelId: string; messageId: string; teamId: string },
) {
  const { rows } = await client.query<PollMutationRow>(
    `
      SELECT message.author_user_id, message.root_message_id, poll.selection_mode,
             poll.visibility, poll.closed_at
      FROM chat_polls poll
      INNER JOIN chat_messages message
        ON message.id = poll.message_id
       AND message.team_id = $1
       AND message.channel_id = $2
       AND message.deleted_at IS NULL
      INNER JOIN chat_channel_members membership
        ON membership.channel_id = message.channel_id
       AND membership.user_id = $4
      WHERE poll.message_id = $3
      FOR UPDATE OF poll
    `,
    [input.teamId, input.channelId, input.messageId, input.actorUserId],
  );
  return rows[0] ?? null;
}

export async function replaceChatPollVote(input: {
  actorUserId: string;
  channelId: string;
  messageId: string;
  optionIds: string[];
  teamId: string;
}): Promise<ChatPollMutationResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const poll = await lockMutablePoll(client, input);
    if (!poll) {
      await client.query("ROLLBACK");
      return { status: "notFound" };
    }
    if (poll.closed_at) {
      await client.query("ROLLBACK");
      return { status: "forbidden" };
    }
    const optionIds = normalizeChatPollVote(input.optionIds, poll.selection_mode);
    if (!optionIds) {
      await client.query("ROLLBACK");
      return { status: "invalid" };
    }
    const { rows: validOptions } = await client.query<{ id: string }>(
      `SELECT id FROM chat_poll_options WHERE poll_message_id = $1 AND id = ANY($2::text[]) FOR SHARE`,
      [input.messageId, optionIds],
    );
    if (validOptions.length !== optionIds.length) {
      await client.query("ROLLBACK");
      return { status: "invalid" };
    }
    const now = nowIso();
    await client.query(
      `DELETE FROM chat_poll_votes WHERE poll_message_id = $1 AND voter_user_id = $2`,
      [input.messageId, input.actorUserId],
    );
    await client.query(
      `
        INSERT INTO chat_poll_votes (
          poll_message_id, option_id, voter_user_id, created_at, updated_at
        )
        SELECT $1, selected.option_id, $2, $3, $3
        FROM unnest($4::text[]) AS selected(option_id)
      `,
      [input.messageId, input.actorUserId, now, optionIds],
    );
    await client.query(`UPDATE chat_polls SET updated_at = $2 WHERE message_id = $1`, [input.messageId, now]);
    await client.query("COMMIT");
    return { status: "ok", rootMessageId: poll.root_message_id, visibility: poll.visibility };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function closeChatPoll(input: {
  actorUserId: string;
  channelId: string;
  messageId: string;
  teamId: string;
}): Promise<ChatPollMutationResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const poll = await lockMutablePoll(client, input);
    if (!poll) {
      await client.query("ROLLBACK");
      return { status: "notFound" };
    }
    if (poll.author_user_id !== input.actorUserId) {
      await client.query("ROLLBACK");
      return { status: "forbidden" };
    }
    if (!poll.closed_at) {
      const now = nowIso();
      await client.query(
        `UPDATE chat_polls SET closed_at = $2, closed_by_user_id = $3, updated_at = $2 WHERE message_id = $1`,
        [input.messageId, now, input.actorUserId],
      );
    }
    await client.query("COMMIT");
    return { status: "ok", rootMessageId: poll.root_message_id, visibility: poll.visibility };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
