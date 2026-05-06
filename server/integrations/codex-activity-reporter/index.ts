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

function sentence(value: string) {
  const text = value.trim();
  if (!text || /[。.!！?？]$/.test(text)) {
    return text;
  }

  return `${text}。`;
}

function quote(value: string) {
  return `「${trimSentenceEnd(value)}」`;
}

function formatDetails(details: string[]) {
  const cleaned = details.map(cleanActivityText).filter(Boolean);

  if (cleaned.length === 0) {
    return undefined;
  }

  if (cleaned.length === 1) {
    return cleaned[0];
  }

  return cleaned.map((detail, index) => `${index + 1}. ${detail}`).join("\n");
}

export function readCodexActivityConfig(env: NodeJS.ProcessEnv = process.env) {
  return configSchema.parse(env);
}

interface CodexActivityMessageContext {
  summary: string;
  quotedSummary: string;
  detailText?: string;
}

interface CodexActivityStyle {
  id: string;
  label: string;
  format: (context: CodexActivityMessageContext) => string;
}

const codexActivityStyles = [
  {
    id: "poem",
    label: "写诗",
    format: ({ quotedSummary, detailText }) =>
      [
        `刚把${quotedSummary}收进灯下。`,
        detailText ? `余韵还在：${sentence(detailText)}` : "键盘声停下，事情往前亮了一格。",
      ].join("\n"),
  },
  {
    id: "ci",
    label: "写词",
    format: ({ summary, detailText }) =>
      [
        `小令一阕，写的是：${sentence(summary)}`,
        detailText ? `尾声轻轻一折：${sentence(detailText)}` : "风过命令行，收束得刚刚好。",
      ].join("\n"),
  },
  {
    id: "classical",
    label: "文言文",
    format: ({ summary, detailText }) =>
      [`事已成：${sentence(summary)}`, detailText ? `其详曰：${sentence(detailText)}` : "记之。"].join("\n"),
  },
  {
    id: "humor",
    label: "风趣幽默",
    format: ({ summary, detailText }) =>
      [
        `这事办完了：${sentence(summary)}`,
        detailText ? `顺手还把这串也带回来了：${sentence(detailText)}` : "键盘表示这把它很有参与感。",
      ].join("\n"),
  },
  {
    id: "serious",
    label: "严肃",
    format: ({ summary, detailText }) =>
      [`已完成：${sentence(summary)}`, detailText ? `结果：${sentence(detailText)}` : "状态正常。"].join("\n"),
  },
  {
    id: "cold-joke",
    label: "冷笑话",
    format: ({ quotedSummary, detailText }) =>
      [
        `冷笑话时间：刚处理完${quotedSummary}。`,
        detailText ? `详情也没溜走：${sentence(detailText)}` : "它现在很“完成”，因为它真的完成了。",
      ].join("\n"),
  },
  {
    id: "wuxia",
    label: "江湖",
    format: ({ summary, detailText }) =>
      [`一招收势：${sentence(summary)}`, detailText ? `案上留痕：${sentence(detailText)}` : "剑不出鞘，事已落定。"].join("\n"),
  },
  {
    id: "sci-fi",
    label: "科幻",
    format: ({ summary, detailText }) =>
      [
        `来自近未来的一条回执：${sentence(summary)}`,
        detailText ? `舱内记录：${sentence(detailText)}` : "进度条轻轻合上了舱门。",
      ].join("\n"),
  },
  {
    id: "radio",
    label: "深夜电台",
    format: ({ summary, detailText }) =>
      [
        `这里插播一条不打扰的消息：${sentence(summary)}`,
        detailText ? `把音量拧小一点，细节是：${sentence(detailText)}` : "灯还亮着，事已经过站。",
      ].join("\n"),
  },
  {
    id: "news",
    label: "快讯",
    format: ({ summary, detailText }) =>
      [`快讯：${sentence(summary)}`, detailText ? `现场补充：${sentence(detailText)}` : "目前一切平稳。"].join("\n"),
  },
  {
    id: "diary",
    label: "日记",
    format: ({ summary, detailText }) =>
      [`今日小记：${sentence(summary)}`, detailText ? `旁注：${sentence(detailText)}` : "完成得不吵，挺好。"].join("\n"),
  },
  {
    id: "stage",
    label: "舞台剧",
    format: ({ summary, detailText }) =>
      [
        `灯光一亮，这一幕叫：${sentence(summary)}`,
        detailText ? `演员退场前补了一句：${sentence(detailText)}` : "幕布落下，观众席很安静。",
      ].join("\n"),
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
  const parsed = codexActivityInputSchema.parse(input);
  const summary = cleanActivityText(parsed.summary) || "完成了一轮会话";

  return {
    summary: trimSentenceEnd(summary),
    quotedSummary: quote(summary),
    detailText: formatDetails(parsed.details),
  };
}

export function formatCodexActivityMessage(input: CodexActivityInput, config: Partial<CodexActivityConfig> = {}) {
  const context = buildMessageContext(input);
  const style = resolveStyle(config.CODEX_ACTIVITY_STYLE) ?? codexActivityStyles[0];

  return style.format(context);
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
  const selectedStyle = selectStyleForPost(config);
  const message = selectedStyle.style.format(buildMessageContext(input));
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

  return { postId: post.id, channelId, message };
}
