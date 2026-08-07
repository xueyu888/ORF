import assert from "node:assert/strict";
import test from "node:test";
import {
  feedbackDailyDigestListHref,
  feedbackDailyDigestTargetId,
  formatFeedbackDailyDigestBody,
  shouldRunFeedbackDailyDigest,
  sortFeedbackDailyDigestItems,
} from "@orf/feedback-module/server";

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

test("feedback daily digest list href uses the feedback route contribution link contract", () => {
  assert.equal(
    feedbackDailyDigestListHref("user 1"),
    "/feedback?assignee=user+1&sort=updated-asc&view=assigned",
  );
});

test("feedback daily digest sorts by impact then oldest update and formats feedback links", () => {
  const items = sortFeedbackDailyDigestItems([
    { id: "fb-low", impact: "low", title: "低影响", updatedAt: "2026-08-03" },
    { id: "fb-high-new", impact: "high", title: "高影响新", updatedAt: "2026-08-04" },
    { id: "fb-high-old", impact: "high", title: "高影响旧", updatedAt: "2026-08-01" },
  ]);

  assert.deepEqual(items.map((item) => item.id), ["fb-high-old", "fb-high-new", "fb-low"]);
  assert.equal(formatFeedbackDailyDigestBody({
    items,
  }), [
    "你有 3 条待处理反馈。",
    "1. [High] [高影响旧](/feedback/fb-high-old)",
    "2. [High] [高影响新](/feedback/fb-high-new)",
    "3. [Low] [低影响](/feedback/fb-low)",
  ].join("\n"));
});

test("feedback daily digest keeps two digit ordered list markers in the markdown source", () => {
  const body = formatFeedbackDailyDigestBody({
    items: Array.from({ length: 22 }, (_, index) => ({
      id: `fb-${String(index + 1).padStart(2, "0")}`,
      impact: "medium",
      title: `反馈标题 ${index + 1}`,
      updatedAt: `2026-08-${String(index + 1).padStart(2, "0")}`,
    })),
  });

  assert.match(body, /^10\. \[Medium\] \[反馈标题 10\]\(\/feedback\/fb-10\)$/m);
  assert.match(body, /^20\. \[Medium\] \[反馈标题 20\]\(\/feedback\/fb-20\)$/m);
  assert.doesNotMatch(body, /^0\. \[Medium\]/m);
  assert.match(body, /^还有 2 条未展开。$/m);
});
