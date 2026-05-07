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

function summarizeActivity(input: CodexActivityInput) {
  const source = activitySource(input);

  if (
    includesAny(source, [
      "codex",
      "活动播报",
      "自动播报",
      "完成播报",
      "mattermost",
      "mm",
      "会话内容",
      "风格",
      "单条消息",
      "一条消息",
      "表情包",
      "文言文",
      "英文",
      "english",
      "音标",
      "语法",
      "换行",
      "水豚",
      "噜噜",
      "龙傲天",
      "自信",
      "冷笑话",
    ])
  ) {
    return {
      summary: "调整了 Codex 活动播报机制",
      detailText: includesAny(source, ["复制", "原样", "会话内容", "隐私"])
        ? "改成先抽象总结对话，再按轮换风格发送到 Mattermost，避免复述原始会话。"
        : "让完成通知按多种语气轮换，并保持 Mattermost 推送链路可用。",
    };
  }

  if (includesAny(source, ["node", "npm", "engine", "engines", "运行环境", "升级"])) {
    return {
      summary: "升级了项目运行环境配置",
      detailText: "本机 Node 版本和项目 engines 约束已对齐，测试与构建继续通过。",
    };
  }

  if (includesAny(source, ["github", "push", "推送", "同步", "commit", "提交"])) {
    return {
      summary: "完善了 GitHub 推送同步流程",
      detailText: "提交、推送和 ORF 频道同步链路完成了一轮验证。",
    };
  }

  if (includesAny(source, ["测试", "test", "build", "构建", "验证"])) {
    return {
      summary: "完成了项目验证",
      detailText: "测试和构建结果已经检查，当前改动可继续推进。",
    };
  }

  if (includesAny(source, ["文档", "docs", "readme", "规则"])) {
    return {
      summary: "整理了项目文档",
      detailText: "相关说明已经归档到文档目录，方便后续追踪。",
    };
  }

  if (includesAny(source, ["后端", "server", "api", "数据库", "接口"])) {
    return {
      summary: "调整了后端实现",
      detailText: "后端逻辑按当前需求更新，并保留了验证入口。",
    };
  }

  if (includesAny(source, ["前端", "页面", "ui", "组件", "样式"])) {
    return {
      summary: "调整了前端体验",
      detailText: "页面交互和展示细节按当前需求推进了一步。",
    };
  }

  return {
    summary: "完成了一轮 ORF 项目协作",
    detailText: "本轮对话已经收束成可追踪的活动记录，没有携带原始会话内容。",
  };
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
  "水豚噜噜点头.jpg 🦫",
  "水豚噜噜端茶.jpg 🍵",
  "水豚噜噜稳住.jpg 😌",
  "水豚噜噜加班.jpg 💻",
] as const;

interface WordNote {
  word: string;
  ipa: string;
  part: string;
  meaning: string;
}

interface EnglishNote {
  sentence: string;
  words: WordNote[];
  grammar: string;
}

interface ActivitySummaryPack {
  summary: string;
  detail: string;
  punchline: string;
  english: EnglishNote;
}

interface ActivityTone {
  prefix: string;
  suffix: string;
}

