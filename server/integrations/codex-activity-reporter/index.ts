import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const configSchema = z.object({
  MATTERMOST_URL: z.string().url(),
  MATTERMOST_LOGIN_ID: z.string().min(1),
  MATTERMOST_PASSWORD: z.string().min(1),
  MATTERMOST_CHANNEL_ID: z.string().min(1),
  CODEX_ACTIVITY_CHANNEL_ID: z.string().min(1).optional(),
  CODEX_ACTIVITY_STYLE: z.string().trim().min(1).optional(),
  CODEX_ACTIVITY_STYLE_STATE_FILE: z.string().trim().min(1).optional(),
});

export const codexActivityInputSchema = z.object({
  summary: z.string().trim().min(1),
  details: z.array(z.string().trim().min(1)).default([]),
  actor: z.string().trim().min(1).optional(),
});

type CodexActivityConfig = z.infer<typeof configSchema>;
export type CodexActivityInput = z.infer<typeof codexActivityInputSchema>;

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function trimSentenceEnd(value: string) {
  return value.trim().replace(/[。.!！]+$/, "");
}

function cleanActivityText(value: string) {
  return value
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function redactSensitiveText(value: string) {
  return value
    .replace(/\bconst\s+[A-Za-z_$][\w$]*\s*=\s*['"][^'"]+['"]/g, "[code redacted]")
    .replace(/\bconst\s+[A-Za-z_$][\w$]*\s*=\s*\[redacted\]/g, "[code redacted]")
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b(password|passwd|pwd|token|secret|api[_-]?key)\s*[:=]\s*['"]?[^'"\s，。；,;]+['"]?/gi, "$1=[redacted]")
    .replace(/(密码|口令|密钥|令牌)\s*(是|为|[:=])\s*[^，。；,;\s]+/g, "$1=[redacted]");
}

function normalizeForClassification(value: string) {
  return cleanActivityText(value).toLowerCase();
}

function includesAny(value: string, patterns: string[]) {
  const normalized = value.toLowerCase();
  return patterns.some((pattern) => normalized.includes(pattern.toLowerCase()));
}

function activitySource(input: CodexActivityInput) {
  const parsed = codexActivityInputSchema.parse(input);
  return normalizeForClassification([parsed.summary, ...parsed.details].join("\n"));
}

export function getCodexActivitySkipReason(input: CodexActivityInput) {
  const source = activitySource(input);

  if (
    source.includes("you are a helpful assistant") &&
    source.includes("short title for a task") &&
    source.includes("created from that prompt")
  ) {
    return "internal-title";
  }

  return undefined;
}

