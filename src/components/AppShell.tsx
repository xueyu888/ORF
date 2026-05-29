import { Loader2, Plus, Search, Shield } from "lucide-react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { type CSSProperties, useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { Button } from "./ui";
import { CommandMenu } from "./CommandMenu";
import { GlobalModals } from "./GlobalModals";
import { NotificationBell } from "./NotificationBell";
import { Toasts } from "./Toasts";
import { breadcrumb } from "./appShellBreadcrumb";
import { orfAssetLibrary, toCssImageUrl } from "../config/assetLibrary";
import { hasPermission } from "../config/permissions";
import { canCreateFeedbackFromVisibleState } from "../features/feedback/model/feedbackCapabilities";
import { useVisualBackground } from "../hooks/useVisualBackground";
import { useOrf } from "../state/OrfProvider";

function appShellBackgroundUrlFor(sidebarBackgroundUrl: string) {
  const background = orfAssetLibrary.appShell.nikeExtendedBackground;
  return sidebarBackgroundUrl.endsWith(background.sourceSidebarUrl) ? background.src : null;
}

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, openModal, state } = useOrf();
  const [commandOpen, setCommandOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const sidebarBackground = useVisualBackground("app_background");

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

  if (sidebarBackground.status === "error") {
    throw sidebarBackground.error;
  }
  if (sidebarBackground.status === "loading") {
    return <AppShellBackgroundLoading />;
  }

  const sidebarBackgroundUrl = sidebarBackground.url;
  const appShellBackgroundUrl = appShellBackgroundUrlFor(sidebarBackgroundUrl);
  const shellStyle = {
    "--orf-app-shell-bg-image": appShellBackgroundUrl ? toCssImageUrl(appShellBackgroundUrl) : "none",
  } as CSSProperties;
  const canCreateObjective = hasPermission(currentUser, state.permissionRules, "objective.create");
  const canCreateFeedback = canCreateFeedbackFromVisibleState(state, currentUser);
  const isBountyHall = location.pathname.startsWith("/bounties");

  return (
    <div
      className="orf-app-shell flex min-h-screen"
      data-sidebar-collapsed={sidebarCollapsed ? "true" : "false"}
      data-unified-background={appShellBackgroundUrl ? "true" : "false"}
      style={shellStyle}
    >
      <Sidebar
        backgroundUrl={sidebarBackgroundUrl}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        onCommand={() => setCommandOpen(true)}
        unifiedBackgroundUrl={appShellBackgroundUrl}
      />
      <div className="orf-shell-body min-w-0 flex-1">
        <header className="orf-topbar orf-shell-x-padding sticky top-0 z-30 flex items-center gap-3 border-b orf-border">
          <div className="orf-topbar-title orf-text-primary min-w-[180px] text-2xl font-semibold tracking-tight" role="heading" aria-level={1}>
            {isBountyHall && (
              <span className="orf-topbar-title-icon" aria-hidden="true">
                <Shield className="h-5 w-5" />
              </span>
            )}
            <span>{breadcrumb(location.pathname)}</span>
          </div>
          {!isBountyHall && (
            <>
              <div className="relative min-w-[180px] max-w-xl flex-1">
                <Search className="orf-text-muted pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                <button
                  onClick={() => setCommandOpen(true)}
                  className="orf-search-trigger h-10 w-full pl-9 pr-3 text-left text-sm transition"
                >
                  搜索目标、指标、行动项、反馈...
                </button>
              </div>
              {canCreateFeedback && <Button variant="secondary" onClick={() => openModal({ type: "newFeedback" })}>
                <Plus className="h-4 w-4" />
                新建反馈
              </Button>}
            </>
          )}
          <div className="orf-topbar-actions ml-auto flex shrink-0 items-center gap-2">
            {canCreateObjective && (
              <Button onClick={() => navigate("/tasks?create=objective")}>
                <Plus className="h-4 w-4" />
                新建目标
              </Button>
            )}
            <NotificationBell />
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

function AppShellBackgroundLoading() {
  return (
    <main className="orf-auth-loading-page" role="status" aria-live="polite">
      <div className="orf-auth-loading-panel">
        <Loader2 className="h-7 w-7 animate-spin" />
        <div>
          <div className="orf-auth-loading-title">正在加载视觉背景</div>
          <div className="orf-auth-loading-copy">侧边栏背景图片加载完成后进入系统。</div>
        </div>
      </div>
    </main>
  );
}
