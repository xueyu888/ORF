import assert from "node:assert/strict";
import test from "node:test";
import {
  codexActivityStyleIds,
  formatCodexActivityMessage,
  getCodexActivitySkipReason,
} from "../server/integrations/codex-activity-reporter";

const chineseTitlePrefix =
  /^(龙傲天版|本座战报|胜者记录|强者速览|龙傲天表情包版|定论|冷面强者曰|江湖已知|未来回执|全频道通告|捷报|强者小记|龙傲天终局版)：/m;

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

  assert.doesNotMatch(message, /定论：/);
  assert.match(message, /活动播报/);
  assert.match(message, /简明总结问答内容/);
  assert.match(message, /结论明确，继续推进/);
  assert.match(message, /^这轮把 Codex 活动播报机制又调顺了。/);
  assert.match(
    message,
    /English: This round tuned the Codex activity reporting mechanism back into shape\..*The conclusion is clear; keep pushing forward\./,
  );
  assert.match(message, /Words:/);
  assert.match(message, /activity \/ækˈtɪvəti\/ n\. 活动/);
  assert.match(message, /Grammar: .*一般过去时/);
  assert.doesNotMatch(message, new RegExp(rawPrompt));
  assert.doesNotMatch(message, /formatter 的输入当作信号源/);
  assert.doesNotMatch(message, /抽象总结对话|Mattermost/);
  assert.doesNotMatch(message, /发到mm/);
  assert.doesNotMatch(message, /文言：/);
  assert.doesNotMatch(message, chineseTitlePrefix);
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

  assert.doesNotMatch(message, /捷报：/);
  assert.match(message, /活动播报/);
  assert.match(message, /胜势已成/);
  assert.match(message, /The winning momentum is already formed\./);
  assert.match(message, /English:/);
  assert.match(message, /Words:/);
  assert.match(message, /Grammar:/);
  assert.doesNotMatch(message, chineseTitlePrefix);
  assert.doesNotMatch(message, /10\.0\.0\.1|user@example\.com|not-a-real-password|const token|secret/);
});

test("supports multiple rotating confident activity styles", () => {
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
  assert.ok(messages.every((message) => /拿下|本座|强者|胜者|不服|此局|时间线|众人|胜势|赢了|一锤定音|自信/.test(message)));
  assert.ok(messages.every((message) => message.includes("活动播报")));
  assert.ok(messages.some((message) => message.includes("水豚噜噜")));
  assert.ok(messages.every((message) => /English:/.test(message)));
  assert.ok(messages.every((message) => /Words:/.test(message)));
  assert.ok(messages.every((message) => /Grammar:/.test(message)));
  assert.ok(messages.every((message) => /\/[A-Za-zæɑɔəɛɪʊʌˈˌːðŋʃʒθtʃdʒɡ -]+\/.*(n\.|v\.|det\.)/.test(message)));
  assert.ok(messages.every((message) => !/文言：|行舟将欲走|明月几时有|朝辞白帝|床前代码光/.test(message)));
  assert.ok(messages.every((message) => !chineseTitlePrefix.test(message)));
  assert.ok(messages.every((message) => !message.includes("xueyu")));
  assert.ok(messages.every((message) => !message.includes("不要复制原始对话")));
  assert.ok(messages.every((message) => message.includes("\n")));
});

test("skips Codex internal title generation notifications", () => {
  const skipReason = getCodexActivitySkipReason({
    summary:
      "You are a helpful assistant. You will be presented with a user prompt, and your job is to provide a short title for a task that will be created from that prompt.",
    details: ['{"title":"改为单条人话消息"}'],
  });

  assert.equal(skipReason, "internal-title");
});
