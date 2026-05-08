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
  return patterns.some((pattern) => value.includes(pattern.toLowerCase()));
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
  ]);
}

function summaryCandidates(input: CodexActivityInput) {
  const parsed = codexActivityInputSchema.parse(input);
  return [...parsed.details, parsed.summary]
    .flatMap((text) => cleanActivityText(text).split("\n"))
    .map(cleanSummaryLine)
    .filter((line) => line.length >= 6 && !lineLooksBoilerplate(line));
}

function explicitSummaryCandidate(input: CodexActivityInput) {
  const parsed = codexActivityInputSchema.parse(input);
  for (const line of [...parsed.details, parsed.summary].flatMap((text) => cleanActivityText(text).split("\n"))) {
    const match = line.match(/^(播报摘要|活动摘要|Activity summary|Summary)\s*[:：]\s*(.+)$/i);
    if (match?.[2]) {
      const value = cleanSummaryLine(match[2]);
      if (value) return value;
    }
  }

  return undefined;
}

function explicitEnglishCandidate(input: CodexActivityInput) {
  const parsed = codexActivityInputSchema.parse(input);
  for (const line of [...parsed.details, parsed.summary].flatMap((text) => cleanActivityText(text).split("\n"))) {
    const match = line.match(/^(播报英文|活动英文|Broadcast English|English summary)\s*[:：]\s*(.+)$/i);
    if (match?.[2]) {
      const value = redactSensitiveText(match[2]).replace(/\s+/g, " ").trim();
      if (value) return trimSentenceEnd(value);
    }
  }

  return undefined;
}

function summaryCandidateScore(line: string, index: number) {
  let score = 100 - index;

  if (lineLooksConcrete(line)) score += 30;
  if (/(\.md|\.ts|\.tsx|tests?\/|server\/|docs\/)/i.test(line)) score += 10;
  if (/[A-Z][A-Za-z0-9]+[A-Z][A-Za-z0-9]+/.test(line)) score += 8;
  if (includesAny(line, ["文档", "实现", "测试", "验证", "播报", "悬赏大厅", "征召", "积分"])) score += 8;
  if (includesAny(line, ["明确", "改为", "删掉", "确保", "避免", "通过"])) score += 8;
  if (/^[^，。；]{2,16}[：:]/.test(line)) score += 6;
  if (line.length > 120) score -= 10;

  return score;
}

function buildOneSentenceSummary(input: CodexActivityInput) {
  const explicit = explicitSummaryCandidate(input);
  if (explicit) {
    const normalized = clause(explicit);
    return normalized.startsWith("这轮") ? normalized : `这轮${normalized}`;
  }

  const candidates = summaryCandidates(input);
  const [text = "完成了一轮 ORF 项目协作"] = candidates
    .map((line, index) => ({ line, score: summaryCandidateScore(line, index) }))
    .sort((left, right) => right.score - left.score)
    .map((item) => item.line);
  const normalized = clause(text);
  const summary = normalized.startsWith("这轮") ? normalized : `这轮${normalized}`;
  return summary.length > 120 ? `${summary.slice(0, 117)}...` : summary;
}

function clause(value: string) {
  return trimSentenceEnd(value).replace(/\s*\n+\s*/g, " ").replace(/[ \t]+/g, " ").trim();
}

