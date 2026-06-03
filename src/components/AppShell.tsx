import { Loader2, Plus, Search, Shield } from "lucide-react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { type CSSProperties, useCallback, useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { Button } from "./ui";
import { CommandMenu } from "./CommandMenu";
import { GlobalModals } from "./GlobalModals";
import { NotificationBell } from "./NotificationBell";
import { Toasts } from "./Toasts";
import { breadcrumb } from "./appShellBreadcrumb";
import { toCssImageUrl } from "../config/assetLibrary";
import { hasPermission } from "../config/permissions";
import { canCreateFeedbackFromVisibleState } from "../features/feedback/model/feedbackCapabilities";
import { SystemBroadcastBanner } from "../features/notifications/components/SystemBroadcastBanner";
import { useVisualBackground } from "../hooks/useVisualBackground";
import { getUserPreferences, saveUserPreferences } from "../state/apiClient";
import { useOrf } from "../state/OrfProvider";

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, dismissSystemBroadcast, openModal, state, systemBroadcasts } = useOrf();
  const [commandOpen, setCommandOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const sidebarBackground = useVisualBackground("app_background");

  useEffect(() => {
    let cancelled = false;
    if (!currentUser) {
      return undefined;
    }

    void getUserPreferences()
      .then((preferences) => {
        if (!cancelled && preferences.sidebarCollapsed !== null) {
          setSidebarCollapsed(preferences.sidebarCollapsed);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  const handleSidebarCollapsedChange = useCallback((collapsed: boolean) => {
    setSidebarCollapsed(collapsed);
    void saveUserPreferences({ sidebarCollapsed: collapsed }).catch(() => undefined);
  }, []);

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
  const shellStyle = {
    "--orf-app-chrome-bg-image": toCssImageUrl(sidebarBackgroundUrl),
  } as CSSProperties;
  const canCreateObjective = hasPermission(currentUser, state.permissionRules, "objective.create");
  const canCreateFeedback = canCreateFeedbackFromVisibleState(state, currentUser);
  const isBountyHall = location.pathname.startsWith("/bounties");

  return (
    <div
      className="orf-app-shell flex min-h-screen"
      data-bounty-hall={isBountyHall ? "true" : "false"}
      data-sidebar-collapsed={sidebarCollapsed ? "true" : "false"}
      style={shellStyle}
    >
      <Sidebar
        backgroundUrl={sidebarBackgroundUrl}
        collapsed={sidebarCollapsed}
        onCollapsedChange={handleSidebarCollapsedChange}
        onCommand={() => setCommandOpen(true)}
      />
      <div className="orf-shell-body min-w-0 flex-1">
        <header className="orf-topbar orf-shell-x-padding sticky top-0 z-30 flex items-center gap-2">
          <div className="orf-topbar-title orf-text-primary min-w-[160px] font-semibold tracking-tight" role="heading" aria-level={1}>
            {isBountyHall && (
              <span className="orf-topbar-title-icon" aria-hidden="true">
                <Shield className="h-4 w-4" />
              </span>
            )}
            <span>{breadcrumb(location.pathname)}</span>
          </div>
          {!isBountyHall && (
            <>
              <div className="relative min-w-[180px] max-w-xl flex-1">
                <Search className="orf-text-muted pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
                <button
                  onClick={() => setCommandOpen(true)}
                  className="orf-search-trigger h-8 w-full pl-8 pr-3 text-left text-xs transition"
                >
                  搜索页面、行动项...
                </button>
              </div>
              {canCreateFeedback && <Button className="h-8 px-2.5 text-xs" variant="secondary" onClick={() => openModal({ type: "newFeedback" })}>
                <Plus className="h-4 w-4" />
                新建反馈
              </Button>}
            </>
          )}
          <div className="orf-topbar-actions ml-auto flex shrink-0 items-center gap-1.5">
            {canCreateObjective && (
              <Button className="h-8 px-2.5 text-xs" onClick={() => navigate("/tasks?create=objective")}>
                <Plus className="h-4 w-4" />
                新建目标
              </Button>
            )}
            <NotificationBell />
          </div>
        </header>
        <SystemBroadcastBanner broadcasts={systemBroadcasts} onDismiss={dismissSystemBroadcast} />
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
