import assert from "node:assert/strict";
import test from "node:test";
import { codexActivityStyleIds, formatCodexActivityMessage } from "../server/integrations/codex-activity-reporter";

test("formats Codex activity message with normal detail length", () => {
  const message = formatCodexActivityMessage(
    {
      summary: "把活动播报接到 Mattermost ORF 频道，而且不要再把内容压成八个字以内。",
      details: ["独立放在 integrations 目录", "支持 dry-run，也支持真实发送时按风格轮换"],
    },
    { CODEX_ACTIVITY_STYLE: "serious" },
  );

  assert.ok(message.length > 60);
  assert.match(message, /不要再把内容压成八个字以内/);
  assert.match(message, /支持真实发送时按风格轮换/);
  assert.doesNotMatch(message, /^####/);
  assert.doesNotMatch(message, /xueyu/);
  assert.doesNotMatch(message, /。。/);
});

test("supports multiple rotating activity styles", () => {
  assert.ok(codexActivityStyleIds.length >= 10);

  const messages = codexActivityStyleIds.map((styleId) =>
    formatCodexActivityMessage(
      {
        summary: "把自动播报改得更好玩",
        details: ["轮流换一种语气"],
      },
      { CODEX_ACTIVITY_STYLE: styleId },
    ),
  );

  assert.equal(new Set(messages).size, codexActivityStyleIds.length);
  assert.ok(messages.some((message) => message.includes("小令一阕")));
  assert.ok(messages.some((message) => message.includes("事已成")));
  assert.ok(messages.some((message) => message.includes("冷")));
  assert.ok(messages.every((message) => !message.includes("xueyu")));
});
