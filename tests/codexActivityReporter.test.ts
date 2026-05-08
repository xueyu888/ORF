import assert from "node:assert/strict";
import test from "node:test";
import {
  codexActivityStyleIds,
  formatCodexActivityMessage,
  getCodexActivitySkipReason,
} from "../server/integrations/codex-activity-reporter";

const chineseTitlePrefix =
  /^(龙傲天版|本座战报|胜者记录|强者速览|龙傲天表情包版|定论|冷面强者曰|江湖已知|未来回执|全频道通告|捷报|强者小记|龙傲天终局版)：/m;

function firstContentLine(message: string) {
  return message.split("\n").find((line) => line !== "---") ?? "";
}

test("keeps the concrete session summary instead of replacing it with boilerplate", () => {
  const message = formatCodexActivityMessage(
    {
      summary: "现在在弄悬赏大厅，别写空话套话",
      details: ["把悬赏大厅改成主动贡献入口，补充 ContributionSummary、RecruitmentSection 和 AvailableBountyList。"],
    },
    { CODEX_ACTIVITY_STYLE: "serious" },
  );

  assert.doesNotMatch(message, /定论：/);
  assert.match(message, /^---\n/);
  assert.match(message, /悬赏大厅/);
  assert.match(message, /主动贡献入口/);
  assert.match(message, /ContributionSummary/);
  assert.match(message, /AvailableBountyList/);
  assert.match(message, /结论明确，继续推进/);
  assert.doesNotMatch(message, /整理了项目文档|调整了前端体验|完成了一轮 ORF 项目协作/);
  assert.equal((firstContentLine(message).match(/。/g) ?? []).length, 1);
  assert.doesNotMatch(message, /English:/);
  assert.doesNotMatch(message, /Words:/);
  assert.doesNotMatch(message, /Grammar:/);
  assert.doesNotMatch(message, /空话套话/);
  assert.doesNotMatch(message, /This round records.*悬赏大厅/);
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
  assert.match(message, /^---\n/);
  assert.match(message, /胜势已成/);
  assert.equal((firstContentLine(message).match(/。/g) ?? []).length, 1);
  assert.doesNotMatch(message, /English:/);
  assert.doesNotMatch(message, /Words:/);
  assert.doesNotMatch(message, /Grammar:/);
  assert.doesNotMatch(message, chineseTitlePrefix);
  assert.doesNotMatch(message, /10\.0\.0\.1|user@example\.com|not-a-real-password|const token|secret/);
  assert.match(message, /\[redacted\]|\[url\]|\[email\]/);
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
  assert.ok(messages.every((message) => message.startsWith("---\n")));
  assert.ok(messages.every((message) => /气势拉满|拿下|本座|胜者|退散|结论|不服|此局|时间线|众人|胜势|赢了/.test(message)));
  assert.ok(messages.every((message) => message.includes("调整自动播报")));
  assert.ok(messages.some((message) => message.includes("水豚噜噜")));
  assert.ok(messages.every((message) => !/English:/.test(message)));
  assert.ok(messages.every((message) => !/Words:/.test(message)));
  assert.ok(messages.every((message) => !/Grammar:/.test(message)));
  assert.ok(messages.every((message) => (firstContentLine(message).match(/。/g) ?? []).length === 1));
  assert.ok(messages.every((message) => !/文言：|行舟将欲走|明月几时有|朝辞白帝|床前代码光/.test(message)));
  assert.ok(messages.every((message) => !chineseTitlePrefix.test(message)));
  assert.ok(messages.every((message) => !message.includes("xueyu")));
  assert.ok(messages.every((message) => !message.includes("不要复制原始对话")));
  assert.ok(messages.every((message) => message.includes("\n")));
});

test("ignores conversational agreement when result bullets are available", () => {
  const message = formatCodexActivityMessage(
    {
      summary: "这轮你说得对，我把刚才那种业务关键词规则化的方向撤掉了",
      details: [
        "改动结果：",
        "- 播报实现：删掉固定模板映射，改为从本轮 summary/details 里取最具体的一句。",
        "- 测试：新增验证，确保悬赏大厅不会被替换成整理项目文档这类套话。",
      ],
    },
    { CODEX_ACTIVITY_STYLE: "wuxia" },
  );

  assert.match(message, /删掉固定模板映射|悬赏大厅不会被替换/);
  assert.doesNotMatch(message, /你说得对|刚才那种|方向撤掉/);
  assert.match(message, /此局我定/);
});

test("uses explicit Codex-written activity summary when present", () => {
  const message = formatCodexActivityMessage(
    {
      summary: "看起来并没有解决问题",
      details: [
        "你说得对，第一行还是不应该被播报。",
        "播报摘要：修正 Codex 活动播报，让 notify hook 读取 Codex 自己写的一句话总结，而不是截取回复开头。",
      ],
    },
    { CODEX_ACTIVITY_STYLE: "sci-fi" },
  );

  assert.match(message, /notify hook/);
  assert.match(message, /Codex 自己写的一句话总结/);
  assert.doesNotMatch(message, /你说得对|看起来并没有解决问题|第一行还是不应该被播报/);
  assert.match(message, /时间线已向我方收束/);
});

test("uses explicit matching English summary instead of generic English filler", () => {
  const message = formatCodexActivityMessage(
    {
      summary: "中英文为什么对不上？",
      details: [
        "播报摘要：修正 Codex 活动播报，让中文和英文都来自 Codex 自己写的同一轮总结。",
        "播报英文：This round fixes the Codex activity report so both Chinese and English come from Codex-written summaries for the same session.",
      ],
    },
    { CODEX_ACTIVITY_STYLE: "serious" },
  );

  assert.match(message, /中文和英文都来自 Codex 自己写的同一轮总结/);
  assert.match(message, /English: This round fixes the Codex activity report so both Chinese and English come from Codex-written summaries for the same session, and the conclusion is clear and the advance continues\./);
  assert.doesNotMatch(message, /concrete session result stated above/);
  assert.match(message, /summary \/ˈsʌməri\/ n\. 总结/);
});

test("skips Codex internal title generation notifications", () => {
  const skipReason = getCodexActivitySkipReason({
    summary:
      "You are a helpful assistant. You will be presented with a user prompt, and your job is to provide a short title for a task that will be created from that prompt.",
    details: ['{"title":"改为单条人话消息"}'],
  });

  assert.equal(skipReason, "internal-title");
});
