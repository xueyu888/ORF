import { Flag, MessageSquarePlus, Search, Shield } from "lucide-react";
import { Outlet, useLocation } from "react-router-dom";
import { type CSSProperties, useCallback, useEffect, useState } from "react";
import { canCreateTeamFeedback } from "@orf/feedback-module/web";
import { Sidebar } from "./Sidebar";
import { VisualBackgroundSlot } from "./VisualBackgroundSlot";
import { Button } from "./ui";
import { CommandMenu } from "./CommandMenu";
import { GlobalModals } from "./GlobalModals";
import { MobileBottomNav } from "./MobileBottomNav";
import { Toasts } from "./Toasts";
import { breadcrumb } from "./appShellBreadcrumb";
import { orfAssetLibrary } from "../config/assetLibrary";
import { hasPermission } from "../config/permissions";
import { pageVisualBackgroundSceneForPath } from "../config/visualSkinSlots";
import { requiredWebModuleAction } from "../config/webModuleRegistry";
import { SystemBroadcastBanner } from "../features/notifications/components/SystemBroadcastBanner";
import { ClientUpdateCenterDialog } from "../features/client-updates/ClientUpdateCenterDialog";
import { ClientUpdateNotice } from "../features/client-updates/ClientUpdateNotice";
import { clientUpdateCenterOpenEvent, type ClientUpdateCenterOpenRequest } from "../features/client-updates/clientUpdateCenterEvents";
import { ClientReleaseNotesDialog } from "../features/client-updates/ClientReleaseNotesDialog";
import { DesktopWindowControls } from "../features/desktop/DesktopWindowControls";
import { ChatFloatingImagePreviewProvider } from "../features/chat/ChatFloatingImagePreview";
import { isDesktopShellAvailable, setDesktopWorkbenchZoomLevel } from "../features/desktop/desktopShellRuntime";
import { applyDisplayPreferencesToDocument, nextWorkbenchZoomLevel } from "../features/display/displayPreferences";
import { WorkbenchNavigationControls, WorkbenchNavigationProvider, useWorkbenchNavigation } from "../features/workbench-navigation";
import { useHorizontalPanelResize } from "../hooks/useHorizontalPanelResize";
import { useVisualBackground } from "../hooks/useVisualBackground";
import {
  defaultChatTheme,
  defaultUserDisplayPreferences,
  normalizeSidebarWidth,
  sidebarLayoutLimits,
  type ChatTheme,
  type UserDisplayPreferences,
} from "../domain/settings/personalPreferences";
import {
  defaultVisualBackgroundCrop,
  defaultVisualBackgroundOverlayOpacity,
} from "../domain/settings/visualBackgrounds";
import { getUserPreferences, saveUserPreferences } from "../state/apiClient";
import { useOrf } from "../state/OrfProvider";
import { dispatchPersonalPreferencesChanged, subscribePersonalPreferencesChanged } from "../utils/personalPreferences";
import type { VisualBackgroundSelection } from "../utils/visualBackgrounds";
import { preloadProductionRouteExperience } from "../routing/routePreload";

const shellMainMinimumWidthPx = 640;
const feedbackCreatePath = requiredWebModuleAction("feedback", "createPath");

function clampShellSidebarWidth(width: number, viewportWidth: number) {
  const { min, max } = sidebarLayoutLimits.expandedWidthPx;
  const availableMax = Math.max(min, Math.min(max, viewportWidth - shellMainMinimumWidthPx));
  return Math.round(Math.min(Math.max(width, min), availableMax));
}

export function AppShell() {
  const { currentUser } = useOrf();
  return (
    <WorkbenchNavigationProvider currentUserId={currentUser?.id ?? null}>
      <AppShellFrame />
    </WorkbenchNavigationProvider>
  );
}

