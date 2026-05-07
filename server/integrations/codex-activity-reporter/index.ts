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
  { text: "水豚噜噜点头.jpg 🦫", translation: "Water Capybara Lulu nods.jpg." },
  { text: "水豚噜噜端茶.jpg 🍵", translation: "Water Capybara Lulu serves tea.jpg." },
  { text: "水豚噜噜稳住.jpg 😌", translation: "Water Capybara Lulu keeps things steady.jpg." },
  { text: "水豚噜噜加班.jpg 💻", translation: "Water Capybara Lulu works overtime.jpg." },
] as const;

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
  english: EnglishNote;
}

interface ActivityTone {
  closing: string;
  translation: string;
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
          translation:
            "This round tuned the Codex activity reporting mechanism back into shape. The focus is to summarize each Q&A clearly and concisely, with a confident and direct tone, without taking the classical-Chinese detour. From now on, every report must land the final word.",
          words: [
            { word: "activity", ipa: "/ækˈtɪvəti/", part: "n.", meaning: "活动" },
            { word: "report", ipa: "/rɪˈpɔːrt/", part: "n./v.", meaning: "报告；汇报" },
            { word: "mechanism", ipa: "/ˈmekənɪzəm/", part: "n.", meaning: "机制" },
          ],
          grammar: "`This round tuned...` 是一般过去时，结构是主语 + 动词过去式 + 宾语。",
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
          translation:
            "This round aligned the project runtime configuration. Node, npm, and the project constraints have each returned to their proper place, so running tests and builds later will be easier.",
          words: [
            { word: "runtime", ipa: "/ˈrʌntaɪm/", part: "n.", meaning: "运行环境" },
            { word: "configuration", ipa: "/kənˌfɪɡjəˈreɪʃən/", part: "n.", meaning: "配置" },
            { word: "align", ipa: "/əˈlaɪn/", part: "v.", meaning: "对齐；校准" },
          ],
          grammar: "`This round aligned...` 是一般过去时，说明本轮已经完成对齐动作。",
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
          translation:
            "This round made the GitHub push sync pipeline sturdier. New commits can keep syncing to the ORF channel, and the push path is clearer. Once the code goes out, the message will reach the battlefield.",
          words: [
            { word: "push", ipa: "/pʊʃ/", part: "n./v.", meaning: "推送" },
            { word: "sync", ipa: "/sɪŋk/", part: "n./v.", meaning: "同步" },
            { word: "pipeline", ipa: "/ˈpaɪplaɪn/", part: "n.", meaning: "流程；管线" },
          ],
          grammar: "`can keep syncing` 使用情态动词 `can` 加动词原形，表示后续仍然可以持续同步。",
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
          translation:
            "This round completed project validation. Tests and builds have both been checked, and the current changes can keep moving forward. Validation has passed, so there is no need to hesitate on the road ahead.",
          words: [
            { word: "project", ipa: "/ˈprɑːdʒekt/", part: "n.", meaning: "项目" },
            { word: "check", ipa: "/tʃek/", part: "n./v.", meaning: "检查；校验" },
            { word: "pass", ipa: "/pæs/", part: "v.", meaning: "通过" },
          ],
          grammar: "`Validation has passed` 是现在完成时，表示验证已经通过并影响当前判断。",
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
          translation:
            "This round organized the project documents. The relevant ideas and page notes have been archived, so later implementation has a trail to follow. The documents have formed their battle line, and implementation can advance by the rules.",
          words: [
            { word: "document", ipa: "/ˈdɑːkjumənt/", part: "n.", meaning: "文档" },
            { word: "organize", ipa: "/ˈɔːrɡənaɪz/", part: "v.", meaning: "整理；组织" },
            { word: "project", ipa: "/ˈprɑːdʒekt/", part: "n.", meaning: "项目" },
          ],
          grammar: "`have been archived` 是现在完成时的被动语态，说明文档已经被归档。",
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
          translation:
            "This round adjusted the backend implementation. The server logic was updated for the current requirement, with the validation entry point kept in place. The backend foundation is steady, and the interfaces shall answer the command.",
          words: [
            { word: "backend", ipa: "/ˌbækˈend/", part: "n.", meaning: "后端" },
            { word: "implementation", ipa: "/ˌɪmplɪmenˈteɪʃən/", part: "n.", meaning: "实现" },
            { word: "update", ipa: "/ʌpˈdeɪt/", part: "v.", meaning: "更新" },
          ],
          grammar: "`was updated` 是一般过去时的被动语态，说明服务端逻辑已经被更新。",
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
          translation:
            "This round adjusted the frontend experience. The page structure and interaction wording are closer to the current product direction. The interface direction is set, and the experience will only grow stronger.",
          words: [
            { word: "frontend", ipa: "/ˌfrʌntˈend/", part: "n.", meaning: "前端" },
            { word: "experience", ipa: "/ɪkˈspɪriəns/", part: "n.", meaning: "体验" },
            { word: "improve", ipa: "/ɪmˈpruːv/", part: "v.", meaning: "改进" },
          ],
          grammar: "`will only grow stronger` 使用一般将来时，表达体验后续会继续增强。",
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
          translation:
            "This round completed one ORF project collaboration. The conversation has been gathered into a traceable record without carrying out the original chat. This round's result has been booked.",
          words: [
            { word: "round", ipa: "/raʊnd/", part: "n.", meaning: "一轮" },
            { word: "collaboration", ipa: "/kəˌlæbəˈreɪʃən/", part: "n.", meaning: "协作" },
            { word: "complete", ipa: "/kəmˈpliːt/", part: "v.", meaning: "完成" },
          ],
          grammar: "`has been gathered` 是现在完成时的被动语态，表示对话已经被收束成记录。",
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
        translation:
          "This round completed one ORF collaboration. The conversation has been arranged into a concise activity record, and later work can continue from here. This matter is settled; keep moving forward.",
        words: [
          { word: "round", ipa: "/raʊnd/", part: "n.", meaning: "一轮" },
          { word: "collaboration", ipa: "/kəˌlæbəˈreɪʃən/", part: "n.", meaning: "协作" },
          { word: "concise", ipa: "/kənˈsaɪs/", part: "adj.", meaning: "简明的" },
        ],
        grammar: "`can continue` 使用情态动词 `can` 加动词原形，表示后续工作可以继续。",
      },
    }
  );
}

