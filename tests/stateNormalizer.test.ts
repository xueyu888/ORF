import assert from "node:assert/strict";
import test from "node:test";
import { classifyInputValue, normalizeDomSnapshot, sanitizeVisibleText } from "../e2e/_explorer/stateNormalizer";

test("state normalization filters noisy text and target signature values", () => {
  const first = normalizeDomSnapshot({
    url: "http://127.0.0.1:5173/auth/550e8400-e29b-41d4-a716-446655440000",
    title: "ORF",
    visibleText: "User 123 at 2026-05-19 12:31 image https://example.test/bg-123.png token abcdef1234567890",
    focusedSignature: "input|id:550e8400e29b41d4a716446655440000|rect:1.2.3.4",
    targets: [
      {
        signature: "input|id:550e8400e29b41d4a716446655440000|rect:1.2.3.4",
        kind: "input:textbox:text",
        disabled: false,
        value: "ui.explorer@example.test",
      },
    ],
    flags: { hasError: false, hasToast: false, hasModal: false, hasLoading: false, hasDrawer: false },
    bodyChildCount: 1,
  });
  const second = normalizeDomSnapshot({
    url: "http://127.0.0.1:5173/auth/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    title: "ORF",
    visibleText: "User 999 at 2027-01-01 08:00 image https://cdn.test/other.png token ffffff9999999999",
    focusedSignature: "input|id:aaaaaaaaaaaabbbbccccddddeeeeeeeeeeee|rect:9.8.7.6",
    targets: [
      {
        signature: "input|id:aaaaaaaaaaaabbbbccccddddeeeeeeeeeeee|rect:9.8.7.6",
        kind: "input:textbox:text",
        disabled: false,
        value: "ui.explorer@example.test",
      },
    ],
    flags: { hasError: false, hasToast: false, hasModal: false, hasLoading: false, hasDrawer: false },
    bodyChildCount: 1,
  });

  assert.equal(first.routePattern, "/auth/:uuid");
  assert.deepEqual(first.inputValueKinds, ["emailLike"]);
  assert.equal(first.fingerprint, second.fingerprint);
});

test("input value classifier maps raw strings into finite value kinds", () => {
  assert.equal(classifyInputValue(""), "empty");
  assert.equal(classifyInputValue("   "), "whitespaceOnly");
  assert.equal(classifyInputValue("a@example.test"), "emailLike");
  assert.equal(classifyInputValue("12345"), "numberLike");
  assert.equal(classifyInputValue("🙂"), "emoji");
  assert.equal(classifyInputValue("中文"), "unicode");
  assert.equal(classifyInputValue("line one\nline two"), "multiLine");
  assert.equal(classifyInputValue('{"a":1}'), "structured");
  assert.equal(classifyInputValue("<script>alert("), "malformed");
});

test("visible text sanitizer removes URLs, dates, tokens, and raw numbers", () => {
  const sanitized = sanitizeVisibleText("2026-05-19 token abcdef1234567890 https://example.test/a.png value 42");
  assert.equal(sanitized.includes("https://example.test"), false);
  assert.equal(sanitized.includes("abcdef1234567890"), false);
  assert.equal(sanitized.includes("42"), false);
});
