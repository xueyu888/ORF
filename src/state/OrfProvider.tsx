import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { OrfFlowStore } from "./OrfFlowStore";
import type { CommentStatus, CommentTargetType, Feedback, FeedbackStatus, OrfState, PermissionAction, PermissionResource, Result, Task, TaskStatus, UserRole, OrfStage } from "../types/orf";

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
  updateFeedbackStatus: (feedbackId: string, status: FeedbackStatus) => void;
  updateResultConfidence: (resultId: string, confidence: number) => void;
  registerUser: (input: { name: string; email: string }) => void;
  loginUser: (email: string) => void;
  updateUserRole: (userId: string, role: UserRole) => void;
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

function loadTheme(): ThemeMode {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return raw === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function OrfProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(() => store.load());
  const [theme, setThemeState] = useState<ThemeMode>(() => loadTheme());
  const [modal, setModal] = useState<ModalState>({ type: null });
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

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

  const value = useMemo<OrfContextValue>(
    () => ({
      state,
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
      createResult: (input) => commit(store.createResult(state, input), "结果已创建"),
      createFeedback: (input) => commit(store.createFeedback(state, input), "反馈已捕获"),
      createTask: (input) => commit(store.createTask(state, input), "任务已创建"),
      updateTaskStatus: (taskId, status) => commit(store.updateTaskStatus(state, taskId, status), `任务状态已更新`),
      setTaskCompletion: (taskId, done) => commit(store.setTaskCompletion(state, taskId, done), `任务完成状态已更新`),
      updateTaskChecklistItem: (taskId, itemId, done) => commit(store.updateTaskChecklistItem(state, taskId, itemId, done), `子任务完成状态已更新`),
      createTaskChecklistItem: (taskId, afterItemId) => commit(store.createTaskChecklistItem(state, taskId, afterItemId), "子任务已添加"),
      updateFeedbackStatus: (feedbackId, status) => commit(store.updateFeedbackStatus(state, feedbackId, status), `反馈状态已更新`),
      updateResultConfidence: (resultId, confidence) => commit(store.updateResultConfidence(state, resultId, confidence), "结果信心已更新"),
      registerUser: (input) => commit(store.registerUser(state, input), "账号已创建"),
      loginUser: (email) => commit(store.loginUser(state, email), "已登录"),
      updateUserRole: (userId, role) => commit(store.updateUserRole(state, userId, role), "角色已更新"),
      updatePermissionRule: (input) => commit(store.updatePermissionRule(state, input), "权限已更新"),
      addComment: (input) => commit(store.addComment(state, input), "评论已添加"),
      updateCommentThreadStatus: (threadId, status) => commit(store.updateCommentThreadStatus(state, threadId, status), status === "resolved" ? "评论已解决" : "评论已重新打开"),
      updateCommentMessage: (threadId, messageId, body) => commit(store.updateCommentMessage(state, threadId, messageId, body), "评论已更新"),
      deleteCommentMessage: (threadId, messageId) => commit(store.deleteCommentMessage(state, threadId, messageId), "评论已删除"),
      proposeResultUpdate: (resultId, title, reason, feedbackId) =>
        commit(store.proposeResultUpdate(state, resultId, title, reason, feedbackId), "结果更新已记录"),
    }),
    [modal, state, theme, toasts],
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
