import { createContext, type ReactNode, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  API_AUTHENTICATION_EXPIRED_EVENT,
  getChatSync,
  getChatUnreadSummary,
  getUserPreferences,
  getWorkLogReminderState,
  snoozeWorkLogReminder as snoozeWorkLogReminderRequest,
} from "./apiClient";
import { isReportsReadModelPath } from "./orfDataLoading";
import { loadEmptyOrfStateSnapshot } from "./orfStateSnapshot";
import { useOrfDataState } from "./orfProviderData";
import { type AuthResult, useAuthSessionState } from "./orfProviderAuth";
import { useOrfProviderCommentActions } from "./orfProviderCommentActions";
import { useNotificationState } from "./orfProviderNotifications";
import { businessMutationFailureMessage } from "./orfProviderMutationMessages";
import {
  type CreateObjectiveInput,
  type RequestObjectiveAlignmentInput,
  type ReviewObjectiveAlignmentInput,
  type ReviewObjectiveLootInput,
  type ReviewObjectiveTrialReviewInput,
  type SettleObjectiveLootInput,
  type SubmitContributionReviewInput,
  type SubmitLootInput,
  useOrfProviderObjectiveActions,
} from "./orfProviderObjectiveActions";
import { type MoveResultInput, useOrfProviderResultActions } from "./orfProviderResultActions";
import { type MoveSubtaskInput, type MoveTaskInput, useOrfProviderTaskActions } from "./orfProviderTaskActions";
import { useOrfProviderUserActions } from "./orfProviderUserActions";
import { enqueueSystemBroadcast } from "../features/notifications/notificationBroadcasts";
import { publishChatRealtimeEvent } from "../features/realtime/chatRealtimeEventBus";
import { readModelInvalidationKey } from "../features/realtime/readModelInvalidations";
import { clearReadModelCache } from "./readModelCache";
import { clearChatFeedSessionCache } from "../features/chat/chatFeedSessionCache";
import { clearPreparedVisualBackgrounds } from "../utils/visualBackgrounds";
import { useRealtimeEvents } from "../features/realtime/useRealtimeEvents";
import { useRealtimeReconciliation } from "../features/realtime/useRealtimeReconciliation";
import {
  buildChatRealtimeRecoveryState,
  type ChatRealtimeRecoveryState,
} from "../features/realtime/realtimeRecoveryModel";
import { requestClientUpdateCheck } from "../features/client-updates/clientUpdateCenterEvents";
import {
  attentionToastIntentFromNotification,
  attentionToastIntentFromWorkLogReminder,
  buildAttentionState,
  type AttentionToastIntent,
} from "../features/attention/attentionModel";
import type { AttentionState } from "../features/attention/attentionTypes";
import {
  buildChatNativeNotificationDecision,
  buildChatRealtimeAttentionIntent,
  type ChatRealtimeAttentionIntent,
} from "../features/chat/chatNativeNotificationModel";
import type { AppAttentionState } from "../features/interaction/appAttentionState";
import { useAppAttentionState } from "../features/interaction/useAppAttentionState";
import {
  showDesktopToastIntent,
  syncDesktopAttentionState,
  subscribeDesktopTargetOpen,
  type DesktopToastIntent,
  type DesktopToastSource,
} from "../features/desktop/desktopShellRuntime";
import { prepareDesktopNotificationAvatar } from "../features/desktop/desktopNotificationAvatar";
import { registerOrfPushNotifications, revokeOrfPushNotifications } from "../features/push/orfPushRegistration";
import { GlobalWorkLogReminderModal } from "../features/work-logs/GlobalWorkLogReminderModal";
import {
  isSafeChatNotificationTargetPath,
  prepareNativeChatNotifications,
  sendNativeChatNotification,
  subscribeNativeChatNotificationOpen,
} from "../features/chat/chatNativeNotificationDelivery";
import { getChatNativeNotificationViewState } from "../features/chat/chatNativeNotificationViewState";
import { readChatSyncCursor, writeChatSyncCursor } from "../features/chat/chatSyncCursor";
import { resolveChatSyncCheckpoint } from "../features/chat/chatSyncRecovery";
import type { ResultDetailsInput } from "../domain/orfResultDetails";
import type { ReportsPageData } from "../domain/reportsLeaderboard";
import { subscribePersonalPreferencesChanged } from "../utils/personalPreferences";
import type { ChatRealtimeEvent, ClientUpdateAvailable, OrfReadModelInvalidation, SystemBroadcast } from "../types/realtime";
import type {
  CommentStatus,
  CommentTargetType,
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
  CommentAttachmentUploadResult,
  UserRole,
  WorkLogReminderState,
} from "../types/orf";

