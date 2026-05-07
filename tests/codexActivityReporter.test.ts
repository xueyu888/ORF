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

  assert.match(message, /播报机制|代码播报/);
  assert.doesNotMatch(message, new RegExp(rawPrompt));
  assert.doesNotMatch(message, /formatter 的输入当作信号源/);
  assert.doesNotMatch(message, /抽象总结对话|Mattermost/);
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

  assert.match(message, /播报机制|代码播报/);
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
  const poemParodyPattern =
    /行舟将欲走|明月几时有|朝辞白帝|床前代码光|众里寻他|白日依山尽|问君能有几多愁|十步改一处|大鹏一日同风起|春眠不觉晓|清明时节码纷纷|采菊东篱下|醉里挑灯看码/;
  assert.ok(messages.every((message) => poemParodyPattern.test(message)));
  assert.ok(messages.some((message) => message.includes("薛宇行舟将欲走")));
  assert.ok(messages.some((message) => message.includes("稳了.jpg") || message.includes("😎")));
  assert.ok(messages.every((message) => !/本台消息|表情包递上|这轮已经完成|讲个短笑话|今日小记|深夜电台|来自近未来|冷笑话时间/.test(message)));
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
