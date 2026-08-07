import { useCallback, useEffect, useRef, useState } from "react";
import { emptyFeedbackIssueReadModelData, type FeedbackIssueReadModelData } from "../../domain/feedbackReadModel";
import {
  getFeedbackIssueDetailReadModel,
  getFeedbackIssueReadModel,
} from "../../state/apiClient";

type FeedbackIssueReadModelHookState = {
  data: FeedbackIssueReadModelData;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
};

export function useFeedbackIssueReadModel(enabled = true): FeedbackIssueReadModelHookState {
  const load = useCallback(() => getFeedbackIssueReadModel(), []);
  return useFeedbackIssueReadModelLoader(load, enabled);
}

export function useFeedbackIssueDetailReadModel(feedbackId: string, enabled = true): FeedbackIssueReadModelHookState {
  const load = useCallback(() => getFeedbackIssueDetailReadModel(feedbackId), [feedbackId]);
  return useFeedbackIssueReadModelLoader(load, enabled && Boolean(feedbackId.trim()));
}

function useFeedbackIssueReadModelLoader(
  load: () => Promise<FeedbackIssueReadModelData>,
  enabled: boolean,
): FeedbackIssueReadModelHookState {
  const [data, setData] = useState<FeedbackIssueReadModelData>(emptyFeedbackIssueReadModelData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const reload = useCallback(async () => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    if (!enabled) {
      setData(emptyFeedbackIssueReadModelData);
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
      setError(loadError instanceof Error ? loadError.message : "反馈读取失败");
      setData(emptyFeedbackIssueReadModelData);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [enabled, load]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, loading, reload };
}
