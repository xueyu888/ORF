import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { OrfFlowStore } from "./OrfFlowStore";
import type {
  CommentStatus,
  CommentTargetType,
  Feedback,
  FeedbackStatus,
  OrfState,
  OrfUser,
  PermissionAction,
  PermissionResource,
  Result,
  Task,
  TaskStatus,
  UserRole,
  OrfStage,
} from "../types/orf";

type ModalType = "newObjective" | "newResult" | "newFeedback" | "newTask" | "resultUpdate" | null;
export type ThemeMode = "dark" | "light";

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
  createFeedback: (input: Pick<Feedback, "phenomenon" | "causeCategories" | "impact" | "linkedObjectiveId" | "linkedResultId" | "suggestedAdjustment" | "source" | "owner">) => void;
  createTask: (input: Pick<Task, "title" | "description" | "assignee" | "priority" | "linkedObjectiveId" | "linkedResultId"> & Partial<Task>) => void;
  updateTaskStatus: (taskId: string, status: TaskStatus) => void;
  setTaskCompletion: (taskId: string, done: boolean) => void;
  updateTaskChecklistItem: (taskId: string, itemId: string, done: boolean) => void;
  createTaskChecklistItem: (taskId: string, afterItemId?: string) => void;
  moveResult: OrfFlowStore["moveResult"] extends (state: OrfState, input: infer T) => OrfState ? (input: T) => void : never;
  moveTask: OrfFlowStore["moveTask"] extends (state: OrfState, input: infer T) => OrfState ? (input: T) => void : never;
  moveTaskChecklistItem: OrfFlowStore["moveTaskChecklistItem"] extends (state: OrfState, input: infer T) => OrfState ? (input: T) => void : never;
  deleteObjective: (objectiveId: string) => void;
  deleteResult: (resultId: string) => void;
  deleteTask: (taskId: string) => void;
  deleteTaskChecklistItem: (taskId: string, itemId: string) => void;
  updateFeedbackStatus: (feedbackId: string, status: FeedbackStatus) => void;
  updateResultConfidence: (resultId: string, confidence: number) => void;
  createUser: (input: { name: string; email: string; role: UserRole }) => void;
  registerUser: (input: { name: string; email: string }) => void;
  loginUser: (email: string) => void;
  updateUserRole: (userId: string, role: UserRole) => void;
  updateUser: (userId: string, input: { name: string; email: string; role: UserRole }) => void;
  deleteUser: (userId: string) => void;
  updatePermissionRule: (input: { role: UserRole; stage: OrfStage; resource: PermissionResource; action: PermissionAction; allowed: boolean }) => void;
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
const AUTH_STORAGE_KEY = "orf-flow-auth-user-id";
type TaskManagementData = Pick<OrfState, "objectives" | "results" | "tasks" | "evidence" | "feedback">;

function mergeTaskManagementData(state: OrfState, data: TaskManagementData): OrfState {
  return {
    ...state,
    objectives: data.objectives,
    results: data.results,
    tasks: data.tasks,
    evidence: data.evidence,
    feedback: data.feedback,
  };
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...init,
    headers,
  });

  if (!response.ok) {
    throw new Error(`API ${response.status}: ${path}`);
  }

  return response.json() as Promise<T>;
}

async function apiRequest(path: string, init?: RequestInit): Promise<void> {
  await apiJson<unknown>(path, init);
}

