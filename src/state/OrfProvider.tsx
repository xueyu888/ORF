import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { hasPermission } from "../config/permissions";
import { apiJson, apiRequest, getUserPreferences } from "./apiClient";
import { OrfFlowStore } from "./OrfFlowStore";
import { useOrfDataState } from "./orfProviderData";
import { type AuthResult, useAuthSessionState } from "./orfProviderAuth";
import { useOrfProviderCommentActions } from "./orfProviderCommentActions";
import { useNotificationState } from "./orfProviderNotifications";
import {
  bountyMutationFailureMessage,
  businessMutationFailureMessage,
  commentMutationFailureMessage,
} from "./orfProviderMutationMessages";
import { useOrfProviderUserActions } from "./orfProviderUserActions";
import { isObjectiveReestimateWindowOpen } from "../domain/orfLifecycle";
import { enqueueSystemBroadcast } from "../features/notifications/notificationBroadcasts";
import { readModelInvalidationKey } from "../features/realtime/readModelInvalidations";
import { fetchLocalSettlementSummary, submitLocalEncryptedContributionReview } from "../services/localSettlementClient";
import { useRealtimeEvents } from "../features/realtime/useRealtimeEvents";
import { subscribePersonalPreferencesChanged } from "../utils/personalPreferences";
import type { OrfReadModelInvalidation, SystemBroadcast } from "../types/realtime";
import type {
  CommentStatus,
  CommentTargetType,
  Feedback,
  Objective,
  ObjectiveAlignmentRequestKind,
  ObjectiveAlignmentRequestStatus,
  FeedbackStatus,
  LootResultClaim,
  ObjectiveTrialReviewStatus,
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
  UncertaintyLevel,
  UserRole,
} from "../types/orf";

type ModalType = "newResult" | "newFeedback" | "recruitChallengers" | null;
export type ThemeMode = "dark" | "light";
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
type ReviewObjectiveTrialReviewInput = {
  status: Exclude<ObjectiveTrialReviewStatus, "requested">;
  commanderFeedback: string;
};
type RequestObjectiveAlignmentInput = {
  kind: ObjectiveAlignmentRequestKind;
  scheduledAt?: string | null;
  meetingRoom?: string | null;
  note?: string | null;
};
type ReviewObjectiveAlignmentInput = {
  status: Extract<ObjectiveAlignmentRequestStatus, "scheduled" | "completed" | "needsWork" | "cancelled">;
  scheduledAt?: string | null;
  meetingRoom?: string | null;
  commanderFeedback?: string | null;
};

