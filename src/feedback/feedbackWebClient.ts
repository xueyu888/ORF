import { useCallback, useEffect, useRef, useState } from "react";
import {
  emptyFeedbackDashboardSummary,
  type FeedbackDashboardSummary,
  type FeedbackReferenceCardData,
  type FeedbackReferenceCardQuery,
  type FeedbackReferenceSummary,
} from "@orf/feedback-module/contracts";

export class FeedbackWebApiError extends Error {
  readonly status: number;
  readonly url: string;

  constructor(status: number, url: string, message: string) {
    super(message);
    this.name = "FeedbackWebApiError";
    this.status = status;
    this.url = url;
  }
}

type FeedbackDashboardSummaryHookState = {
  data: FeedbackDashboardSummary;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
};

export type {
  FeedbackReferenceCardData,
  FeedbackReferenceSummary,
};

export async function getFeedbackReferenceCard(input: FeedbackReferenceCardQuery, options: { signal?: AbortSignal } = {}) {
  const feedbackId = input.feedbackId.trim();
  const query = new URLSearchParams();
  const activityId = input.activityId?.trim();
  const commentMessageId = input.commentMessageId?.trim();
  if (activityId) query.set("activity", activityId);
  if (commentMessageId) query.set("comment", commentMessageId);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiJson<{ reference: FeedbackReferenceCardData }>(
    `/api/feedback/${encodeURIComponent(feedbackId)}/reference${suffix}`,
    { signal: options.signal },
  );
}

export async function getFeedbackReferences(input: {
  ids?: readonly string[];
  limit?: number;
  query?: string;
  signal?: AbortSignal;
} = {}) {
  const query = new URLSearchParams();
  for (const id of input.ids ?? []) {
    const normalizedId = id.trim();
    if (normalizedId) query.append("id", normalizedId);
  }
  const searchText = input.query?.trim();
  if (searchText) query.set("q", searchText);
  if (input.limit !== undefined) query.set("limit", String(input.limit));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await apiJson<{ feedback: FeedbackReferenceSummary[] }>(`/api/feedback/references${suffix}`, {
    signal: input.signal,
  });
  return response.feedback;
}

export function useFeedbackDashboardSummary(enabled = true, reloadKey = ""): FeedbackDashboardSummaryHookState {
  const load = useCallback(() => apiJson<FeedbackDashboardSummary>("/api/feedback/summary"), []);
  const [data, setData] = useState<FeedbackDashboardSummary>(emptyFeedbackDashboardSummary);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const reload = useCallback(async () => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    if (!enabled) {
      setData(emptyFeedbackDashboardSummary);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const nextData = await load();
      if (requestId !== requestIdRef.current) return;
      setData(nextData);
    } catch (loadError) {
      if (requestId !== requestIdRef.current) return;
      setError(loadError instanceof Error ? loadError.message : "反馈摘要读取失败");
      setData(emptyFeedbackDashboardSummary);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [enabled, load]);

  useEffect(() => {
    void reload();
  }, [reload, reloadKey]);

  return { data, error, loading, reload };
}

async function apiJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await apiRequest(url, init);
  return response.json() as Promise<T>;
}

async function apiRequest(url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (init.body && typeof init.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    credentials: "same-origin",
    ...init,
    headers,
  });

  if (!response.ok) {
    throw new FeedbackWebApiError(response.status, url, await apiErrorMessage(response));
  }
  return response;
}

async function apiErrorMessage(response: Response) {
  try {
    const body = await response.json() as { error?: unknown; message?: unknown };
    const message = typeof body.error === "string" ? body.error : typeof body.message === "string" ? body.message : "";
    return message || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}
