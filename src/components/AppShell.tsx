import { Flag, MessageSquarePlus, Search, Shield } from "lucide-react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { type CSSProperties, useCallback, useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { Button } from "./ui";
import { CommandMenu } from "./CommandMenu";
import { GlobalModals } from "./GlobalModals";
import { MobileBottomNav } from "./MobileBottomNav";
import { NotificationBell } from "./NotificationBell";
import { Toasts } from "./Toasts";
import { breadcrumb } from "./appShellBreadcrumb";
import { orfAssetLibrary, toCssImageUrl } from "../config/assetLibrary";
import { hasPermission } from "../config/permissions";
import { canCreateFeedbackFromVisibleState } from "../features/feedback/model/feedbackCapabilities";
import { SystemBroadcastBanner } from "../features/notifications/components/SystemBroadcastBanner";
import { ClientUpdateNotice } from "../features/client-updates/ClientUpdateNotice";
import { ClientReleaseNotesDialog } from "../features/client-updates/ClientReleaseNotesDialog";
import { DesktopWindowControls } from "../features/desktop/DesktopWindowControls";
import { isDesktopShellAvailable } from "../features/desktop/desktopShellRuntime";
import { useVisualBackground } from "../hooks/useVisualBackground";
import { defaultChatTheme, type ChatTheme } from "../domain/settings/personalPreferences";
import { getUserPreferences, saveUserPreferences } from "../state/apiClient";
import { useOrf } from "../state/OrfProvider";
import { subscribePersonalPreferencesChanged } from "../utils/personalPreferences";

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, dismissSystemBroadcast, openModal, state, systemBroadcasts } = useOrf();
  const [commandOpen, setCommandOpen] = useState(false);
  const [desktopChromeEnabled, setDesktopChromeEnabled] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [chatTheme, setChatTheme] = useState<ChatTheme>(defaultChatTheme);
  const sidebarBackground = useVisualBackground("app_background");

  useEffect(() => {
    setDesktopChromeEnabled(isDesktopShellAvailable());
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!currentUser) {
      setSidebarCollapsed(false);
      setChatTheme(defaultChatTheme);
      return undefined;
    }

    const refreshPreferences = () => {
      void getUserPreferences()
        .then((preferences) => {
          if (!cancelled) {
            setSidebarCollapsed(preferences.sidebarCollapsed ?? false);
            setChatTheme(preferences.chatTheme);
          }
        })
        .catch(() => undefined);
    };

    refreshPreferences();
    const unsubscribe = subscribePersonalPreferencesChanged(refreshPreferences);

    return () => {
      cancelled = true;
      unsubscribe();
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

  const sidebarBackgroundUrl =
    sidebarBackground.status === "ready" ? sidebarBackground.url : orfAssetLibrary.sidebar.characterGuideBackground.src;
  const shellStyle = {
    "--orf-app-chrome-bg-image": toCssImageUrl(sidebarBackgroundUrl),
  } as CSSProperties;
  const canCreateObjective = hasPermission(currentUser, state.permissionRules, "objective.create");
  const canCreateFeedback = canCreateFeedbackFromVisibleState(state, currentUser);
  const isBountyHall = location.pathname.startsWith("/bounties");
  const isChatPage = location.pathname.startsWith("/chat");

  return (
    <div
      className="orf-app-shell flex min-h-screen"
      data-bounty-hall={isBountyHall ? "true" : "false"}
      data-chat-page={isChatPage ? "true" : "false"}
      data-chat-theme={chatTheme}
      data-desktop-chrome={desktopChromeEnabled ? "true" : "false"}
      data-sidebar-collapsed={sidebarCollapsed ? "true" : "false"}
      style={shellStyle}
    >
      <Sidebar
        backgroundUrl={sidebarBackgroundUrl}
        collapsed={sidebarCollapsed}
        onCollapsedChange={handleSidebarCollapsedChange}
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
          <div className="relative min-w-[180px] max-w-xl flex-1">
            <Search className="orf-text-muted pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
            <button
              onClick={() => setCommandOpen(true)}
              className="orf-search-trigger h-8 w-full pl-8 pr-3 text-left text-xs transition"
              aria-label="搜索页面、目标、指标、任务、反馈"
            >
              <span className="orf-search-trigger-label">搜索页面、目标、指标、任务、反馈</span>
            </button>
          </div>
          {!isBountyHall && canCreateFeedback && (
            <Button className="orf-topbar-action-button h-8 px-2.5 text-xs" variant="secondary" onClick={() => openModal({ type: "newFeedback" })}>
              <MessageSquarePlus className="h-4 w-4" />
              新建反馈
            </Button>
          )}
          <div className="orf-topbar-actions ml-auto flex shrink-0 items-center gap-1.5">
            {canCreateObjective && (
              <Button className="orf-topbar-action-button h-8 px-2.5 text-xs" onClick={() => navigate("/tasks?create=objective")}>
                <Flag className="h-4 w-4" />
                新建目标
              </Button>
            )}
            <NotificationBell />
            <DesktopWindowControls enabled={desktopChromeEnabled} />
          </div>
        </header>
        <SystemBroadcastBanner broadcasts={systemBroadcasts} onDismiss={dismissSystemBroadcast} />
        <ClientUpdateNotice />
        <main className="orf-main-content">
          <Outlet />
        </main>
      </div>
      <CommandMenu open={commandOpen} onClose={() => setCommandOpen(false)} />
      <MobileBottomNav />
      <ClientReleaseNotesDialog />
      <GlobalModals />
      <Toasts />
    </div>
  );
}
