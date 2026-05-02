import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { AIEvaluationPage } from "./pages/AIEvaluationPage";
import { AuthPage } from "./pages/AuthPage";
import { DashboardPage } from "./pages/DashboardPage";
import { FeedbackDetailPage } from "./pages/FeedbackDetailPage";
import { FeedbackInboxPage } from "./pages/FeedbackInboxPage";
import { FantasyUiPreviewPage } from "./pages/FantasyUiPreviewPage";
import { ObjectiveDetailPage } from "./pages/ObjectiveDetailPage";
import { ObjectivesPage } from "./pages/ObjectivesPage";
import { PermissionsPage } from "./pages/PermissionsPage";
import { ReportsPage } from "./pages/ReportsPage";
import { ResultDetailPage } from "./pages/ResultDetailPage";
import { SettingsPage } from "./pages/SettingsPage";
import { StrategyMapPage } from "./pages/StrategyMapPage";
import { TasksPage } from "./pages/TasksPage";
import { WeeklyReviewPage } from "./pages/WeeklyReviewPage";
import { useOrf } from "./state/OrfProvider";

export function App() {
  return (
    <Routes>
      <Route path="auth" element={<AuthRoute />} />
      <Route element={<RequireAuth />}>
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="objectives" element={<ObjectivesPage />} />
        <Route path="objectives/:objectiveId" element={<ObjectiveDetailPage />} />
        <Route path="objectives/:objectiveId/results/:resultId" element={<ResultDetailPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="fantasy-ui" element={<FantasyUiPreviewPage />} />
        <Route path="feedback" element={<FeedbackInboxPage />} />
        <Route path="feedback/:feedbackId" element={<FeedbackDetailPage />} />
        <Route path="review" element={<WeeklyReviewPage />} />
        <Route path="strategy-map" element={<StrategyMapPage />} />
        <Route path="ai-evaluation" element={<AIEvaluationPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route
          path="permissions"
          element={
            <RequireAdmin>
              <PermissionsPage />
            </RequireAdmin>
          }
        />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/tasks" replace />} />
      </Route>
    </Routes>
  );
}

function AuthRoute() {
  const { isAuthenticated } = useOrf();
  return isAuthenticated ? <Navigate to="/tasks" replace /> : <AuthPage />;
}

function RequireAuth() {
  const { isAuthenticated } = useOrf();
  return isAuthenticated ? <AppShell /> : <Navigate to="/auth" replace />;
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin } = useOrf();
  return isAdmin ? children : <Navigate to="/tasks" replace />;
}