function activitySummaryPack(summary: string): ActivitySummaryPack {
  const text = clause(summary);
  const packs = new Map<string, ActivitySummaryPack>([
    [
      "调整了 Codex 活动播报机制",
      {
        summary: "这轮把 Codex 活动播报机制又调顺了",
        detail: "重点是简明总结问答内容，语气自信直接，不再文言绕路",
        punchline: "此后每条播报都要一锤定音",
        english: {
          sentence: "The activity report has been refined.",
          words: [
            { word: "activity", ipa: "/ækˈtɪvəti/", part: "n.", meaning: "活动" },
            { word: "report", ipa: "/rɪˈpɔːrt/", part: "n./v.", meaning: "报告；汇报" },
            { word: "refine", ipa: "/rɪˈfaɪn/", part: "v.", meaning: "改进；打磨" },
          ],
          grammar: "`has been refined` 是现在完成时的被动语态，表示改动已完成并影响现在。",
        },
      },
    ],
    [
      "升级了项目运行环境配置",
      {
        summary: "这轮把项目运行环境配置对齐了",
        detail: "Node、npm 和项目约束各归其位，后续跑测试构建更省心",
        punchline: "环境已服，后续只管推进",
        english: {
          sentence: "The runtime configuration has been aligned.",
          words: [
            { word: "runtime", ipa: "/ˈrʌntaɪm/", part: "n.", meaning: "运行环境" },
            { word: "configuration", ipa: "/kənˌfɪɡjəˈreɪʃən/", part: "n.", meaning: "配置" },
            { word: "align", ipa: "/əˈlaɪn/", part: "v.", meaning: "对齐；校准" },
          ],
          grammar: "`has been aligned` 是现在完成时的被动语态，强调配置已被对齐。",
        },
      },
    ],
    [
      "完善了 GitHub 推送同步流程",
      {
        summary: "这轮把 GitHub 推送同步链路补稳了",
        detail: "新增提交能继续同步到 ORF 频道，推送路径更清楚",
        punchline: "代码既出，消息自会抵达战场",
        english: {
          sentence: "The GitHub push sync has been verified.",
          words: [
            { word: "push", ipa: "/pʊʃ/", part: "n./v.", meaning: "推送" },
            { word: "sync", ipa: "/sɪŋk/", part: "n./v.", meaning: "同步" },
            { word: "verify", ipa: "/ˈverɪfaɪ/", part: "v.", meaning: "验证" },
          ],
          grammar: "`has been verified` 是现在完成时的被动语态，表示验证已经完成。",
        },
      },
    ],
    [
      "完成了项目验证",
      {
        summary: "这轮完成了项目验证",
        detail: "测试和构建都已检查，当前改动可以继续往前走",
        punchline: "验证已过，前路无需犹疑",
        english: {
          sentence: "The project checks have passed.",
          words: [
            { word: "project", ipa: "/ˈprɑːdʒekt/", part: "n.", meaning: "项目" },
            { word: "check", ipa: "/tʃek/", part: "n./v.", meaning: "检查；校验" },
            { word: "pass", ipa: "/pæs/", part: "v.", meaning: "通过" },
          ],
          grammar: "`have passed` 是现在完成时，主语 `checks` 为复数，所以用 `have`。",
        },
      },
    ],
    [
      "整理了项目文档",
      {
        summary: "这轮整理了项目文档",
        detail: "相关思路和页面说明已经归档，后续实现有据可循",
        punchline: "文档成阵，后续实现照章推进",
        english: {
          sentence: "The project documents have been organized.",
          words: [
            { word: "document", ipa: "/ˈdɑːkjumənt/", part: "n.", meaning: "文档" },
            { word: "organize", ipa: "/ˈɔːrɡənaɪz/", part: "v.", meaning: "整理；组织" },
            { word: "project", ipa: "/ˈprɑːdʒekt/", part: "n.", meaning: "项目" },
          ],
          grammar: "`have been organized` 是现在完成时的被动语态，说明文档已被整理。",
        },
      },
    ],
    [
      "调整了后端实现",
      {
        summary: "这轮调整了后端实现",
        detail: "服务端逻辑按当前需求更新，并保留验证入口",
        punchline: "后端根基已稳，接口自当听令",
        english: {
          sentence: "The backend implementation has been updated.",
          words: [
            { word: "backend", ipa: "/ˌbækˈend/", part: "n.", meaning: "后端" },
            { word: "implementation", ipa: "/ˌɪmplɪmenˈteɪʃən/", part: "n.", meaning: "实现" },
            { word: "update", ipa: "/ʌpˈdeɪt/", part: "v.", meaning: "更新" },
          ],
          grammar: "`has been updated` 是现在完成时的被动语态，表示实现已被更新。",
        },
      },
    ],
    [
      "调整了前端体验",
      {
        summary: "这轮调整了前端体验",
        detail: "页面结构和交互表达更贴近当前产品方向",
        punchline: "界面方向已定，体验只会更强",
        english: {
          sentence: "The frontend experience has been improved.",
          words: [
            { word: "frontend", ipa: "/ˌfrʌntˈend/", part: "n.", meaning: "前端" },
            { word: "experience", ipa: "/ɪkˈspɪriəns/", part: "n.", meaning: "体验" },
            { word: "improve", ipa: "/ɪmˈpruːv/", part: "v.", meaning: "改进" },
          ],
          grammar: "`has been improved` 是现在完成时的被动语态，突出体验已被改进。",
        },
      },
    ],
    [
      "完成了一轮 ORF 项目协作",
      {
        summary: "这轮完成了一次 ORF 项目协作",
        detail: "对话内容已经收束成可追踪记录，没有带出原始会话",
        punchline: "本轮战果已入账",
        english: {
          sentence: "One round of ORF collaboration has been completed.",
          words: [
            { word: "round", ipa: "/raʊnd/", part: "n.", meaning: "一轮" },
            { word: "collaboration", ipa: "/kəˌlæbəˈreɪʃən/", part: "n.", meaning: "协作" },
            { word: "complete", ipa: "/kəmˈpliːt/", part: "v.", meaning: "完成" },
          ],
          grammar: "`has been completed` 是现在完成时的被动语态，表示这一轮协作已经完成。",
        },
      },
    ],
  ]);

  return (
    packs.get(text) ?? {
      summary: "这轮完成了一项 ORF 协作",
      detail: "对话已经整理成简明活动记录，后续可以继续接着推进",
      punchline: "此事已定，继续向前",
      english: {
        sentence: "This task has been completed.",
        words: [
          { word: "task", ipa: "/tæsk/", part: "n.", meaning: "任务" },
          { word: "complete", ipa: "/kəmˈpliːt/", part: "v.", meaning: "完成" },
          { word: "this", ipa: "/ðɪs/", part: "det.", meaning: "这个" },
        ],
        grammar: "`has been completed` 是现在完成时的被动语态，表示任务已经完成。",
      },
    }
  );
}