interface ModalState {
  type: ModalType;
  objectiveId?: string;
  resultId?: string;
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
  readModelInvalidations: OrfReadModelInvalidation[];
  systemBroadcasts: SystemBroadcast[];
  unreadNotificationCount: number;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  openModal: (modal: ModalState) => void;
  closeModal: () => void;
  notify: (message: string) => void;
  removeToast: (id: string) => void;
  dismissSystemBroadcast: (id: string) => void;
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
  applyForBounty: (objectiveId: string, reason: string) => Promise<boolean>;
  acceptBountyChallenge: (objectiveId: string) => Promise<boolean>;
  freezeObjective: (objectiveId: string) => Promise<boolean>;
  reviewObjectiveLoot: (objectiveId: string, input: ReviewObjectiveLootInput) => Promise<boolean>;
  submitContributionReview: (objectiveId: string, allocations: ContributionAllocation[]) => Promise<boolean>;
  createFeedback: (input: Pick<Feedback, "phenomenon" | "causeCategories" | "impact" | "linkedObjectiveId" | "linkedResultId" | "suggestedAdjustment" | "source" | "owner">) => Promise<boolean>;
  createTask: (input: Pick<Task, "title" | "description" | "assignee" | "priority" | "linkedObjectiveId"> & Partial<Omit<Task, "linkedObjectiveId">>) => Promise<Task | null>;
  updateTaskStatus: (taskId: string, status: TaskStatus) => void;
  setTaskCompletion: (taskId: string, done: boolean) => Promise<boolean>;
  updateTaskChecklistItem: (taskId: string, itemId: string, done: boolean) => Promise<boolean>;
  updateObjectiveTitle: (objectiveId: string, title: string) => Promise<boolean>;
  updateObjectiveFinalDueAt: (objectiveId: string, finalDueAt: string) => Promise<boolean>;
  updateResultTitle: (resultId: string, title: string) => Promise<boolean>;
  updateResultUncertaintyLevel: (resultId: string, uncertaintyLevel: UncertaintyLevel) => Promise<boolean>;
  updateTaskTitle: (taskId: string, title: string) => Promise<boolean>;
  updateTaskChecklistItemLabel: (taskId: string, itemId: string, label: string) => Promise<boolean>;
  createTaskChecklistItem: (taskId: string, input?: { afterItemId?: string; label?: string }) => Promise<TaskChecklistItem | null>;
  moveResult: OrfFlowStore["moveResult"] extends (state: OrfState, input: infer T) => OrfState ? (input: T) => void : never;
  moveTask: OrfFlowStore["moveTask"] extends (state: OrfState, input: infer T) => OrfState ? (input: T) => void : never;
  moveTaskChecklistItem: OrfFlowStore["moveTaskChecklistItem"] extends (state: OrfState, input: infer T) => OrfState ? (input: T) => void : never;
  submitLoot: (input: SubmitLootInput) => Promise<boolean>;
  submitObjectiveTrialReview: (input: SubmitLootInput) => Promise<boolean>;
  reviewObjectiveTrialReview: (objectiveId: string, trialReviewId: string, input: ReviewObjectiveTrialReviewInput) => Promise<boolean>;
  requestObjectiveAlignment: (objectiveId: string, input: RequestObjectiveAlignmentInput) => Promise<boolean>;
  reviewObjectiveAlignment: (objectiveId: string, requestId: string, input: ReviewObjectiveAlignmentInput) => Promise<boolean>;
  deleteObjective: (objectiveId: string) => void;
  deleteResult: (resultId: string) => void;
  deleteTask: (taskId: string) => void;
  deleteTaskChecklistItem: (taskId: string, itemId: string) => void;
  updateFeedbackStatus: (feedbackId: string, status: FeedbackStatus) => void;
  updateResultConfidence: (resultId: string, confidence: number) => void;
  createUser: (input: { name: string; email: string; role: UserRole }) => Promise<boolean>;
  loginWithPassword: (email: string, password: string) => Promise<AuthResult>;
  registerWithPassword: (input: { name: string; email: string; password: string }) => Promise<AuthResult>;
  uploadCurrentUserAvatar: (file: File) => Promise<boolean>;
  deleteCurrentUserAvatar: () => Promise<boolean>;
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
}

const OrfContext = createContext<OrfContextValue | null>(null);

const store = new OrfFlowStore();
const THEME_STORAGE_KEY = "orf-flow-theme";

function loadInitialState() {
  return store.load();
}

