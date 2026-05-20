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

test("state exploration abstraction collapses repeatable comment counts but keeps business tags", () => {
  const oneComment = normalizeDomSnapshot(commentSnapshot(["alpha-test 待征召"], ["button|text:删除|rect:1.1.1.1|index:0"]), "stateExploration");
  const twoComments = normalizeDomSnapshot(
    commentSnapshot(["alpha-test 待征召", "another comment 待征召"], ["button|text:删除|rect:1.1.1.1|index:0", "button|text:删除|rect:1.2.1.1|index:1"]),
    "stateExploration",
  );
  const differentTag = normalizeDomSnapshot(commentSnapshot(["alpha-test 挑战中"], ["button|text:删除|rect:1.1.1.1|index:0"]), "stateExploration");

  assert.equal(oneComment.fingerprint, twoComments.fingerprint);
  assert.notEqual(oneComment.fingerprint, differentTag.fingerprint);
  assert.equal(oneComment.repeatableRegions[0]?.kind, "comment");
  assert.deepEqual(oneComment.repeatableRegions[0]?.businessTags, ["status:pendingRecruitment"]);
});

test("state exploration ignores transient focus and input values", () => {
  const focused = normalizeDomSnapshot(
    {
      ...commentSnapshot(["alpha-test 待征召"], ["input|text:none|rect:1.1.1.1|index:0"]),
      focusedSignature: "input|text:none|rect:1.1.1.1|index:0",
      targets: [{ signature: "input|text:none|rect:1.1.1.1|index:0", kind: "input:textbox:text", disabled: false, value: "alpha" }],
    },
    "stateExploration",
  );
  const edited = normalizeDomSnapshot(
    {
      ...commentSnapshot(["alpha-test 待征召"], ["input|text:none|rect:1.2.1.1|index:1"]),
      focusedSignature: "input|text:none|rect:1.2.1.1|index:1",
      targets: [{ signature: "input|text:none|rect:1.2.1.1|index:1", kind: "input:textbox:text", disabled: false, value: "alpha beta" }],
    },
    "stateExploration",
  );

  assert.equal(focused.fingerprint, edited.fingerprint);
  assert.equal(focused.focusedTargetSignature, null);
  assert.deepEqual(focused.inputValueKinds, []);
});

test("state exploration keeps repeatable regions coarse for global state identity", () => {
  const taskList = normalizeDomSnapshot(repeatableListSnapshot("orf-task-list"), "stateExploration");
  const objectiveList = normalizeDomSnapshot(repeatableListSnapshot("orf-objective-list"), "stateExploration");

  assert.equal(taskList.fingerprint, objectiveList.fingerprint);
  assert.notDeepEqual(taskList.repeatableRegions[0]?.abstractionKey, objectiveList.repeatableRegions[0]?.abstractionKey);
});

test("state exploration excludes generic repeatable lists from global state identity", () => {
  const state = normalizeDomSnapshot(genericListSnapshot(), "stateExploration");

  assert.equal(state.repeatableRegions.length, 0);
  assert.deepEqual(state.repeatableRegionStates, []);
});

test("repeatable detector ignores generic layout utility classes", () => {
  const state = normalizeDomSnapshot(layoutUtilitySnapshot(), "stateExploration");

  assert.equal(state.repeatableRegions.some((region) => region.label === "items-center"), false);
});

