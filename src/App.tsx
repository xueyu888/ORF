import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { canShowFrontend, type FrontendVisibilityKey } from "./config/frontendVisibility";
import { AIEvaluationPage } from "./pages/AIEvaluationPage";
import { AuthPage } from "./pages/AuthPage";
import { BountyHallPage } from "./pages/BountyHallPage";
import { DashboardPage } from "./pages/DashboardPage";
import { FeedbackDetailPage } from "./pages/FeedbackDetailPage";
import { FeedbackInboxPage } from "./pages/FeedbackInboxPage";
import { FantasyUiPreviewPage } from "./features/fantasy-ui";
import { GenshinUIKitPreviewPage } from "./features/genshin-ui-kit";
import { LootSubmitPage } from "./pages/LootSubmitPage";
import { MembersPage } from "./pages/MembersPage";
import { ObjectiveDetailPage } from "./pages/ObjectiveDetailPage";
import { ObjectivesPage } from "./pages/ObjectivesPage";
import { PermissionsPage } from "./pages/PermissionsPage";
import { ReportsPage } from "./pages/ReportsPage";
import { ResultDetailPage } from "./pages/ResultDetailPage";
import { SettingsPage } from "./pages/SettingsPage";
import { StrategyMapPage } from "./pages/StrategyMapPage";
import { ChallengePlanPage } from "./pages/TasksPage";
import { useOrf } from "./state/OrfProvider";

export function App() {
  return (
    <Routes>
      <Route path="auth" element={<AuthRoute />} />
      <Route path="preview/genshin-ui-kit" element={<GenshinUIKitPreviewPage />} />
      <Route element={<RequireAuth />}>
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="bounties" element={<BountyHallPage />} />
        <Route path="objectives" element={<ObjectivesPage />} />
        <Route path="objectives/:objectiveId" element={<ObjectiveDetailPage />} />
        <Route path="objectives/:objectiveId/results/:resultId" element={<ResultDetailPage />} />
        <Route path="tasks" element={<ChallengePlanPage />} />
        <Route path="objectives/:objectiveId/loot" element={<LootSubmitPage />} />
        <Route path="fantasy-ui" element={<FantasyUiPreviewPage />} />
        <Route path="genshin-ui-kit" element={<GenshinUIKitPreviewPage />} />
        <Route path="feedback" element={<FeedbackInboxPage />} />
        <Route path="feedback/:feedbackId" element={<FeedbackDetailPage />} />
        <Route path="strategy-map" element={<StrategyMapPage />} />
        <Route path="ai-evaluation" element={<AIEvaluationPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route
          path="members"
          element={
            <RequireFrontendVisibility visibilityKey="page.members">
              <MembersPage />
            </RequireFrontendVisibility>
          }
        />
        <Route
          path="permissions"
          element={
            <RequireFrontendVisibility visibilityKey="page.permissions">
              <PermissionsPage />
            </RequireFrontendVisibility>
          }
        />
        <Route
          path="settings"
          element={
            <RequireFrontendVisibility visibilityKey="page.settings">
              <SettingsPage />
            </RequireFrontendVisibility>
          }
        />
        <Route path="*" element={<Navigate to="/bounties" replace />} />
      </Route>
    </Routes>
  );
}

function AuthRoute() {
  const { authReady, isAuthenticated, isApproved } = useOrf();
  return authReady && isAuthenticated && isApproved ? <Navigate to="/bounties" replace /> : <AuthPage />;
}

function RequireAuth() {
  const { authReady, currentUser, isAuthenticated, isApproved, logout } = useOrf();
  if (!authReady) {
    return <AuthLoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  if (!isApproved) {
    return <ApprovalPendingScreen status={currentUser?.status ?? "pending"} onLogout={logout} />;
  }

  return <AppShell />;
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

function ApprovalPendingScreen({ onLogout, status }: { onLogout: () => void; status: string }) {
  const stateCopy = approvalStateCopy(status);

  return (
    <main className="orf-auth-loading-page" role="status" aria-live="polite">
      <div className="orf-auth-loading-panel">
        <div>
          <h1 className="orf-auth-loading-title">{stateCopy.title}</h1>
          <div className="orf-auth-loading-copy">{stateCopy.copy}</div>
        </div>
        <button className="orf-control orf-secondary-action mt-4 inline-flex justify-center border px-4 py-2 text-sm font-medium" type="button" onClick={onLogout}>
          退出登录
        </button>
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