export { authFailureMessage } from "./orfProviderAuth";

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
  const { authenticateWithPassword, authReady, authUserId, refreshAuthSession, setAuthUserId } = useAuthSessionState(setState);
  const [theme, setThemeState] = useState<ThemeMode>(() => loadTheme());
  const [toastEnabled, setToastEnabled] = useState(true);
  const [modal, setModal] = useState<ModalState>({ type: null });
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [readModelInvalidations, setReadModelInvalidations] = useState<OrfReadModelInvalidation[]>([]);
  const [systemBroadcasts, setSystemBroadcasts] = useState<SystemBroadcast[]>([]);
  const notify = useCallback((message: string) => {
    if (!toastEnabled) {
      return;
    }
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((items) => [...items, { id, message }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 3600);
  }, [toastEnabled]);
  const currentUser = authUserId ? state.users.find((user) => user.id === authUserId) ?? null : null;
  const currentUserRole = currentUser?.role ?? null;
  const isAuthenticated = currentUser !== null;
  const isApproved = currentUser?.status === "active";
  const isAdmin = currentUser?.role === "admin";
  const {
    clearNotifications,
    markAllNotificationsRead,
    markNotificationRead,
    notifications,
    receiveNotification,
    refreshNotifications,
    unreadNotificationCount,
  } = useNotificationState(businessMutationFailureMessage, notify);
  const {
    applyCommentThread,
    applyRemovedCommentThread,
    dataReady,
    refreshPermissionRules,
    refreshTaskManagementData,
    refreshUsers,
  } = useOrfDataState({
    authReady,
    authUserId,
    clearNotifications,
    currentUserRole,
    isApproved,
    isAuthenticated,
    refreshNotifications,
    setState,
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (!authReady || !isAuthenticated || !isApproved) {
      setToastEnabled(true);
      return undefined;
    }

    let cancelled = false;
    const refreshPersonalPreferences = () => {
      void getUserPreferences()
        .then((preferences) => {
          if (!cancelled) {
            setToastEnabled(preferences.notificationDisplay.toastEnabled);
          }
        })
        .catch(() => undefined);
    };

    refreshPersonalPreferences();
    const unsubscribe = subscribePersonalPreferencesChanged(refreshPersonalPreferences);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [authReady, isApproved, isAuthenticated]);

  const dismissSystemBroadcast = useCallback((id: string) => {
    setSystemBroadcasts((items) => items.filter((item) => item.id !== id));
  }, []);

  const receiveRealtimeNotification = useCallback(
    (notification: AppNotification) => {
      receiveNotification(notification);
    },
    [receiveNotification],
  );
  const receiveRealtimeBroadcast = useCallback((broadcast: SystemBroadcast) => {
    setSystemBroadcasts((items) => enqueueSystemBroadcast(items, broadcast));
  }, []);
  const receiveReadModelInvalidation = useCallback((invalidation: OrfReadModelInvalidation) => {
    setReadModelInvalidations((items) => [invalidation, ...items.filter((item) => item.id !== invalidation.id)].slice(0, 64));
  }, []);

  useRealtimeEvents({
    enabled: authReady && isAuthenticated && isApproved,
    onBroadcast: receiveRealtimeBroadcast,
    onNotification: receiveRealtimeNotification,
    onReadModelInvalidation: receiveReadModelInvalidation,
  });

  useEffect(() => {
    if (!isAuthenticated || !isApproved) {
      setReadModelInvalidations([]);
      setSystemBroadcasts([]);
    }
  }, [isApproved, isAuthenticated]);

  useEffect(() => {
    void refreshAuthSession();
  }, [refreshAuthSession]);

  const taskManagementInvalidationKey = useMemo(
    () => readModelInvalidationKey(readModelInvalidations, "taskManagement"),
    [readModelInvalidations],
  );
  const usersInvalidationKey = useMemo(() => readModelInvalidationKey(readModelInvalidations, "users"), [readModelInvalidations]);
  const permissionsInvalidationKey = useMemo(
    () => readModelInvalidationKey(readModelInvalidations, "permissions"),
    [readModelInvalidations],
  );
  const notificationsInvalidationKey = useMemo(
    () => readModelInvalidationKey(readModelInvalidations, "notifications"),
    [readModelInvalidations],
  );

  useEffect(() => {
    if (!taskManagementInvalidationKey || !authReady || !isAuthenticated || !isApproved) return;
    void refreshTaskManagementData().catch(() => undefined);
  }, [authReady, isApproved, isAuthenticated, refreshTaskManagementData, taskManagementInvalidationKey]);

  useEffect(() => {
    if (!usersInvalidationKey || !authReady || !isAuthenticated || !isApproved || !isAdmin) return;
    void refreshUsers().catch(() => undefined);
  }, [authReady, isAdmin, isApproved, isAuthenticated, refreshUsers, usersInvalidationKey]);

  useEffect(() => {
    if (!permissionsInvalidationKey || !authReady || !isAuthenticated || !isApproved || !isAdmin) return;
    void refreshPermissionRules().catch(() => undefined);
  }, [authReady, isAdmin, isApproved, isAuthenticated, permissionsInvalidationKey, refreshPermissionRules]);

  useEffect(() => {
    if (!notificationsInvalidationKey || !authReady || !isAuthenticated || !isApproved) return;
    void refreshNotifications().catch(() => undefined);
  }, [authReady, isApproved, isAuthenticated, notificationsInvalidationKey, refreshNotifications]);

  const userActions = useOrfProviderUserActions({
    authenticateWithPassword,
    authUserId,
    notify,
    refreshPermissionRules,
    refreshUsers,
    setAuthUserId,
    setState,
  });
  const commentActions = useOrfProviderCommentActions({
    applyCommentThread,
    applyRemovedCommentThread,
    notify,
    refreshTaskManagementData,
  });
  const refreshTaskManagementDataAfterCreate = useCallback(
    (failureMessage: string) => {
      void refreshTaskManagementData().catch((error) => {
        notify(businessMutationFailureMessage(error, failureMessage));
      });
    },
    [notify, refreshTaskManagementData],
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
      readModelInvalidations,
      systemBroadcasts,
      unreadNotificationCount,
      theme,
      setTheme: setThemeState,
      toggleTheme: () => setThemeState((current) => (current === "dark" ? "light" : "dark")),
      openModal: setModal,
      closeModal: () => setModal({ type: null }),
      notify,
      dismissSystemBroadcast,
      removeToast: (id: string) => setToasts((items) => items.filter((item) => item.id !== id)),
      resetState: () => {
        void refreshTaskManagementData()
          .then(() => notify("数据已从后端重新加载"))
          .catch((error) => notify(businessMutationFailureMessage(error, "重新加载数据失败")));
      },
      refreshNotifications,
      markNotificationRead,
      markAllNotificationsRead,
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
          refreshTaskManagementDataAfterCreate("目标已创建，但数据刷新失败");
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
        const canAdjustDuringReestimate = Boolean(
          objective &&
            isObjectiveReestimateWindowOpen(objective) &&
            currentUser?.name &&
            objective.challengers.includes(currentUser.name),
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
          notify(payload.source === "memberProposed" ? "指标已提交" : "指标已创建");
          refreshTaskManagementDataAfterCreate(payload.source === "memberProposed" ? "指标已提交，但数据刷新失败" : "指标已创建，但数据刷新失败");
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
      applyForBounty: async (objectiveId, reason) => {
        if (currentUser?.role !== "member") {
          notify("只有普通成员可以申请挑战");
          return false;
        }
        const applicant = currentUser?.name ?? "";
        const applicationReason = reason.trim();
        if (!applicationReason) {
          notify("请先填写申请理由");
          return false;
        }
        const hasScopedObjective = state.objectives.some((objective) => objective.id === objectiveId);
        if (hasScopedObjective) {
          const next = store.applyForBounty(state, objectiveId, applicant, applicationReason);
          if (next === state) {
            notify("这个目标暂时不能申请挑战");
            return false;
          }
        }

        try {
          await apiRequest(`/api/objectives/${encodeURIComponent(objectiveId)}/challenge-applications`, {
            method: "POST",
            body: JSON.stringify({ reason: applicationReason }),
          });
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
          const objective = state.objectives.find((item) => item.id === objectiveId);
          const localSummary = objective && objective.challengers.length > 1
            ? await fetchLocalSettlementSummary({ challengers: objective.challengers, objectiveId }).catch(() => null)
            : null;
          const settlementInput =
            localSummary?.status === "ready" && localSummary.contributionResolution
              ? { ...input, contributionResolution: localSummary.contributionResolution }
              : input;
          await apiRequest(`/api/objectives/${encodeURIComponent(objectiveId)}/review`, {
            method: "POST",
            body: JSON.stringify(settlementInput),
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
          const objective = state.objectives.find((item) => item.id === objectiveId);
          if (!objective || !currentUser) {
            notify("匿名互评提交失败：目标或当前用户不可用");
            return false;
          }
          await submitLocalEncryptedContributionReview({
            allocations,
            challengers: objective.challengers,
            objectiveId,
            objectiveTitle: objective.title,
            reviewer: currentUser.name,
          });
          notify("匿名互评已提交到本地结算服务");
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "匿名互评提交失败"));
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
          notify("行动项已创建");
          refreshTaskManagementDataAfterCreate("行动项已创建，但数据刷新失败");
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
      setTaskCompletion: async (taskId, done) => {
        try {
          await apiRequest(`/api/tasks/${encodeURIComponent(taskId)}/completion`, {
            method: "PATCH",
            body: JSON.stringify({ done }),
          });
          await refreshTaskManagementData();
          notify("行动项完成状态已更新");
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "行动项完成状态更新失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      updateTaskChecklistItem: async (taskId, itemId, done) => {
        try {
          await apiRequest(`/api/tasks/${encodeURIComponent(taskId)}/checklist/${encodeURIComponent(itemId)}`, {
            method: "PATCH",
            body: JSON.stringify({ done }),
          });
          await refreshTaskManagementData();
          notify("子行动项完成状态已更新");
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "子行动项完成状态更新失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      updateObjectiveTitle: async (objectiveId, title) => {
        try {
          await apiRequest(`/api/objectives/${encodeURIComponent(objectiveId)}`, {
            method: "PATCH",
            body: JSON.stringify({ title }),
          });
          await refreshTaskManagementData();
          notify("目标已更新");
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "目标更新失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      updateObjectiveFinalDueAt: async (objectiveId, finalDueAt) => {
        try {
          await apiRequest(`/api/objectives/${encodeURIComponent(objectiveId)}`, {
            method: "PATCH",
            body: JSON.stringify({ finalDueAt }),
          });
          await refreshTaskManagementData();
          notify("截止日期已更新");
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "截止日期更新失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      updateResultTitle: async (resultId, title) => {
        try {
          await apiRequest(`/api/results/${encodeURIComponent(resultId)}`, {
            method: "PATCH",
            body: JSON.stringify({ title }),
          });
          await refreshTaskManagementData();
          notify("指标已更新");
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "指标更新失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      updateResultUncertaintyLevel: async (resultId, uncertaintyLevel) => {
        try {
          await apiRequest(`/api/results/${encodeURIComponent(resultId)}/uncertainty`, {
            method: "PATCH",
            body: JSON.stringify({ uncertaintyLevel }),
          });
          await refreshTaskManagementData();
          notify("指标积分已校准");
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "指标积分校准失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      updateTaskTitle: async (taskId, title) => {
        try {
          await apiRequest(`/api/tasks/${encodeURIComponent(taskId)}`, {
            method: "PATCH",
            body: JSON.stringify({ title }),
          });
          await refreshTaskManagementData();
          notify("行动项已更新");
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "行动项更新失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      updateTaskChecklistItemLabel: async (taskId, itemId, label) => {
        try {
          await apiRequest(`/api/tasks/${encodeURIComponent(taskId)}/checklist/${encodeURIComponent(itemId)}/label`, {
            method: "PATCH",
            body: JSON.stringify({ label }),
          });
          await refreshTaskManagementData();
          notify("子行动项已更新");
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "子行动项更新失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      createTaskChecklistItem: async (taskId, input = {}) => {
        try {
          const data = await apiJson<CreateChecklistItemResponse>(`/api/tasks/${encodeURIComponent(taskId)}/checklist`, {
            method: "POST",
            body: JSON.stringify(input),
          });
          notify("子行动项已添加");
          refreshTaskManagementDataAfterCreate("子行动项已添加，但数据刷新失败");
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
          notify("战利品已提交，请申请验收对齐并定好会议室");
          return true;
        } catch (error) {
          notify(commentMutationFailureMessage(error, "战利品提交失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      submitObjectiveTrialReview: async (input) => {
        try {
          await apiRequest(`/api/objectives/${encodeURIComponent(input.objectiveId)}/trial-reviews`, {
            method: "POST",
            body: JSON.stringify({
              body: input.body,
              resultClaims: input.resultClaims,
              selfTestReportUrl: input.selfTestReportUrl,
              selfTestReportBody: input.selfTestReportBody,
            }),
          });
          await refreshTaskManagementData();
          notify("试验收已提交");
          return true;
        } catch (error) {
          notify(commentMutationFailureMessage(error, "试验收提交失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      reviewObjectiveTrialReview: async (objectiveId, trialReviewId, input) => {
        try {
          await apiRequest(`/api/objectives/${encodeURIComponent(objectiveId)}/trial-reviews/${encodeURIComponent(trialReviewId)}`, {
            method: "PATCH",
            body: JSON.stringify(input),
          });
          await refreshTaskManagementData();
          notify("试验收反馈已提交");
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "试验收反馈提交失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      requestObjectiveAlignment: async (objectiveId, input) => {
        try {
          await apiRequest(`/api/objectives/${encodeURIComponent(objectiveId)}/alignment-requests`, {
            method: "POST",
            body: JSON.stringify(input),
          });
          await refreshTaskManagementData();
          notify(input.kind === "reestimateCompletion" ? "已申请重估对齐，请约时间并定好会议室" : "已申请验收对齐，请约时间并定好会议室");
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "对齐申请失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      reviewObjectiveAlignment: async (objectiveId, requestId, input) => {
        try {
          await apiRequest(`/api/objectives/${encodeURIComponent(objectiveId)}/alignment-requests/${encodeURIComponent(requestId)}`, {
            method: "PATCH",
            body: JSON.stringify(input),
          });
          await refreshTaskManagementData();
          notify(input.status === "completed" ? "对齐已完成" : "对齐反馈已提交");
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "对齐处理失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      ...userActions,
      ...commentActions,
    }),
    [
      authReady,
      commentActions,
      currentUser,
      dismissSystemBroadcast,
      isAdmin,
      isApproved,
      isAuthenticated,
      modal,
      markAllNotificationsRead,
      markNotificationRead,
      notify,
      notifications,
      readModelInvalidations,
      refreshNotifications,
      refreshTaskManagementDataAfterCreate,
      refreshTaskManagementData,
      state,
      systemBroadcasts,
      theme,
      toasts,
      unreadNotificationCount,
      userActions,
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