function loadAuthUserId() {
  try {
    return window.localStorage.getItem(AUTH_STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveAuthUserId(userId: string | null) {
  try {
    if (userId) {
      window.localStorage.setItem(AUTH_STORAGE_KEY, userId);
    } else {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  } catch {
    // localStorage can be unavailable in restricted browser contexts.
  }
}

function loadInitialState() {
  const loaded = store.load();
  const authUserId = loadAuthUserId();
  return authUserId && loaded.users.some((user) => user.id === authUserId) ? { ...loaded, currentUserId: authUserId } : loaded;
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
  const [authUserId, setAuthUserId] = useState<string | null>(() => loadAuthUserId());
  const [theme, setThemeState] = useState<ThemeMode>(() => loadTheme());
  const [modal, setModal] = useState<ModalState>({ type: null });
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const currentUser = authUserId ? state.users.find((user) => user.id === authUserId) ?? null : null;
  const isAuthenticated = currentUser !== null;
  const isAdmin = currentUser?.role === "admin";
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
    if (authUserId && !state.users.some((user) => user.id === authUserId)) {
      setAuthUserId(null);
      saveAuthUserId(null);
    }
  }, [authUserId, state.users]);

  useEffect(() => {
    let cancelled = false;

    void apiJson<TaskManagementData>("/api/tasks-page")
      .then((data) => {
        if (!cancelled) {
          applyTaskManagementData(data);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [applyTaskManagementData]);

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

  const rememberAuth = (userId: string | null) => {
    setAuthUserId(userId);
    saveAuthUserId(userId);
  };

  const value = useMemo<OrfContextValue>(
    () => ({
      state,
      currentUser,
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
      resetState: () => commit(store.reset(), "Mock 工作区已重置"),
      createObjective: (input) => commit(store.createObjective(state, input), "目标已创建"),
      createResult: (input) => {
        commit(store.createResult(state, input), "结果已创建");
        syncTaskMutation(() =>
          apiRequest("/api/results", {
            method: "POST",
            body: JSON.stringify(input),
          }),
        );
      },
      createFeedback: (input) => commit(store.createFeedback(state, input), "反馈已捕获"),
      createTask: (input) => {
        commit(store.createTask(state, input), "任务已创建");
        syncTaskMutation(() =>
          apiRequest("/api/tasks", {
            method: "POST",
            body: JSON.stringify(input),
          }),
        );
      },
      updateTaskStatus: (taskId, status) => {
        commit(store.updateTaskStatus(state, taskId, status), `任务状态已更新`);
        syncTaskMutation(() =>
          apiRequest(`/api/tasks/${encodeURIComponent(taskId)}/status`, {
            method: "PATCH",
            body: JSON.stringify({ status }),
          }),
        );
      },
      setTaskCompletion: (taskId, done) => {
        commit(store.setTaskCompletion(state, taskId, done), `任务完成状态已更新`);
        syncTaskMutation(() =>
          apiRequest(`/api/tasks/${encodeURIComponent(taskId)}/completion`, {
            method: "PATCH",
            body: JSON.stringify({ done }),
          }),
        );
      },
      updateTaskChecklistItem: (taskId, itemId, done) => {
        commit(store.updateTaskChecklistItem(state, taskId, itemId, done), `子任务完成状态已更新`);
        syncTaskMutation(() =>
          apiRequest(`/api/tasks/${encodeURIComponent(taskId)}/checklist/${encodeURIComponent(itemId)}`, {
            method: "PATCH",
            body: JSON.stringify({ done }),
          }),
        );
      },
      createTaskChecklistItem: (taskId, afterItemId) => {
        commit(store.createTaskChecklistItem(state, taskId, afterItemId), "子任务已添加");
        syncTaskMutation(() =>
          apiRequest(`/api/tasks/${encodeURIComponent(taskId)}/checklist`, {
            method: "POST",
            body: JSON.stringify({ afterItemId }),
          }),
        );
      },
      moveResult: (input) => {
        commit(store.moveResult(state, input), "指标位置已更新");
        syncTaskMutation(() =>
          apiRequest(`/api/results/${encodeURIComponent(input.resultId)}/order`, {
            method: "PATCH",
            body: JSON.stringify({ referenceResultId: input.referenceResultId, placement: input.placement }),
          }),
        );
      },
      moveTask: (input) => {
        commit(store.moveTask(state, input), "任务位置已更新");
        syncTaskMutation(() =>
          apiRequest(`/api/tasks/${encodeURIComponent(input.taskId)}/move`, {
            method: "PATCH",
            body: JSON.stringify({ toResultId: input.toResultId, referenceTaskId: input.referenceTaskId, placement: input.placement }),
          }),
        );
      },
      moveTaskChecklistItem: (input) => {
        commit(store.moveTaskChecklistItem(state, input), "子任务位置已更新");
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
        commit(store.deleteResult(state, resultId), "指标已删除");
        syncTaskMutation(() => apiRequest(`/api/results/${encodeURIComponent(resultId)}`, { method: "DELETE" }));
      },
      deleteTask: (taskId) => {
        commit(store.deleteTask(state, taskId), "任务已删除");
        syncTaskMutation(() => apiRequest(`/api/tasks/${encodeURIComponent(taskId)}`, { method: "DELETE" }));
      },
      deleteTaskChecklistItem: (taskId, itemId) => {
        commit(store.deleteTaskChecklistItem(state, taskId, itemId), "子任务已删除");
        syncTaskMutation(() => apiRequest(`/api/tasks/${encodeURIComponent(taskId)}/checklist/${encodeURIComponent(itemId)}`, { method: "DELETE" }));
      },
      updateFeedbackStatus: (feedbackId, status) => commit(store.updateFeedbackStatus(state, feedbackId, status), `反馈状态已更新`),
      updateResultConfidence: (resultId, confidence) => commit(store.updateResultConfidence(state, resultId, confidence), "结果信心已更新"),
      createUser: (input) => commit(store.createUser(state, input), "用户已添加"),
      registerUser: (input) => {
        const next = store.registerUser(state, input);
        const user = next.users.find((item) => item.email.toLowerCase() === input.email.trim().toLowerCase());
        if (!user) {
          return;
        }

        rememberAuth(user.id);
        commit({ ...next, currentUserId: user.id }, "账号已创建");
      },
      loginUser: (email) => {
        const user = state.users.find((item) => item.email.toLowerCase() === email.trim().toLowerCase());
        if (!user) {
          return;
        }

        const next = store.loginUser(state, email);
        rememberAuth(user.id);
        commit(next, "已登录");
      },
      updateUserRole: (userId, role) => commit(store.updateUserRole(state, userId, role), "角色已更新"),
      updateUser: (userId, input) => commit(store.updateUser(state, userId, input), "用户已更新"),
      deleteUser: (userId) => {
        const next = store.deleteUser(state, userId);
        if (authUserId === userId && next.currentUserId !== userId) {
          rememberAuth(next.currentUserId);
        }
        commit(next, "用户已删除");
      },
      updatePermissionRule: (input) => commit(store.updatePermissionRule(state, input), "权限已更新"),
      addComment: (input) => commit(store.addComment(state, input), "评论已添加"),
      updateCommentThreadStatus: (threadId, status) => commit(store.updateCommentThreadStatus(state, threadId, status), status === "resolved" ? "评论已解决" : "评论已重新打开"),
      updateCommentMessage: (threadId, messageId, body) => commit(store.updateCommentMessage(state, threadId, messageId, body), "评论已更新"),
      deleteCommentMessage: (threadId, messageId) => commit(store.deleteCommentMessage(state, threadId, messageId), "评论已删除"),
      proposeResultUpdate: (resultId, title, reason, feedbackId) =>
        commit(store.proposeResultUpdate(state, resultId, title, reason, feedbackId), "结果更新已记录"),
    }),
    [authUserId, currentUser, isAdmin, isAuthenticated, modal, state, syncTaskMutation, theme, toasts],
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
