import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CHAT_POLL_INPUT_CONTRACT } from "../src/domain/chatPollContract";
import {
  chatPollProjectionPolicy,
  normalizeChatPollDraft,
  normalizeChatPollVote,
} from "../server/chat/chatPollModel";
import { validateChatPollSchema, type RuntimeSchemaConstraint, type RuntimeTableColumn } from "../server/db/schemaGuard";
import {
  addChatPollDraftOption,
  chatPollDraftValidationMessage,
  createInitialChatPollDraft,
  sameChatPollSelection,
  toChatPollCreateInput,
  toggleChatPollSelection,
  updateChatPollDraftOption,
} from "../src/features/chat/chatPollModel";

test("chat poll draft requires a question and two distinct complete options", () => {
  const initial = createInitialChatPollDraft();
  assert.equal(chatPollDraftValidationMessage(initial), "请输入投票问题");

  const withQuestion = { ...initial, question: "本周活动选什么？" };
  assert.equal(chatPollDraftValidationMessage(withQuestion), "请填写完整的选项内容");

  const first = updateChatPollDraftOption(withQuestion, withQuestion.options[0].id, "火锅");
  const complete = updateChatPollDraftOption(first, first.options[1].id, "烧烤");
  assert.equal(chatPollDraftValidationMessage(complete), null);
  assert.deepEqual(toChatPollCreateInput(complete), {
    options: ["火锅", "烧烤"],
    question: "本周活动选什么？",
    selectionMode: "single",
    visibility: "named",
  });

  const duplicate = updateChatPollDraftOption(complete, complete.options[1].id, " 火锅 ");
  assert.equal(chatPollDraftValidationMessage(duplicate), "投票选项不能重复");
  assert.equal(addChatPollDraftOption(complete).options.length, 3);

  let maximumDraft = complete;
  while (maximumDraft.options.length < CHAT_POLL_INPUT_CONTRACT.maximumOptionCount) {
    maximumDraft = addChatPollDraftOption(maximumDraft);
  }
  assert.equal(maximumDraft.options.length, 100);
  assert.equal(addChatPollDraftOption(maximumDraft), maximumDraft);
});

test("server normalization independently enforces poll creation bounds", () => {
  assert.deepEqual(normalizeChatPollDraft({
    options: [" A ", "B"],
    selectionMode: "multiple",
    visibility: "anonymous",
  }), {
    options: ["A", "B"],
    selectionMode: "multiple",
    visibility: "anonymous",
  });
  assert.equal(normalizeChatPollDraft({ options: ["A"], selectionMode: "single", visibility: "named" }), null);
  assert.equal(normalizeChatPollDraft({ options: ["A", " a "], selectionMode: "single", visibility: "named" }), null);
  assert.equal(normalizeChatPollDraft({ options: ["", "B"], selectionMode: "single", visibility: "named" }), null);

  const maximumOptions = Array.from(
    { length: CHAT_POLL_INPUT_CONTRACT.maximumOptionCount },
    (_, index) => `选项 ${index + 1}`,
  );
  assert.equal(normalizeChatPollDraft({ options: maximumOptions, selectionMode: "multiple", visibility: "named" })?.options.length, 100);
  assert.equal(normalizeChatPollDraft({ options: [...maximumOptions, "越界选项"], selectionMode: "multiple", visibility: "named" }), null);
});

test("single choice accepts exactly one option and multiple choice removes duplicates", () => {
  assert.deepEqual(normalizeChatPollVote(["option-a"], "single"), ["option-a"]);
  assert.equal(normalizeChatPollVote(["option-a", "option-b"], "single"), null);
  assert.deepEqual(normalizeChatPollVote(["option-a", "option-a", "option-b"], "multiple"), ["option-a", "option-b"]);
  assert.equal(normalizeChatPollVote([], "multiple"), null);
  const maximumSelection = Array.from({ length: CHAT_POLL_INPUT_CONTRACT.maximumOptionCount }, (_, index) => `option-${index}`);
  assert.equal(normalizeChatPollVote(maximumSelection, "multiple")?.length, 100);
  assert.equal(normalizeChatPollVote([...maximumSelection, "option-overflow"], "multiple"), null);

  const selected = toggleChatPollSelection("multiple", new Set(), "option-a");
  const changed = toggleChatPollSelection("multiple", selected, "option-b");
  assert.deepEqual(Array.from(changed), ["option-a", "option-b"]);
  assert.equal(sameChatPollSelection(changed, new Set(["option-b", "option-a"])), true);
});

