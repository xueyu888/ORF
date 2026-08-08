import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  getFeedbackAssignees,
  getFeedbackDashboardSummary,
  getFeedbackIssueDetailReadModel,
  getFeedbackIssueReadModel,
  getFeedbackReferences,
} from "./api";
import { mergeFeedbackAssigneeOptions, type FeedbackAssigneeOption } from "./model/assigneeOptions";
import {
  feedbackIssueListPageQuery,
  mergeFeedbackIssueListReadModelPages,
} from "./model/issueListPagination";
import {
  emptyFeedbackDashboardSummary,
  emptyFeedbackIssueReadModelData,
  type FeedbackDashboardSummary,
  type FeedbackIssueReadModelData,
  type FeedbackReferenceSummary,
  type FeedbackWebUser,
} from "./types";

type FeedbackReadHookState<T> = {
  data: T;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
};

type FeedbackReadLoaderState<T> = FeedbackReadHookState<T> & {
  setData: Dispatch<SetStateAction<T>>;
  setError: Dispatch<SetStateAction<string | null>>;
};

type FeedbackIssueReadModelHookState = FeedbackReadHookState<FeedbackIssueReadModelData>;
type FeedbackIssueReadModelLoaderState = FeedbackReadLoaderState<FeedbackIssueReadModelData>;

type FeedbackDashboardSummaryHookState = FeedbackReadHookState<FeedbackDashboardSummary>;

type FeedbackIssueListReadModelHookState = FeedbackIssueReadModelHookState & {
  hasMore: boolean;
  loadMore: () => Promise<void>;
  loadingMore: boolean;
};

type FeedbackReferenceOptionsHookState = {
  error: string | null;
  loading: boolean;
  references: FeedbackReferenceSummary[];
  reload: () => Promise<void>;
};

export function useFeedbackIssueReadModel(enabled = true, reloadKey = "", query = ""): FeedbackIssueReadModelHookState {
  const load = useCallback(() => getFeedbackIssueReadModel(query), [query]);
  return useFeedbackReadLoader(load, enabled, reloadKey, emptyFeedbackIssueReadModelData, "反馈读取失败");
}

export function useFeedbackIssueListReadModel(enabled = true, reloadKey = "", query = ""): FeedbackIssueListReadModelHookState {
  const firstPageQuery = useMemo(() => feedbackIssueListPageQuery(query), [query]);
  const load = useCallback(() => getFeedbackIssueReadModel(firstPageQuery), [firstPageQuery]);
  const { data, error, loading, reload, setData, setError } = useFeedbackReadLoader(load, enabled, reloadKey, emptyFeedbackIssueReadModelData, "反馈读取失败");
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreRequestIdRef = useRef(0);
  const activePageQueryRef = useRef(firstPageQuery);
  const nextCursor = data.list?.pageInfo.nextCursor ?? null;
  const hasMore = Boolean(data.list?.pageInfo.hasMore && nextCursor);

  useEffect(() => {
    activePageQueryRef.current = firstPageQuery;
    loadMoreRequestIdRef.current += 1;
    setLoadingMore(false);
  }, [enabled, firstPageQuery]);

  const loadMore = useCallback(async () => {
    if (!enabled || !hasMore || !nextCursor || loadingMore || loading) return;

    loadMoreRequestIdRef.current += 1;
    const requestId = loadMoreRequestIdRef.current;
    const requestPageQuery = firstPageQuery;
    setLoadingMore(true);
    try {
      const nextPage = await getFeedbackIssueReadModel(feedbackIssueListPageQuery(query, { cursor: nextCursor }));
      if (requestId !== loadMoreRequestIdRef.current || requestPageQuery !== activePageQueryRef.current) return;
      setData((current) => mergeFeedbackIssueListReadModelPages(current, nextPage));
    } catch {
      if (requestId === loadMoreRequestIdRef.current) {
        setError("反馈列表加载更多失败");
      }
    } finally {
      if (requestId === loadMoreRequestIdRef.current) {
        setLoadingMore(false);
      }
    }
  }, [enabled, firstPageQuery, hasMore, loading, loadingMore, nextCursor, query, setData, setError]);

  return {
    data,
    error,
    hasMore,
    loading,
    loadingMore,
    loadMore,
    reload,
  };
}

export function useFeedbackIssueDetailReadModel(feedbackId: string, enabled = true, reloadKey = ""): FeedbackIssueReadModelHookState {
  const load = useCallback(() => getFeedbackIssueDetailReadModel(feedbackId), [feedbackId]);
  return useFeedbackReadLoader(load, enabled && Boolean(feedbackId.trim()), reloadKey, emptyFeedbackIssueReadModelData, "反馈读取失败");
}

export function useFeedbackDashboardSummary(enabled = true, reloadKey = ""): FeedbackDashboardSummaryHookState {
  const load = useCallback(() => getFeedbackDashboardSummary(), []);
  return useFeedbackReadLoader(load, enabled, reloadKey, emptyFeedbackDashboardSummary, "反馈摘要读取失败");
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

export function useFeedbackReferenceOptions(
  enabled = true,
  reloadKey = "",
  referenceIds: readonly string[] = [],
  limit = 80,
  query = "",
): FeedbackReferenceOptionsHookState {
  const referenceIdKey = useMemo(() => Array.from(new Set(referenceIds.map((id) => id.trim()).filter(Boolean))).sort().join("\n"), [referenceIds]);
  const normalizedQuery = query.trim();
  const load = useCallback(async () => {
    const ids = referenceIdKey ? referenceIdKey.split("\n") : [];
    const [referenced, recent] = await Promise.all([
      ids.length > 0 ? getFeedbackReferences({ ids }) : Promise.resolve([]),
      getFeedbackReferences({ limit, query: normalizedQuery }),
    ]);
    return mergeFeedbackReferences(referenced, recent);
  }, [limit, normalizedQuery, referenceIdKey]);

  const [references, setReferences] = useState<FeedbackReferenceSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const reload = useCallback(async () => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    if (!enabled) {
      setReferences([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const nextReferences = await load();
      if (requestId !== requestIdRef.current) return;
      setReferences(nextReferences);
    } catch (loadError) {
      if (requestId !== requestIdRef.current) return;
      setError(loadError instanceof Error ? loadError.message : "反馈引用读取失败");
      setReferences([]);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [enabled, load]);

  useEffect(() => {
    void reload();
  }, [reload, reloadKey]);

  return { error, loading, references, reload };
}

function useFeedbackReadLoader<T>(
  load: () => Promise<T>,
  enabled: boolean,
  reloadKey: string,
  emptyData: T,
  errorMessage: string,
): FeedbackReadLoaderState<T> {
  const [data, setData] = useState<T>(emptyData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const reload = useCallback(async () => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    if (!enabled) {
      setData(emptyData);
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
      setError(loadError instanceof Error ? loadError.message : errorMessage);
      setData(emptyData);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [emptyData, enabled, errorMessage, load]);

  useEffect(() => {
    void reload();
  }, [reload, reloadKey]);

  return { data, error, loading, reload, setData, setError };
}

function mergeFeedbackReferences(...groups: readonly FeedbackReferenceSummary[][]) {
  const referencesById = new Map<string, FeedbackReferenceSummary>();
  for (const reference of groups.flat()) {
    if (!referencesById.has(reference.id)) {
      referencesById.set(reference.id, reference);
    }
  }
  return [...referencesById.values()];
}