function formatMattermostMessage(value: string) {
  return value
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

const memeCues = [
  { text: "水豚噜噜点头.jpg 🦫", translation: "Water Capybara Lulu nodding" },
  { text: "水豚噜噜端茶.jpg 🍵", translation: "Water Capybara Lulu serving tea" },
  { text: "水豚噜噜稳住.jpg 😌", translation: "Water Capybara Lulu holding the line" },
  { text: "水豚噜噜加班.jpg 💻", translation: "Water Capybara Lulu working overtime" },
] as const;

const messageSeparator = "---";

interface WordNote {
  word: string;
  ipa: string;
  part: string;
  meaning: string;
}

interface EnglishNote {
  translation: string;
  words: WordNote[];
  grammar: string;
}

interface ActivitySummaryPack {
  summary: string;
  detail: string;
  punchline: string;
  english?: EnglishNote;
}

interface ActivityTone {
  closing: string;
  translation: string;
}

function activitySummaryPack(summary: string, englishSummary?: string): ActivitySummaryPack {
  const text = clause(summary);
  const english: EnglishNote | undefined = englishSummary
    ? {
        translation: englishSummary,
        words: [
          { word: "summary", ipa: "/ˈsʌməri/", part: "n.", meaning: "总结" },
          { word: "specific", ipa: "/spəˈsɪfɪk/", part: "adj.", meaning: "具体的" },
          { word: "result", ipa: "/rɪˈzʌlt/", part: "n.", meaning: "结果" },
        ],
        grammar: "`This round...` 用一般现在时，概括本轮实际完成的事情。",
      }
    : undefined;

  return {
    summary: text,
    detail: text,
    punchline: "播报只记录本轮实事",
    english,
  };
}

function formatEnglishNote(note: EnglishNote, translation: string) {
  return [
    `English: ${translation}`,
    "Words:",
    ...note.words.map((word) => `- ${word.word} ${word.ipa} ${word.part} ${word.meaning}`),
    `Grammar: ${note.grammar}`,
  ].join("\n");
}

function formatAotianSummary(pack: ActivitySummaryPack, tone: ActivityTone, memeCue?: (typeof memeCues)[number]) {
  const chinese = `${trimSentenceEnd(pack.summary)}，${trimSentenceEnd(tone.closing)}${memeCue ? `，${memeCue.text}` : ""}。`;
  const english = pack.english
    ? `${trimSentenceEnd(pack.english.translation)}, and ${trimSentenceEnd(tone.translation)}${memeCue ? `, with ${memeCue.translation}` : ""}.`
    : undefined;

  return [
    messageSeparator,
    chinese,
    ...(pack.english && english ? [formatEnglishNote(pack.english, english)] : []),
  ].join("\n");
}

export function readCodexActivityConfig(env: NodeJS.ProcessEnv = process.env) {
  return configSchema.parse(env);
}

interface CodexActivityMessageContext {
  pack: ActivitySummaryPack;
}

interface CodexActivityStyle {
  id: string;
  label: string;
  format: (context: CodexActivityMessageContext) => string;
}

const codexActivityStyles = [
  {
    id: "poem",
    label: "龙傲天",
    format: ({ pack }) => formatAotianSummary(pack, { closing: "这点小事，拿下", translation: "this small matter is handled" }),
  },
  {
    id: "ci",
    label: "龙傲天二",
    format: ({ pack }) => formatAotianSummary(pack, { closing: "全局尽在本座掌中", translation: "the whole situation is in my hands" }),
  },
  {
    id: "classical",
    label: "龙傲天三",
    format: ({ pack }) => formatAotianSummary(pack, { closing: "胜者无需多言", translation: "the victor needs no further words" }),
  },
  {
    id: "humor",
    label: "龙傲天四",
    format: ({ pack }) => formatAotianSummary(pack, { closing: "问题见我，自会退散", translation: "problems step aside when they meet me" }),
  },
  {
    id: "meme",
    label: "表情包",
    format: ({ pack }) => formatAotianSummary(pack, { closing: "稳如本座", translation: "it is as steady as I am" }, memeCues[0]),
  },
  {
    id: "serious",
    label: "龙傲天五",
    format: ({ pack }) => formatAotianSummary(pack, { closing: "结论明确，继续推进", translation: "the conclusion is clear and the advance continues" }),
  },
  {
    id: "cold-joke",
    label: "龙傲天六",
    format: ({ pack }) => formatAotianSummary(pack, { closing: "不服也得服", translation: "even refusal has to yield" }),
  },
  {
    id: "wuxia",
    label: "龙傲天七",
    format: ({ pack }) => formatAotianSummary(pack, { closing: "此局我定", translation: "I decide this round" }),
  },
  {
    id: "sci-fi",
    label: "龙傲天八",
    format: ({ pack }) => formatAotianSummary(pack, { closing: "时间线已向我方收束", translation: "the timeline converges in our favor" }),
  },
  {
    id: "radio",
    label: "龙傲天九",
    format: ({ pack }) => formatAotianSummary(pack, { closing: "众人只需看结果", translation: "everyone only needs to see the result" }),
  },
  {
    id: "news",
    label: "龙傲天十",
    format: ({ pack }) => formatAotianSummary(pack, { closing: "胜势已成", translation: "the winning momentum is already formed" }),
  },
  {
    id: "diary",
    label: "龙傲天十一",
    format: ({ pack }) => formatAotianSummary(pack, { closing: "平平无奇地赢了", translation: "I won in an utterly ordinary way" }),
  },
  {
    id: "stage",
    label: "龙傲天",
    format: ({ pack }) =>
      formatAotianSummary(pack, { closing: "区区小事，已被本座拿下", translation: "this trivial matter has already been taken down by me" }, memeCues[2]),
  },
] satisfies CodexActivityStyle[];

export const codexActivityStyleIds = codexActivityStyles.map((style) => style.id);

function resolveStyle(styleId: string | undefined) {
  if (!styleId || styleId === "rotate") {
    return undefined;
  }

  const style = codexActivityStyles.find((candidate) => candidate.id === styleId);
  if (!style) {
    throw new Error(`Unknown Codex activity style: ${styleId}. Available styles: ${codexActivityStyleIds.join(", ")}`);
  }

  return style;
}

function buildMessageContext(input: CodexActivityInput): CodexActivityMessageContext {
  return {
    pack: activitySummaryPack(trimSentenceEnd(buildOneSentenceSummary(input)), explicitEnglishCandidate(input)),
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
