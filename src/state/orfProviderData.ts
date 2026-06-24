import { type Dispatch, type SetStateAction, useCallback, useEffect, useRef, useState } from "react";
import { apiJson, getCurrentUserAccess, type CurrentUserAccessData, type PermissionRulesResponse, type TaskManagementData, type UsersResponse } from "./apiClient";
import { normalizeState } from "./orfStateSnapshot";
import { shouldFetchAdminCollections, taskManagementPathForRole } from "./orfDataLoading";
import { mergeUserDisplayProfiles, userDisplayProfilesFromUsers } from "../domain/userDisplayProfile";
import { getDesktopSystemIdleSnapshot, getDesktopWindowState, isDesktopShellAvailable } from "../features/desktop/desktopShellRuntime";
import { readBrowserDocumentAttentionSnapshot } from "../features/interaction/appAttentionState";
import { getRealtimeClientId } from "../features/realtime/realtimeClientId";
import type { CommentThread, OrfState, OrfUser, UserPresenceActivityInput, UserRole } from "../types/orf";

const ONLINE_ACTIVITY_THROTTLE_MS = 60_000;
const PRESENCE_HEARTBEAT_MS = 60_000;

type OnlineActivityResponse = { ok: boolean; lastOnlineAt?: string | null };

async function buildPresenceActivityPayload(lastInteractionAt: string | null): Promise<UserPresenceActivityInput> {
  const browserSnapshot = readBrowserDocumentAttentionSnapshot();
  const payload: UserPresenceActivityInput = {
    clientId: getRealtimeClientId(),
    documentFocused: browserSnapshot.documentFocused,
    documentVisible: browserSnapshot.visibilityState === "visible",
    lastInteractionAt,
    occurredAt: new Date().toISOString(),
    source: isDesktopShellAvailable() ? "desktop" : "browser",
  };

  if (!isDesktopShellAvailable()) return payload;

  const [windowStateResult, idleResult] = await Promise.all([
    getDesktopWindowState().catch(() => null),
    getDesktopSystemIdleSnapshot().catch(() => null),
  ]);
  if (windowStateResult?.status === "success" && windowStateResult.data) {
    payload.windowFocused = windowStateResult.data.isFocused === true;
    payload.windowMinimized = windowStateResult.data.isMinimized === true;
    payload.windowVisible = windowStateResult.data.isVisible !== false;
  }
  if (idleResult?.status === "success" && idleResult.data) {
    payload.systemIdleSeconds = idleResult.data.idleSeconds;
    payload.systemIdleState = idleResult.data.state;
  }

  return payload;
}

interface OrfDataStateOptions {
  authReady: boolean;
  authUserId: string | null;
  currentUserRole: UserRole | null;
  isApproved: boolean;
  isAuthenticated: boolean;
  loadTaskManagementData: boolean;
  refreshNotifications: () => Promise<void>;
  resetNotificationState: () => void;
  setState: Dispatch<SetStateAction<OrfState>>;
}

export function mergeTaskManagementData(state: OrfState, data: TaskManagementData): OrfState {
  return normalizeState({
    ...state,
    projects: data.projects ?? state.projects ?? [],
    objectives: data.objectives,
    results: data.results,
    tasks: data.tasks,
    evidence: data.evidence,
    feedback: data.feedback,
    comments: data.comments ?? state.comments ?? [],
    objectiveLoot: data.objectiveLoot ?? state.objectiveLoot ?? [],
    objectiveTrialReviews: data.objectiveTrialReviews ?? state.objectiveTrialReviews ?? [],
    objectiveAcceptanceReviews: data.objectiveAcceptanceReviews ?? state.objectiveAcceptanceReviews ?? [],
    objectiveAlignmentRequests: data.objectiveAlignmentRequests ?? state.objectiveAlignmentRequests ?? [],
    objectiveSettlementEvents: data.objectiveSettlementEvents ?? state.objectiveSettlementEvents ?? [],
    pointLedger: data.pointLedger ?? state.pointLedger ?? [],
    userProfiles: data.userProfiles ?? state.userProfiles ?? userDisplayProfilesFromUsers(state.users),
  });
}

function mergeCurrentUser(users: OrfUser[], user: OrfUser) {
  return [...users.filter((item) => item.id !== user.id && item.email.toLowerCase() !== user.email.toLowerCase()), user];
}

