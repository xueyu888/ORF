import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { AppFallbackPage } from "./components/AppFallback";
import { Button } from "./components/ui";
import { canShowFrontend, canShowFrontendPath, type FrontendVisibilityKey } from "./config/frontendVisibility";
import { systemManagementPages } from "./config/navigation";
import { ChatImagePopoutPage } from "./features/chat/ChatFloatingImagePreview";
import { useOrf } from "./state/OrfProvider";

const AIEvaluationPage = lazyNamed(() => import("./pages/AIEvaluationPage"), "AIEvaluationPage");
const AuthPage = lazyNamed(() => import("./pages/AuthPage"), "AuthPage");
const BountyHallPage = lazyNamed(() => import("./pages/BountyHallPage"), "BountyHallPage");
const ChallengePlanPage = lazyNamed(() => import("./pages/TasksPage"), "ChallengePlanPage");
const ChatPage = lazyNamed(() => import("./pages/ChatPage"), "ChatPage");
const DashboardPage = lazyNamed(() => import("./pages/DashboardPage"), "DashboardPage");
const DrivePage = lazyNamed(() => import("./pages/DrivePage"), "DrivePage");
const FantasyUiPreviewPage = lazyNamed(() => import("./features/fantasy-ui"), "FantasyUiPreviewPage");
const FeedbackInboxPage = lazyNamed(() => import("./pages/FeedbackInboxPage"), "FeedbackInboxPage");
const FeedbackCreatePage = lazyNamed(() => import("./pages/FeedbackCreatePage"), "FeedbackCreatePage");
const FeedbackIssuePage = lazyNamed(() => import("./pages/FeedbackIssuePage"), "FeedbackIssuePage");
const FeedbackLabelsPage = lazyNamed(() => import("./pages/FeedbackLabelsPage"), "FeedbackLabelsPage");
const FeedbackMilestonesPage = lazyNamed(() => import("./pages/FeedbackMilestonesPage"), "FeedbackMilestonesPage");
const GenshinUIKitPreviewPage = lazyNamed(() => import("./features/genshin-ui-kit"), "GenshinUIKitPreviewPage");
const LootSubmitPage = lazyNamed(() => import("./pages/LootSubmitPage"), "LootSubmitPage");
const MembersPage = lazyNamed(() => import("./pages/MembersPage"), "MembersPage");
const PermissionsPage = lazyNamed(() => import("./pages/PermissionsPage"), "PermissionsPage");
const PersonalSettingsPage = lazyNamed(() => import("./pages/PersonalSettingsPage"), "PersonalSettingsPage");
const ReportsPage = lazyNamed(() => import("./pages/ReportsPage"), "ReportsPage");
const StrategyMapPage = lazyNamed(() => import("./pages/StrategyMapPage"), "StrategyMapPage");
const SystemManagementPage = lazyNamed(() => import("./pages/SystemManagementPage"), "SystemManagementPage");
const SystemSettingsPage = lazyNamed(() => import("./pages/SettingsPage"), "SystemSettingsPage");
const WorkLogsPage = lazyNamed(() => import("./pages/WorkLogsPage"), "WorkLogsPage");

