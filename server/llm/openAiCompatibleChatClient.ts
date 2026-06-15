import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { env } from "../env";

export type OpenAiCompatibleChatMessage = {
  content: string;
  role: "assistant" | "system" | "user";
};

export type OpenAiCompatibleChatConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
};

export class OpenAiCompatibleChatClient {
  constructor(readonly config: OpenAiCompatibleChatConfig) {}

  async complete(input: {
    maxTokens?: number;
    messages: OpenAiCompatibleChatMessage[];
    temperature?: number;
  }) {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await fetch(`${this.config.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
        body: JSON.stringify({
          model: this.config.model,
          messages: input.messages,
          temperature: input.temperature,
          max_tokens: input.maxTokens,
        }),
        headers: {
          "content-type": "application/json",
          ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {}),
        },
        method: "POST",
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`LLM request failed: ${response.status}`);
      }
      const data = (await response.json()) as ChatCompletionResponse;
      const content = data.choices?.[0]?.message?.content;
      return typeof content === "string" ? content : "";
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }
}

export function buildOpenAiCompatibleChatClient() {
  const config = resolveOpenAiCompatibleChatConfig();
  return config ? new OpenAiCompatibleChatClient(config) : null;
}

export function resolveOpenAiCompatibleChatConfig(): OpenAiCompatibleChatConfig | null {
  const dotenv = readKnownLocalLlmDotenvValues();
  const baseUrl = firstNonEmpty(
    env.ORF_LLM_BASE_URL,
    env.AUTO_CLASSIFY_MODEL_API_URL,
    env.AGENT_LLM_BASE_URL,
    env.CHAT_MODEL_API_URL,
    dotenv.ORF_LLM_BASE_URL,
    dotenv.AUTO_CLASSIFY_MODEL_API_URL,
    dotenv.AGENT_LLM_BASE_URL,
    dotenv.CHAT_MODEL_API_URL,
  );
  const model = firstNonEmpty(
    env.ORF_LLM_MODEL,
    env.AUTO_CLASSIFY_MODEL_NAME,
    env.AGENT_LLM_MODEL,
    env.CHAT_MODEL_NAME,
    dotenv.ORF_LLM_MODEL,
    dotenv.AUTO_CLASSIFY_MODEL_NAME,
    dotenv.AGENT_LLM_MODEL,
    dotenv.CHAT_MODEL_NAME,
  );
  if (!baseUrl || !model) {
    return null;
  }

  return {
    apiKey: firstNonEmpty(
      env.ORF_LLM_API_KEY,
      env.AUTO_CLASSIFY_MODEL_API_KEY,
      env.AGENT_LLM_API_KEY,
      env.CHAT_MODEL_API_KEY,
      dotenv.ORF_LLM_API_KEY,
      dotenv.AUTO_CLASSIFY_MODEL_API_KEY,
      dotenv.AGENT_LLM_API_KEY,
      dotenv.CHAT_MODEL_API_KEY,
    ),
    baseUrl,
    model,
    timeoutMs: env.ORF_LLM_TIMEOUT_MS,
  };
}

function readKnownLocalLlmDotenvValues() {
  const values: Record<string, string> = {};
  for (const filePath of knownLocalLlmDotenvPaths()) {
    if (!existsSync(filePath)) continue;
    Object.assign(values, readDotenvFile(filePath));
  }
  return values;
}

function knownLocalLlmDotenvPaths() {
  const workspaceParent = path.resolve(process.cwd(), "..");
  return [
    path.join(process.cwd(), ".env"),
    path.join(workspaceParent, "aio", "platform", "agent-service", ".env"),
    path.join(workspaceParent, "aio", "apps", "audit-workbench", "backend", ".env"),
  ];
}

function readDotenvFile(filePath: string) {
  const values: Record<string, string> = {};
  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [rawKey, ...rawValue] = line.split("=");
    values[rawKey.trim()] = rawValue.join("=").trim().replace(/^["']|["']$/g, "");
  }
  return values;
}

function firstNonEmpty(...values: Array<string | null | undefined>) {
  return values.find((value) => value && value.trim())?.trim() ?? "";
}
