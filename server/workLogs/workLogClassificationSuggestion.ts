import type {
  WorkLogCategoryOption,
  WorkLogClassificationSuggestion,
} from "../../src/types/orf";
import { buildOpenAiCompatibleChatClient } from "../llm/openAiCompatibleChatClient";

type SuggestionInput = {
  bodyMarkdown: string;
  categories: WorkLogCategoryOption[];
};

type RawSuggestion = {
  categoryId?: unknown;
  categoryName?: unknown;
  confidence?: unknown;
  kind?: unknown;
  reason?: unknown;
};

export function isWorkLogClassificationSuggestionConfigured() {
  return buildOpenAiCompatibleChatClient() !== null;
}

export async function suggestWorkLogClassification({
  bodyMarkdown,
  categories,
}: SuggestionInput): Promise<WorkLogClassificationSuggestion | null> {
  const client = buildOpenAiCompatibleChatClient();
  if (!client) return null;

  try {
    const raw = await client.complete({
      maxTokens: 360,
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: [
            "你是 ORF 工作日志分类助手。只返回 JSON，不要解释。",
            "工作日志不关联目标。你只能根据日志内容选择候选分类，或者建议新建分类。",
            "适合已有分类时选择 category；适合新分类时建议 newCategory；不需要分类时返回 uncategorized。",
            "返回结构：{\"kind\":\"category|newCategory|uncategorized\",\"categoryId\":string|null,\"categoryName\":string|null,\"confidence\":0..1,\"reason\":string}",
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify(
            {
              log: bodyMarkdown.trim().slice(0, 3000),
              categories: categories.slice(0, 80).map((category) => ({
                id: category.id,
                name: category.name,
              })),
            },
            null,
            2,
          ),
        },
      ],
    });

    return normalizeSuggestion(raw, { categories });
  } catch {
    return null;
  }
}

function normalizeSuggestion(
  raw: string,
  options: Pick<SuggestionInput, "categories">,
): WorkLogClassificationSuggestion | null {
  const parsed = parseSuggestionJson(raw);
  if (!parsed) return null;

  const confidence = normalizeConfidence(parsed.confidence);
  const reason = typeof parsed.reason === "string" ? parsed.reason.trim().slice(0, 80) : null;
  const kind = typeof parsed.kind === "string" ? parsed.kind : "";
  const categoryId = typeof parsed.categoryId === "string" ? parsed.categoryId.trim() : "";
  const categoryName = typeof parsed.categoryName === "string" ? normalizeSuggestedCategoryName(parsed.categoryName) : "";

  if (kind === "category" && options.categories.some((category) => category.id === categoryId)) {
    return { kind: "category", objectiveId: null, categoryId, categoryName: null, confidence, reason };
  }

  if (categoryName) {
    const existingCategory = options.categories.find((category) => category.name.toLocaleLowerCase() === categoryName.toLocaleLowerCase());
    if (existingCategory) {
      return { kind: "category", objectiveId: null, categoryId: existingCategory.id, categoryName: null, confidence, reason };
    }
    return { kind: "newCategory", objectiveId: null, categoryId: null, categoryName, confidence, reason };
  }

  return { kind: "uncategorized", objectiveId: null, categoryId: null, categoryName: null, confidence, reason };
}

function parseSuggestionJson(raw: string): RawSuggestion | null {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced ?? trimmed.match(/\{[\s\S]*\}/)?.[0] ?? trimmed;
  try {
    const parsed = JSON.parse(candidate) as unknown;
    return parsed && typeof parsed === "object" ? parsed as RawSuggestion : null;
  } catch {
    return null;
  }
}

function normalizeConfidence(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0.5;
  return Math.max(0, Math.min(1, numeric));
}

function normalizeSuggestedCategoryName(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 48);
}
