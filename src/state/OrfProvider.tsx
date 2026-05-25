import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { hasPermission } from "../config/permissions";
import {
  ApiError,
  apiJson,
  apiRequest,
  getCommentMentionableUsers,
  getNotifications,
  markAllNotificationsReadRequest,
  markNotificationReadRequest,
  type AuthSession,
  type NotificationsResponse,
  type PermissionRulesResponse,
  type TaskManagementData,
  type UsersResponse,
  uploadCommentAttachment as uploadCommentAttachmentRequest,
} from "./apiClient";
import { normalizeState, OrfFlowStore } from "./OrfFlowStore";
import { shouldFetchAdminCollections, taskManagementPathForRole } from "./orfDataLoading";
import type {
  CommentStatus,
  CommentThread,
  CommentTargetType,
  Feedback,
  Objective,
  FeedbackStatus,
  LootResultClaim,
  OrfState,
  OrfUser,
  Result,
  ResultAcceptedResult,
  Task,
  TaskChecklistItem,
  TaskStatus,
  BountySource,
  ContributionAllocation,
  AppNotification,
  UserRole,
} from "../types/orf";

type ModalType = "newResult" | "newFeedback" | "newTask" | "resultUpdate" | "recruitChallengers" | null;
export type ThemeMode = "dark" | "light";
type AuthResult = { ok: true } | { ok: false; message: string };
type CommentMutationResponse = { ok: boolean; commentThread: CommentThread | null };
type OnlineActivityResponse = { ok: boolean; lastOnlineAt?: string | null };
type CreateObjectiveResponse = { objective: Objective };
type CreateResultResponse = { result: Result };
type CreateTaskResponse = { task: Task };
type CreateChecklistItemResponse = { item: TaskChecklistItem };
type SubmitLootInput = {
  objectiveId: string;
  body: string;
  resultClaims: LootResultClaim[];
  selfTestReportUrl?: string | null;
  selfTestReportBody?: string | null;
  author?: string;
};
type ReviewObjectiveLootInput = {
  lootId?: string;
  resultReviews?: Array<{ resultId: string; acceptedResult: ResultAcceptedResult }>;
  contributionResolution?: { ratios: ContributionAllocation[]; reason: string };
  reason?: string;
};

interface ModalState {
  type: ModalType;
  objectiveId?: string;
  resultId?: string;
  feedbackId?: string;
  source?: BountySource;
}

interface ToastMessage {
  id: string;
  message: string;
}

interface OrfContextValue {
  state: OrfState;
  currentUser: OrfUser | null;
  authReady: boolean;
  dataReady: boolean;
  isAuthenticated: boolean;
  isApproved: boolean;
  isAdmin: boolean;
  modal: ModalState;
  toasts: ToastMessage[];
  notifications: AppNotification[];
  unreadNotificationCount: number;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  openModal: (modal: ModalState) => void;
  closeModal: () => void;
  notify: (message: string) => void;
  removeToast: (id: string) => void;
  resetState: () => void;
  refreshNotifications: () => Promise<void>;
  markNotificationRead: (notificationId: string) => Promise<boolean>;
  markAllNotificationsRead: () => Promise<boolean>;
  createObjective: Parameters<OrfFlowStore["createObjective"]>[1] extends infer T ? (input: T) => Promise<Objective | null> : never;
  createResult: (input: Partial<Result> & Pick<Result, "objectiveId" | "title" | "metricName">) => Promise<Result | null>;
  publishObjective: (objectiveId: string) => Promise<boolean>;
  recruitObjectiveChallengers: (objectiveId: string, members: string[]) => Promise<boolean>;
  approveChallengeApplication: (objectiveId: string, applicationId: string) => Promise<boolean>;
  rejectChallengeApplication: (objectiveId: string, applicationId: string) => Promise<boolean>;
  applyForBounty: (objectiveId: string) => Promise<boolean>;
  acceptBountyChallenge: (objectiveId: string) => Promise<boolean>;
  freezeObjective: (objectiveId: string) => Promise<boolean>;
  reviewObjectiveLoot: (objectiveId: string, input: ReviewObjectiveLootInput) => Promise<boolean>;
  submitContributionReview: (objectiveId: string, allocations: ContributionAllocation[]) => Promise<boolean>;
  createFeedback: (input: Pick<Feedback, "phenomenon" | "causeCategories" | "impact" | "linkedObjectiveId" | "linkedResultId" | "suggestedAdjustment" | "source" | "owner">) => Promise<boolean>;
  createTask: (input: Pick<Task, "title" | "description" | "assignee" | "priority" | "linkedObjectiveId"> & Partial<Task>) => Promise<Task | null>;
  updateTaskStatus: (taskId: string, status: TaskStatus) => void;
  setTaskCompletion: (taskId: string, done: boolean) => void;
  updateTaskChecklistItem: (taskId: string, itemId: string, done: boolean) => void;
  updateObjectiveTitle: (objectiveId: string, title: string) => void;
  updateObjectiveStage: (objectiveId: string, stage: OrfState["objectives"][number]["stage"]) => void;
  updateResultTitle: (resultId: string, title: string) => void;
  updateTaskTitle: (taskId: string, title: string) => void;
  updateTaskChecklistItemLabel: (taskId: string, itemId: string, label: string) => void;
  createTaskChecklistItem: (taskId: string, input?: { afterItemId?: string; label?: string }) => Promise<TaskChecklistItem | null>;
  moveResult: OrfFlowStore["moveResult"] extends (state: OrfState, input: infer T) => OrfState ? (input: T) => void : never;
  moveTask: OrfFlowStore["moveTask"] extends (state: OrfState, input: infer T) => OrfState ? (input: T) => void : never;
  moveTaskChecklistItem: OrfFlowStore["moveTaskChecklistItem"] extends (state: OrfState, input: infer T) => OrfState ? (input: T) => void : never;
  submitLoot: (input: SubmitLootInput) => Promise<boolean>;
  deleteObjective: (objectiveId: string) => void;
  deleteResult: (resultId: string) => void;
  deleteTask: (taskId: string) => void;
  deleteTaskChecklistItem: (taskId: string, itemId: string) => void;
  updateFeedbackStatus: (feedbackId: string, status: FeedbackStatus) => void;
  updateResultConfidence: (resultId: string, confidence: number) => void;
  createUser: (input: { name: string; email: string; role: UserRole }) => Promise<boolean>;
  loginWithPassword: (email: string, password: string) => Promise<AuthResult>;
  registerWithPassword: (input: { name: string; email: string; password: string }) => Promise<AuthResult>;
  logout: () => void;
  updateUser: (userId: string, input: { name: string; email: string; role: UserRole }) => Promise<boolean>;
  deleteUser: (userId: string) => Promise<boolean>;
  disableUser: (userId: string) => Promise<boolean>;
  approveRegistrationRequest: (userId: string) => Promise<boolean>;
  rejectRegistrationRequest: (userId: string) => Promise<boolean>;
  updateRolePermissionRules: (role: UserRole, rules: OrfState["permissionRules"]) => Promise<boolean>;
  addComment: (input: {
    targetType: CommentTargetType;
    targetId: string;
    targetTitle: string;
    body: string;
    author?: string;
    parentMessageId?: string;
    replyToMessageId?: string;
    replyToAuthor?: string;
  }) => void;
  loadCommentMentionableUsers: (input: { targetId: string; targetType: CommentTargetType }) => Promise<OrfUser[]>;
  uploadCommentAttachment: (input: { file: File; targetId: string; targetType: CommentTargetType }) => Promise<string | null>;
  updateCommentThreadStatus: (threadId: string, status: CommentStatus) => void;
  updateCommentMessage: (threadId: string, messageId: string, body: string) => void;
  deleteCommentMessage: (threadId: string, messageId: string) => void;
  proposeResultUpdate: (resultId: string, title: string, reason: string, feedbackId?: string) => Promise<boolean>;
}