test("repeatable detector ignores page layout containers with business words", () => {
  const state = normalizeDomSnapshot(layoutContainerSnapshot(), "stateExploration");

  assert.equal(state.repeatableRegions.some((region) => region.componentName === "orf-team-dashboard"), false);
  assert.equal(state.repeatableRegions.some((region) => region.componentName === "orf-task-list"), true);
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

function commentSnapshot(comments: string[], targetSignatures: string[]) {
  return {
    url: "http://127.0.0.1:5173/tasks",
    title: "ORF",
    visibleText: comments.join(" "),
    focusedSignature: null,
    targets: targetSignatures.map((signature) => ({ signature, kind: "button:button", disabled: false })),
    flags: { hasError: false, hasToast: false, hasModal: false, hasLoading: false, hasDrawer: false },
    bodyChildCount: 1,
    domTree: {
      tag: "body",
      role: "body",
      classTokens: [],
      dataAttributes: {},
      textBucket: "none",
      subtreeTextBucket: comments.join(" "),
      children: [
        {
          tag: "aside",
          role: "aside",
          classTokens: ["orf-comment-panel"],
          dataAttributes: { "data-comment-panel": "true" },
          textBucket: "none",
          subtreeTextBucket: comments.join(" "),
          children: [
            {
              tag: "div",
              role: "div",
              classTokens: ["orf-comment-message-list"],
              dataAttributes: {},
              textBucket: "none",
              subtreeTextBucket: comments.join(" "),
              children: comments.map((comment) => ({
                tag: "article",
                role: "article",
                classTokens: ["orf-comment-message-row"],
                dataAttributes: {},
                textBucket: comment,
                subtreeTextBucket: comment,
                children: [
                  {
                    tag: "button",
                    role: "button",
                    classTokens: ["orf-comment-icon-button"],
                    dataAttributes: {},
                    textBucket: "删除",
                    subtreeTextBucket: "删除",
                    children: [],
                  },
                ],
              })),
            },
          ],
        },
      ],
    },
  };
}

function repeatableListSnapshot(className: string) {
  return {
    url: "http://127.0.0.1:5173/tasks",
    title: "ORF",
    visibleText: "目标 待征召",
    focusedSignature: null,
    targets: [],
    flags: { hasError: false, hasToast: false, hasModal: false, hasLoading: false, hasDrawer: false },
    bodyChildCount: 1,
    domTree: {
      tag: "body",
      role: "body",
      classTokens: [],
      dataAttributes: {},
      textBucket: "none",
      subtreeTextBucket: "目标 待征召",
      children: [
        {
          tag: "section",
          role: "section",
          classTokens: [className],
          dataAttributes: {},
          textBucket: "none",
          subtreeTextBucket: "目标 待征召",
          children: [
            {
              tag: "article",
              role: "article",
              classTokens: [],
              dataAttributes: {},
              textBucket: "目标 待征召",
              subtreeTextBucket: "目标 待征召",
              children: [],
            },
          ],
        },
      ],
    },
  };
}

function genericListSnapshot() {
  return {
    url: "http://127.0.0.1:5173/tasks",
    title: "ORF",
    visibleText: "alpha beta",
    focusedSignature: null,
    targets: [],
    flags: { hasError: false, hasToast: false, hasModal: false, hasLoading: false, hasDrawer: false },
    bodyChildCount: 1,
    domTree: {
      tag: "body",
      role: "body",
      classTokens: [],
      dataAttributes: {},
      textBucket: "none",
      subtreeTextBucket: "alpha beta",
      children: [
        {
          tag: "ul",
          role: "list",
          classTokens: ["generic-list"],
          dataAttributes: {},
          textBucket: "none",
          subtreeTextBucket: "alpha beta",
          children: [
            { tag: "li", role: "li", classTokens: [], dataAttributes: {}, textBucket: "alpha", subtreeTextBucket: "alpha", children: [] },
            { tag: "li", role: "li", classTokens: [], dataAttributes: {}, textBucket: "beta", subtreeTextBucket: "beta", children: [] },
          ],
        },
      ],
    },
  };
}

function layoutUtilitySnapshot() {
  return {
    url: "http://127.0.0.1:5173/tasks",
    title: "ORF",
    visibleText: "目标 任务 alpha beta",
    focusedSignature: null,
    targets: [],
    flags: { hasError: false, hasToast: false, hasModal: false, hasLoading: false, hasDrawer: false },
    bodyChildCount: 1,
    domTree: {
      tag: "body",
      role: "body",
      classTokens: [],
      dataAttributes: {},
      textBucket: "none",
      subtreeTextBucket: "目标 任务 alpha beta",
      children: [
        {
          tag: "div",
          role: "div",
          classTokens: ["items-center"],
          dataAttributes: {},
          textBucket: "none",
          subtreeTextBucket: "目标 任务 alpha beta",
          children: [
            { tag: "div", role: "div", classTokens: [], dataAttributes: {}, textBucket: "alpha", subtreeTextBucket: "alpha", children: [] },
            { tag: "div", role: "div", classTokens: [], dataAttributes: {}, textBucket: "beta", subtreeTextBucket: "beta", children: [] },
          ],
        },
      ],
    },
  };
}

function layoutContainerSnapshot() {
  return {
    url: "http://127.0.0.1:5173/tasks",
    title: "ORF",
    visibleText: "目标 待征召 目标 挑战中",
    focusedSignature: null,
    targets: [],
    flags: { hasError: false, hasToast: false, hasModal: false, hasLoading: false, hasDrawer: false },
    bodyChildCount: 1,
    domTree: {
      tag: "body",
      role: "body",
      classTokens: [],
      dataAttributes: {},
      textBucket: "none",
      subtreeTextBucket: "目标 待征召 目标 挑战中",
      children: [
        {
          tag: "main",
          role: "main",
          classTokens: ["orf-team-dashboard"],
          dataAttributes: {},
          textBucket: "none",
          subtreeTextBucket: "目标 待征召 目标 挑战中",
          children: [
            {
              tag: "section",
              role: "section",
              classTokens: ["orf-task-list"],
              dataAttributes: {},
              textBucket: "none",
              subtreeTextBucket: "目标 待征召 目标 挑战中",
              children: [
                { tag: "article", role: "article", classTokens: ["orf-task-item"], dataAttributes: {}, textBucket: "目标 待征召", subtreeTextBucket: "目标 待征召", children: [] },
                { tag: "article", role: "article", classTokens: ["orf-task-item"], dataAttributes: {}, textBucket: "目标 挑战中", subtreeTextBucket: "目标 挑战中", children: [] },
              ],
            },
            {
              tag: "section",
              role: "section",
              classTokens: ["orf-task-list"],
              dataAttributes: {},
              textBucket: "none",
              subtreeTextBucket: "目标 待征召 目标 挑战中",
              children: [
                { tag: "article", role: "article", classTokens: ["orf-task-item"], dataAttributes: {}, textBucket: "目标 待征召", subtreeTextBucket: "目标 待征召", children: [] },
                { tag: "article", role: "article", classTokens: ["orf-task-item"], dataAttributes: {}, textBucket: "目标 挑战中", subtreeTextBucket: "目标 挑战中", children: [] },
              ],
            },
          ],
        },
      ],
    },
  };
}

test("visible text sanitizer removes URLs, dates, tokens, and raw numbers", () => {
  const sanitized = sanitizeVisibleText("2026-05-19 token abcdef1234567890 https://example.test/a.png value 42");
  assert.equal(sanitized.includes("https://example.test"), false);
  assert.equal(sanitized.includes("abcdef1234567890"), false);
  assert.equal(sanitized.includes("42"), false);
});
