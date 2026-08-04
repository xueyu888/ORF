import assert from "node:assert/strict";
import test from "node:test";
import {
  feedbackDailyDigestTargetId,
  formatFeedbackDailyDigestBody,
  shouldRunFeedbackDailyDigest,
  sortFeedbackDailyDigestItems,
} from "../server/feedback/feedbackDailyDigestModel";

test("feedback daily digest becomes due at the configured local 08:00 boundary", () => {
  assert.deepEqual(shouldRunFeedbackDailyDigest({
    hour: 8,
    minute: 0,
    now: new Date("2026-08-05T00:00:00.000Z"),
    timeZone: "Asia/Shanghai",
  }), {
    due: true,
    localDate: "2026-08-05",
  });

  assert.deepEqual(shouldRunFeedbackDailyDigest({
    hour: 8,
    minute: 0,
    now: new Date("2026-08-04T23:59:00.000Z"),
    timeZone: "Asia/Shanghai",
  }), {
    due: false,
    localDate: "2026-08-05",
  });
});

test("feedback daily digest target id is unique by team date and assignee", () => {
  assert.equal(
    feedbackDailyDigestTargetId("team-1", "user-1", "2026-08-05"),
    "feedback-daily-digest:team-1:user-1:2026-08-05",
  );
});

test("feedback daily digest sorts by impact then oldest update and formats feedback links", () => {
  const items = sortFeedbackDailyDigestItems([
    { id: "fb-low", impact: "Low", phenomenon: "低影响", updatedAt: "2026-08-03" },
    { id: "fb-high-new", impact: "High", phenomenon: "高影响新", updatedAt: "2026-08-04" },
    { id: "fb-high-old", impact: "High", phenomenon: "高影响旧", updatedAt: "2026-08-01" },
  ]);

  assert.deepEqual(items.map((item) => item.id), ["fb-high-old", "fb-high-new", "fb-low"]);
  assert.equal(formatFeedbackDailyDigestBody({
    items,
    listHref: "/feedback?state=open&assignee=user-1",
  }), [
    "你有 3 条待处理反馈。",
    "1. [High] [高影响旧](/feedback/fb-high-old)",
    "2. [High] [高影响新](/feedback/fb-high-new)",
    "3. [Low] [低影响](/feedback/fb-low)",
    "",
    "[打开反馈列表](/feedback?state=open&assignee=user-1)",
  ].join("\n"));
});
