import { Bell, Moon, Plus, Search, Sun } from "lucide-react";
import { Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { Button, IconButton } from "./ui";
import { CommandMenu } from "./CommandMenu";
import { GlobalModals } from "./GlobalModals";
import { Toasts } from "./Toasts";
import { useOrf } from "../state/OrfProvider";

const titleMap: Record<string, string> = {
  dashboard: "ORF 仪表盘",
  objectives: "目标",
  tasks: "任务",
  feedback: "反馈",
  review: "周复盘",
  "strategy-map": "策略地图",
  "ai-evaluation": "AI 评估",
  reports: "汇报",
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
  const { openModal, theme, toggleTheme } = useOrf();
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
        <header className="orf-topbar sticky top-0 z-30 flex h-16 items-center gap-4 border-b orf-border px-6 backdrop-blur-xl">
          <div className="orf-text-secondary min-w-[220px] text-sm">{breadcrumb(location.pathname)}</div>
          <div className="relative max-w-xl flex-1">
            <Search className="orf-text-muted pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
            <button
              onClick={() => setCommandOpen(true)}
              className="orf-input orf-text-muted h-9 rounded-md pl-9 pr-3 text-left text-sm"
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
          <IconButton icon={Bell} label="通知" />
          <IconButton icon={theme === "dark" ? Sun : Moon} label={theme === "dark" ? "切换亮色主题" : "切换暗色主题"} onClick={toggleTheme} />
          <div className="orf-accent-soft orf-accent-border flex h-9 w-9 items-center justify-center rounded-full border text-xs font-semibold">AC</div>
        </header>
        <main className="px-6 py-6">
          <Outlet />
        </main>
      </div>
      <CommandMenu open={commandOpen} onClose={() => setCommandOpen(false)} />
      <GlobalModals />
      <Toasts />
    </div>
  );
}
