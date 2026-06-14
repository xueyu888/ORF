import type {
  WorkLogCategoryOption,
  WorkLogClassificationSuggestion,
  WorkLogObjectiveOption,
} from "../../src/types/orf";
import { buildOpenAiCompatibleChatClient } from "../llm/openAiCompatibleChatClient";

type SuggestionInput = {
  bodyMarkdown: string;
  categories: WorkLogCategoryOption[];
  objectives: WorkLogObjectiveOption[];
};

type RawSuggestion = {
  categoryId?: unknown;
  categoryName?: unknown;
  confidence?: unknown;
  kind?: unknown;
  objectiveId?: unknown;
  reason?: unknown;
};

export function isWorkLogClassificationSuggestionConfigured() {
  return buildOpenAiCompatibleChatClient() !== null;
}

export async function suggestWorkLogClassification({
  bodyMarkdown,
  categories,
  objectives,
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
            "你只能根据日志内容从候选目标、候选分类中选择，或者建议新建分类。",
            "如果内容明显对应目标，优先选择目标；如果不对应任何目标但适合已有分类，选择分类；如果都不适合，建议 newCategory。",
            "返回结构：{\"kind\":\"objective|category|newCategory|uncategorized\",\"objectiveId\":string|null,\"categoryId\":string|null,\"categoryName\":string|null,\"confidence\":0..1,\"reason\":string}",
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify(
            {
              log: bodyMarkdown.trim().slice(0, 3000),
              objectives: objectives.slice(0, 80).map((objective) => ({
                id: objective.id,
                title: objective.title,
                status: objective.flowStatus,
                finalDueAt: objective.finalDueAt,
              })),
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

    return normalizeSuggestion(raw, { categories, objectives });
  } catch {
    return null;
  }
}

function normalizeSuggestion(
  raw: string,
  options: Pick<SuggestionInput, "categories" | "objectives">,
): WorkLogClassificationSuggestion | null {
  const parsed = parseSuggestionJson(raw);
  if (!parsed) return null;

  const confidence = normalizeConfidence(parsed.confidence);
  const reason = typeof parsed.reason === "string" ? parsed.reason.trim().slice(0, 80) : null;
  const kind = typeof parsed.kind === "string" ? parsed.kind : "";
  const objectiveId = typeof parsed.objectiveId === "string" ? parsed.objectiveId.trim() : "";
  const categoryId = typeof parsed.categoryId === "string" ? parsed.categoryId.trim() : "";
  const categoryName = typeof parsed.categoryName === "string" ? normalizeSuggestedCategoryName(parsed.categoryName) : "";

  if (kind === "objective" && options.objectives.some((objective) => objective.id === objectiveId)) {
    return { kind: "objective", objectiveId, categoryId: null, categoryName: null, confidence, reason };
  }

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