function cleanSummaryLine(value: string) {
  return redactSensitiveText(value)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^[-*]\s+/, "")
    .replace(/^#+\s+/, "")
    .replace(/^(`?[\w./ -]+`?\s*)?[:：]\s*/, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanGrammarNote(value: string) {
  return cleanSummaryLine(value)
    .replace(/\s*(?:\.{3}|…{1,2})\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lineLooksConcrete(value: string) {
  return includesAny(value, [
    "改",
    "更新",
    "重写",
    "写入",
    "补充",
    "修正",
    "提交",
    "推送",
    "设计",
    "新增",
    "删除",
    "调整",
    "实现",
    "修复",
    "悬赏大厅",
    "征召",
    "积分",
    "讨论",
    "结论",
    "确认",
  ]);
}

function lineLooksBoilerplate(value: string) {
  return includesAny(value, [
    "你说得对",
    "我理解",
    "明白",
    "刚才",
    "方向撤掉",
    "截图里",
    "暴露的问题",
    "看起来",
    "并没有解决问题",
    "我会",
    "我先",
    "接下来",
    "已改完",
    "改动结果：",
    "现在改成：",
    "验证：",
    "验证已跑",
    "dry-run",
    "未跑构建",
    "当前改动",
    "工作区",
    "如果你想",
    "后续可以",
    "谢谢",
    "不要复制原始对话",
    "原始对话",
    "继续来",
    "可以，而且",
  ]);
}

function summaryCandidates(input: CodexActivityInput) {
  return activityLines(input)
    .map(cleanSummaryLine)
    .filter((line) => line.length >= 6 && !lineLooksBoilerplate(line));
}

function activityLines(input: CodexActivityInput) {
  const parsed = codexActivityInputSchema.parse(input);
  return [...parsed.details, parsed.summary].flatMap((text) => cleanActivityText(text).split("\n"));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanAnswerLine(value: string) {
  return redactSensitiveText(value)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^[-*]\s+/, "")
    .replace(/^#+\s+/, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function explicitFieldCandidate(input: CodexActivityInput, labels: string[], clean: (value: string) => string) {
  const labelPattern = labels.map(escapeRegExp).join("|");
  const fieldPattern = new RegExp(`^(?:${labelPattern})\\s*[:：]\\s*(.+)$`, "i");

  for (const line of activityLines(input)) {
    const match = line.match(fieldPattern);
    if (match?.[1]) {
      const value = clean(match[1]);
      if (value) return value;
    }
  }

  return undefined;
}

function explicitQuestionCandidate(input: CodexActivityInput) {
  return explicitFieldCandidate(input, ["播报问题", "活动问题", "Question", "问题"], cleanSummaryLine);
}

function explicitLegacySummaryCandidate(input: CodexActivityInput) {
  return explicitFieldCandidate(input, ["播报摘要", "活动摘要", "Activity summary", "Summary"], cleanSummaryLine);
}

function explicitAnswerCandidate(input: CodexActivityInput) {
  return explicitFieldCandidate(
    input,
    ["播报回答", "活动回答", "Answer", "回答", "播报英文", "活动英文", "Broadcast English", "English summary"],
    (value) => trimEnglishSentenceEnd(cleanAnswerLine(value)),
  );
}

function explicitGrammarCandidate(input: CodexActivityInput) {
  return explicitFieldCandidate(input, ["播报语法", "活动语法", "Grammar note", "Grammar", "语法"], (value) =>
    trimChineseSentenceEnd(cleanGrammarNote(value)),
  );
}

function explicitMemeCandidate(input: CodexActivityInput) {
  return explicitFieldCandidate(input, ["播报表情", "活动表情", "Meme", "表情包"], cleanSummaryLine);
}

function summaryCandidateScore(line: string, index: number) {
  let score = 100 - index;

  if (lineLooksConcrete(line)) score += 30;
  if (/(\.md|\.ts|\.tsx|tests?\/|server\/|docs\/)/i.test(line)) score += 10;
  if (/[A-Z][A-Za-z0-9]+[A-Z][A-Za-z0-9]+/.test(line)) score += 8;
  if (includesAny(line, ["文档", "实现", "测试", "验证", "播报", "悬赏大厅", "征召", "积分"])) score += 8;
  if (includesAny(line, ["明确", "改为", "删掉", "确保", "避免", "通过"])) score += 8;
  if (includesAny(line, ["密码", "口令", "密钥", "令牌", "[redacted]", "[code redacted]"])) score -= 20;
  if (/^[^，。；]{2,16}[：:]/.test(line)) score += 6;
  if (line.length > 120) score -= 10;

  return score;
}

function bestSummaryCandidate(input: CodexActivityInput) {
  return summaryCandidates(input)
    .map((line, index) => ({ line, score: summaryCandidateScore(line, index) }))
    .sort((left, right) => right.score - left.score)
    .map((item) => item.line)[0];
}

function buildReportQuestion(input: CodexActivityInput) {
  const explicit = explicitQuestionCandidate(input) ?? explicitLegacySummaryCandidate(input);
  if (explicit) {
    return naturalQuestionClause(explicit);
  }

  const parsed = codexActivityInputSchema.parse(input);
  const summary = cleanSummaryLine(parsed.summary);
  if (summary.length >= 6 && !lineLooksBoilerplate(summary)) {
    return naturalQuestionClause(summary);
  }

  return naturalQuestionClause(bestSummaryCandidate(input) ?? "这轮需要明确 ORF 工作的真实问题");
}

function clause(value: string) {
  return trimSentenceEnd(value).replace(/\s*\n+\s*/g, " ").replace(/[ \t]+/g, " ").trim();
}

function naturalQuestionClause(value: string) {
  return clause(value)
    .replace(
      /^这轮(?:用户|你|我们|我)?(?=把|对|为|修复|修正|解决|新增|补充|实现|接入|对接|持久化|写入|提交|推送|更新|调整|改|重写|讨论|确认|明确|测试|验证|指出|质疑|要求|想要|希望)/,
      "",
    )
    .replace(/^这轮(?:用户|你|我们|我)?\s*/, "")
    .trim();
}

function trimChineseSentenceEnd(value: string) {
  return value.trim().replace(/[。.!！？?]+$/, "");
}

function trimEnglishSentenceEnd(value: string) {
  return value.trim().replace(/[。.!！？?]+$/, "");
}

function formatChineseSentence(value: string) {
  const text = value.trim();
  if (/[。！？?]$/.test(text)) return text;
  return `${trimChineseSentenceEnd(text)}。`;
}

function formatEnglishSentence(value: string) {
  return `${trimEnglishSentenceEnd(value)}.`;
}

function formatMattermostMessage(value: string) {
  return value
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

const messageSeparator = "---";

interface ActivityReportPack {
  question: string;
  answer: string;
  grammar: string;
  meme: string;
}

function englishIdentifierText(value: string) {
  const identifiers = Array.from(new Set(value.match(/\b[A-Z][A-Za-z0-9]+(?:[A-Z][A-Za-z0-9]+)+\b/g) ?? [])).slice(0, 3);
  const identifierText =
    identifiers.length === 0
      ? ""
      : identifiers.length === 1
        ? `, including ${identifiers[0]}`
        : `, including ${identifiers.slice(0, -1).join(", ")}, and ${identifiers.at(-1)}`;

  return identifierText;
}

function fallbackEnglishAnswer(question: string, evidence: string | undefined) {
  const signal = [question, evidence].filter(Boolean).join("\n");
  const identifierText = englishIdentifierText(signal);

  if (includesAny(signal, ["活动播报", "自动播报", "播报"]) && includesAny(signal, ["模板", "机械", "愚蠢", "空话", "套话", "answer", "英文", "语法", "中文"])) {
    return "The answer is to make the activity report question-first and AI-written, so it captures the user's concern before summarizing the response in English";
  }

  if (includesAny(signal, ["三个文档", "三处", "三个地方", "都一样", "重复"]) && includesAny(signal, ["引用", "单一来源", "source"])) {
    return "The answer is to treat the repeated rule text as a single-source reference issue instead of flattening three contexts into one document-edit template";
  }

  if (includesAny(signal, ["引用", "单一来源"])) {
    return "The answer keeps the reference relationship explicit instead of turning the context into a vague document note";
  }

  if (includesAny(signal, ["悬赏大厅"])) {
    return `The answer keeps the Bounty Hall work specific${identifierText}, rather than turning it into a generic frontend update`;
  }

  if (includesAny(signal, ["评论"]) && includesAny(signal, ["后端"])) {
    return "The answer keeps the comment backend issue tied to the actual verification needed, rather than treating the discussion as a finished fix";
  }

  if (includesAny(signal, ["质疑", "不对", "问题", "为什么", "怎么", "是不是", "吗"])) {
    return "The answer clarifies the decision without pretending that a follow-up implementation has already happened";
  }

  if (includesAny(signal, ["修复", "修正", "实现", "新增", "补充", "调整", "改成", "写入", "提交", "推送", "验证"])) {
    return `The answer summarizes the concrete ORF result${identifierText} without inventing extra scope`;
  }

  return "The answer records the actual ORF decision in plain English without inventing completed work";
}

function fallbackGrammarNote(answer: string) {
  if (answer.includes(" instead of ")) {
    return "instead of 后面接名词或动名词，用来说明新做法替代了旧做法。";
  }

  if (answer.includes(" rather than ")) {
    return "rather than 用来连接被排除的旧做法，强调这次回答选择了另一种表达方式。";
  }

  if (answer.includes(" without ")) {
    return "without 后面接名词或动名词，用来说明某件事不会伴随发生。";
  }

  if (answer.includes(" so ")) {
    return "so 后面接完整句子，用来说明前面的改动带来的结果。";
  }

  if (answer.includes(", including ")) {
    return "including 后面列出具体内容，用来补充说明这次改动涉及哪些模块。";
  }

  if (answer.includes(" was ")) {
    return "was 加过去分词构成被动语态，适合说明某项工作已经被完成。";
  }

  if (answer.includes("The answer ")) {
    return "The answer 后面接现在时动词，可以直接说明这轮回复给出的判断。";
  }

  return "一般现在时可以用来做简短回答，直接说明这轮对话形成的判断。";
}

function fallbackMeme(question: string, answer: string) {
  const signal = `${question}\n${answer}`;
  if (includesAny(signal, ["引用", "single-source", "reference"])) return "引用归位.jpg 🧭";
  if (includesAny(signal, ["模板", "套话", "generic", "flattening", "keyword"])) return "别再套模板.jpg";
  if (includesAny(signal, ["question-first", "问题"])) return "先看问题.jpg";
  if (includesAny(signal, ["测试", "验证", "通过"])) return "测试全绿.jpg ✅";
  if (includesAny(signal, ["提交", "推送"])) return "推送已到.jpg 🚀";
  if (includesAny(signal, ["悬赏大厅"])) return "悬赏大厅开门.jpg 🏁";
  if (includesAny(signal, ["评论"])) return "评论落库.jpg 💬";
  if (includesAny(signal, ["修复", "修正", "白屏"])) return "问题收口.jpg ✅";
  return "这次说清楚了.jpg 🧭";
}

function activityReportPack(input: CodexActivityInput): ActivityReportPack {
  const question = buildReportQuestion(input);
  const answer = explicitAnswerCandidate(input) ?? fallbackEnglishAnswer(question, bestSummaryCandidate(input));
  const grammar = explicitGrammarCandidate(input) ?? fallbackGrammarNote(answer);

  return {
    question,
    answer: trimEnglishSentenceEnd(answer),
    grammar,
    meme: explicitMemeCandidate(input) ?? fallbackMeme(question, answer),
  };
}

function formatNormalSummary(pack: ActivityReportPack) {
  return [
    messageSeparator,
    `问题：${formatChineseSentence(pack.question)}`,
    `Answer: ${formatEnglishSentence(pack.answer)}`,
    `语法：${formatChineseSentence(pack.grammar)}`,
    `表情包：${pack.meme}`,
  ].join("\n");
}

export function readCodexActivityConfig(env: NodeJS.ProcessEnv = process.env) {
  return configSchema.parse(env);
}

interface CodexActivityMessageContext {
  pack: ActivityReportPack;
}

interface CodexActivityStyle {
  id: string;
  label: string;
  format: (context: CodexActivityMessageContext) => string;
}

const codexActivityStyles = [
  {
    id: "normal",
    label: "简洁",
    format: ({ pack }) => formatNormalSummary(pack),
  },
] satisfies CodexActivityStyle[];

const legacyStyleIds = ["poem", "ci", "classical", "humor", "meme", "serious", "cold-joke", "wuxia", "sci-fi", "radio", "news", "diary", "stage"];
export const codexActivityStyleIds = [...codexActivityStyles.map((style) => style.id), ...legacyStyleIds];

function resolveStyle(styleId: string | undefined) {
  if (!styleId || styleId === "rotate") {
    return undefined;
  }

  const style = codexActivityStyles.find((candidate) => candidate.id === styleId);
  if (style) {
    return style;
  }

  if (!legacyStyleIds.includes(styleId)) {
    throw new Error(`Unknown Codex activity style: ${styleId}. Available styles: ${codexActivityStyleIds.join(", ")}`);
  }

  return codexActivityStyles[0];
}

function buildMessageContext(input: CodexActivityInput): CodexActivityMessageContext {
  return {
    pack: activityReportPack(input),
  };
}

export function formatCodexActivityMessage(input: CodexActivityInput, config: Partial<CodexActivityConfig> = {}) {
  const context = buildMessageContext(input);
  const style = resolveStyle(config.CODEX_ACTIVITY_STYLE) ?? codexActivityStyles[0];

  return formatMattermostMessage(style.format(context));
}

function resolveStyleStateFile(config: Partial<CodexActivityConfig>) {
  const stateFile = config.CODEX_ACTIVITY_STYLE_STATE_FILE ?? ".artifacts/codex-activity-style-state.json";
  return path.isAbsolute(stateFile) ? stateFile : path.resolve(process.cwd(), stateFile);
}

function readStyleIndex(stateFile: string) {
  if (!existsSync(stateFile)) {
    return 0;
  }

  try {
    const state = JSON.parse(readFileSync(stateFile, "utf8")) as { nextIndex?: unknown };
    if (typeof state.nextIndex === "number" && Number.isInteger(state.nextIndex) && state.nextIndex >= 0) {
      return state.nextIndex % codexActivityStyles.length;
    }
  } catch {
    return 0;
  }

  return 0;
}

function writeStyleIndex(stateFile: string, nextIndex: number) {
  mkdirSync(path.dirname(stateFile), { recursive: true });
  writeFileSync(stateFile, `${JSON.stringify({ nextIndex }, null, 2)}\n`);
}

function selectStyleForPost(config: Partial<CodexActivityConfig>) {
  const fixedStyle = resolveStyle(config.CODEX_ACTIVITY_STYLE);
  if (fixedStyle) {
    return { style: fixedStyle };
  }

  const stateFile = resolveStyleStateFile(config);
  const styleIndex = readStyleIndex(stateFile);
  return {
    style: codexActivityStyles[styleIndex],
    stateFile,
    nextIndex: (styleIndex + 1) % codexActivityStyles.length,
  };
}

async function mattermostLogin(config: CodexActivityConfig) {
  const response = await fetch(`${trimTrailingSlash(config.MATTERMOST_URL)}/api/v4/users/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ login_id: config.MATTERMOST_LOGIN_ID, password: config.MATTERMOST_PASSWORD }),
  });

  if (!response.ok) {
    throw new Error(`Mattermost login failed with HTTP ${response.status}`);
  }

  const token = response.headers.get("token");
  if (!token) {
    throw new Error("Mattermost login did not return a token");
  }

  return token;
}

export async function postCodexActivity(input: CodexActivityInput, config = readCodexActivityConfig()) {
  const skipReason = getCodexActivitySkipReason(input);
  if (skipReason) {
    return { skipped: true, reason: skipReason } as const;
  }

  const selectedStyle = selectStyleForPost(config);
  const message = formatMattermostMessage(selectedStyle.style.format(buildMessageContext(input)));
  const token = await mattermostLogin(config);
  const channelId = config.CODEX_ACTIVITY_CHANNEL_ID ?? config.MATTERMOST_CHANNEL_ID;
  const response = await fetch(`${trimTrailingSlash(config.MATTERMOST_URL)}/api/v4/posts`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      channel_id: channelId,
      message,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Mattermost post failed with HTTP ${response.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
  }

  const post = (await response.json()) as { id: string };
  if (selectedStyle.stateFile && typeof selectedStyle.nextIndex === "number") {
    writeStyleIndex(selectedStyle.stateFile, selectedStyle.nextIndex);
  }

  return { skipped: false as const, postId: post.id, channelId, message };
}
