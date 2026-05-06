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

function oneLineMessage(value: string) {
  return value.replace(/\s*\n+\s*/g, " ").replace(/[ \t]+/g, " ").trim();
}

function poemTopic(value: string) {
  const text = clause(value);
  const knownTopics = new Map([
    ["调整了 Codex 活动播报机制", "播报机制"],
    ["升级了项目运行环境配置", "运行环境"],
    ["完善了 GitHub 推送同步流程", "推送同步"],
    ["完成了项目验证", "项目验证"],
    ["整理了项目文档", "项目文档"],
    ["调整了后端实现", "后端实现"],
    ["调整了前端体验", "前端体验"],
    ["完成了一轮 ORF 项目协作", "ORF 协作"],
  ]);

  return knownTopics.get(text) ?? text.replace(/^(调整了|升级了|完善了|完成了|整理了)/, "");
}

export function readCodexActivityConfig(env: NodeJS.ProcessEnv = process.env) {
  return configSchema.parse(env);
}

interface CodexActivityMessageContext {
  summary: string;
}

interface CodexActivityStyle {
  id: string;
  label: string;
  format: (context: CodexActivityMessageContext) => string;
}

const codexActivityStyles = [
  {
    id: "poem",
    label: "赠汪伦魔改",
    format: ({ summary }) => `薛宇行舟将欲走，忽闻代码播报声；桃花潭水深千尺，不及${poemTopic(summary)}情。`,
  },
  {
    id: "ci",
    label: "水调歌头魔改",
    format: ({ summary }) => `明月几时有，把码问青天；不知${poemTopic(summary)}，今夕稳不稳。`,
  },
  {
    id: "classical",
    label: "早发白帝城魔改",
    format: ({ summary }) => `朝辞白帝彩云间，千行代码一日还；两岸 bug 啼不住，${poemTopic(summary)}过万山。`,
  },
  {
    id: "humor",
    label: "静夜思魔改",
    format: ({ summary }) => `床前代码光，疑是测试霜；举头看${poemTopic(summary)}，低头笑一场。`,
  },
  {
    id: "meme",
    label: "青玉案魔改",
    format: ({ summary }) => `众里寻他千百度，蓦然回首，${poemTopic(summary)}正在灯火阑珊处 😎`,
  },
  {
    id: "serious",
    label: "登鹳雀楼魔改",
    format: ({ summary }) => `白日依山尽，代码入海流；欲穷${poemTopic(summary)}目，更上一层楼。`,
  },
  {
    id: "cold-joke",
    label: "虞美人魔改",
    format: ({ summary }) => `问君能有几多愁，恰似${poemTopic(summary)}刚改完还回头。`,
  },
  {
    id: "wuxia",
    label: "侠客行魔改",
    format: ({ summary }) => `十步改一处，千行不留 bug；事了拂衣去，${poemTopic(summary)}藏深处。`,
  },
  {
    id: "sci-fi",
    label: "上李邕魔改",
    format: ({ summary }) => `大鹏一日同风起，代码直上九万里；若问${poemTopic(summary)}何处去，星河尽头报捷归。`,
  },
  {
    id: "radio",
    label: "春晓魔改",
    format: ({ summary }) => `春眠不觉晓，处处闻提交；夜来风雨声，${poemTopic(summary)}少不了。`,
  },
  {
    id: "news",
    label: "清明魔改",
    format: ({ summary }) => `清明时节码纷纷，路上行人欲断魂；借问${poemTopic(summary)}何处稳，牧童遥指测试门。`,
  },
  {
    id: "diary",
    label: "饮酒魔改",
    format: ({ summary }) => `采菊东篱下，悠然见提交；${poemTopic(summary)}归来后，南山也点头。`,
  },
  {
    id: "stage",
    label: "破阵子魔改",
    format: ({ summary }) => `醉里挑灯看码，梦回测试连营；${poemTopic(summary)}沙场点兵，稳了.jpg 😎`,
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
    summary: trimSentenceEnd(activitySummary.summary),
  };
}

export function formatCodexActivityMessage(input: CodexActivityInput, config: Partial<CodexActivityConfig> = {}) {
  const context = buildMessageContext(input);
  const style = resolveStyle(config.CODEX_ACTIVITY_STYLE) ?? codexActivityStyles[0];

  return oneLineMessage(style.format(context));
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
  const message = oneLineMessage(selectedStyle.style.format(buildMessageContext(input)));
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
