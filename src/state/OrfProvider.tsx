import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { API_AUTHENTICATION_EXPIRED_EVENT, getChatUnreadSummary, getUserPreferences } from "./apiClient";
import { shouldLoadInitialTaskManagementReadModel } from "./orfDataLoading";
import { loadEmptyOrfStateSnapshot } from "./orfStateSnapshot";
import { useOrfDataState } from "./orfProviderData";
import { type AuthResult, useAuthSessionState } from "./orfProviderAuth";
import { useOrfProviderCommentActions } from "./orfProviderCommentActions";
import { useOrfProviderFeedbackActions } from "./orfProviderFeedbackActions";
import { useNotificationState } from "./orfProviderNotifications";
import { businessMutationFailureMessage } from "./orfProviderMutationMessages";
import {
  type CreateObjectiveInput,
  type RequestObjectiveAlignmentInput,
  type ReviewObjectiveAlignmentInput,
  type ReviewObjectiveLootInput,
  type ReviewObjectiveTrialReviewInput,
  type SubmitLootInput,
  useOrfProviderObjectiveActions,
} from "./orfProviderObjectiveActions";
import { type MoveResultInput, useOrfProviderResultActions } from "./orfProviderResultActions";
import { type MoveSubtaskInput, type MoveTaskInput, useOrfProviderTaskActions } from "./orfProviderTaskActions";
import { useOrfProviderUserActions } from "./orfProviderUserActions";
import { enqueueSystemBroadcast } from "../features/notifications/notificationBroadcasts";
import { readModelInvalidationKey } from "../features/realtime/readModelInvalidations";
import { useRealtimeEvents } from "../features/realtime/useRealtimeEvents";
import type { ResultDetailsInput } from "../domain/orfResultDetails";
import { subscribePersonalPreferencesChanged } from "../utils/personalPreferences";
import type { ChatRealtimeEvent, OrfReadModelInvalidation, SystemBroadcast } from "../types/realtime";
import type {
  CommentStatus,
  CommentTargetType,
  Feedback,
  FeedbackStatus,
  Objective,
  OrfState,
  OrfUser,
  Result,
  Task,
  TaskChecklistItem,
  TaskStatus,
  BountySource,
  ContributionAllocation,
  AppNotification,
  ChatUnreadSummary,
  UncertaintyLevel,
  UserRole,
} from "../types/orf";

type ModalType = "newResult" | "newFeedback" | "recruitChallengers" | null;

interface ModalState {
  type: ModalType;
  objectiveId?: string;
  source?: BountySource;
}

interface ToastMessage {
  id: string;
  message: string;
}