type ModalType = "newResult" | "recruitChallengers" | "reinforceChallengers" | null;

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
  actionableMessageUnreadCount: 0,
  ackRequiredCount: 0,
  directMessageUnreadCount: 0,
  mainMentionCount: 0,
  mentionCount: 0,
  messageUnreadCount: 0,
  nextTarget: null,
  threadMentionCount: 0,
  threadUnreadCount: 0,
  totalUnreadCount: 0,
  unreadChannelCount: 0,
};

function chatRouteChannelIdFromPathname(pathname: string) {
  const match = /^\/chat\/([^/?#]+)/.exec(pathname);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

interface OrfContextValue {
  state: OrfState;
  reportsData: ReportsPageData | null;
  currentUser: OrfUser | null;
  authConnectionError: string | null;
  authReady: boolean;
  dataReady: boolean;
  isAuthenticated: boolean;
  isApproved: boolean;
  isAdmin: boolean;
  attentionState: AttentionState;
  appAttentionState: AppAttentionState;
  modal: ModalState;
  toasts: ToastMessage[];
  readModelInvalidations: OrfReadModelInvalidation[];
  systemBroadcasts: SystemBroadcast[];
  workLogReminderState: WorkLogReminderState | null;
  chatUnreadSummary: ChatUnreadSummary;
  chatRealtimeRecoveryState: ChatRealtimeRecoveryState;
  notifications: AppNotification[];
  unreadNotificationCount: number;
  markAllNotificationsRead: () => Promise<number>;
  markNotificationRead: (notificationId: string) => Promise<AppNotification>;
  openModal: (modal: ModalState) => void;
  closeModal: () => void;
  notify: (message: string) => void;
  removeToast: (id: string) => void;
  dismissSystemBroadcast: (id: string) => void;
  resetState: () => void;
  refreshChatUnreadSummary: () => Promise<ChatUnreadSummary>;
  refreshWorkLogReminderState: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  snoozeWorkLogReminder: () => Promise<void>;
  createObjective: (input: CreateObjectiveInput) => Promise<Objective | null>;
  createProject: (input: { name: string }) => Promise<OrfState["projects"][number] | null>;
  deleteProject: (projectId: string) => Promise<boolean>;
  setObjectiveProject: (objectiveId: string, projectId: string | null) => Promise<boolean>;
  createResult: (input: Partial<Result> & Pick<Result, "objectiveId" | "title">) => Promise<Result | null>;
  publishObjective: (objectiveId: string) => Promise<boolean>;
  recruitObjectiveChallengers: (objectiveId: string, memberUserIds: string[]) => Promise<boolean>;
  reinforceObjectiveChallengers: (objectiveId: string, memberUserIds: string[]) => Promise<boolean>;
  approveChallengeApplication: (objectiveId: string, applicationId: string) => Promise<boolean>;
  rejectChallengeApplication: (objectiveId: string, applicationId: string) => Promise<boolean>;
  applyForBounty: (objectiveId: string, reason: string) => Promise<boolean>;
  acceptBountyChallenge: (objectiveId: string) => Promise<boolean>;
  freezeObjective: (objectiveId: string) => Promise<boolean>;
  reviewObjectiveLoot: (objectiveId: string, input: ReviewObjectiveLootInput) => Promise<boolean>;
  settleObjectiveLoot: (objectiveId: string, input: SettleObjectiveLootInput) => Promise<boolean>;
  submitContributionReview: (objectiveId: string, input: SubmitContributionReviewInput) => Promise<boolean>;
  createTask: (input: Pick<Task, "title" | "description" | "assigneeUserId" | "priority" | "linkedObjectiveId"> & Partial<Pick<Task, "dueDate" | "tags" | "checklist">>) => Promise<Task | null>;
  updateTaskStatus: (taskId: string, status: TaskStatus) => void;
  setTaskCompletion: (taskId: string, done: boolean) => Promise<boolean>;
  updateTaskChecklistItem: (taskId: string, itemId: string, done: boolean) => Promise<boolean>;
  updateObjectiveTitle: (objectiveId: string, title: string) => Promise<boolean>;
  updateObjectiveFinalDueAt: (objectiveId: string, finalDueAt: string) => Promise<boolean>;
  updateObjectiveBasePoints: (objectiveId: string, objectiveBasePoints: number) => Promise<boolean>;
  updateResultTitle: (resultId: string, title: string) => Promise<boolean>;
  updateResultDetails: (resultId: string, details: ResultDetailsInput) => Promise<boolean>;
  updateResultExecutionCompletion: (resultId: string, completed: boolean) => Promise<boolean>;
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
  updateResultConfidence: (resultId: string, confidence: number) => void;
  createUser: (input: { name: string; email: string; role: UserRole }) => Promise<boolean>;
  loginWithPassword: (email: string, password: string) => Promise<AuthResult>;
  registerWithPassword: (input: { name: string; email: string; password: string }) => Promise<AuthResult>;
  uploadCurrentUserAvatar: (file: File) => Promise<boolean>;
  deleteCurrentUserAvatar: () => Promise<boolean>;
  logout: () => void;
  updateUser: (userId: string, input: { name: string; email: string; role: UserRole }) => Promise<boolean>;
  resetUserPassword: (userId: string, input: { password: string }) => Promise<boolean>;
  deleteUser: (userId: string) => Promise<boolean>;
  disableUser: (userId: string) => Promise<boolean>;
  enableUser: (userId: string) => Promise<boolean>;
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
  }) => Promise<boolean>;
  loadCommentMentionableUsers: (input: { targetId: string; targetType: CommentTargetType }) => Promise<OrfUser[]>;
  uploadCommentAttachment: (input: { file: File; targetId: string; targetType: CommentTargetType }) => Promise<CommentAttachmentUploadResult | null>;
  updateCommentThreadStatus: (threadId: string, status: CommentStatus) => void;
  updateCommentMessage: (threadId: string, messageId: string, body: string) => Promise<boolean>;
  deleteCommentMessage: (threadId: string, messageId: string) => void;
}

const OrfContext = createContext<OrfContextValue | null>(null);

function loadInitialState() {
  return loadEmptyOrfStateSnapshot();
}

export { authFailureMessage } from "./orfProviderAuth";

export function OrfProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [state, setState] = useState(loadInitialState);
  const [reportsData, setReportsData] = useState<ReportsPageData | null>(null);
  const {
    authenticateWithPassword,
    authConnectionError,
    authReady,
    authUserId,
    confirmApiAuthenticationExpired,
    refreshAuthSession,
    setAuthUserId,
  } = useAuthSessionState(setState);
  const appAttentionState = useAppAttentionState();
  const [toastEnabled, setToastEnabled] = useState(true);
  const [modal, setModal] = useState<ModalState>({ type: null });
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [readModelInvalidations, setReadModelInvalidations] = useState<OrfReadModelInvalidation[]>([]);
  const [systemBroadcasts, setSystemBroadcasts] = useState<SystemBroadcast[]>([]);
  const [workLogReminderState, setWorkLogReminderState] = useState<WorkLogReminderState | null>(null);
  const [chatUnreadSummary, setChatUnreadSummary] = useState<ChatUnreadSummary>(emptyChatUnreadSummary);
  const [chatRealtimeAttentionIntents, setChatRealtimeAttentionIntents] = useState<ChatRealtimeAttentionIntent[]>([]);
  const authenticationExpiryConfirmationRef = useRef<Promise<void> | null>(null);
  const notifiedChatMessageIdsRef = useRef<string[]>([]);
  const chatRealtimeAttentionIntentsRef = useRef<ChatRealtimeAttentionIntent[]>([]);
  const [readModelSessionUserId, setReadModelSessionUserId] = useState<string | null>(null);
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

  useLayoutEffect(() => {
    if (readModelSessionUserId === authUserId) return;
    clearReadModelCache();
    clearChatFeedSessionCache();
    clearPreparedVisualBackgrounds();
    setReadModelSessionUserId(authUserId);
  }, [authUserId, readModelSessionUserId]);
  const readModelSessionReady = readModelSessionUserId === authUserId;
  const loadReportsData = isReportsReadModelPath(location.pathname);
  const {
    markAllNotificationsRead,
    markNotificationRead,
    notifications,
    receiveNotification,
    refreshNotifications,
    resetNotificationState,
    unreadNotificationCount,
  } = useNotificationState();
  const currentPath = useMemo(
    () => `${location.pathname}${location.search}${location.hash}`,
    [location.hash, location.pathname, location.search],
  );
  const attentionState = useMemo(
    () => buildAttentionState({
      appAttentionState,
      authenticated: isAuthenticated && isApproved,
      chatRealtimeAttentionIntents,
      chatUnreadSummary,
      currentPath,
      currentUserId: currentUser?.id,
      notifications,
      workLogReminderState,
    }),
    [appAttentionState, chatRealtimeAttentionIntents, chatUnreadSummary, currentPath, currentUser?.id, isApproved, isAuthenticated, notifications, workLogReminderState],
  );
  const {
    applyCommentThread,
    applyRemovedCommentThread,
    dataReady,
    refreshCurrentUserAccess,
    refreshPermissionRules,
    refreshReportsData,
    refreshTaskManagementData,
    refreshUsers,
  } = useOrfDataState({
    authReady,
    authUserId,
    currentUserRole,
    isApproved,
    isAuthenticated,
    loadReportsData,
    refreshNotifications,
    resetNotificationState,
    setReportsData,
    setState,
  });
  useEffect(() => {
    if (!authReady || !isAuthenticated || !isApproved) {
      setToastEnabled(true);
      return undefined;
    }

    let cancelled = false;
    const refreshPersonalPreferences = () => {
      void getUserPreferences({ userId: currentUser.id })
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
  }, [authReady, currentUser?.id, isApproved, isAuthenticated]);

  const dismissSystemBroadcast = useCallback((id: string) => {
    setSystemBroadcasts((items) => items.filter((item) => item.id !== id));
  }, []);

  const sendDesktopAttentionToastIntent = useCallback((toast: AttentionToastIntent, source: DesktopToastSource) => {
    const intent: DesktopToastIntent = {
      body: toast.body,
      eventId: `${source}:${toast.id}`,
      level: toast.level,
      sender: toast.sender,
      source,
      targetPath: toast.targetPath,
      title: toast.title,
    };
    void prepareDesktopNotificationAvatar(intent)
      .then(showDesktopToastIntent)
      .catch(() => showDesktopToastIntent(intent))
      .catch(() => undefined);
  }, []);

  const receiveRealtimeNotification = useCallback(
    (notification: AppNotification) => {
      receiveNotification(notification);
      const toastIntent = attentionToastIntentFromNotification({
        appAttentionState,
        currentPath,
        currentUserId: currentUser?.id,
        notification,
      });
      if (toastIntent) {
        sendDesktopAttentionToastIntent(toastIntent, "notification");
      }
    },
    [appAttentionState, currentPath, currentUser?.id, receiveNotification, sendDesktopAttentionToastIntent],
  );
  const receiveRealtimeBroadcast = useCallback((broadcast: SystemBroadcast) => {
    if (isClientUpdateSystemBroadcast(broadcast)) {
      return;
    }
    setSystemBroadcasts((items) => enqueueSystemBroadcast(items, broadcast));
  }, []);
  const receiveReadModelInvalidation = useCallback((invalidation: OrfReadModelInvalidation) => {
    setReadModelInvalidations((items) => [invalidation, ...items.filter((item) => item.id !== invalidation.id)].slice(0, 64));
  }, []);
  const receiveClientUpdateAvailable = useCallback((update: ClientUpdateAvailable) => {
    requestClientUpdateCheck({ releaseVersion: update.releaseVersion });
  }, []);
  const refreshWorkLogReminderState = useCallback(async () => {
    const response = await getWorkLogReminderState();
    setWorkLogReminderState(response.reminder);
  }, []);
  const snoozeWorkLogReminder = useCallback(async () => {
    const response = await snoozeWorkLogReminderRequest();
    setWorkLogReminderState(response.reminder);
  }, []);
  const refreshChatUnreadSummary = useCallback(async () => {
    const summary = await getChatUnreadSummary();
    setChatUnreadSummary(summary);
    return summary;
  }, []);
  const requestChatAttentionRealtimeReconciliationRef = useRef<() => void>(() => undefined);
  const reconcileChatAttentionState = useCallback(async () => {
    const settledRealtimeEventIds = new Set(chatRealtimeAttentionIntentsRef.current.map((intent) => intent.eventId));
    let synchronizedCursor: Awaited<ReturnType<typeof resolveChatSyncCheckpoint>> | null = null;
    if (currentUser?.id) {
      const storedCursor = readChatSyncCursor(currentUser.id);
      synchronizedCursor = await resolveChatSyncCheckpoint({ fetchPage: getChatSync, storedCursor });
    }
    await Promise.all([
      refreshChatUnreadSummary(),
      refreshNotifications(),
    ]);
    if (currentUser?.id && synchronizedCursor) {
      writeChatSyncCursor(currentUser.id, synchronizedCursor);
    }
    if (settledRealtimeEventIds.size > 0) {
      const remainingIntents = chatRealtimeAttentionIntentsRef.current.filter((intent) => !settledRealtimeEventIds.has(intent.eventId));
      chatRealtimeAttentionIntentsRef.current = remainingIntents;
      setChatRealtimeAttentionIntents(remainingIntents);
    }
  }, [currentUser?.id, refreshChatUnreadSummary, refreshNotifications]);
  const reserveChatNotification = useCallback((messageId: string) => {
    const messageIds = notifiedChatMessageIdsRef.current;
    if (messageIds.includes(messageId)) return false;
    messageIds.push(messageId);
    if (messageIds.length > 160) {
      messageIds.splice(0, messageIds.length - 160);
    }
    return true;
  }, []);
  const receiveRealtimeChatEvent = useCallback((event: ChatRealtimeEvent) => {
    publishChatRealtimeEvent(event);
    if (event.eventType === "typing") return;
    const viewState = getChatNativeNotificationViewState();
    const focus = {
      activeChannelId: viewState.activeChannelId ?? chatRouteChannelIdFromPathname(location.pathname),
      activeThreadRootMessageId: viewState.activeThreadRootMessageId,
      appFocused: appAttentionState.activelyViewed,
    };
    const attentionIntent = buildChatRealtimeAttentionIntent({
      currentUserId: currentUser?.id,
      event,
      focus,
    });
    if (attentionIntent) {
      const nextIntents = [
        attentionIntent,
        ...chatRealtimeAttentionIntentsRef.current.filter((intent) => intent.eventId !== attentionIntent.eventId),
      ].slice(0, 32);
      chatRealtimeAttentionIntentsRef.current = nextIntents;
      setChatRealtimeAttentionIntents(nextIntents);
    }
    const decision = buildChatNativeNotificationDecision({
      currentUserId: currentUser?.id,
      event,
      focus,
    });
    if (decision.action === "notify" && reserveChatNotification(decision.notification.messageId)) {
      void sendNativeChatNotification(decision.notification).catch(() => undefined);
    }
    requestChatAttentionRealtimeReconciliationRef.current();
  }, [appAttentionState.activelyViewed, currentUser?.id, location.pathname, reserveChatNotification]);

  const receiveWorkLogReminderRequired = useCallback((event: { reminder: WorkLogReminderState }) => {
    setWorkLogReminderState(event.reminder);
    const toastIntent = attentionToastIntentFromWorkLogReminder(event.reminder, {
      appAttentionState,
      currentPath,
    });
    if (toastIntent) {
      sendDesktopAttentionToastIntent(toastIntent, "worklog");
    }
  }, [appAttentionState, currentPath, sendDesktopAttentionToastIntent]);

  const receiveWorkLogReminderResolved = useCallback((event: { reminder: WorkLogReminderState }) => {
    setWorkLogReminderState(event.reminder);
  }, []);

  useEffect(() => subscribeNativeChatNotificationOpen((targetPath) => {
    if (isSafeChatNotificationTargetPath(targetPath)) {
      navigate(targetPath);
    }
  }), [navigate]);

  useEffect(() => subscribeDesktopTargetOpen((targetPath) => {
    navigate(targetPath);
  }), [navigate]);

  useEffect(() => {
    if (!authReady || !isAuthenticated || !isApproved) return;
    void prepareNativeChatNotifications().catch(() => undefined);
  }, [authReady, isApproved, isAuthenticated]);

  useEffect(() => {
    if (!authReady || !isAuthenticated || !isApproved) return;
    void registerOrfPushNotifications((targetPath) => {
      navigate(targetPath);
    }).catch(() => undefined);
  }, [authReady, isApproved, isAuthenticated, navigate]);

  const realtimeConnectionState = useRealtimeEvents({
    enabled: authReady && isAuthenticated && isApproved,
    onBroadcast: receiveRealtimeBroadcast,
    onChatEvent: receiveRealtimeChatEvent,
    onClientUpdateAvailable: receiveClientUpdateAvailable,
    onNotification: receiveRealtimeNotification,
    onReadModelInvalidation: receiveReadModelInvalidation,
    onWorkLogReminderRequired: receiveWorkLogReminderRequired,
    onWorkLogReminderResolved: receiveWorkLogReminderResolved,
  });
  const chatAttentionReconciliation = useRealtimeReconciliation({
    connected: realtimeConnectionState.status === "connected",
    connectionEpoch: realtimeConnectionState.connectionEpoch,
    enabled: authReady && isAuthenticated && isApproved,
    reconcile: reconcileChatAttentionState,
  });
  useEffect(() => {
    requestChatAttentionRealtimeReconciliationRef.current = () => {
      chatAttentionReconciliation.request("realtime-event");
    };
    return () => {
      requestChatAttentionRealtimeReconciliationRef.current = () => undefined;
    };
  }, [chatAttentionReconciliation.request]);
  const chatRealtimeRecoveryState = useMemo(
    () => buildChatRealtimeRecoveryState(realtimeConnectionState, chatAttentionReconciliation.state),
    [chatAttentionReconciliation.state, realtimeConnectionState],
  );

  useEffect(() => {
    if (!authReady || !isAuthenticated || !isApproved) return;
    const handleOnline = () => chatAttentionReconciliation.request("online");
    const handleFocus = () => chatAttentionReconciliation.request("focus");
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") chatAttentionReconciliation.request("visibility");
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [authReady, chatAttentionReconciliation.request, isApproved, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !isApproved) {
      setChatUnreadSummary(emptyChatUnreadSummary);
      chatRealtimeAttentionIntentsRef.current = [];
      setChatRealtimeAttentionIntents([]);
      setReadModelInvalidations([]);
      setSystemBroadcasts([]);
      setWorkLogReminderState(null);
    }
  }, [isApproved, isAuthenticated]);

  useEffect(() => {
    const payload = isAuthenticated && isApproved
      ? {
        badgeCount: attentionState.badgeCount,
        body: attentionState.body,
        count: attentionState.badgeCount,
        latestEventId: attentionState.latestEventId,
        latestTargetPath: attentionState.latestTargetPath,
        level: attentionState.level,
        reason: attentionState.reason,
        title: attentionState.title,
        workItemCount: attentionState.count,
      }
      : {
        badgeCount: 0,
        body: "",
        count: 0,
        latestEventId: null,
        latestTargetPath: null,
        level: "none" as const,
        reason: null,
        title: "ORF",
        workItemCount: 0,
      };
    void syncDesktopAttentionState(payload).catch(() => undefined);
  }, [attentionState, isApproved, isAuthenticated]);

  useEffect(() => {
    if (!authReady || !isAuthenticated || !isApproved) return;
    void refreshChatUnreadSummary().catch(() => undefined);
  }, [authReady, isApproved, isAuthenticated, refreshChatUnreadSummary]);

  useEffect(() => {
    if (!authReady || !isAuthenticated || !isApproved) return;
    void refreshWorkLogReminderState().catch(() => undefined);
  }, [authReady, isApproved, isAuthenticated, refreshWorkLogReminderState]);

  useEffect(() => {
    void refreshAuthSession();
  }, [refreshAuthSession]);

  useEffect(() => {
    const handleAuthenticationExpired = () => {
      if (authenticationExpiryConfirmationRef.current) {
        return;
      }

      authenticationExpiryConfirmationRef.current = confirmApiAuthenticationExpired()
        .then((result) => {
          if (result === "expired") {
            notify("登录已失效，请重新登录。");
          } else if (result === "unavailable") {
            notify("登录状态暂时无法确认，请稍后重试。");
          }
        })
        .finally(() => {
          authenticationExpiryConfirmationRef.current = null;
        });
    };

    window.addEventListener(API_AUTHENTICATION_EXPIRED_EVENT, handleAuthenticationExpired);
    return () => window.removeEventListener(API_AUTHENTICATION_EXPIRED_EVENT, handleAuthenticationExpired);
  }, [confirmApiAuthenticationExpired, notify]);

  const taskManagementInvalidationKey = useMemo(
    () => readModelInvalidationKey(readModelInvalidations, "taskManagement"),
    [readModelInvalidations],
  );
  const usersInvalidationKey = useMemo(
    () => readModelInvalidationKey(readModelInvalidations, "users", { excludeReasons: ["user.presence.changed"] }),
    [readModelInvalidations],
  );
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
    if (loadReportsData) void refreshReportsData().catch(() => undefined);
  }, [authReady, isApproved, isAuthenticated, loadReportsData, refreshReportsData, refreshTaskManagementData, taskManagementInvalidationKey]);

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
    beforeLogout: revokeOrfPushNotifications,
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
  const value = useMemo<OrfContextValue>(
    () => ({
      state,
      reportsData,
      currentUser,
      authConnectionError,
      authReady,
      dataReady,
      isAuthenticated,
      isApproved,
      isAdmin,
      attentionState,
      appAttentionState,
      modal,
      toasts,
      readModelInvalidations,
      systemBroadcasts,
      workLogReminderState,
      chatUnreadSummary,
      chatRealtimeRecoveryState,
      notifications,
      unreadNotificationCount,
      markAllNotificationsRead,
      markNotificationRead,
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
      refreshWorkLogReminderState,
      refreshNotifications,
      snoozeWorkLogReminder,
      ...objectiveActions,
      ...resultActions,
      ...taskActions,
      ...userActions,
      ...commentActions,
    }),
    [
      authConnectionError,
      authReady,
      attentionState,
      appAttentionState,
      chatUnreadSummary,
      chatRealtimeRecoveryState,
      commentActions,
      currentUser,
      dismissSystemBroadcast,
      isAdmin,
      isApproved,
      isAuthenticated,
      markAllNotificationsRead,
      markNotificationRead,
      modal,
      notifications,
      notify,
      objectiveActions,
      readModelInvalidations,
      reportsData,
      resultActions,
      refreshChatUnreadSummary,
      refreshWorkLogReminderState,
      refreshNotifications,
      refreshTaskManagementData,
      systemBroadcasts,
      snoozeWorkLogReminder,
      taskActions,
      toasts,
      unreadNotificationCount,
      workLogReminderState,
      userActions,
    ],
  );

  return (
    <OrfContext.Provider value={value}>
      {readModelSessionReady ? children : null}
      <GlobalWorkLogReminderModal
        reminder={workLogReminderState}
        onSnooze={snoozeWorkLogReminder}
      />
    </OrfContext.Provider>
  );
}

function isClientUpdateSystemBroadcast(broadcast: SystemBroadcast) {
  return broadcast.tone === "clientUpdate";
}

export function useOrf() {
  const context = useContext(OrfContext);
  if (!context) {
    throw new Error("useOrf must be used inside OrfProvider");
  }
  return context;
}
