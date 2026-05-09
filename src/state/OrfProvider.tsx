import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ApiError, apiJson, apiRequest, type AuthSession, type PermissionRulesResponse, type TaskManagementData, type UsersResponse } from "./apiClient";
import { OrfFlowStore } from "./OrfFlowStore";
import type {
  CommentStatus,
  CommentThread,
  CommentTargetType,
  Feedback,
  FeedbackStatus,
  OrfState,
  OrfUser,
  Result,
  Task,
  TaskStatus,
  UserRole,
} from "../types/orf";

type ModalType = "newObjective" | "newResult" | "newFeedback" | "newTask" | "resultUpdate" | null;
export type ThemeMode = "dark" | "light";
type AuthResult = { ok: true } | { ok: false; message: string };
type CommentMutationResponse = { ok: boolean; commentThread: CommentThread | null };

interface ModalState {
  type: ModalType;
  objectiveId?: string;
  resultId?: string;
  feedbackId?: string;
}

interface ToastMessage {
  id: string;
  message: string;
}

interface OrfContextValue {
  state: OrfState;
  currentUser: OrfUser | null;
  authReady: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  modal: ModalState;
  toasts: ToastMessage[];
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  openModal: (modal: ModalState) => void;
  closeModal: () => void;
  notify: (message: string) => void;
  removeToast: (id: string) => void;
  resetState: () => void;
  createObjective: Parameters<OrfFlowStore["createObjective"]>[1] extends infer T ? (input: T) => void : never;
  createResult: (input: Partial<Result> & Pick<Result, "objectiveId" | "title" | "metricName">) => void;
  claimBounty: (resultId: string) => Promise<boolean>;
  createFeedback: (input: Pick<Feedback, "phenomenon" | "causeCategories" | "impact" | "linkedObjectiveId" | "linkedResultId" | "suggestedAdjustment" | "source" | "owner">) => void;
  createTask: (input: Pick<Task, "title" | "description" | "assignee" | "priority" | "linkedObjectiveId" | "linkedResultId"> & Partial<Task>) => void;
  updateTaskStatus: (taskId: string, status: TaskStatus) => void;
  setTaskCompletion: (taskId: string, done: boolean) => void;
  updateTaskChecklistItem: (taskId: string, itemId: string, done: boolean) => void;
  updateObjectiveTitle: (objectiveId: string, title: string) => void;
  updateObjectiveStage: (objectiveId: string, stage: OrfState["objectives"][number]["stage"]) => void;
  updateResultTitle: (resultId: string, title: string) => void;
  updateTaskTitle: (taskId: string, title: string) => void;
  updateTaskChecklistItemLabel: (taskId: string, itemId: string, label: string) => void;
  createTaskChecklistItem: (taskId: string, afterItemId?: string) => void;
  moveResult: OrfFlowStore["moveResult"] extends (state: OrfState, input: infer T) => OrfState ? (input: T) => void : never;
  moveTask: OrfFlowStore["moveTask"] extends (state: OrfState, input: infer T) => OrfState ? (input: T) => void : never;
  moveTaskChecklistItem: OrfFlowStore["moveTaskChecklistItem"] extends (state: OrfState, input: infer T) => OrfState ? (input: T) => void : never;
  submitLoot: OrfFlowStore["submitLoot"] extends (state: OrfState, input: infer T) => OrfState ? (input: T) => void : never;
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
  updateCommentThreadStatus: (threadId: string, status: CommentStatus) => void;
  updateCommentMessage: (threadId: string, messageId: string, body: string) => void;
  deleteCommentMessage: (threadId: string, messageId: string) => void;
  proposeResultUpdate: (resultId: string, title: string, reason: string, feedbackId?: string) => void;
}

const OrfContext = createContext<OrfContextValue | null>(null);

const store = new OrfFlowStore();
const THEME_STORAGE_KEY = "orf-flow-theme";
const AUTH_SESSION_TIMEOUT_MS = 8000;

function mergeTaskManagementData(state: OrfState, data: TaskManagementData): OrfState {
  return {
    ...state,
    objectives: data.objectives,
    results: data.results,
    tasks: data.tasks,
    evidence: data.evidence,
    feedback: data.feedback,
    comments: data.comments ?? state.comments ?? [],
    permissionRules: data.permissionRules,
    automaticCompletions: data.automaticCompletions ?? {},
  };
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
    const next = mergeAuthenticatedUser(current, user);
    store.save(next);
    return next;
  });
}

function authFailureMessage(error: unknown, action: "login" | "registration") {
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
      return "认证服务暂时不可用，请确认后端、Ory 和数据库已启动";
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
      return "你没有接受这个悬赏的权限";
    }

    if (error.status === 404) {
      return "悬赏不存在，已刷新数据";
    }

    if (error.status === 409) {
      return "这个悬赏已经有挑战者";
    }

    return error.message || fallback;
  }

  return fallback;
}

function commentMutationFailureMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return "登录已过期，请重新登录";
    }

    if (error.status === 403) {
      return "只能编辑或删除自己的评论";
    }

    if (error.status === 404) {
      return "评论对象不存在，已刷新数据";
    }

    if (error.status === 400) {
      return "评论内容不能为空";
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
  const [theme, setThemeState] = useState<ThemeMode>(() => loadTheme());
  const [modal, setModal] = useState<ModalState>({ type: null });
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const currentUser = authUserId ? state.users.find((user) => user.id === authUserId) ?? null : null;
  const isAuthenticated = currentUser !== null;
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
      const next = mergeTaskManagementData(current, data);
      store.save(next);
      return next;
    });
  }, []);
  const refreshTaskManagementData = useCallback(async () => {
    const data = await apiJson<TaskManagementData>("/api/tasks-page");
    applyTaskManagementData(data);
  }, [applyTaskManagementData]);
  const applyPermissionRules = useCallback((data: PermissionRulesResponse) => {
    setState((current) => {
      const next = mergePermissionRules(current, data);
      store.save(next);
      return next;
    });
  }, []);
  const refreshPermissionRules = useCallback(async () => {
    const data = await apiJson<PermissionRulesResponse>("/api/permissions");
    applyPermissionRules(data);
  }, [applyPermissionRules]);
  const applyUsers = useCallback((data: UsersResponse) => {
    setState((current) => {
      const next = mergeUsers(current, data);
      store.save(next);
      return next;
    });
  }, []);
  const applyCommentThread = useCallback((commentThread: CommentThread) => {
    setState((current) => {
      const next = mergeCommentThread(current, commentThread);
      store.save(next);
      return next;
    });
  }, []);
  const applyRemovedCommentThread = useCallback((threadId: string) => {
    setState((current) => {
      const next = removeCommentThread(current, threadId);
      store.save(next);
      return next;
    });
  }, []);
  const refreshUsers = useCallback(async () => {
    const data = await apiJson<UsersResponse>("/api/users");
    applyUsers(data);
  }, [applyUsers]);
  const syncTaskMutation = useCallback(
    (request: () => Promise<void>) => {
      void request()
        .then(refreshTaskManagementData)
        .catch(() => undefined);
    },
    [refreshTaskManagementData],
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    void refreshAuthSession();
  }, [refreshAuthSession]);

  useEffect(() => {
    if (!authReady || !isAuthenticated) {
      return;
    }

    let cancelled = false;

    void apiJson<TaskManagementData>("/api/tasks-page")
      .then((data) => {
        if (!cancelled) {
          applyTaskManagementData(data);
        }
      })
      .catch(() => undefined);

    void apiJson<PermissionRulesResponse>("/api/permissions")
      .then((data) => {
        if (!cancelled) {
          applyPermissionRules(data);
        }
      })
      .catch(() => undefined);

    if (isAdmin) {
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
  }, [applyPermissionRules, applyTaskManagementData, applyUsers, authReady, isAdmin, isAuthenticated]);

  const commit = (next: OrfState, message?: string) => {
    setState(next);
    store.save(next);
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
      isAuthenticated,
      isAdmin,
      modal,
      toasts,
      theme,
      setTheme: setThemeState,
      toggleTheme: () => setThemeState((current) => (current === "dark" ? "light" : "dark")),
      openModal: setModal,
      closeModal: () => setModal({ type: null }),
      notify,
      removeToast: (id: string) => setToasts((items) => items.filter((item) => item.id !== id)),
      resetState: () => commit(store.reset(), "本地缓存已重置"),
      createObjective: (input) => commit(store.createObjective(state, input), "目标已创建"),
      createResult: (input) => {
        commit(store.createResult(state, input), "悬赏已创建");
        syncTaskMutation(() =>
          apiRequest("/api/results", {
            method: "POST",
            body: JSON.stringify(input),
          }),
        );
      },
      claimBounty: async (resultId) => {
        const challenger = currentUser?.name ?? "";
        const next = store.claimBounty(state, resultId, challenger);
        if (next === state) {
          notify("这个悬赏暂时不能接受挑战");
          return false;
        }

        commit(next, "已接受挑战");

        try {
          await apiRequest(`/api/results/${encodeURIComponent(resultId)}/challenge`, { method: "PATCH" });
          await refreshTaskManagementData();
          return true;
        } catch (error) {
          notify(bountyMutationFailureMessage(error, "接受挑战失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      createFeedback: (input) => commit(store.createFeedback(state, input), "反馈已捕获"),
      createTask: (input) => {
        commit(store.createTask(state, input), "行动项已创建");
        syncTaskMutation(() =>
          apiRequest("/api/tasks", {
            method: "POST",
            body: JSON.stringify(input),
          }),
        );
      },
      updateTaskStatus: (taskId, status) => {
        commit(store.updateTaskStatus(state, taskId, status), `行动项状态已更新`);
        syncTaskMutation(() =>
          apiRequest(`/api/tasks/${encodeURIComponent(taskId)}/status`, {
            method: "PATCH",
            body: JSON.stringify({ status }),
          }),
        );
      },
      setTaskCompletion: (taskId, done) => {
        commit(store.setTaskCompletion(state, taskId, done), `行动项完成状态已更新`);
        syncTaskMutation(() =>
          apiRequest(`/api/tasks/${encodeURIComponent(taskId)}/completion`, {
            method: "PATCH",
            body: JSON.stringify({ done }),
          }),
        );
      },
      updateTaskChecklistItem: (taskId, itemId, done) => {
        commit(store.updateTaskChecklistItem(state, taskId, itemId, done), `子行动项完成状态已更新`);
        syncTaskMutation(() =>
          apiRequest(`/api/tasks/${encodeURIComponent(taskId)}/checklist/${encodeURIComponent(itemId)}`, {
            method: "PATCH",
            body: JSON.stringify({ done }),
          }),
        );
      },
      updateObjectiveTitle: (objectiveId, title) => {
        commit(store.updateObjectiveTitle(state, objectiveId, title), "目标已更新");
        syncTaskMutation(() =>
          apiRequest(`/api/objectives/${encodeURIComponent(objectiveId)}`, {
            method: "PATCH",
            body: JSON.stringify({ title }),
          }),
        );
      },
      updateObjectiveStage: (objectiveId, stage) => {
        commit(store.updateObjectiveStage(state, objectiveId, stage), "目标状态已更新");
        syncTaskMutation(() =>
          apiRequest(`/api/objectives/${encodeURIComponent(objectiveId)}/stage`, {
            method: "PATCH",
            body: JSON.stringify({ stage }),
          }),
        );
      },
      updateResultTitle: (resultId, title) => {
        commit(store.updateResultTitle(state, resultId, title), "悬赏已更新");
        syncTaskMutation(() =>
          apiRequest(`/api/results/${encodeURIComponent(resultId)}`, {
            method: "PATCH",
            body: JSON.stringify({ title }),
          }),
        );
      },
      updateTaskTitle: (taskId, title) => {
        commit(store.updateTaskTitle(state, taskId, title), "行动项已更新");
        syncTaskMutation(() =>
          apiRequest(`/api/tasks/${encodeURIComponent(taskId)}`, {
            method: "PATCH",
            body: JSON.stringify({ title }),
          }),
        );
      },
      updateTaskChecklistItemLabel: (taskId, itemId, label) => {
        commit(store.updateTaskChecklistItemLabel(state, taskId, itemId, label), "子行动项已更新");
        syncTaskMutation(() =>
          apiRequest(`/api/tasks/${encodeURIComponent(taskId)}/checklist/${encodeURIComponent(itemId)}/label`, {
            method: "PATCH",
            body: JSON.stringify({ label }),
          }),
        );
      },
      createTaskChecklistItem: (taskId, afterItemId) => {
        commit(store.createTaskChecklistItem(state, taskId, afterItemId), "子行动项已添加");
        syncTaskMutation(() =>
          apiRequest(`/api/tasks/${encodeURIComponent(taskId)}/checklist`, {
            method: "POST",
            body: JSON.stringify({ afterItemId }),
          }),
        );
      },
      moveResult: (input) => {
        commit(store.moveResult(state, input), "悬赏位置已更新");
        syncTaskMutation(() =>
          apiRequest(`/api/results/${encodeURIComponent(input.resultId)}/order`, {
            method: "PATCH",
            body: JSON.stringify({ referenceResultId: input.referenceResultId, placement: input.placement }),
          }),
        );
      },
      moveTask: (input) => {
        commit(store.moveTask(state, input), "行动项位置已更新");
        syncTaskMutation(() =>
          apiRequest(`/api/tasks/${encodeURIComponent(input.taskId)}/move`, {
            method: "PATCH",
            body: JSON.stringify({ toResultId: input.toResultId, referenceTaskId: input.referenceTaskId, placement: input.placement }),
          }),
        );
      },
      moveTaskChecklistItem: (input) => {
        commit(store.moveTaskChecklistItem(state, input), "子行动项位置已更新");
        syncTaskMutation(() =>
          apiRequest(`/api/tasks/${encodeURIComponent(input.fromTaskId)}/checklist/${encodeURIComponent(input.itemId)}/move`, {
            method: "PATCH",
            body: JSON.stringify({ toTaskId: input.toTaskId, referenceItemId: input.referenceItemId, placement: input.placement }),
          }),
        );
      },
      deleteObjective: (objectiveId) => {
        commit(store.deleteObjective(state, objectiveId), "目标已删除");
        syncTaskMutation(() => apiRequest(`/api/objectives/${encodeURIComponent(objectiveId)}`, { method: "DELETE" }));
      },
      deleteResult: (resultId) => {
        commit(store.deleteResult(state, resultId), "悬赏已删除");
        syncTaskMutation(() => apiRequest(`/api/results/${encodeURIComponent(resultId)}`, { method: "DELETE" }));
      },
      deleteTask: (taskId) => {
        commit(store.deleteTask(state, taskId), "行动项已删除");
        syncTaskMutation(() => apiRequest(`/api/tasks/${encodeURIComponent(taskId)}`, { method: "DELETE" }));
      },
      deleteTaskChecklistItem: (taskId, itemId) => {
        commit(store.deleteTaskChecklistItem(state, taskId, itemId), "子行动项已删除");
        syncTaskMutation(() => apiRequest(`/api/tasks/${encodeURIComponent(taskId)}/checklist/${encodeURIComponent(itemId)}`, { method: "DELETE" }));
      },
      updateFeedbackStatus: (feedbackId, status) => commit(store.updateFeedbackStatus(state, feedbackId, status), `反馈状态已更新`),
      updateResultConfidence: (resultId, confidence) => commit(store.updateResultConfidence(state, resultId, confidence), "悬赏信心已更新"),
      submitLoot: (input) => {
        commit(store.submitLoot(state, input), "战利品已提交");
        void apiRequest(`/api/results/${encodeURIComponent(input.bountyId)}/loot`, {
          method: "POST",
          body: JSON.stringify({ body: input.body }),
        })
          .then(refreshTaskManagementData)
          .catch((error) => {
            notify(commentMutationFailureMessage(error, "战利品提交失败"));
            void refreshTaskManagementData().catch(() => undefined);
          });
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
        commit(store.addComment(state, input), "评论已添加");
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
          })
          .catch((error) => {
            notify(commentMutationFailureMessage(error, "评论添加失败"));
            void refreshTaskManagementData().catch(() => undefined);
          });
      },
      updateCommentThreadStatus: (threadId, status) => {
        commit(store.updateCommentThreadStatus(state, threadId, status), status === "resolved" ? "评论已解决" : "评论已重新打开");
        void apiJson<CommentMutationResponse>(`/api/comments/${encodeURIComponent(threadId)}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        })
          .then((response) => {
            if (response.commentThread) {
              applyCommentThread(response.commentThread);
            }
          })
          .catch((error) => {
            notify(commentMutationFailureMessage(error, "评论状态更新失败"));
            void refreshTaskManagementData().catch(() => undefined);
          });
      },
      updateCommentMessage: (threadId, messageId, body) => {
        commit(store.updateCommentMessage(state, threadId, messageId, body), "评论已更新");
        void apiJson<CommentMutationResponse>(`/api/comments/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}`, {
          method: "PATCH",
          body: JSON.stringify({ body }),
        })
          .then((response) => {
            if (response.commentThread) {
              applyCommentThread(response.commentThread);
            }
          })
          .catch((error) => {
            notify(commentMutationFailureMessage(error, "评论更新失败"));
            void refreshTaskManagementData().catch(() => undefined);
          });
      },
      deleteCommentMessage: (threadId, messageId) => {
        commit(store.deleteCommentMessage(state, threadId, messageId), "评论已删除");
        void apiJson<CommentMutationResponse>(`/api/comments/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}`, { method: "DELETE" })
          .then((response) => {
            if (response.commentThread) {
              applyCommentThread(response.commentThread);
            } else {
              applyRemovedCommentThread(threadId);
            }
          })
          .catch((error) => {
            notify(commentMutationFailureMessage(error, "评论删除失败"));
            void refreshTaskManagementData().catch(() => undefined);
          });
      },
      proposeResultUpdate: (resultId, title, reason, feedbackId) =>
        commit(store.proposeResultUpdate(state, resultId, title, reason, feedbackId), "悬赏更新已记录"),
    }),
    [
      applyCommentThread,
      applyRemovedCommentThread,
      authReady,
      authUserId,
      authenticateWithPassword,
      currentUser,
      isAdmin,
      isAuthenticated,
      modal,
      refreshPermissionRules,
      refreshTaskManagementData,
      refreshUsers,
      state,
      syncTaskMutation,
      theme,
      toasts,
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
