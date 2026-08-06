import assert from "node:assert/strict";
import test from "node:test";
import {
  clearChatFeedReadingPosition,
  readChatFeedReadingPosition,
  readChatLastChannelId,
  rememberChatLastChannel,
  rememberChatFeedReadingPosition,
} from "../src/features/chat/chatFeedReadingPosition";

test("chat feed reading position records the last channel without requiring a message anchor", () => {
  const userId = "user-reading-position-channel";
  clearChatFeedReadingPosition(userId);

  rememberChatLastChannel({
    channelId: "channel-a",
    userId,
  });

  assert.equal(readChatLastChannelId(userId, ["channel-a", "channel-b"]), "channel-a");
  assert.equal(readChatLastChannelId(userId, ["channel-b"]), null);
  assert.equal(readChatFeedReadingPosition(userId, "channel-a"), null);
});

test("chat feed reading position stores per-user message anchors as optional local display state", () => {
  const userId = "user-reading-position-anchor";
  clearChatFeedReadingPosition(userId);

  rememberChatFeedReadingPosition({
    channelId: "channel-a",
    scrollAnchor: { messageId: "message-4", offsetTop: 32 },
    scrollTop: 480,
    userId,
  });
  rememberChatFeedReadingPosition({
    channelId: "channel-b",
    scrollAnchor: { messageId: "message-9", offsetTop: -24 },
    scrollTop: -50,
    userId,
  });
  rememberChatLastChannel({ channelId: "channel-b", userId });

  const channelAPosition = readChatFeedReadingPosition(userId, "channel-a");
  assert.ok(channelAPosition?.capturedAt);
  assert.deepEqual(channelAPosition, {
    capturedAt: channelAPosition.capturedAt,
    channelId: "channel-a",
    messageId: "message-4",
    offsetTop: 32,
    scrollTop: 480,
  });
  assert.equal(readChatFeedReadingPosition(userId, "channel-b")?.scrollTop, 0);
  assert.equal(readChatLastChannelId(userId, ["channel-a", "channel-b"]), "channel-b");

  clearChatFeedReadingPosition(userId, "channel-b");
  assert.equal(readChatFeedReadingPosition(userId, "channel-b"), null);
  assert.equal(readChatLastChannelId(userId, ["channel-a", "channel-b"]), null);
  assert.equal(readChatFeedReadingPosition("another-user", "channel-a"), null);
});

test("chat feed reading position preserves deep offsets inside long messages", () => {
  const userId = "user-reading-position-long-message";
  clearChatFeedReadingPosition(userId);

  rememberChatFeedReadingPosition({
    channelId: "channel-long",
    scrollAnchor: { messageId: "message-long", offsetTop: -2450 },
    scrollTop: 3200,
    userId,
  });

  const position = readChatFeedReadingPosition(userId, "channel-long");
  assert.equal(position?.messageId, "message-long");
  assert.equal(position?.offsetTop, -2450);
  assert.equal(position?.scrollTop, 3200);
});
