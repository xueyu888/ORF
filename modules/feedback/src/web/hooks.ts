import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getFeedbackAssignees,
  getFeedbackIssueDetailReadModel,
  getFeedbackIssueReadModel,
} from "./api";
import { mergeFeedbackAssigneeOptions, type FeedbackAssigneeOption } from "./model/assigneeOptions";
import { emptyFeedbackIssueReadModelData, type FeedbackIssueReadModelData, type FeedbackWebUser } from "./types";

type FeedbackIssueReadModelHookState = {
  data: FeedbackIssueReadModelData;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
};

export function useFeedbackIssueReadModel(enabled = true, reloadKey = "", query = ""): FeedbackIssueReadModelHookState {
  const load = useCallback(() => getFeedbackIssueReadModel(query), [query]);
  return useFeedbackIssueReadModelLoader(load, enabled, reloadKey);
}

export function useFeedbackIssueDetailReadModel(feedbackId: string, enabled = true, reloadKey = ""): FeedbackIssueReadModelHookState {
  const load = useCallback(() => getFeedbackIssueDetailReadModel(feedbackId), [feedbackId]);
  return useFeedbackIssueReadModelLoader(load, enabled && Boolean(feedbackId.trim()), reloadKey);
}

export function useFeedbackAssigneeOptions(users: readonly FeedbackWebUser[], currentUser: FeedbackWebUser | null): FeedbackAssigneeOption[] {
  const [serverOptions, setServerOptions] = useState<FeedbackAssigneeOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    getFeedbackAssignees()
      .then((response) => {
        if (!cancelled) setServerOptions(response.users);
      })
      .catch(() => {
        if (!cancelled) setServerOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => {
    const localOptions = users
      .filter((user) => user.status === "active")
      .map((user) => ({ avatarUrl: user.avatarUrl ?? null, id: user.id, name: user.name }));
    const currentOption = currentUser?.status === "active"
      ? [{ avatarUrl: currentUser.avatarUrl ?? null, id: currentUser.id, name: currentUser.name }]
      : [];
    return mergeFeedbackAssigneeOptions(serverOptions, localOptions, currentOption);
  }, [currentUser, serverOptions, users]);
}

function useFeedbackIssueReadModelLoader(
  load: () => Promise<FeedbackIssueReadModelData>,
  enabled: boolean,
  reloadKey: string,
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
  }, [reload, reloadKey]);

  return { data, error, loading, reload };
}