const OrfContext = createContext<OrfContextValue | null>(null);

const store = new OrfFlowStore();
const THEME_STORAGE_KEY = "orf-flow-theme";
const AUTH_SESSION_TIMEOUT_MS = 8000;
const AUTH_PASSWORD_TIMEOUT_MS = 2000;
const ONLINE_ACTIVITY_THROTTLE_MS = 60_000;
const NOTIFICATION_POLL_MS = 30_000;

function mergeTaskManagementData(state: OrfState, data: TaskManagementData): OrfState {
  return normalizeState({
    ...state,
    objectives: data.objectives,
    results: data.results,
    tasks: data.tasks,
    evidence: data.evidence,
    feedback: data.feedback,
    comments: data.comments ?? state.comments ?? [],
    objectiveLoot: data.objectiveLoot ?? state.objectiveLoot ?? [],
    objectiveContributionReviews: data.objectiveContributionReviews ?? state.objectiveContributionReviews ?? [],
    pointLedger: data.pointLedger ?? state.pointLedger ?? [],
    permissionRules: data.permissionRules,
  });
}

function mergePermissionRules(state: OrfState, data: PermissionRulesResponse): OrfState {
  return {
    ...state,
    permissionRules: data.permissionRules,
  };
}

function mergeUsers(state: OrfState, data: UsersResponse): OrfState {
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

function loadInitialState() {
  return store.load();
}

function mergeAuthenticatedUser(state: OrfState, user: OrfUser): OrfState {
  const users = state.users.filter((item) => item.id !== user.id && item.email.toLowerCase() !== user.email.toLowerCase());
  return {
    ...state,
    users: [...users, user],
    currentUserId: user.id,
  };
}

function persistAuthenticatedUser(user: OrfUser, setState: (update: (current: OrfState) => OrfState) => void) {
  setState((current) => {
    return mergeAuthenticatedUser(current, user);
  });
}

export function authFailureMessage(error: unknown, action: "login" | "registration") {
  if (error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError")) {
    return "认证服务暂时不可用，请联系管理员。";
  }

  if (error instanceof ApiError) {
    if (error.status === 401) {
      return "账号或密码不正确";
    }

    if (error.status === 400) {
      if (action === "registration" && error.message && error.message !== "Registration failed") {
        return error.message;
      }

      return action === "registration" ? "注册失败，请检查邮箱和密码" : "账号或密码不正确";
    }

    if (error.status === 502 || error.status === 503 || error.status === 504) {
      return error.message || "认证服务暂时不可用，请联系管理员。";
    }
  }

  return "无法连接后端服务，请确认服务已启动";
}

function userMutationFailureMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return "登录已过期，请重新登录";
    }

    if (error.status === 403) {
      return "只有管理员可以操作成员";
    }

    if (error.status === 409) {
      if (error.message === "Admin cannot delete self") {
        return "管理员不能删除自己";
      }

      if (error.message === "Admin cannot demote self") {
        return "管理员不能将自己降级为成员";
      }

      if (error.message === "Name already exists") {
        return "已存在同名成员";
      }

      if (error.message === "User name is referenced by ORF records") {
        return "该成员已被 ORF 业务记录引用，不能改名";
      }

      if (error.message === "User is referenced by ORF records") {
        return "该成员已被 ORF 业务记录引用，不能删除，请改为停用";
      }

      if (error.message === "Name is referenced by ORF records") {
        return "该姓名已被 ORF 历史记录占用，不能创建新成员";
      }

      if (error.message === "Bound login email cannot be changed") {
        return "已绑定登录身份的邮箱不能在成员管理中修改";
      }

      return error.message;
    }

    if (error.status === 404) {
      return "用户不存在，已刷新成员列表";
    }

    return error.message || fallback;
  }

  return fallback;
}

function bountyMutationFailureMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return "登录已过期，请重新登录";
    }

    if (error.status === 403) {
      return "你没有接受这个悬赏目标的权限";
    }

    if (error.status === 404) {
      return "悬赏目标不存在，已刷新数据";
    }

    if (error.status === 409) {
      if (error.message === "Objective already includes this challenger") {
        return "你已经是这个目标的挑战者";
      }

      if (error.message === "Challenge application already exists") {
        return "你已经申请过这个目标";
      }

      if (error.message === "Objective final due date is too close to start confirmation") {
        return "目标截止时间太近，不能接受征召";
      }

      if (
        error.message === "Objective is not open for challenge acceptance" ||
        error.message === "Objective is not open for challenge applications" ||
        error.message === "Objective status does not allow this operation"
      ) {
        return "目标状态已变化，请刷新后再试";
      }

      return error.message || "目标状态已变化，请刷新后再试";
    }

    return error.message || fallback;
  }

  return fallback;
}

function commentMutationFailureMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    const isImageMutation = fallback.includes("图片");

    if (error.status === 401) {
      return "登录已过期，请重新登录";
    }

    if (error.status === 403) {
      return isImageMutation ? "没有权限上传这个评论图片" : "只能编辑或删除自己的评论";
    }

    if (error.status === 404) {
      return "评论对象不存在，已刷新数据";
    }

    if (error.status === 413) {
      return "图片过大，请压缩后再上传";
    }

    if (error.status === 415) {
      return "只能上传 PNG、JPEG、GIF 或 WebP 图片";
    }

    if (error.status === 400) {
      return isImageMutation ? "图片文件无效" : "评论内容不能为空";
    }

    return error.message || fallback;
  }

  return fallback;
}

function businessMutationFailureMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return "登录已过期，请重新登录";
    }

    if (error.status === 403) {
      return "没有执行这个操作的权限";
    }

    if (error.status === 404) {
      return "操作对象不存在，已刷新数据";
    }

    if (error.status === 409) {
      if (error.message === "Feedback owner must be an active member") {
        return "反馈处理人必须是当前可用成员";
      }
      return error.message || "数据状态已变化，请刷新后再试";
    }

    return error.message || fallback;
  }

  return fallback;
}