function formatEnglishNote(note: EnglishNote) {
  return [
    `English: ${note.sentence}`,
    "Words:",
    ...note.words.map((word) => `- ${word.word} ${word.ipa} ${word.part} ${word.meaning}`),
    `Grammar: ${note.grammar}`,
  ].join("\n");
}

function formatAotianSummary(pack: ActivitySummaryPack, tone: ActivityTone, memeCue?: string) {
  return [
    `${tone.prefix}${pack.summary}。${pack.detail}。${pack.punchline}${tone.suffix}${memeCue ? ` ${memeCue}` : ""}`,
    formatEnglishNote(pack.english),
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
    format: ({ pack }) => formatAotianSummary(pack, { prefix: "龙傲天版：", suffix: "，这点小事，拿下。" }),
  },
  {
    id: "ci",
    label: "龙傲天二",
    format: ({ pack }) => formatAotianSummary(pack, { prefix: "本座战报：", suffix: "，全局尽在掌中。" }),
  },
  {
    id: "classical",
    label: "龙傲天三",
    format: ({ pack }) => formatAotianSummary(pack, { prefix: "胜者记录：", suffix: "，无需多言。" }),
  },
  {
    id: "humor",
    label: "龙傲天四",
    format: ({ pack }) => formatAotianSummary(pack, { prefix: "强者速览：", suffix: "，问题见我，自会退散。" }),
  },
  {
    id: "meme",
    label: "表情包",
    format: ({ pack }) => formatAotianSummary(pack, { prefix: "龙傲天表情包版：", suffix: "，稳如本座。" }, memeCues[0]),
  },
  {
    id: "serious",
    label: "龙傲天五",
    format: ({ pack }) => formatAotianSummary(pack, { prefix: "定论：", suffix: "，结论明确，继续推进。" }),
  },
  {
    id: "cold-joke",
    label: "龙傲天六",
    format: ({ pack }) => formatAotianSummary(pack, { prefix: "冷面强者曰：", suffix: "，不服也得服。" }),
  },
  {
    id: "wuxia",
    label: "龙傲天七",
    format: ({ pack }) => formatAotianSummary(pack, { prefix: "江湖已知：", suffix: "，此局我定。" }),
  },
  {
    id: "sci-fi",
    label: "龙傲天八",
    format: ({ pack }) => formatAotianSummary(pack, { prefix: "未来回执：", suffix: "，时间线已向我方收束。" }),
  },
  {
    id: "radio",
    label: "龙傲天九",
    format: ({ pack }) => formatAotianSummary(pack, { prefix: "全频道通告：", suffix: "，众人只需看结果。" }),
  },
  {
    id: "news",
    label: "龙傲天十",
    format: ({ pack }) => formatAotianSummary(pack, { prefix: "捷报：", suffix: "，胜势已成。" }),
  },
  {
    id: "diary",
    label: "龙傲天十一",
    format: ({ pack }) => formatAotianSummary(pack, { prefix: "强者小记：", suffix: "，平平无奇地赢了。" }),
  },
  {
    id: "stage",
    label: "龙傲天",
    format: ({ pack }) =>
      formatAotianSummary(pack, { prefix: "龙傲天终局版：", suffix: "，区区小事，已被本座拿下。" }, memeCues[2]),
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
  const activitySummary = summarizeActivity(input);

  return {
    pack: activitySummaryPack(trimSentenceEnd(activitySummary.summary)),
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
