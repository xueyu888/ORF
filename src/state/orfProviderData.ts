import { type Dispatch, type SetStateAction, useCallback, useEffect, useRef, useState } from "react";
import { apiJson, type PermissionRulesResponse, type TaskManagementData, type UsersResponse } from "./apiClient";
import { normalizeState } from "./orfStateSnapshot";
import { shouldFetchAdminCollections, taskManagementPathForRole } from "./orfDataLoading";
import type { CommentThread, OrfState, UserRole } from "../types/orf";

const ONLINE_ACTIVITY_THROTTLE_MS = 60_000;

type OnlineActivityResponse = { ok: boolean; lastOnlineAt?: string | null };

interface OrfDataStateOptions {
  authReady: boolean;
  authUserId: string | null;
  clearNotifications: () => void;
  currentUserRole: UserRole | null;
  isApproved: boolean;
  isAuthenticated: boolean;
  refreshNotifications: () => Promise<void>;
  setState: Dispatch<SetStateAction<OrfState>>;
}

export function mergeTaskManagementData(state: OrfState, data: TaskManagementData): OrfState {
  return normalizeState({
    ...state,
    objectives: data.objectives,
    results: data.results,
    tasks: data.tasks,
    evidence: data.evidence,
    feedback: data.feedback,
    comments: data.comments ?? state.comments ?? [],
    objectiveLoot: data.objectiveLoot ?? state.objectiveLoot ?? [],
    objectiveTrialReviews: data.objectiveTrialReviews ?? state.objectiveTrialReviews ?? [],
    objectiveAlignmentRequests: data.objectiveAlignmentRequests ?? state.objectiveAlignmentRequests ?? [],
    pointLedger: data.pointLedger ?? state.pointLedger ?? [],
    permissionRules: data.permissionRules,
  });
}

export function mergePermissionRules(state: OrfState, data: PermissionRulesResponse): OrfState {
  return {
    ...state,
    permissionRules: data.permissionRules,
  };
}

export function mergeUsers(state: OrfState, data: UsersResponse): OrfState {
  return {
    ...state,
    users: data.users,
    currentUserId: data.users.some((user) => user.id === state.currentUserId) ? state.currentUserId : data.users[0]?.id ?? state.currentUserId,
  };
}

function mergeCommentThread(state: OrfState, commentThread: CommentThread): OrfState {
  const comments = state.comments.filter(
    (thread) =>
      thread.id !== commentThread.id &&
      !(thread.targetType === commentThread.targetType && thread.targetId === commentThread.targetId && thread.status === commentThread.status),
  );

  return {
    ...state,
    comments: [commentThread, ...comments].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
  };
}

function removeCommentThread(state: OrfState, threadId: string): OrfState {
  return {
    ...state,
    comments: state.comments.filter((thread) => thread.id !== threadId),
  };
}

