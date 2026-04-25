import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { AIEvaluationPage } from "./pages/AIEvaluationPage";
import { DashboardPage } from "./pages/DashboardPage";
import { FeedbackDetailPage } from "./pages/FeedbackDetailPage";
import { FeedbackInboxPage } from "./pages/FeedbackInboxPage";
import { ObjectiveDetailPage } from "./pages/ObjectiveDetailPage";
import { ObjectivesPage } from "./pages/ObjectivesPage";
import { ReportsPage } from "./pages/ReportsPage";
import { ResultDetailPage } from "./pages/ResultDetailPage";
import { SettingsPage } from "./pages/SettingsPage";
import { StrategyMapPage } from "./pages/StrategyMapPage";
import { TasksPage } from "./pages/TasksPage";
import { WeeklyReviewPage } from "./pages/WeeklyReviewPage";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="objectives" element={<ObjectivesPage />} />
        <Route path="objectives/:objectiveId" element={<ObjectiveDetailPage />} />
        <Route path="objectives/:objectiveId/results/:resultId" element={<ResultDetailPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="feedback" element={<FeedbackInboxPage />} />
        <Route path="feedback/:feedbackId" element={<FeedbackDetailPage />} />
        <Route path="review" element={<WeeklyReviewPage />} />
        <Route path="strategy-map" element={<StrategyMapPage />} />
        <Route path="ai-evaluation" element={<AIEvaluationPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}