const emptyChatUnreadSummary: ChatUnreadSummary = {
  mentionCount: 0,
  messageUnreadCount: 0,
  threadUnreadCount: 0,
  totalUnreadCount: 0,
  unreadChannelCount: 0,
};

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
  chatUnreadSummary: ChatUnreadSummary;
  unreadNotificationCount: number;
  openModal: (modal: ModalState) => void;
  closeModal: () => void;
  notify: (message: string) => void;
  removeToast: (id: string) => void;
  dismissSystemBroadcast: (id: string) => void;
  resetState: () => void;
  refreshChatUnreadSummary: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  markNotificationRead: (notificationId: string) => Promise<boolean>;
  markAllNotificationsRead: () => Promise<boolean>;
  deleteNotifications: (notificationIds: string[]) => Promise<boolean>;
  clearAllNotifications: () => Promise<boolean>;
  createObjective: (input: CreateObjectiveInput) => Promise<Objective | null>;
  createProject: (input: { name: string }) => Promise<OrfState["projects"][number] | null>;
  deleteProject: (projectId: string) => Promise<boolean>;
  setObjectiveProject: (objectiveId: string, projectId: string | null) => Promise<boolean>;
  createResult: (input: Partial<Result> & Pick<Result, "objectiveId" | "title">) => Promise<Result | null>;
  publishObjective: (objectiveId: string) => Promise<boolean>;
  recruitObjectiveChallengers: (objectiveId: string, members: string[]) => Promise<boolean>;
  approveChallengeApplication: (objectiveId: string, applicationId: string) => Promise<boolean>;
  rejectChallengeApplication: (objectiveId: string, applicationId: string) => Promise<boolean>;
  applyForBounty: (objectiveId: string, reason: string) => Promise<boolean>;
  acceptBountyChallenge: (objectiveId: string) => Promise<boolean>;
  freezeObjective: (objectiveId: string) => Promise<boolean>;
  reviewObjectiveLoot: (objectiveId: string, input: ReviewObjectiveLootInput) => Promise<boolean>;
  submitContributionReview: (objectiveId: string, allocations: ContributionAllocation[]) => Promise<boolean>;
  createFeedback: (input: Pick<Feedback, "phenomenon" | "causeCategories" | "impact" | "suggestedAdjustment" | "owner">) => Promise<boolean>;
  createTask: (input: Pick<Task, "title" | "description" | "assignee" | "priority" | "linkedObjectiveId"> & Partial<Pick<Task, "dueDate" | "tags" | "checklist">>) => Promise<Task | null>;
  updateTaskStatus: (taskId: string, status: TaskStatus) => void;
  setTaskCompletion: (taskId: string, done: boolean) => Promise<boolean>;
  updateTaskChecklistItem: (taskId: string, itemId: string, done: boolean) => Promise<boolean>;
  updateObjectiveTitle: (objectiveId: string, title: string) => Promise<boolean>;
  updateObjectiveFinalDueAt: (objectiveId: string, finalDueAt: string) => Promise<boolean>;
  updateResultTitle: (resultId: string, title: string) => Promise<boolean>;
  updateResultDetails: (resultId: string, details: ResultDetailsInput) => Promise<boolean>;
  updateResultUncertaintyLevel: (resultId: string, uncertaintyLevel: UncertaintyLevel) => Promise<boolean>;
  updateTaskTitle: (taskId: string, title: string) => Promise<boolean>;
  updateTaskChecklistItemLabel: (taskId: string, itemId: string, label: string) => Promise<boolean>;
  createTaskChecklistItem: (taskId: string, input?: { afterItemId?: string; label?: string }) => Promise<TaskChecklistItem | null>;
  moveResult: (input: MoveResultInput) => void;
  moveTask: (input: MoveTaskInput) => void;
  moveTaskChecklistItem: (input: MoveSubtaskInput) => void;
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

function loadInitialState() {
  return loadEmptyOrfStateSnapshot();
}

export { authFailureMessage } from "./orfProviderAuth";

