import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { OrfFlowStore } from "./OrfFlowStore";
import type { Feedback, FeedbackStatus, OrfState, Result, Task, TaskStatus } from "../types/orf";

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
  updateFeedbackStatus: (feedbackId: string, status: FeedbackStatus) => void;
  updateResultConfidence: (resultId: string, confidence: number) => void;
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
      updateFeedbackStatus: (feedbackId, status) => commit(store.updateFeedbackStatus(state, feedbackId, status), `反馈状态已更新`),
      updateResultConfidence: (resultId, confidence) => commit(store.updateResultConfidence(state, resultId, confidence), "结果信心已更新"),
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
