import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyChatScrollEvent,
  hasRecentChatScrollUserIntent,
  shouldRecordChatFeedReadingPosition,
} from "../src/features/chat/chatScrollController";

test("chat scroll controller classifies programmatic scrolls as their own source", () => {
  const source = classifyChatScrollEvent({
    activelyViewed: true,
    now: 1_000,
    programmatic: true,
    userIntentUntil: 0,
  });

  assert.equal(source, "programmatic");
  assert.equal(shouldRecordChatFeedReadingPosition(source), false);
});

test("chat scroll controller treats hidden-window scroll events as ambient", () => {
  const source = classifyChatScrollEvent({
    activelyViewed: false,
    now: 1_000,
    programmatic: false,
    userIntentUntil: 0,
  });

  assert.equal(source, "ambient");
  assert.equal(shouldRecordChatFeedReadingPosition(source), false);
});

test("chat scroll controller treats active scroll events without user intent as ambient", () => {
  const source = classifyChatScrollEvent({
    activelyViewed: true,
    now: 1_000,
    programmatic: false,
    userIntentUntil: 0,
  });

  assert.equal(source, "ambient");
  assert.equal(shouldRecordChatFeedReadingPosition(source), false);
});

test("chat scroll controller accepts scroll events with explicit user intent", () => {
  assert.equal(hasRecentChatScrollUserIntent(1_000, 1_200), true);

  const source = classifyChatScrollEvent({
    activelyViewed: true,
    now: 1_000,
    programmatic: false,
    userIntentUntil: 1_200,
  });

  assert.equal(source, "user");
  assert.equal(shouldRecordChatFeedReadingPosition(source), true);
});

test("chat scroll controller expires old user intent", () => {
  assert.equal(hasRecentChatScrollUserIntent(1_201, 1_200), false);

  const source = classifyChatScrollEvent({
    activelyViewed: true,
    now: 1_201,
    programmatic: false,
    userIntentUntil: 1_200,
  });

  assert.equal(source, "ambient");
  assert.equal(shouldRecordChatFeedReadingPosition(source), false);
});