export function mergeCurrentUserAccess(state: OrfState, data: CurrentUserAccessData): OrfState {
  return {
    ...state,
    users: mergeCurrentUser(state.users, data.user),
    userProfiles: mergeUserDisplayProfiles(state.userProfiles, [data.user]),
    currentUserId: data.user.id,
    permissionRules: data.permissionRules,
  };
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
    userProfiles: userDisplayProfilesFromUsers(data.users),
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
  currentUserRole,
  isApproved,
  isAuthenticated,
  loadTaskManagementData,
  refreshNotifications,
  resetNotificationState,
  setState,
}: OrfDataStateOptions) {
  const [dataReady, setDataReady] = useState(false);
  const lastOnlineActivitySentAt = useRef(0);
  const lastUserInteractionAt = useRef<string | null>(new Date().toISOString());

  const applyTaskManagementData = useCallback(
    (data: TaskManagementData) => {
      setState((current) => mergeTaskManagementData(current, data));
    },
    [setState],
  );

  const applyCurrentUserAccess = useCallback(
    (data: CurrentUserAccessData) => {
      setState((current) => mergeCurrentUserAccess(current, data));
    },
    [setState],
  );

  const refreshCurrentUserAccess = useCallback(async () => {
    const data = await getCurrentUserAccess();
    applyCurrentUserAccess(data);
  }, [applyCurrentUserAccess]);

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
      resetNotificationState();
      setDataReady(false);
      return;
    }

    let cancelled = false;
    setDataReady(false);

    const markReady = () => {
      if (!cancelled) {
        setDataReady(true);
      }
    };

    const accessLoad = getCurrentUserAccess()
      .then((data) => {
        if (!cancelled) {
          applyCurrentUserAccess(data);
        }
      })
      .catch(() => undefined);

    const taskManagementLoad = loadTaskManagementData
      ? apiJson<TaskManagementData>(taskManagementPathForRole(currentUserRole))
          .then((data) => {
            if (!cancelled) {
              applyTaskManagementData(data);
            }
          })
          .catch(() => undefined)
      : Promise.resolve();

    void Promise.allSettled([accessLoad, taskManagementLoad]).finally(markReady);

    void refreshNotifications().catch(() => undefined);

    if (loadTaskManagementData && shouldFetchAdminCollections(currentUserRole)) {
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
  }, [
    applyCurrentUserAccess,
    applyTaskManagementData,
    applyUsers,
    authReady,
    currentUserRole,
    isAuthenticated,
    isApproved,
    loadTaskManagementData,
    refreshNotifications,
    resetNotificationState,
  ]);

  useEffect(() => {
    if (!authReady || !isAuthenticated || !isApproved) {
      lastOnlineActivitySentAt.current = 0;
      return undefined;
    }

    let cancelled = false;
    const reportActivity = (force = false) => {
      const now = Date.now();
      if (!force && now - lastOnlineActivitySentAt.current < ONLINE_ACTIVITY_THROTTLE_MS) {
        return;
      }

      lastOnlineActivitySentAt.current = now;
      void buildPresenceActivityPayload(lastUserInteractionAt.current)
        .then((payload) => {
          if (cancelled) return null;
          return apiJson<OnlineActivityResponse>("/api/users/me/activity", {
            body: JSON.stringify(payload),
            keepalive: force,
            method: "POST",
          });
        })
        .then((activity) => {
          if (!activity?.lastOnlineAt || !authUserId) {
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
    const handleActivity = () => {
      lastUserInteractionAt.current = new Date().toISOString();
      reportActivity();
    };
    const reportFinalActivity = () => reportActivity(true);
    const heartbeat = window.setInterval(() => reportActivity(), PRESENCE_HEARTBEAT_MS);

    document.addEventListener("pointerdown", handleActivity, { capture: true });
    document.addEventListener("keydown", handleActivity, { capture: true });
    document.addEventListener("wheel", handleActivity, { capture: true, passive: true });
    document.addEventListener("touchstart", handleActivity, { capture: true, passive: true });
    window.addEventListener("focus", handleActivity);
    window.addEventListener("pagehide", reportFinalActivity);
    document.addEventListener("visibilitychange", reportVisibleActivity);

    return () => {
      cancelled = true;
      window.clearInterval(heartbeat);
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
    refreshCurrentUserAccess,
    refreshPermissionRules,
    refreshTaskManagementData,
    refreshUsers,
  };
}