function AppShellFrame() {
  const location = useLocation();
  const workbenchNavigation = useWorkbenchNavigation();
  const { currentUser, dismissSystemBroadcast, notify, state, systemBroadcasts } = useOrf();
  const currentUserId = currentUser?.id ?? null;
  const [commandOpen, setCommandOpen] = useState(false);
  const [desktopChromeEnabled, setDesktopChromeEnabled] = useState(() => isDesktopShellAvailable());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState<number>(sidebarLayoutLimits.expandedWidthPx.default);
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const [chatTheme, setChatTheme] = useState<ChatTheme>(defaultChatTheme);
  const [displayPreferences, setDisplayPreferences] = useState<UserDisplayPreferences>(defaultUserDisplayPreferences);
  const [clientUpdateCenter, setClientUpdateCenter] = useState<{ notice?: string; open: boolean }>({ open: false });
  const shellDisplayPath = location.pathname;
  const isChatPage = location.pathname.startsWith("/chat");
  const pageBackgroundScene = isChatPage ? null : pageVisualBackgroundSceneForPath(location.pathname);
  const sidebarBackground = useVisualBackground("sidebar_background");
  const topbarBackground = useVisualBackground("topbar_background");
  const pageBackground = useVisualBackground(pageBackgroundScene);

  useEffect(() => {
    setDesktopChromeEnabled(isDesktopShellAvailable());
  }, []);

  useEffect(() => {
    if (!currentUserId) return undefined;
    const preload = () => void preloadProductionRouteExperience();
    if (typeof window.requestIdleCallback === "function") {
      const idleRequest = window.requestIdleCallback(preload, { timeout: 2_500 });
      return () => window.cancelIdleCallback(idleRequest);
    }
    const timer = window.setTimeout(preload, 1_000);
    return () => window.clearTimeout(timer);
  }, [currentUserId]);

  useEffect(() => {
    let cancelled = false;
    if (!currentUser) {
      setSidebarCollapsed(false);
      setSidebarWidth(sidebarLayoutLimits.expandedWidthPx.default);
      setChatTheme(defaultChatTheme);
      setDisplayPreferences(defaultUserDisplayPreferences);
      return undefined;
    }

    const refreshPreferences = () => {
      void getUserPreferences({ userId: currentUser.id })
        .then((preferences) => {
          if (!cancelled) {
            setSidebarCollapsed(preferences.sidebarCollapsed ?? false);
            setSidebarWidth(normalizeSidebarWidth(preferences.sidebarWidth));
            setChatTheme(preferences.chatTheme);
            setDisplayPreferences(preferences.display ?? defaultUserDisplayPreferences);
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

  useEffect(() => {
    const cleanup = applyDisplayPreferencesToDocument(displayPreferences, { includeWorkbenchZoom: !desktopChromeEnabled });
    if (desktopChromeEnabled) {
      void setDesktopWorkbenchZoomLevel(displayPreferences.workbenchZoomLevel).catch(() => undefined);
    }
    return cleanup;
  }, [desktopChromeEnabled, displayPreferences]);

  useEffect(() => {
    const updateViewportWidth = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", updateViewportWidth);
    return () => window.removeEventListener("resize", updateViewportWidth);
  }, []);

  const handleSidebarCollapsedChange = useCallback((collapsed: boolean) => {
    setSidebarCollapsed(collapsed);
    void saveUserPreferences({ sidebarCollapsed: collapsed }).catch(() => undefined);
  }, []);

  const visibleSidebarWidth = clampShellSidebarWidth(sidebarWidth, viewportWidth);
  const createSidebarWidthResolver = useCallback(() => {
    const startWidth = visibleSidebarWidth;
    return (deltaX: number) => clampShellSidebarWidth(startWidth + deltaX, viewportWidth);
  }, [viewportWidth, visibleSidebarWidth]);

  const commitSidebarWidth = useCallback((width: number) => {
    if (!currentUser) return;
    void saveUserPreferences({ sidebarWidth: width }).catch(() => {
      notify("侧边栏宽度保存失败，请稍后重试。");
    });
  }, [currentUser, notify]);

  const shellSidebarResize = useHorizontalPanelResize<HTMLButtonElement>({
    createValueResolver: createSidebarWidthResolver,
    disabled: sidebarCollapsed,
    onChange: setSidebarWidth,
    onCommit: commitSidebarWidth,
  });

  const saveDisplayPreferences = useCallback((nextPreferences: UserDisplayPreferences) => {
    setDisplayPreferences(nextPreferences);
    void saveUserPreferences({ display: nextPreferences })
      .then(() => dispatchPersonalPreferencesChanged())
      .catch(() => undefined);
  }, []);

  const updateWorkbenchZoomPreference = useCallback((direction: "in" | "out" | "reset") => {
    if (!currentUser) return;
    const nextLevel = nextWorkbenchZoomLevel(displayPreferences.workbenchZoomLevel, direction);
    if (nextLevel === displayPreferences.workbenchZoomLevel) return;
    saveDisplayPreferences({ ...displayPreferences, workbenchZoomLevel: nextLevel });
  }, [currentUser, displayPreferences, saveDisplayPreferences]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
        return;
      }
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        updateWorkbenchZoomPreference("in");
        return;
      }
      if (event.key === "-") {
        event.preventDefault();
        updateWorkbenchZoomPreference("out");
        return;
      }
      if (event.key === "0") {
        event.preventDefault();
        updateWorkbenchZoomPreference("reset");
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [updateWorkbenchZoomPreference]);

  useEffect(() => {
    const handleOpenClientUpdateCenter = (event: Event) => {
      const request = event instanceof CustomEvent ? event.detail as ClientUpdateCenterOpenRequest | undefined : undefined;
      setClientUpdateCenter({ notice: request?.notice, open: true });
    };

    window.addEventListener(clientUpdateCenterOpenEvent, handleOpenClientUpdateCenter);
    return () => window.removeEventListener(clientUpdateCenterOpenEvent, handleOpenClientUpdateCenter);
  }, []);

  const sidebarBackgroundUrl = sidebarBackground.status === "ready" ? sidebarBackground.url : orfAssetLibrary.sidebar.characterGuideBackground.src;
  const sidebarBackgroundCrop = sidebarBackground.status === "ready"
    ? sidebarBackground.selection.crop
    : { ...defaultVisualBackgroundCrop, zoom: 1.03 };
  const sidebarBackgroundOverlayOpacity = sidebarBackground.status === "ready"
    ? sidebarBackground.selection.overlayOpacity
    : defaultVisualBackgroundOverlayOpacity;
  const topbarSelection = topbarBackground.status === "ready" ? topbarBackground.selection : null;
  const pageSelection = pageBackgroundScene && pageBackground.status === "ready" ? pageBackground.selection : null;
  const canCreateObjective = hasPermission(currentUser, state.permissionRules, "objective.create");
  const canCreateFeedback = canCreateTeamFeedback(currentUser);
  const isBountyHall = !isChatPage && shellDisplayPath.startsWith("/bounties");
  const shellStyle = {
    "--orf-sidebar-width": `${visibleSidebarWidth}px`,
  } as CSSProperties;

  return (
    <ChatFloatingImagePreviewProvider>
        <div
          className="orf-app-shell flex min-h-screen"
          data-bounty-hall={isBountyHall ? "true" : "false"}
          data-chat-page={isChatPage ? "true" : "false"}
          data-chat-theme={chatTheme}
          data-desktop-chrome={desktopChromeEnabled ? "true" : "false"}
          data-display-contrast={displayPreferences.contrast}
          data-display-density={displayPreferences.density}
          data-sidebar-collapsed={sidebarCollapsed ? "true" : "false"}
          data-resizing-shell-sidebar={shellSidebarResize.resizing ? "true" : "false"}
          style={shellStyle}
        >
          <Sidebar
            backgroundUrl={sidebarBackgroundUrl}
            backgroundCrop={sidebarBackgroundCrop}
            backgroundOverlayOpacity={sidebarBackgroundOverlayOpacity}
            collapsed={sidebarCollapsed}
            onCollapsedChange={handleSidebarCollapsedChange}
            onOpenClientUpdateCenter={() => setClientUpdateCenter({ open: true })}
          />
          <button
            type="button"
            className="orf-panel-resize-handle orf-shell-sidebar-resize-handle"
            aria-label="拖动调整全局侧边栏宽度"
            aria-orientation="vertical"
            disabled={sidebarCollapsed}
            title="拖动调整全局侧边栏宽度"
            {...shellSidebarResize.handleProps}
          />
          <div className="orf-shell-body min-w-0 flex-1">
            <header
              className="orf-topbar orf-shell-x-padding sticky top-0 z-30 flex items-center gap-2"
              data-topbar-skin={topbarSelection ? "true" : "false"}
              style={backgroundOverlayStyle(topbarSelection)}
            >
              <VisualBackgroundSlot
                frameClassName="orf-topbar-skin-frame"
                imageClassName="orf-topbar-skin-layer"
                imageUrl={topbarSelection?.url ?? null}
                crop={topbarSelection?.crop ?? defaultVisualBackgroundCrop}
              />
              <WorkbenchNavigationControls />
              <div className="orf-topbar-title orf-text-primary min-w-[160px] font-semibold tracking-tight" role="heading" aria-level={1}>
                {isBountyHall && (
                  <span className="orf-topbar-title-icon" aria-hidden="true">
                    <Shield className="h-4 w-4" />
                  </span>
                )}
                <span>{breadcrumb(shellDisplayPath)}</span>
              </div>
              <div className="relative min-w-[180px] max-w-xl flex-1">
                <Search className="orf-text-muted pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
                <button
                  onClick={() => setCommandOpen(true)}
                  className="orf-search-trigger h-8 w-full pl-8 pr-3 text-left text-xs transition"
                  aria-label="搜索页面、资源、目标、指标、任务、反馈"
                >
                  <span className="orf-search-trigger-label">搜索页面、资源、目标、指标、任务、反馈</span>
                </button>
              </div>
              {!isBountyHall && canCreateFeedback && (
                <Button className="orf-topbar-action-button" size="sm" variant="secondary" onClick={() => workbenchNavigation.open(feedbackCreatePath, { source: "user" })}>
                  <MessageSquarePlus className="h-4 w-4" />
                  新建反馈
                </Button>
              )}
              <div className="orf-topbar-actions ml-auto flex shrink-0 items-center gap-1.5">
                {canCreateObjective && (
                  <Button className="orf-topbar-action-button" size="sm" onClick={() => workbenchNavigation.open("/tasks?create=objective", { source: "user" })}>
                    <Flag className="h-4 w-4" />
                    新建目标
                  </Button>
                )}
                <DesktopWindowControls enabled={desktopChromeEnabled} />
              </div>
            </header>
            <SystemBroadcastBanner broadcasts={systemBroadcasts} onDismiss={dismissSystemBroadcast} />
            <ClientUpdateNotice />
            <main
              className="orf-main-content"
              data-page-scene={pageBackgroundScene ?? "none"}
              data-page-skin={pageSelection ? "true" : "false"}
              style={backgroundOverlayStyle(pageSelection)}
            >
              <VisualBackgroundSlot
                frameClassName="orf-main-content-skin-frame"
                imageClassName="orf-main-content-skin-layer"
                imageUrl={pageSelection?.url ?? null}
                crop={pageSelection?.crop ?? defaultVisualBackgroundCrop}
              />
              <Outlet />
            </main>
          </div>
          <CommandMenu open={commandOpen} onClose={() => setCommandOpen(false)} />
          <MobileBottomNav />
          <ClientReleaseNotesDialog />
          <ClientUpdateCenterDialog
            notice={clientUpdateCenter.notice}
            open={clientUpdateCenter.open}
            onClose={() => setClientUpdateCenter({ open: false })}
          />
          <GlobalModals />
          <Toasts />
        </div>
      </ChatFloatingImagePreviewProvider>
  );
}

function backgroundOverlayStyle(selection: VisualBackgroundSelection | null) {
  return {
    "--orf-visual-bg-overlay-opacity": selection?.overlayOpacity ?? defaultVisualBackgroundOverlayOpacity,
  } as CSSProperties;
}
