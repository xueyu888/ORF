import assert from "node:assert/strict";
import test from "node:test";
import {
  codexActivityStyleIds,
  formatCodexActivityMessage,
  getCodexActivitySkipReason,
} from "../server/integrations/codex-activity-reporter";

test("summarizes Codex activity without copying conversation text", () => {
  const rawPrompt = "你千万别复制我的会话内容，我是让你总结，对话的内容，然后形成某一种风格，然后发到mm";
  const rawResult = "我会把 formatter 的输入当作信号源，不把你的原话输出到 Mattermost。";
  const message = formatCodexActivityMessage(
    {
      summary: rawPrompt,
      details: [rawResult],
    },
    { CODEX_ACTIVITY_STYLE: "serious" },
  );

  assert.match(message, /Codex 活动播报机制/);
  assert.match(message, /抽象总结对话/);
  assert.match(message, /Mattermost/);
  assert.doesNotMatch(message, new RegExp(rawPrompt));
  assert.doesNotMatch(message, /formatter 的输入当作信号源/);
  assert.doesNotMatch(message, /发到mm/);
  assert.doesNotMatch(message, /^####/);
  assert.doesNotMatch(message, /xueyu/);
  assert.doesNotMatch(message, /。。/);
});

test("does not leak raw urls credentials or snippets into Mattermost copy", () => {
  const message = formatCodexActivityMessage(
    {
      summary: "请把 Mattermost 地址 http://10.0.0.1:8065 和账号 user@example.com 配到脚本里",
      details: ["密码是 not-a-real-password，代码片段 const token = 'secret' 只是测试"],
    },
    { CODEX_ACTIVITY_STYLE: "news" },
  );

  assert.match(message, /Codex 活动播报机制|Mattermost/);
  assert.doesNotMatch(message, /10\.0\.0\.1|user@example\.com|not-a-real-password|const token|secret/);
});

test("supports multiple rotating activity styles", () => {
  assert.ok(codexActivityStyleIds.length >= 11);
  assert.ok(codexActivityStyleIds.includes("meme"));

  const messages = codexActivityStyleIds.map((styleId) =>
    formatCodexActivityMessage(
      {
        summary: "调整自动播报的风格轮换",
        details: ["不要复制原始对话，只发改写后的活动摘要"],
      },
      { CODEX_ACTIVITY_STYLE: styleId },
    ),
  );

  assert.equal(new Set(messages).size, codexActivityStyleIds.length);
  assert.ok(messages.some((message) => message.includes("小令")));
  assert.ok(messages.some((message) => message.includes("事既毕")));
  assert.ok(messages.some((message) => message.includes("表情包") && message.includes("稳了.jpg")));
  assert.ok(messages.some((message) => message.includes("本台消息")));
  assert.ok(messages.every((message) => !message.includes("xueyu")));
  assert.ok(messages.every((message) => !message.includes("不要复制原始对话")));
  assert.ok(messages.every((message) => !message.includes("\n")));
});

test("skips Codex internal title generation notifications", () => {
  const skipReason = getCodexActivitySkipReason({
    summary:
      "You are a helpful assistant. You will be presented with a user prompt, and your job is to provide a short title for a task that will be created from that prompt.",
    details: ['{"title":"改为单条人话消息"}'],
  });

  assert.equal(skipReason, "internal-title");
});