function joinChineseSentences(sentences: string[]) {
  return `${sentences.map((sentence) => trimSentenceEnd(sentence)).filter(Boolean).join("。")}。`;
}

function joinEnglishSentences(sentences: (string | undefined)[]) {
  return sentences
    .map((sentence) => sentence?.trim())
    .filter((sentence): sentence is string => Boolean(sentence))
    .join(" ");
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
  const chinese = `${joinChineseSentences([pack.summary, pack.detail, pack.punchline, tone.closing])}${
    memeCue ? ` ${memeCue.text}` : ""
  }`;
  const english = joinEnglishSentences([pack.english.translation, tone.translation, memeCue?.translation]);

  return [
    chinese,
    formatEnglishNote(pack.english, english),
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
    format: ({ pack }) => formatAotianSummary(pack, { closing: "这点小事，拿下", translation: "This small matter is handled." }),
  },
  {
    id: "ci",
    label: "龙傲天二",
    format: ({ pack }) => formatAotianSummary(pack, { closing: "全局尽在本座掌中", translation: "The whole situation is in my hands." }),
  },
  {
    id: "classical",
    label: "龙傲天三",
    format: ({ pack }) => formatAotianSummary(pack, { closing: "胜者无需多言", translation: "The victor needs no further words." }),
  },
  {
    id: "humor",
    label: "龙傲天四",
    format: ({ pack }) => formatAotianSummary(pack, { closing: "问题见我，自会退散", translation: "When problems meet me, they step aside on their own." }),
  },
  {
    id: "meme",
    label: "表情包",
    format: ({ pack }) => formatAotianSummary(pack, { closing: "稳如本座", translation: "It is as steady as I am." }, memeCues[0]),
  },
  {
    id: "serious",
    label: "龙傲天五",
    format: ({ pack }) => formatAotianSummary(pack, { closing: "结论明确，继续推进", translation: "The conclusion is clear; keep pushing forward." }),
  },
  {
    id: "cold-joke",
    label: "龙傲天六",
    format: ({ pack }) => formatAotianSummary(pack, { closing: "不服也得服", translation: "Even if it refuses, it still has to yield." }),
  },
  {
    id: "wuxia",
    label: "龙傲天七",
    format: ({ pack }) => formatAotianSummary(pack, { closing: "此局我定", translation: "I decide the outcome of this round." }),
  },
  {
    id: "sci-fi",
    label: "龙傲天八",
    format: ({ pack }) => formatAotianSummary(pack, { closing: "时间线已向我方收束", translation: "The timeline has already converged in our favor." }),
  },
  {
    id: "radio",
    label: "龙傲天九",
    format: ({ pack }) => formatAotianSummary(pack, { closing: "众人只需看结果", translation: "Everyone only needs to look at the result." }),
  },
  {
    id: "news",
    label: "龙傲天十",
    format: ({ pack }) => formatAotianSummary(pack, { closing: "胜势已成", translation: "The winning momentum is already formed." }),
  },
  {
    id: "diary",
    label: "龙傲天十一",
    format: ({ pack }) => formatAotianSummary(pack, { closing: "平平无奇地赢了", translation: "I won in an utterly ordinary way." }),
  },
  {
    id: "stage",
    label: "龙傲天",
    format: ({ pack }) =>
      formatAotianSummary(pack, { closing: "区区小事，已被本座拿下", translation: "This trivial matter has already been taken down by me." }, memeCues[2]),
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