export function App() {
  return (
    <Routes>
      <Route path="auth" element={<AuthRoute />} />
      <Route path="chat/image-popout/:popoutId" element={<ChatImagePopoutPage />} />
      <Route path="preview/genshin-ui-kit" element={<LazyRoute><GenshinUIKitPreviewPage /></LazyRoute>} />
      <Route element={<RequireAuth />}>
        <Route path="dashboard" element={<LazyRoute><DashboardPage /></LazyRoute>} />
        <Route path="bounties" element={<LazyRoute><BountyHallPage /></LazyRoute>} />
        <Route path="tasks" element={<LazyRoute><ChallengePlanPage /></LazyRoute>} />
        <Route path="work-logs" element={<LazyRoute><WorkLogsPage /></LazyRoute>} />
        <Route path="drive" element={<LazyRoute><DrivePage /></LazyRoute>} />
        <Route path="tasks/objectives/:objectiveId/loot" element={<LazyRoute><LootSubmitPage /></LazyRoute>} />
        <Route path="chat" element={<LazyRoute><ChatPage /></LazyRoute>} />
        <Route path="chat/system/:systemConversationId" element={<LazyRoute><ChatPage /></LazyRoute>} />
        <Route path="chat/:channelId" element={<LazyRoute><ChatPage /></LazyRoute>} />
        <Route path="fantasy-ui" element={<LazyRoute><FantasyUiPreviewPage /></LazyRoute>} />
        <Route path="genshin-ui-kit" element={<LazyRoute><GenshinUIKitPreviewPage /></LazyRoute>} />
        <Route path="feedback" element={<LazyRoute><FeedbackInboxPage /></LazyRoute>} />
        <Route path="feedback/new" element={<LazyRoute><FeedbackCreatePage /></LazyRoute>} />
        <Route path="feedback/labels" element={<LazyRoute><FeedbackLabelsPage /></LazyRoute>} />
        <Route path="feedback/milestones" element={<LazyRoute><FeedbackMilestonesPage /></LazyRoute>} />
        <Route path="feedback/:feedbackId" element={<LazyRoute><FeedbackIssuePage /></LazyRoute>} />
        <Route path="notifications" element={<Navigate to="/chat/system/personalNotifications" replace />} />
        <Route path="strategy-map" element={<LazyRoute><StrategyMapPage /></LazyRoute>} />
        <Route path="ai-evaluation" element={<LazyRoute><AIEvaluationPage /></LazyRoute>} />
        <Route path="reports" element={<LazyRoute><ReportsPage /></LazyRoute>} />
        <Route path="members" element={<Navigate to="/system/members" replace />} />
        <Route path="permissions" element={<Navigate to="/system/permissions" replace />} />
        <Route
          path="settings"
          element={
            <RequireFrontendVisibility visibilityKey="page.personalSettings">
              <LazyRoute><PersonalSettingsPage /></LazyRoute>
            </RequireFrontendVisibility>
          }
        />
        <Route path="settings/system" element={<Navigate to="/system/settings" replace />} />
        <Route
          path="system"
          element={
            <RequireFrontendVisibility visibilityKey="page.systemManagement">
              <LazyRoute><SystemManagementPage /></LazyRoute>
            </RequireFrontendVisibility>
          }
        >
          <Route index element={<SystemManagementIndexRedirect />} />
          <Route
            path="members"
            element={
              <RequireFrontendVisibility visibilityKey="page.systemMembers">
                <LazyRoute><MembersPage /></LazyRoute>
              </RequireFrontendVisibility>
            }
          />
          <Route
            path="permissions"
            element={
              <RequireFrontendVisibility visibilityKey="page.systemPermissions">
                <LazyRoute><PermissionsPage /></LazyRoute>
              </RequireFrontendVisibility>
            }
          />
          <Route
            path="settings"
            element={
              <RequireFrontendVisibility visibilityKey="page.systemSettings">
                <LazyRoute><SystemSettingsPage /></LazyRoute>
              </RequireFrontendVisibility>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/bounties" replace />} />
      </Route>
    </Routes>
  );
}

function AuthRoute() {
  const { authConnectionError, authReady, isAuthenticated, isApproved } = useOrf();
  if (authReady && !isAuthenticated && authConnectionError) {
    return <BackendUnavailableScreen detail={authConnectionError} />;
  }
  return authReady && isAuthenticated && isApproved ? <Navigate to="/bounties" replace /> : <LazyRoute><AuthPage /></LazyRoute>;
}

function RequireAuth() {
  const { authConnectionError, authReady, currentUser, isAuthenticated, isApproved, logout } = useOrf();
  if (!authReady) {
    return <AuthLoadingScreen />;
  }

  if (!isAuthenticated) {
    if (authConnectionError) {
      return <BackendUnavailableScreen detail={authConnectionError} />;
    }
    return <Navigate to="/auth" replace />;
  }

  if (!isApproved) {
    return <ApprovalPendingScreen status={currentUser?.status ?? "pending"} onLogout={logout} />;
  }

  return <AppShell />;
}

function BackendUnavailableScreen({ detail }: { detail: string }) {
  return (
    <AppFallbackPage
      title="无法连接后端服务"
      description="ORF 前端已经启动，但后端认证接口没有响应。请确认后端服务已启动，然后重新加载页面。"
      detail={detail}
    />
  );
}

function AuthLoadingScreen() {
  return (
    <main className="orf-auth-loading-page" role="status" aria-live="polite">
      <div className="orf-auth-loading-panel">
        <Loader2 className="h-7 w-7 animate-spin" />
        <div>
          <div className="orf-auth-loading-title">正在连接认证服务</div>
          <div className="orf-auth-loading-copy">如果这里停留过久，请确认后端服务已启动。</div>
        </div>
      </div>
    </main>
  );
}

function RouteLoadingScreen() {
  return (
    <div className="grid min-h-[40vh] place-items-center" role="status" aria-live="polite">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );
}

function LazyRoute({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteLoadingScreen />}>{children}</Suspense>;
}

function lazyNamed<TComponent extends ComponentType, TKey extends string>(
  loader: () => Promise<Record<TKey, TComponent>>,
  exportName: TKey,
) {
  return lazy(async () => ({ default: (await loader())[exportName] }));
}

function ApprovalPendingScreen({ onLogout, status }: { onLogout: () => void; status: string }) {
  const stateCopy = approvalStateCopy(status);

  return (
    <main className="orf-auth-loading-page" role="status" aria-live="polite">
      <div className="orf-auth-loading-panel">
        <div>
          <h1 className="orf-auth-loading-title">{stateCopy.title}</h1>
          <div className="orf-auth-loading-copy">{stateCopy.copy}</div>
        </div>
        <Button className="mt-4" type="button" variant="secondary" onClick={onLogout}>
          退出登录
        </Button>
      </div>
    </main>
  );
}

function approvalStateCopy(status: string) {
  if (status === "rejected") {
    return {
      title: "注册未通过",
      copy: "你的注册申请未通过。请联系管理员确认后再重新申请。",
    };
  }

  if (status === "disabled") {
    return {
      title: "账号已停用",
      copy: "你的账号已停用。请联系管理员恢复访问。",
    };
  }

  return {
    title: "等待注册审核",
    copy: "你的注册申请已提交，等待管理员审核通过后即可进入 ORF。",
  };
}

function RequireFrontendVisibility({ children, visibilityKey }: { children: ReactNode; visibilityKey: FrontendVisibilityKey }) {
  const { currentUser } = useOrf();
  return canShowFrontend(currentUser, visibilityKey) ? children : <Navigate to="/bounties" replace />;
}

function SystemManagementIndexRedirect() {
  const { currentUser } = useOrf();
  const target = systemManagementPages.find((item) => canShowFrontendPath(currentUser, item.path))?.path ?? "/bounties";
  return <Navigate to={target} replace />;
}
