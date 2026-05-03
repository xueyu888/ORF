import { Lock, Play, Plus, Search } from "lucide-react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { Button } from "./ui";
import { CommandMenu } from "./CommandMenu";
import { GlobalModals } from "./GlobalModals";
import { Toasts } from "./Toasts";
import { useOrf } from "../state/OrfProvider";
import { initials } from "../utils/format";

const titleMap: Record<string, string> = {
  dashboard: "ORF 仪表盘",
  objectives: "目标",
  tasks: "计划",
  "fantasy-ui": "Fantasy UI",
  feedback: "反馈",
  review: "周复盘",
  "strategy-map": "策略地图",
  "ai-evaluation": "AI 评估",
  reports: "统计",
  permissions: "权限管理",
  settings: "设置",
};

function breadcrumb(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) {
    return "仪表盘";
  }

  return parts.map((part) => titleMap[part] ?? part).join(" / ");
}

export function AppShell() {
  const location = useLocation();
  const { currentUser, isAdmin, openModal } = useOrf();
  const [commandOpen, setCommandOpen] = useState(false);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="orf-app-shell flex min-h-screen">
      <Sidebar onCommand={() => setCommandOpen(true)} />
      <div className="min-w-0 flex-1">
        <header className="orf-topbar orf-shell-x-padding sticky top-0 z-30 flex items-center gap-3 border-b orf-border">
          <div className="orf-text-primary min-w-[180px] text-2xl font-semibold tracking-tight">{breadcrumb(location.pathname)}</div>
          <div className="relative min-w-[180px] max-w-xl flex-1">
            <Search className="orf-text-muted pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
            <button
              onClick={() => setCommandOpen(true)}
              className="orf-search-trigger h-10 w-full pl-9 pr-3 text-left text-sm transition"
            >
              搜索目标、结果、任务、反馈...
            </button>
          </div>
          <Button variant="secondary" onClick={() => openModal({ type: "newFeedback" })}>
            <Plus className="h-4 w-4" />
            新建反馈
          </Button>
          <Button onClick={() => openModal({ type: "newObjective" })}>
            <Plus className="h-4 w-4" />
            新建目标
          </Button>
          {isAdmin && (
            <Link to="/permissions" className="orf-muted-icon-button inline-flex h-10 w-10 items-center justify-center transition" aria-label="权限" title="权限">
              <Lock className="h-5 w-5" />
            </Link>
          )}
          <button className="orf-solid-icon-button inline-flex h-10 w-10 items-center justify-center transition" type="button" aria-label="演示">
            <Play className="h-5 w-5 fill-current" />
          </button>
          <div className="orf-user-avatar flex h-10 w-10 items-center justify-center orf-status-tag border-2 text-xs font-bold" title={currentUser?.name}>
            {initials(currentUser?.name ?? "User")}
          </div>
        </header>
        <main className="orf-main-content">
          <Outlet />
        </main>
      </div>
      <CommandMenu open={commandOpen} onClose={() => setCommandOpen(false)} />
      <GlobalModals />
      <Toasts />
    </div>
  );
}
