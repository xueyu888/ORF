import assert from "node:assert/strict";
import test from "node:test";
import {
  codexActivityStyleIds,
  formatCodexActivityMessage,
  getCodexActivitySkipReason,
} from "../server/integrations/codex-activity-reporter";

const oldTemplateTone = /龙傲天|本座|胜者|退散|此局|时间线已向我方收束|众人只需看结果|胜势已成|平平无奇地赢了|结论明确，继续推进/;

function lines(message: string) {
  return message.split("\n");
}

function firstContentLine(message: string) {
  return lines(message).find((line) => line !== "---") ?? "";
}

test("formats a question-first report with English answer grammar and meme lines", () => {
  const message = formatCodexActivityMessage(
    {
      summary: "现在在弄悬赏大厅，别写空话套话",
      details: ["把悬赏大厅改成主动贡献入口，补充 ContributionSummary、RecruitmentSection 和 AvailableBountyList。"],
    },
    { CODEX_ACTIVITY_STYLE: "serious" },
  );

  assert.match(message, /^---\n/);
  assert.match(message, /问题：现在在弄悬赏大厅/);
  assert.match(message, /悬赏大厅/);
  assert.match(message, /ContributionSummary/);
  assert.match(message, /AvailableBountyList/);
  assert.match(message, /Answer: The answer keeps the Bounty Hall work specific, including ContributionSummary, RecruitmentSection, and AvailableBountyList, rather than turning it into a generic frontend update\./);
  assert.match(message, /语法：rather than 用来连接被排除的旧做法/);
  assert.match(message, /表情包：/);
  assert.doesNotMatch(message, /整理了项目文档|调整了前端体验|完成了一轮 ORF 项目协作/);
  assert.doesNotMatch(message, oldTemplateTone);
  assert.doesNotMatch(message, /Words:/);
  assert.equal((firstContentLine(message).match(/。/g) ?? []).length, 1);
});

test("does not leak raw urls credentials or snippets into Mattermost copy", () => {
  const message = formatCodexActivityMessage(
    {
      summary: "请把 Mattermost 地址 http://10.0.0.1:8065 和账号 user@example.com 配到脚本里",
      details: ["密码是 not-a-real-password，代码片段 const token = 'secret' 只是测试"],
    },
    { CODEX_ACTIVITY_STYLE: "news" },
  );

  assert.match(message, /^---\n/);
  assert.match(message, /问题：/);
  assert.match(message, /Answer: /);
  assert.match(message, /语法：/);
  assert.match(message, /表情包：/);
  assert.doesNotMatch(message, oldTemplateTone);
  assert.doesNotMatch(message, /10\.0\.0\.1|user@example\.com|not-a-real-password|const token|secret/);
  assert.match(message, /\[redacted\]|\[url\]|\[email\]/);
});

test("accepts legacy style names but keeps the same normal format", () => {
  assert.ok(codexActivityStyleIds.includes("normal"));
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

  assert.equal(new Set(messages).size, 1);
  assert.ok(messages.every((message) => message.startsWith("---\n")));
  assert.ok(messages.every((message) => message.includes("调整自动播报")));
  assert.ok(messages.every((message) => message.includes("Answer:")));
  assert.ok(messages.every((message) => message.includes("语法：")));
  assert.ok(messages.every((message) => message.includes("表情包：")));
  assert.ok(messages.every((message) => !oldTemplateTone.test(message)));
  assert.ok(messages.every((message) => !message.includes("不要复制原始对话")));
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
  assert.doesNotMatch(message, oldTemplateTone);
});

test("uses explicit Codex-written activity fields when present", () => {
  const message = formatCodexActivityMessage(
    {
      summary: "看起来并没有解决问题",
      details: [
        "你说得对，第一行还是不应该被播报。",
        "播报问题：你指出活动播报不该截取回复开头，而要保留这一轮真正的问题。",
        "播报回答：The answer makes the notify hook read Codex-written report fields instead of guessing from the first reply line.",
        "播报语法：`instead of ...` 表示“而不是”，用于对比旧做法和新做法。",
        "播报表情：播报归位.jpg 🧭",
      ],
    },
    { CODEX_ACTIVITY_STYLE: "sci-fi" },
  );

  assert.match(message, /notify hook/);
  assert.match(message, /真正的问题/);
  assert.match(message, /Answer: The answer makes the notify hook read Codex-written report fields instead of guessing from the first reply line\./);
  assert.match(message, /语法：instead of 表示“而不是”，用于对比旧做法和新做法。/);
  assert.match(message, /表情包：播报归位\.jpg 🧭/);
  assert.doesNotMatch(message, /你说得对|看起来并没有解决问题|第一行还是不应该被播报/);
  assert.doesNotMatch(message, oldTemplateTone);
});

test("keeps legacy summary and English fields compatible with the new template", () => {
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
  assert.match(message, /Answer: This round fixes the Codex activity report so both Chinese and English come from Codex-written summaries for the same session\./);
  assert.doesNotMatch(message, /concrete session result stated above/);
  assert.match(message, /语法：so 后面接完整句子/);
});

test("does not turn a reference question into a generic documentation update", () => {
  const message = formatCodexActivityMessage(
    {
      summary: "怎么三个文档都一样，是不是应该改成引用啊。这样的三个地方到处跑似乎不好。",
      details: ["你先说说自己的想法。"],
    },
    { CODEX_ACTIVITY_STYLE: "serious" },
  );

  assert.match(message, /问题：怎么三个文档都一样，是不是应该改成引用啊/);
  assert.match(message, /Answer: The answer is to treat the repeated rule text as a single-source reference issue instead of flattening three contexts into one document-edit template\./);
  assert.match(message, /语法：instead of 后面接名词或动名词/);
  assert.match(message, /表情包：引用归位\.jpg 🧭/);
  assert.doesNotMatch(message, /The update changes the documentation|文档归位\.jpg|已更新对应文档/);
});

test("skips Codex internal title generation notifications", () => {
  const skipReason = getCodexActivitySkipReason({
    summary:
      "You are a helpful assistant. You will be presented with a user prompt, and your job is to provide a short title for a task that will be created from that prompt.",
    details: ['{"title":"改为单条人话消息"}'],
  });

  assert.equal(skipReason, "internal-title");
});