function loadTheme(): ThemeMode {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return raw === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function OrfProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(loadInitialState);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [theme, setThemeState] = useState<ThemeMode>(() => loadTheme());
  const [modal, setModal] = useState<ModalState>({ type: null });
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const lastOnlineActivitySentAt = useRef(0);
  const currentUser = authUserId ? state.users.find((user) => user.id === authUserId) ?? null : null;
  const currentUserRole = currentUser?.role ?? null;
  const isAuthenticated = currentUser !== null;
  const isApproved = currentUser?.status === "active";
  const isAdmin = currentUser?.role === "admin";
  const refreshAuthSession = useCallback(async () => {
    try {
      const session = await apiJson<AuthSession>("/api/auth/session", {
        signal: AbortSignal.timeout(AUTH_SESSION_TIMEOUT_MS),
      });
      if (!session.authenticated) {
        setAuthUserId(null);
        return;
      }

      setAuthUserId(session.user.id);
      persistAuthenticatedUser(session.user, setState);
    } catch {
      setAuthUserId(null);
    } finally {
      setAuthReady(true);
    }
  }, []);
  const applyTaskManagementData = useCallback((data: TaskManagementData) => {
    setState((current) => {
      return mergeTaskManagementData(current, data);
    });
  }, []);
  const refreshTaskManagementData = useCallback(async () => {
    const data = await apiJson<TaskManagementData>(taskManagementPathForRole(currentUserRole));
    applyTaskManagementData(data);
    setDataReady(true);
  }, [applyTaskManagementData, currentUserRole]);
  const applyPermissionRules = useCallback((data: PermissionRulesResponse) => {
    setState((current) => {
      return mergePermissionRules(current, data);
    });
  }, []);
  const refreshPermissionRules = useCallback(async () => {
    const data = await apiJson<PermissionRulesResponse>("/api/permissions");
    applyPermissionRules(data);
  }, [applyPermissionRules]);
  const applyUsers = useCallback((data: UsersResponse) => {
    setState((current) => {
      return mergeUsers(current, data);
    });
  }, []);
  const applyCommentThread = useCallback((commentThread: CommentThread) => {
    setState((current) => {
      return mergeCommentThread(current, commentThread);
    });
  }, []);
  const applyRemovedCommentThread = useCallback((threadId: string) => {
    setState((current) => {
      return removeCommentThread(current, threadId);
    });
  }, []);
  const refreshUsers = useCallback(async () => {
    const data = await apiJson<UsersResponse>("/api/users");
    applyUsers(data);
  }, [applyUsers]);
  const applyNotifications = useCallback((data: NotificationsResponse) => {
    setNotifications(data.notifications);
    setUnreadNotificationCount(data.unreadCount);
  }, []);
  const refreshNotifications = useCallback(async () => {
    applyNotifications(await getNotifications());
  }, [applyNotifications]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    void refreshAuthSession();
  }, [refreshAuthSession]);

  useEffect(() => {
    if (!authReady || !isAuthenticated || !isApproved) {
      setNotifications([]);
      setUnreadNotificationCount(0);
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

    void getNotifications()
      .then((data) => {
        if (!cancelled) {
          applyNotifications(data);
        }
      })
      .catch(() => undefined);

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
  }, [applyNotifications, applyPermissionRules, applyTaskManagementData, applyUsers, authReady, currentUserRole, isAuthenticated, isApproved]);

  useEffect(() => {
    if (!authReady || !isAuthenticated || !isApproved) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      void refreshNotifications().catch(() => undefined);
    }, NOTIFICATION_POLL_MS);

    return () => window.clearInterval(intervalId);
  }, [authReady, isAuthenticated, isApproved, refreshNotifications]);

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
  }, [authReady, authUserId, isAuthenticated, isApproved]);

  const commit = (next: OrfState, message?: string) => {
    setState(next);
    if (message) {
      notify(message);
    }
  };

  const notify = (message: string) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((items) => [...items, { id, message }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 3600);
  };

  const applyAuthSession = useCallback((session: AuthSession) => {
    if (!session.authenticated) {
      return { ok: false, message: "认证服务没有返回登录会话" } satisfies AuthResult;
    }

    setAuthUserId(session.user.id);
    persistAuthenticatedUser(session.user, setState);
    return { ok: true } satisfies AuthResult;
  }, []);
  const authenticateWithPassword = useCallback(
    async (path: "/api/auth/login" | "/api/auth/registration", body: unknown): Promise<AuthResult> => {
      try {
        return applyAuthSession(
          await apiJson<AuthSession>(path, {
            method: "POST",
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(AUTH_PASSWORD_TIMEOUT_MS),
          }),
        );
      } catch (error) {
        return { ok: false, message: authFailureMessage(error, path === "/api/auth/login" ? "login" : "registration") };
      }
    },
    [applyAuthSession],
  );

  const value = useMemo<OrfContextValue>(
    () => ({
      state,
      currentUser,
      authReady,
      dataReady,
      isAuthenticated,
      isApproved,
      isAdmin,
      modal,
      toasts,
      notifications,
      unreadNotificationCount,
      theme,
      setTheme: setThemeState,
      toggleTheme: () => setThemeState((current) => (current === "dark" ? "light" : "dark")),
      openModal: setModal,
      closeModal: () => setModal({ type: null }),
      notify,
      removeToast: (id: string) => setToasts((items) => items.filter((item) => item.id !== id)),
      resetState: () => {
        void refreshTaskManagementData()
          .then(() => notify("数据已从后端重新加载"))
          .catch((error) => notify(businessMutationFailureMessage(error, "重新加载数据失败")));
      },
      refreshNotifications,
      markNotificationRead: async (notificationId) => {
        try {
          const data = await markNotificationReadRequest(notificationId);
          setNotifications((items) => items.map((item) => (item.id === data.notification.id ? data.notification : item)));
          setUnreadNotificationCount(data.unreadCount);
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "消息状态更新失败"));
          void refreshNotifications().catch(() => undefined);
          return false;
        }
      },
      markAllNotificationsRead: async () => {
        try {
          await markAllNotificationsReadRequest();
          setNotifications((items) => items.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
          setUnreadNotificationCount(0);
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "消息状态更新失败"));
          void refreshNotifications().catch(() => undefined);
          return false;
        }
      },
      createObjective: async (input) => {
        if (!hasPermission(currentUser, state.permissionRules, "objective.create")) {
          notify("没有新建目标权限");
          return null;
        }

        try {
          const data = await apiJson<CreateObjectiveResponse>("/api/objectives", {
            method: "POST",
            body: JSON.stringify(input),
          });
          notify("目标已创建");
          void refreshTaskManagementData().catch((error) => {
            notify(businessMutationFailureMessage(error, "目标已创建，但数据刷新失败"));
          });
          return data.objective;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "目标创建失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return null;
        }
      },
      createResult: async (input) => {
        const payload = {
          ...input,
          source: input.source ?? "managerDefined",
          definer: input.definer ?? currentUser?.name ?? "",
        };
        const objective = state.objectives.find((item) => item.id === payload.objectiveId);
        const reestimateDueAt = objective?.confirmationDueAt ? new Date(objective.confirmationDueAt).getTime() : null;
        const reestimateWindowOpen = reestimateDueAt == null || (Number.isFinite(reestimateDueAt) && Date.now() <= reestimateDueAt);
        const canAdjustDuringReestimate = Boolean(
          objective?.flowStatus === "reestimating" &&
            currentUser?.name &&
            objective.challengers.includes(currentUser.name) &&
            reestimateWindowOpen,
        );
        const canCreateManagerDefined = payload.source !== "memberProposed" && hasPermission(currentUser, state.permissionRules, "result.create");
        const canCreateMemberProposed = payload.source === "memberProposed" && canAdjustDuringReestimate;
        if (!canCreateManagerDefined && !canCreateMemberProposed) {
          notify("没有新增指标权限");
          return null;
        }

        try {
          const data = await apiJson<CreateResultResponse>("/api/results", {
            method: "POST",
            body: JSON.stringify(payload),
          });
          await refreshTaskManagementData();
          notify(payload.source === "memberProposed" ? "指标已提交" : "指标已创建");
          return data.result;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "指标创建失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return null;
        }
      },
      publishObjective: async (objectiveId) => {
        try {
          await apiRequest(`/api/objectives/${encodeURIComponent(objectiveId)}/publish`, { method: "PATCH" });
          await refreshTaskManagementData();
          notify("目标已发布到悬赏大厅");
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "目标发布失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      recruitObjectiveChallengers: async (objectiveId, members) => {
        try {
          await apiRequest(`/api/objectives/${encodeURIComponent(objectiveId)}/recruitments`, {
            method: "POST",
            body: JSON.stringify({ members }),
          });
          await refreshTaskManagementData();
          notify("挑战者已征召");
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "征召失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      approveChallengeApplication: async (objectiveId, applicationId) => {
        try {
          await apiRequest(`/api/objectives/${encodeURIComponent(objectiveId)}/challenge-applications/${encodeURIComponent(applicationId)}/approve`, { method: "PATCH" });
          await refreshTaskManagementData();
          notify("挑战申请已确认，目标进入重估");
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "确认挑战申请失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      rejectChallengeApplication: async (objectiveId, applicationId) => {
        try {
          await apiRequest(`/api/objectives/${encodeURIComponent(objectiveId)}/challenge-applications/${encodeURIComponent(applicationId)}/reject`, { method: "PATCH" });
          await refreshTaskManagementData();
          notify("挑战申请已拒绝");
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "拒绝挑战申请失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      applyForBounty: async (objectiveId) => {
        if (currentUser?.role !== "member") {
          notify("只有普通成员可以申请挑战");
          return false;
        }
        const applicant = currentUser?.name ?? "";
        const hasScopedObjective = state.objectives.some((objective) => objective.id === objectiveId);
        if (hasScopedObjective) {
          const next = store.applyForBounty(state, objectiveId, applicant);
          if (next === state) {
            notify("这个目标暂时不能申请挑战");
            return false;
          }
        }

        try {
          await apiRequest(`/api/objectives/${encodeURIComponent(objectiveId)}/challenge-applications`, { method: "POST" });
          await refreshTaskManagementData();
          notify("挑战申请已提交，等待指挥官确认");
          return true;
        } catch (error) {
          notify(bountyMutationFailureMessage(error, "申请挑战失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      acceptBountyChallenge: async (objectiveId) => {
        if (currentUser?.role !== "member") {
          notify("只有普通成员可以接受挑战");
          return false;
        }
        const challenger = currentUser?.name ?? "";
        const hasScopedObjective = state.objectives.some((objective) => objective.id === objectiveId);
        if (hasScopedObjective) {
          const next = store.acceptBountyChallenge(state, objectiveId, challenger);
          if (next === state) {
            notify("这个目标暂时不能接受挑战");
            return false;
          }
        }

        try {
          await apiRequest(`/api/objectives/${encodeURIComponent(objectiveId)}/challenge`, { method: "PATCH" });
          await refreshTaskManagementData();
          notify("已接受挑战");
          return true;
        } catch (error) {
          notify(bountyMutationFailureMessage(error, "接受挑战失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      freezeObjective: async (objectiveId) => {
        try {
          await apiRequest(`/api/objectives/${encodeURIComponent(objectiveId)}/freeze`, { method: "PATCH" });
          await refreshTaskManagementData();
          notify("目标已冻结");
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "冻结目标失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      reviewObjectiveLoot: async (objectiveId, input) => {
        try {
          await apiRequest(`/api/objectives/${encodeURIComponent(objectiveId)}/review`, {
            method: "POST",
            body: JSON.stringify(input),
          });
          await refreshTaskManagementData();
          notify("战利品已验收结算");
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "战利品验收失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      submitContributionReview: async (objectiveId, allocations) => {
        try {
          await apiRequest(`/api/objectives/${encodeURIComponent(objectiveId)}/contribution-reviews`, {
            method: "POST",
            body: JSON.stringify({ allocations }),
          });
          await refreshTaskManagementData();
          notify("匿名互评已提交");
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "匿名互评提交失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      createFeedback: async (input) => {
        try {
          await apiRequest("/api/feedback", {
            method: "POST",
            body: JSON.stringify({
              phenomenon: input.phenomenon,
              causeCategories: input.causeCategories,
              impact: input.impact,
              linkedResultId: input.linkedResultId ?? null,
              suggestedAdjustment: input.suggestedAdjustment,
              source: input.source,
              owner: input.owner,
            }),
          });
          await refreshTaskManagementData();
          notify("反馈已捕获");
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "反馈保存失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      createTask: async (input) => {
        try {
          const data = await apiJson<CreateTaskResponse>("/api/tasks", {
            method: "POST",
            body: JSON.stringify(input),
          });
          await refreshTaskManagementData();
          notify("行动项已创建");
          return data.task;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "行动项创建失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return null;
        }
      },
      updateTaskStatus: (taskId, status) => {
        void apiRequest(`/api/tasks/${encodeURIComponent(taskId)}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        })
          .then(refreshTaskManagementData)
          .then(() => notify("行动项状态已更新"))
          .catch((error) => {
            notify(businessMutationFailureMessage(error, "行动项状态更新失败"));
            void refreshTaskManagementData().catch(() => undefined);
          });
      },
      setTaskCompletion: (taskId, done) => {
        void apiRequest(`/api/tasks/${encodeURIComponent(taskId)}/completion`, {
          method: "PATCH",
          body: JSON.stringify({ done }),
        })
          .then(refreshTaskManagementData)
          .then(() => notify("行动项完成状态已更新"))
          .catch((error) => {
            notify(businessMutationFailureMessage(error, "行动项完成状态更新失败"));
            void refreshTaskManagementData().catch(() => undefined);
          });
      },
      updateTaskChecklistItem: (taskId, itemId, done) => {
        void apiRequest(`/api/tasks/${encodeURIComponent(taskId)}/checklist/${encodeURIComponent(itemId)}`, {
          method: "PATCH",
          body: JSON.stringify({ done }),
        })
          .then(refreshTaskManagementData)
          .then(() => notify("子行动项完成状态已更新"))
          .catch((error) => {
            notify(businessMutationFailureMessage(error, "子行动项完成状态更新失败"));
            void refreshTaskManagementData().catch(() => undefined);
          });
      },
      updateObjectiveTitle: (objectiveId, title) => {
        void apiRequest(`/api/objectives/${encodeURIComponent(objectiveId)}`, {
          method: "PATCH",
          body: JSON.stringify({ title }),
        })
          .then(refreshTaskManagementData)
          .then(() => notify("目标已更新"))
          .catch((error) => {
            notify(businessMutationFailureMessage(error, "目标更新失败"));
            void refreshTaskManagementData().catch(() => undefined);
          });
      },
      updateObjectiveStage: (objectiveId, stage) => {
        void apiRequest(`/api/objectives/${encodeURIComponent(objectiveId)}/stage`, {
          method: "PATCH",
          body: JSON.stringify({ stage }),
        })
          .then(refreshTaskManagementData)
          .then(() => notify("目标状态已更新"))
          .catch((error) => {
            notify(businessMutationFailureMessage(error, "目标状态更新失败"));
            void refreshTaskManagementData().catch(() => undefined);
          });
      },
      updateResultTitle: (resultId, title) => {
        void apiRequest(`/api/results/${encodeURIComponent(resultId)}`, {
          method: "PATCH",
          body: JSON.stringify({ title }),
        })
          .then(refreshTaskManagementData)
          .then(() => notify("指标已更新"))
          .catch((error) => {
            notify(businessMutationFailureMessage(error, "指标更新失败"));
            void refreshTaskManagementData().catch(() => undefined);
          });
      },
      updateTaskTitle: (taskId, title) => {
        void apiRequest(`/api/tasks/${encodeURIComponent(taskId)}`, {
          method: "PATCH",
          body: JSON.stringify({ title }),
        })
          .then(refreshTaskManagementData)
          .then(() => notify("行动项已更新"))
          .catch((error) => {
            notify(businessMutationFailureMessage(error, "行动项更新失败"));
            void refreshTaskManagementData().catch(() => undefined);
          });
      },
      updateTaskChecklistItemLabel: (taskId, itemId, label) => {
        void apiRequest(`/api/tasks/${encodeURIComponent(taskId)}/checklist/${encodeURIComponent(itemId)}/label`, {
          method: "PATCH",
          body: JSON.stringify({ label }),
        })
          .then(refreshTaskManagementData)
          .then(() => notify("子行动项已更新"))
          .catch((error) => {
            notify(businessMutationFailureMessage(error, "子行动项更新失败"));
            void refreshTaskManagementData().catch(() => undefined);
          });
      },
      createTaskChecklistItem: async (taskId, input = {}) => {
        try {
          const data = await apiJson<CreateChecklistItemResponse>(`/api/tasks/${encodeURIComponent(taskId)}/checklist`, {
            method: "POST",
            body: JSON.stringify(input),
          });
          await refreshTaskManagementData();
          notify("子行动项已添加");
          return data.item;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "子行动项添加失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return null;
        }
      },
      moveResult: (input) => {
        void apiRequest(`/api/results/${encodeURIComponent(input.resultId)}/order`, {
          method: "PATCH",
          body: JSON.stringify({ referenceResultId: input.referenceResultId, placement: input.placement }),
        })
          .then(refreshTaskManagementData)
          .then(() => notify("指标位置已更新"))
          .catch((error) => {
            notify(businessMutationFailureMessage(error, "指标位置更新失败"));
            void refreshTaskManagementData().catch(() => undefined);
          });
      },
      moveTask: (input) => {
        void apiRequest(`/api/tasks/${encodeURIComponent(input.taskId)}/move`, {
          method: "PATCH",
          body: JSON.stringify({ objectiveId: input.objectiveId, referenceTaskId: input.referenceTaskId, placement: input.placement }),
        })
          .then(refreshTaskManagementData)
          .then(() => notify("行动项位置已更新"))
          .catch((error) => {
            notify(businessMutationFailureMessage(error, "行动项位置更新失败"));
            void refreshTaskManagementData().catch(() => undefined);
          });
      },
      moveTaskChecklistItem: (input) => {
        void apiRequest(`/api/tasks/${encodeURIComponent(input.fromTaskId)}/checklist/${encodeURIComponent(input.itemId)}/move`, {
          method: "PATCH",
          body: JSON.stringify({ toTaskId: input.toTaskId, referenceItemId: input.referenceItemId, placement: input.placement }),
        })
          .then(refreshTaskManagementData)
          .then(() => notify("子行动项位置已更新"))
          .catch((error) => {
            notify(businessMutationFailureMessage(error, "子行动项位置更新失败"));
            void refreshTaskManagementData().catch(() => undefined);
          });
      },
      deleteObjective: (objectiveId) => {
        void apiRequest(`/api/objectives/${encodeURIComponent(objectiveId)}`, { method: "DELETE" })
          .then(refreshTaskManagementData)
          .then(() => notify("目标已删除"))
          .catch((error) => {
            notify(businessMutationFailureMessage(error, "目标删除失败"));
            void refreshTaskManagementData().catch(() => undefined);
          });
      },
      deleteResult: (resultId) => {
        void apiRequest(`/api/results/${encodeURIComponent(resultId)}`, { method: "DELETE" })
          .then(refreshTaskManagementData)
          .then(() => notify("指标已删除"))
          .catch((error) => {
            notify(businessMutationFailureMessage(error, "指标删除失败"));
            void refreshTaskManagementData().catch(() => undefined);
          });
      },
      deleteTask: (taskId) => {
        void apiRequest(`/api/tasks/${encodeURIComponent(taskId)}`, { method: "DELETE" })
          .then(refreshTaskManagementData)
          .then(() => notify("行动项已删除"))
          .catch((error) => {
            notify(businessMutationFailureMessage(error, "行动项删除失败"));
            void refreshTaskManagementData().catch(() => undefined);
          });
      },
      deleteTaskChecklistItem: (taskId, itemId) => {
        void apiRequest(`/api/tasks/${encodeURIComponent(taskId)}/checklist/${encodeURIComponent(itemId)}`, { method: "DELETE" })
          .then(refreshTaskManagementData)
          .then(() => notify("子行动项已删除"))
          .catch((error) => {
            notify(businessMutationFailureMessage(error, "子行动项删除失败"));
            void refreshTaskManagementData().catch(() => undefined);
          });
      },
      updateFeedbackStatus: (feedbackId, status) => {
        void apiRequest(`/api/feedback/${encodeURIComponent(feedbackId)}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        })
          .then(refreshTaskManagementData)
          .then(() => notify("反馈状态已更新"))
          .catch((error) => {
            notify(businessMutationFailureMessage(error, "反馈状态更新失败"));
            void refreshTaskManagementData().catch(() => undefined);
          });
      },
      updateResultConfidence: (resultId, confidence) => {
        void apiRequest(`/api/results/${encodeURIComponent(resultId)}/confidence`, {
          method: "PATCH",
          body: JSON.stringify({ confidence }),
        })
          .then(refreshTaskManagementData)
          .then(() => notify("指标信心已更新"))
          .catch((error) => {
            notify(businessMutationFailureMessage(error, "指标信心更新失败"));
            void refreshTaskManagementData().catch(() => undefined);
          });
      },
      submitLoot: async (input) => {
        try {
          await apiRequest(`/api/objectives/${encodeURIComponent(input.objectiveId)}/loot`, {
            method: "POST",
            body: JSON.stringify({
              body: input.body,
              resultClaims: input.resultClaims,
              selfTestReportUrl: input.selfTestReportUrl,
              selfTestReportBody: input.selfTestReportBody,
            }),
          });
          await refreshTaskManagementData();
          notify("战利品已提交");
          return true;
        } catch (error) {
          notify(commentMutationFailureMessage(error, "战利品提交失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      createUser: async (input) => {
        try {
          const data = await apiJson<UsersResponse>("/api/users", {
            method: "POST",
            body: JSON.stringify(input),
          });
          commit(mergeUsers(state, data), "用户已添加");
          return true;
        } catch (error) {
          notify(userMutationFailureMessage(error, "用户添加失败"));
          void refreshUsers().catch(() => undefined);
          return false;
        }
      },
      loginWithPassword: (email, password) => authenticateWithPassword("/api/auth/login", { email, password }),
      registerWithPassword: (input) => authenticateWithPassword("/api/auth/registration", input),
      logout: () => {
        setAuthUserId(null);
        void apiRequest("/api/auth/logout", { method: "POST" }).finally(() => {
          window.location.assign("/auth");
        });
      },
      updateUser: async (userId, input) => {
        try {
          const data = await apiJson<UsersResponse>(`/api/users/${encodeURIComponent(userId)}`, {
            method: "PATCH",
            body: JSON.stringify(input),
          });
          commit(mergeUsers(state, data), "用户已更新");
          return true;
        } catch (error) {
          notify(userMutationFailureMessage(error, "用户更新失败"));
          void refreshUsers().catch(() => undefined);
          return false;
        }
      },
      deleteUser: async (userId) => {
        try {
          const data = await apiJson<UsersResponse>(`/api/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
          commit(mergeUsers(state, data), "用户已删除");
          if (authUserId === userId) {
            setAuthUserId(null);
          }
          return true;
        } catch (error) {
          notify(userMutationFailureMessage(error, "用户删除失败"));
          void refreshUsers().catch(() => undefined);
          return false;
        }
      },
      disableUser: async (userId) => {
        try {
          const data = await apiJson<UsersResponse>(`/api/users/${encodeURIComponent(userId)}/disable`, { method: "PATCH" });
          commit(mergeUsers(state, data), "用户已停用");
          return true;
        } catch (error) {
          notify(userMutationFailureMessage(error, "用户停用失败"));
          void refreshUsers().catch(() => undefined);
          return false;
        }
      },
      approveRegistrationRequest: async (userId) => {
        try {
          const data = await apiJson<UsersResponse>(`/api/registration-requests/${encodeURIComponent(userId)}/approve`, { method: "PATCH" });
          commit(mergeUsers(state, data), "注册申请已通过");
          return true;
        } catch (error) {
          notify(userMutationFailureMessage(error, "注册审核失败"));
          void refreshUsers().catch(() => undefined);
          return false;
        }
      },
      rejectRegistrationRequest: async (userId) => {
        try {
          const data = await apiJson<UsersResponse>(`/api/registration-requests/${encodeURIComponent(userId)}/reject`, { method: "PATCH" });
          commit(mergeUsers(state, data), "注册申请已拒绝");
          return true;
        } catch (error) {
          notify(userMutationFailureMessage(error, "注册审核失败"));
          void refreshUsers().catch(() => undefined);
          return false;
        }
      },
      updateRolePermissionRules: async (role, rules) => {
        try {
          const data = await apiJson<PermissionRulesResponse>(`/api/permissions/${encodeURIComponent(role)}`, {
            method: "PUT",
            body: JSON.stringify({ permissionRules: rules }),
          });
          commit(mergePermissionRules(state, data), "角色权限已保存");
          return true;
        } catch {
          notify("角色权限保存失败");
          void refreshPermissionRules().catch(() => undefined);
          return false;
        }
      },
      addComment: (input) => {
        void apiJson<CommentMutationResponse>("/api/comments", {
          method: "POST",
          body: JSON.stringify({
            targetType: input.targetType,
            targetId: input.targetId,
            targetTitle: input.targetTitle,
            body: input.body,
            parentMessageId: input.parentMessageId,
            replyToMessageId: input.replyToMessageId,
            replyToAuthor: input.replyToAuthor,
          }),
        })
          .then((response) => {
            if (response.commentThread) {
              applyCommentThread(response.commentThread);
            }
            notify("评论已添加");
          })
          .catch((error) => {
            notify(commentMutationFailureMessage(error, "评论添加失败"));
            void refreshTaskManagementData().catch(() => undefined);
          });
      },
      loadCommentMentionableUsers: async (input) => {
        const response = await getCommentMentionableUsers(input);
        return response.users;
      },
      uploadCommentAttachment: async (input) => {
        try {
          const response = await uploadCommentAttachmentRequest(input);
          return response.markdown;
        } catch (error) {
          notify(commentMutationFailureMessage(error, "图片上传失败"));
          return null;
        }
      },
      updateCommentThreadStatus: (threadId, status) => {
        void apiJson<CommentMutationResponse>(`/api/comments/${encodeURIComponent(threadId)}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        })
          .then((response) => {
            if (response.commentThread) {
              applyCommentThread(response.commentThread);
            }
            notify(status === "resolved" ? "评论已解决" : "评论已重新打开");
          })
          .catch((error) => {
            notify(commentMutationFailureMessage(error, "评论状态更新失败"));
            void refreshTaskManagementData().catch(() => undefined);
          });
      },
      updateCommentMessage: (threadId, messageId, body) => {
        void apiJson<CommentMutationResponse>(`/api/comments/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}`, {
          method: "PATCH",
          body: JSON.stringify({ body }),
        })
          .then((response) => {
            if (response.commentThread) {
              applyCommentThread(response.commentThread);
            }
            notify("评论已更新");
          })
          .catch((error) => {
            notify(commentMutationFailureMessage(error, "评论更新失败"));
            void refreshTaskManagementData().catch(() => undefined);
          });
      },
      deleteCommentMessage: (threadId, messageId) => {
        void apiJson<CommentMutationResponse>(`/api/comments/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}`, { method: "DELETE" })
          .then((response) => {
            if (response.commentThread) {
              applyCommentThread(response.commentThread);
            } else {
              applyRemovedCommentThread(threadId);
            }
            notify("评论已删除");
          })
          .catch((error) => {
            notify(commentMutationFailureMessage(error, "评论删除失败"));
            void refreshTaskManagementData().catch(() => undefined);
          });
      },
      proposeResultUpdate: async (resultId, title, reason, feedbackId) => {
        try {
          await apiRequest(`/api/results/${encodeURIComponent(resultId)}/update-proposal`, {
            method: "POST",
            body: JSON.stringify({ title, reason, feedbackId }),
          });
          await refreshTaskManagementData();
          notify("指标更新已记录");
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "指标更新记录失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
    }),
    [
      applyCommentThread,
      applyRemovedCommentThread,
      authReady,
      authUserId,
      authenticateWithPassword,
      currentUser,
      isAdmin,
      isApproved,
      isAuthenticated,
      modal,
      notifications,
      refreshNotifications,
      refreshPermissionRules,
      refreshTaskManagementData,
      refreshUsers,
      state,
      theme,
      toasts,
      unreadNotificationCount,
    ],
  );

  return <OrfContext.Provider value={value}>{children}</OrfContext.Provider>;
}

export function useOrf() {
  const context = useContext(OrfContext);
  if (!context) {
    throw new Error("useOrf must be used inside OrfProvider");
  }
  return context;
}