export function OrfProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [state, setState] = useState(loadInitialState);
  const { authenticateWithPassword, authReady, authUserId, refreshAuthSession, setAuthUserId } = useAuthSessionState(setState);
  const [toastEnabled, setToastEnabled] = useState(true);
  const [modal, setModal] = useState<ModalState>({ type: null });
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [readModelInvalidations, setReadModelInvalidations] = useState<OrfReadModelInvalidation[]>([]);
  const [systemBroadcasts, setSystemBroadcasts] = useState<SystemBroadcast[]>([]);
  const [chatUnreadSummary, setChatUnreadSummary] = useState<ChatUnreadSummary>(emptyChatUnreadSummary);
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
  const loadTaskManagementData = shouldLoadInitialTaskManagementReadModel(location.pathname);
  const {
    clearAllNotifications,
    clearNotifications,
    deleteNotifications,
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
    refreshCurrentUserAccess,
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
    loadTaskManagementData,
    refreshNotifications,
    setState,
  });
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
  const refreshChatUnreadSummary = useCallback(async () => {
    const summary = await getChatUnreadSummary();
    setChatUnreadSummary(summary);
  }, []);
  const receiveRealtimeChatEvent = useCallback((event: ChatRealtimeEvent) => {
    if (event.eventType === "typing") return;
    void refreshChatUnreadSummary().catch(() => undefined);
  }, [refreshChatUnreadSummary]);

  useRealtimeEvents({
    enabled: authReady && isAuthenticated && isApproved,
    onBroadcast: receiveRealtimeBroadcast,
    onChatEvent: receiveRealtimeChatEvent,
    onNotification: receiveRealtimeNotification,
    onReadModelInvalidation: receiveReadModelInvalidation,
  });

  useEffect(() => {
    if (!isAuthenticated || !isApproved) {
      setChatUnreadSummary(emptyChatUnreadSummary);
      setReadModelInvalidations([]);
      setSystemBroadcasts([]);
    }
  }, [isApproved, isAuthenticated]);

  useEffect(() => {
    if (!authReady || !isAuthenticated || !isApproved) return;
    void refreshChatUnreadSummary().catch(() => undefined);
  }, [authReady, isApproved, isAuthenticated, refreshChatUnreadSummary]);

  useEffect(() => {
    void refreshAuthSession();
  }, [refreshAuthSession]);

  useEffect(() => {
    const handleAuthenticationExpired = () => {
      setAuthUserId(null);
      notify("登录已失效，请重新登录。");
    };

    window.addEventListener(API_AUTHENTICATION_EXPIRED_EVENT, handleAuthenticationExpired);
    return () => window.removeEventListener(API_AUTHENTICATION_EXPIRED_EVENT, handleAuthenticationExpired);
  }, [notify, setAuthUserId]);

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
    if (!taskManagementInvalidationKey || !authReady || !isAuthenticated || !isApproved || !loadTaskManagementData) return;
    void refreshTaskManagementData().catch(() => undefined);
  }, [authReady, isApproved, isAuthenticated, loadTaskManagementData, refreshTaskManagementData, taskManagementInvalidationKey]);

  useEffect(() => {
    if (!usersInvalidationKey || !authReady || !isAuthenticated || !isApproved || !isAdmin) return;
    void refreshUsers().catch(() => undefined);
  }, [authReady, isAdmin, isApproved, isAuthenticated, refreshUsers, usersInvalidationKey]);

  useEffect(() => {
    if (!permissionsInvalidationKey || !authReady || !isAuthenticated || !isApproved) return;
    void refreshCurrentUserAccess().catch(() => undefined);
  }, [authReady, isApproved, isAuthenticated, permissionsInvalidationKey, refreshCurrentUserAccess]);

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
  const objectiveActions = useOrfProviderObjectiveActions({
    currentUser,
    notify,
    refreshTaskManagementData,
    refreshTaskManagementDataAfterCreate,
    state,
  });
  const resultActions = useOrfProviderResultActions({
    currentUser,
    notify,
    refreshTaskManagementData,
    refreshTaskManagementDataAfterCreate,
    state,
  });
  const taskActions = useOrfProviderTaskActions({
    notify,
    refreshTaskManagementData,
    refreshTaskManagementDataAfterCreate,
  });
  const feedbackActions = useOrfProviderFeedbackActions({
    notify,
    refreshTaskManagementData,
  });

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
      chatUnreadSummary,
      unreadNotificationCount,
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
      refreshChatUnreadSummary,
      refreshNotifications,
      markNotificationRead,
      markAllNotificationsRead,
      deleteNotifications,
      clearAllNotifications,
      ...objectiveActions,
      ...resultActions,
      ...taskActions,
      ...feedbackActions,
      ...userActions,
      ...commentActions,
    }),
    [
      authReady,
      chatUnreadSummary,
      commentActions,
      currentUser,
      dismissSystemBroadcast,
      isAdmin,
      isApproved,
      isAuthenticated,
      modal,
      clearAllNotifications,
      deleteNotifications,
      markAllNotificationsRead,
      markNotificationRead,
      notify,
      notifications,
      objectiveActions,
      readModelInvalidations,
      resultActions,
      feedbackActions,
      refreshChatUnreadSummary,
      refreshNotifications,
      refreshTaskManagementData,
      systemBroadcasts,
      taskActions,
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
