import { Suspense, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { AppFallbackPage } from "./components/AppFallback";
import { Button } from "./components/ui";
import { canShowFrontend, canShowFrontendPath, type FrontendVisibilityKey } from "./config/frontendVisibility";
import { systemManagementPages } from "./config/navigation";
import { registeredWebModuleRoutes } from "./config/webModuleRegistry";
import { readLastWorkbenchLocationHref } from "./features/workbench-navigation";
import { useOrf } from "./state/OrfProvider";
import {
  AuthPage,
  BountyHallPage,
  ChallengePlanPage,
  ChatPage,
  DrivePage,
  LootSubmitPage,
  MembersPage,
  PermissionsPage,
  PersonalSettingsPage,
  ReportsPage,
  SystemManagementPage,
  SystemSettingsPage,
  WorkLogsPage,
} from "./routing/routeModules";

export function App() {
  return (
    <Routes>
      <Route path="auth" element={<AuthRoute />} />
      <Route element={<RequireAuth />}>
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
        {registeredWebModuleRoutes.map(({ id, Page, routePath }) => (
          <Route key={id} path={routePath} element={<LazyRoute><Page /></LazyRoute>} />
        ))}
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
      <div className="orf-surface-muted h-8 w-48 animate-pulse rounded-xl" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="orf-surface-muted h-28 animate-pulse rounded-2xl" />
        <div className="orf-surface-muted h-28 animate-pulse rounded-2xl" />
        <div className="orf-surface-muted h-28 animate-pulse rounded-2xl" />
      </div>
      <div className="orf-surface-muted h-64 animate-pulse rounded-2xl" />
    </div>
  );
}

function LazyRoute({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RoutePendingFallback />}>{children}</Suspense>;
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
