import assert from "node:assert/strict";
import test from "node:test";
import { parseFeedbackTextLinks } from "../src/features/feedback/model/feedbackTextLinks";

test("feedback text parser keeps internal and external links as explicit tokens", () => {
  const tokens = parseFeedbackTextLinks("看 /tasks?view=mine 和 https://example.com/a。");

  assert.deepEqual(tokens, [
    { type: "text", text: "看 " },
    { type: "internalLink", href: "/tasks?view=mine", text: "/tasks?view=mine" },
    { type: "text", text: " 和 " },
    { type: "externalLink", href: "https://example.com/a", text: "https://example.com/a" },
    { type: "text", text: "。" },
  ]);
});
