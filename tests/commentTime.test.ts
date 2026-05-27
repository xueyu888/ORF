import assert from "node:assert/strict";
import test from "node:test";
import { commentTimeDisplay } from "../src/features/challenge/comments/commentTime";

test("commentTimeDisplay keeps very recent comments readable with exact hover time", () => {
  const createdAt = new Date(2999, 0, 1, 10, 5, 30).toISOString();
  const referenceNow = new Date(2999, 0, 1, 10, 5, 50).getTime();

  assert.deepEqual(commentTimeDisplay(createdAt, referenceNow), {
    dateTime: createdAt,
    label: "刚刚",
    title: "2999-01-01 10:05",
  });
});

test("commentTimeDisplay shows minute relative labels for recent comments", () => {
  const createdAt = new Date(2999, 0, 1, 10, 0, 0).toISOString();
  const referenceNow = new Date(2999, 0, 1, 10, 42, 59).getTime();

  assert.deepEqual(commentTimeDisplay(createdAt, referenceNow), {
    dateTime: createdAt,
    label: "42 分钟前",
    title: "2999-01-01 10:00",
  });
});

test("commentTimeDisplay shows hour relative labels for same-day comments", () => {
  const createdAt = new Date(2999, 0, 1, 8, 15, 0).toISOString();
  const referenceNow = new Date(2999, 0, 1, 12, 50, 0).getTime();

  assert.deepEqual(commentTimeDisplay(createdAt, referenceNow), {
    dateTime: createdAt,
    label: "4 小时前",
    title: "2999-01-01 08:15",
  });
});

test("commentTimeDisplay shows local date and minute for historical comments", () => {
  const createdAt = new Date(2999, 0, 1, 23, 30, 0).toISOString();
  const referenceNow = new Date(2999, 0, 3, 9, 0, 0).getTime();

  assert.deepEqual(commentTimeDisplay(createdAt, referenceNow), {
    dateTime: createdAt,
    label: "2999-01-01 23:30",
    title: "2999-01-01 23:30",
  });
});

test("commentTimeDisplay degrades invalid timestamps without time attributes", () => {
  assert.deepEqual(commentTimeDisplay("not-a-date", new Date(2999, 0, 1).getTime()), {
    label: "not-a-date",
  });
});