test("poll results become visible after the current user votes or the poll closes", () => {
  assert.deepEqual(chatPollProjectionPolicy({ closedAt: null, currentUserOptionIds: [], visibility: "named" }), {
    includeParticipantIdentities: false,
    resultsVisible: false,
  });
  assert.deepEqual(chatPollProjectionPolicy({ closedAt: null, currentUserOptionIds: ["option-a"], visibility: "named" }), {
    includeParticipantIdentities: true,
    resultsVisible: true,
  });
  assert.deepEqual(chatPollProjectionPolicy({
    closedAt: "2026-08-20T00:00:00.000Z",
    currentUserOptionIds: [],
    visibility: "named",
  }), {
    includeParticipantIdentities: true,
    resultsVisible: true,
  });
  assert.deepEqual(chatPollProjectionPolicy({ closedAt: null, currentUserOptionIds: ["option-a"], visibility: "anonymous" }), {
    includeParticipantIdentities: false,
    resultsVisible: true,
  });
  assert.deepEqual(chatPollProjectionPolicy({
    closedAt: "2026-08-20T00:00:00.000Z",
    currentUserOptionIds: [],
    visibility: "anonymous",
  }), {
    includeParticipantIdentities: false,
    resultsVisible: true,
  });
});

test("poll schema guard requires all facts and security constraints", () => {
  const nonNull = (tableName: string, columnName: string): RuntimeTableColumn => ({
    columnName,
    isNullable: "NO",
    tableName,
  });
  const columns = [
    ...["message_id", "selection_mode", "visibility", "created_at", "updated_at"].map((column) => nonNull("chat_polls", column)),
    { columnName: "closed_at", isNullable: "YES", tableName: "chat_polls" } as RuntimeTableColumn,
    { columnName: "closed_by_user_id", isNullable: "YES", tableName: "chat_polls" } as RuntimeTableColumn,
    ...["id", "poll_message_id", "label", "position"].map((column) => nonNull("chat_poll_options", column)),
    ...["poll_message_id", "option_id", "voter_user_id", "created_at", "updated_at"].map((column) => nonNull("chat_poll_votes", column)),
  ];
  const constraints = [
    "chat_polls_selection_mode_check",
    "chat_polls_visibility_check",
    "chat_poll_votes_poll_option_fk",
  ].map((constraintName): RuntimeSchemaConstraint => ({ constraintName, definition: "" }));
  assert.deepEqual(validateChatPollSchema({ columns, constraints }), []);
  assert.match(validateChatPollSchema({ columns: columns.filter((column) => column.columnName !== "voter_user_id"), constraints })[0], /voter_user_id/);
});

test("database and repository contracts derive live results without exposing anonymous identity", () => {
  const migration = readFileSync(new URL("../drizzle/0100_chat_polls.sql", import.meta.url), "utf8");
  const pollRepository = readFileSync(new URL("../server/chat/chatPollRepository.ts", import.meta.url), "utf8");
  const chatRepository = readFileSync(new URL("../server/repositories/chatRepository.ts", import.meta.url), "utf8");
  const syncFunction = migration.slice(
    migration.indexOf("CREATE OR REPLACE FUNCTION orf_capture_chat_poll_sync_event"),
    migration.indexOf("CREATE TRIGGER chat_polls_sync_event"),
  );
  assert.match(migration, /chat_poll_votes_selection_guard/);
  assert.match(migration, /single-choice poll accepts one option per voter/);
  assert.doesNotMatch(migration, /"status"/);
  assert.doesNotMatch(syncFunction, /voter_user_id|option_id/);
  assert.match(pollRepository, /count\(vote\.option_id\)::int AS vote_count/);
  assert.doesNotMatch(pollRepository, /CASE WHEN poll\.closed_at IS NULL THEN 0 ELSE/);
  assert.match(pollRepository, /poll\.visibility = 'named'/);
  assert.doesNotMatch(pollRepository, /poll\.closed_at IS NOT NULL/);
  assert.match(chatRepository, /mutation\.visibility === "anonymous" \? null : actor\.id/);
});