export function useOrfDataState({
  authReady,
  authUserId,
  clearNotifications,
  currentUserRole,
  isApproved,
  isAuthenticated,
  refreshNotifications,
  setState,
}: OrfDataStateOptions) {
  const [dataReady, setDataReady] = useState(false);
  const lastOnlineActivitySentAt = useRef(0);

  const applyTaskManagementData = useCallback(
    (data: TaskManagementData) => {
      setState((current) => mergeTaskManagementData(current, data));
    },
    [setState],
  );

  const refreshTaskManagementData = useCallback(async () => {
    const data = await apiJson<TaskManagementData>(taskManagementPathForRole(currentUserRole));
    applyTaskManagementData(data);
    setDataReady(true);
  }, [applyTaskManagementData, currentUserRole]);

  const applyPermissionRules = useCallback(
    (data: PermissionRulesResponse) => {
      setState((current) => mergePermissionRules(current, data));
    },
    [setState],
  );

  const refreshPermissionRules = useCallback(async () => {
    const data = await apiJson<PermissionRulesResponse>("/api/permissions");
    applyPermissionRules(data);
  }, [applyPermissionRules]);

  const applyUsers = useCallback(
    (data: UsersResponse) => {
      setState((current) => mergeUsers(current, data));
    },
    [setState],
  );

  const refreshUsers = useCallback(async () => {
    const data = await apiJson<UsersResponse>("/api/users");
    applyUsers(data);
  }, [applyUsers]);

  const applyCommentThread = useCallback(
    (commentThread: CommentThread) => {
      setState((current) => mergeCommentThread(current, commentThread));
    },
    [setState],
  );

  const applyRemovedCommentThread = useCallback(
    (threadId: string) => {
      setState((current) => removeCommentThread(current, threadId));
    },
    [setState],
  );

  useEffect(() => {
    if (!authReady || !isAuthenticated || !isApproved) {
      clearNotifications();
      return;
    }

    let cancelled = false;
    setDataReady(false);

    void apiJson<TaskManagementData>(taskManagementPathForRole(currentUserRole))
      .then((data) => {
        if (!cancelled) {
          applyTaskManagementData(data);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          setDataReady(true);
        }
      });

    void refreshNotifications().catch(() => undefined);

    if (shouldFetchAdminCollections(currentUserRole)) {
      void apiJson<PermissionRulesResponse>("/api/permissions")
        .then((data) => {
          if (!cancelled) {
            applyPermissionRules(data);
          }
        })
        .catch(() => undefined);

      void apiJson<UsersResponse>("/api/users")
        .then((data) => {
          if (!cancelled) {
            applyUsers(data);
          }
        })
        .catch(() => undefined);
    }

    return () => {
      cancelled = true;
    };
  }, [applyPermissionRules, applyTaskManagementData, applyUsers, authReady, clearNotifications, currentUserRole, isAuthenticated, isApproved, refreshNotifications]);

  useEffect(() => {
    if (!authReady || !isAuthenticated || !isApproved) {
      lastOnlineActivitySentAt.current = 0;
      return undefined;
    }

    const reportActivity = (force = false) => {
      const now = Date.now();
      if (!force && now - lastOnlineActivitySentAt.current < ONLINE_ACTIVITY_THROTTLE_MS) {
        return;
      }

      lastOnlineActivitySentAt.current = now;
      void apiJson<OnlineActivityResponse>("/api/users/me/activity", { method: "POST", keepalive: force })
        .then((activity) => {
          if (!activity.lastOnlineAt || !authUserId) {
            return;
          }

          setState((current) => ({
            ...current,
            users: current.users.map((user) => (user.id === authUserId ? { ...user, lastOnlineAt: activity.lastOnlineAt } : user)),
          }));
        })
        .catch(() => undefined);
    };
    const reportVisibleActivity = () => {
      if (document.visibilityState === "visible") {
        reportActivity();
      }
    };
    const handleActivity = () => reportActivity();
    const reportFinalActivity = () => reportActivity(true);

    document.addEventListener("pointerdown", handleActivity, { capture: true });
    document.addEventListener("keydown", handleActivity, { capture: true });
    document.addEventListener("wheel", handleActivity, { capture: true, passive: true });
    document.addEventListener("touchstart", handleActivity, { capture: true, passive: true });
    window.addEventListener("focus", handleActivity);
    window.addEventListener("pagehide", reportFinalActivity);
    document.addEventListener("visibilitychange", reportVisibleActivity);

    return () => {
      document.removeEventListener("pointerdown", handleActivity, { capture: true });
      document.removeEventListener("keydown", handleActivity, { capture: true });
      document.removeEventListener("wheel", handleActivity, { capture: true });
      document.removeEventListener("touchstart", handleActivity, { capture: true });
      window.removeEventListener("focus", handleActivity);
      window.removeEventListener("pagehide", reportFinalActivity);
      document.removeEventListener("visibilitychange", reportVisibleActivity);
    };
  }, [authReady, authUserId, isAuthenticated, isApproved, setState]);

  return {
    applyCommentThread,
    applyRemovedCommentThread,
    dataReady,
    refreshPermissionRules,
    refreshTaskManagementData,
    refreshUsers,
  };
}
