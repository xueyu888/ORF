import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { AppFallbackPage } from "./components/AppFallback";
import { Button } from "./components/ui";
import { canShowFrontend, canShowFrontendPath, type FrontendVisibilityKey } from "./config/frontendVisibility";
import { systemManagementPages } from "./config/navigation";
import developmentRoutes from "./config/developmentRoutes.json";
import { ChatImagePopoutPage } from "./features/chat/ChatFloatingImagePreview";
import { DriveFilePreviewPopoutPage } from "./features/drive/DriveFilePreview";
import { readLastWorkbenchLocationHref } from "./features/workbench-navigation";
import { useOrf } from "./state/OrfProvider";
import {
  AuthPage,
  BountyHallPage,
  ChallengePlanPage,
  ChatPage,
  DrivePage,
  FeedbackCreatePage,
  FeedbackInboxPage,
  FeedbackIssuePage,
  FeedbackLabelsPage,
  LootSubmitPage,
  MembersPage,
  PermissionsPage,
  PersonalSettingsPage,
  ReportsPage,
  SystemManagementPage,
  SystemSettingsPage,
  WorkLogsPage,
} from "./routing/routeModules";

// These pages are implementation/design references, not committed production products.
// Keeping the imports behind Vite's compile-time DEV flag prevents production bundles
// from publishing either the routes or their page chunks.
const developmentOnlyPages = import.meta.env.DEV
  ? {
      AIEvaluationPage: lazyDevelopmentPage(() => import("./pages/AIEvaluationPage"), "AIEvaluationPage"),
      DashboardPage: lazyDevelopmentPage(() => import("./pages/DashboardPage"), "DashboardPage"),
      FantasyUiPreviewPage: lazyDevelopmentPage(() => import("./features/fantasy-ui"), "FantasyUiPreviewPage"),
      GenshinUIKitPreviewPage: lazyDevelopmentPage(() => import("./features/genshin-ui-kit"), "GenshinUIKitPreviewPage"),
      StrategyMapPage: lazyDevelopmentPage(() => import("./pages/StrategyMapPage"), "StrategyMapPage"),
    }
  : null;

export function App() {
  return (
    <Routes>
      <Route path="auth" element={<AuthRoute />} />
      <Route path="chat/image-popout/:popoutId" element={<ChatImagePopoutPage />} />
      <Route path="drive/file-preview-popout/:popoutId" element={<DriveFilePreviewPopoutPage />} />
      {developmentOnlyPages && (
        <Route path={relativeRoutePath(developmentRoutes.genshinUiKitPreview)} element={<LazyRoute><developmentOnlyPages.GenshinUIKitPreviewPage /></LazyRoute>} />
      )}
      <Route element={<RequireAuth />}>
        {developmentOnlyPages && (
          <>
            <Route path={relativeRoutePath(developmentRoutes.dashboard)} element={<LazyRoute><developmentOnlyPages.DashboardPage /></LazyRoute>} />
            <Route path={relativeRoutePath(developmentRoutes.fantasyUi)} element={<LazyRoute><developmentOnlyPages.FantasyUiPreviewPage /></LazyRoute>} />
            <Route path={relativeRoutePath(developmentRoutes.genshinUiKit)} element={<LazyRoute><developmentOnlyPages.GenshinUIKitPreviewPage /></LazyRoute>} />
            <Route path={relativeRoutePath(developmentRoutes.strategyMap)} element={<LazyRoute><developmentOnlyPages.StrategyMapPage /></LazyRoute>} />
            <Route path={relativeRoutePath(developmentRoutes.aiEvaluation)} element={<LazyRoute><developmentOnlyPages.AIEvaluationPage /></LazyRoute>} />
          </>
        )}
        <Route path="bounties" element={<LazyRoute><BountyHallPage /></LazyRoute>} />
        <Route path="tasks" element={<LazyRoute><ChallengePlanPage /></LazyRoute>} />
        <Route path="work-logs" element={<LazyRoute><WorkLogsPage /></LazyRoute>} />
        <Route path="drive" element={<Navigate to="/resources" replace />} />
        <Route path="resources" element={<LazyRoute><DrivePage /></LazyRoute>} />
        <Route path="resources/:nodeId" element={<LazyRoute><DrivePage /></LazyRoute>} />
        <Route path="resources/:nodeId/preview" element={<LazyRoute><DrivePage /></LazyRoute>} />
        <Route path="tasks/objectives/:objectiveId/loot" element={<LazyRoute><LootSubmitPage /></LazyRoute>} />
        <Route path="chat" element={<LazyRoute><ChatPage /></LazyRoute>} />
        <Route path="chat/system/:systemConversationId" element={<LazyRoute><ChatPage /></LazyRoute>} />
        <Route path="chat/:channelId" element={<LazyRoute><ChatPage /></LazyRoute>} />
        <Route path="feedback" element={<LazyRoute><FeedbackInboxPage /></LazyRoute>} />
        <Route path="feedback/new" element={<LazyRoute><FeedbackCreatePage /></LazyRoute>} />
        <Route path="feedback/labels" element={<LazyRoute><FeedbackLabelsPage /></LazyRoute>} />
        <Route path="feedback/:feedbackId" element={<LazyRoute><FeedbackIssuePage /></LazyRoute>} />
        <Route path="notifications" element={<Navigate to="/chat/system/personalNotifications" replace />} />
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
  const { authConnectionError, authReady, currentUser, isAuthenticated, isApproved } = useOrf();
  if (authReady && !isAuthenticated && authConnectionError) {
    return <BackendUnavailableScreen detail={authConnectionError} />;
  }
  const lastWorkbenchHref = readLastWorkbenchLocationHref(currentUser?.id);
  return authReady && isAuthenticated && isApproved ? <Navigate to={lastWorkbenchHref ?? "/bounties"} replace /> : <LazyRoute><AuthPage /></LazyRoute>;
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

function RoutePendingFallback() {
  return (
    <div className="mx-auto grid min-h-[40vh] w-full max-w-6xl content-start gap-4 px-6 py-8" role="status" aria-live="polite">
      <span className="sr-only">正在准备页面</span>
      <div className="h-8 w-48 animate-pulse rounded-xl bg-white/10" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="h-28 animate-pulse rounded-2xl bg-white/8" />
        <div className="h-28 animate-pulse rounded-2xl bg-white/8" />
        <div className="h-28 animate-pulse rounded-2xl bg-white/8" />
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-white/8" />
    </div>
  );
}

function LazyRoute({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RoutePendingFallback />}>{children}</Suspense>;
}

function lazyDevelopmentPage<TExport extends string, TComponent extends ComponentType>(
  loader: () => Promise<Record<TExport, TComponent>>,
  exportName: TExport,
) {
  return lazy(async () => ({ default: (await loader())[exportName] }));
}

function relativeRoutePath(path: string) {
  return path.replace(/^\//, "");
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
