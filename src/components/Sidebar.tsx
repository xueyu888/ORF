import { Command, LogOut, PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";
import { type CSSProperties, useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import brandLogo from "../assets/brand/orf-logo.png";
import { orfAssetLibrary } from "../config/assetLibrary";
import { canShowFrontend, canShowFrontendPath } from "../config/frontendVisibility";
import { navItems } from "../config/navigation";
import { useOrf } from "../state/OrfProvider";
import { Avatar } from "./ui";

const navItemByLabel = new Map(navItems.map((item) => [item.label, item]));
const sidebarGroups = [
  { title: "work", labels: ["悬赏大厅", "我的挑战"] },
  { title: "report", labels: ["反馈", "统计"] },
  { title: "admin", labels: ["成员管理", "权限管理"] },
].map((group) => ({
  ...group,
  items: group.labels.map((label) => navItemByLabel.get(label)).filter((item) => item !== undefined),
}));

export function Sidebar({
  backgroundUrl,
  collapsed,
  onCollapsedChange,
  onCommand,
  unifiedBackgroundUrl,
}: {
  backgroundUrl: string;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onCommand: () => void;
  unifiedBackgroundUrl?: string | null;
}) {
  const { currentUser, logout } = useOrf();
  const visibleGroups = sidebarGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => canShowFrontendPath(currentUser, item.path)) }))
    .filter((group) => group.items.length > 0);
  const sidebarBackground = orfAssetLibrary.sidebar.characterGuideBackground;
  const useUnifiedBackground = Boolean(unifiedBackgroundUrl);
  const backgroundImageUrl = (useUnifiedBackground ? unifiedBackgroundUrl : backgroundUrl) ?? "";
  const [failedBackgroundUrl, setFailedBackgroundUrl] = useState<string | null>(null);

  useEffect(() => {
    setFailedBackgroundUrl(null);
  }, [backgroundImageUrl]);

  if (!backgroundImageUrl) {
    throw new Error("Sidebar background image URL is missing");
  }
  if (failedBackgroundUrl === backgroundImageUrl) {
    throw new Error(`Sidebar background image failed to load: ${backgroundImageUrl}`);
  }

  const sidebarStyle = {
    "--orf-sidebar-bg-position": useUnifiedBackground ? "left top" : sidebarBackground.position,
    "--orf-sidebar-bg-transform": useUnifiedBackground ? "none" : "scale(1.03)",
    "--orf-sidebar-bg-filter": useUnifiedBackground ? "none" : sidebarBackground.filter,
    "--orf-sidebar-bg-overlay": sidebarBackground.overlay,
  } as CSSProperties;

  return (
    <aside
      className={[
        "orf-sidebar sticky top-0 flex h-screen shrink-0 flex-col border-r",
        collapsed ? "orf-sidebar-collapsed" : "orf-sidebar-expanded",
      ].join(" ")}
      style={sidebarStyle}
      data-unified-background={useUnifiedBackground ? "true" : "false"}
      aria-label="主导航"
    >
      <img
        className="orf-sidebar-background-image"
        src={backgroundImageUrl}
        alt=""
        aria-hidden="true"
        loading="eager"
        decoding="async"
        onError={() => setFailedBackgroundUrl(backgroundImageUrl)}
      />
      <div className="orf-sidebar-brand flex items-center justify-between border-b px-5">
        <div className="orf-sidebar-brand-main flex items-center gap-3">
          <div className="orf-sidebar-logo flex h-11 w-11 items-center justify-center shadow-sm">
            <img className="orf-sidebar-logo-image" src={brandLogo} alt="" aria-hidden="true" />
          </div>
          <div className="orf-sidebar-label orf-sidebar-brand-title whitespace-nowrap">ORF Flow</div>
        </div>
        <button
          className="orf-sidebar-toggle orf-sidebar-icon inline-flex items-center justify-center transition hover:text-white"
          type="button"
          aria-label={collapsed ? "展开侧边栏" : "折叠侧边栏"}
          title={collapsed ? "展开侧边栏" : "折叠侧边栏"}
          onClick={() => onCollapsedChange(!collapsed)}
        >
          {collapsed ? <PanelLeftOpen className="h-6 w-6" /> : <PanelLeftClose className="h-6 w-6" />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {visibleGroups.map((group) => (
          <div key={group.title} className="orf-sidebar-section border-b py-4">
            <div className="orf-sidebar-group-title px-7 pb-2 uppercase">{group.title}</div>
            <div className="space-y-1">
              {group.items.map((item) => (
                <SidebarLink key={item.path} item={item} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="orf-sidebar-footer border-t p-4">
        <div className="orf-sidebar-user-wrap relative">
          <div className="orf-sidebar-user flex w-full items-center gap-3 text-left" title={currentUser?.name ?? "User"} aria-label="当前用户">
            <Avatar name={currentUser?.name ?? "User"} />
            <div className="orf-sidebar-label min-w-0 flex-1">
              <div className="orf-sidebar-user-name truncate">{currentUser?.name ?? "User"}</div>
            </div>
            <div className="orf-sidebar-user-actions" aria-label="用户操作">
              <button
                type="button"
                onClick={onCommand}
                className="orf-sidebar-user-action inline-flex items-center justify-center transition"
                aria-label="搜索"
                title="搜索"
              >
                <Command className="h-4 w-4" />
              </button>
              {canShowFrontend(currentUser, "nav.settings") && (
                <NavLink
                  to="/settings"
                  className={({ isActive }) =>
                    [
                      "orf-sidebar-user-action inline-flex items-center justify-center transition",
                      isActive ? "orf-sidebar-user-action-active" : "",
                    ].join(" ")
                  }
                  aria-label="设置"
                  title="设置"
                >
                  <Settings className="h-4 w-4" />
                </NavLink>
              )}
              <button
                type="button"
                onClick={logout}
                className="orf-sidebar-user-action inline-flex items-center justify-center transition"
                aria-label="退出登录"
                title="退出登录"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function SidebarLink({
  item,
  label = item.label,
}: {
  item: (typeof navItems)[number];
  label?: string;
}) {
  return (
    <NavLink
      to={item.path}
      title={label}
      aria-label={label}
      className={({ isActive }) =>
        [
          "orf-sidebar-link flex items-center transition",
          isActive ? "orf-sidebar-link-active" : "orf-sidebar-link-inactive",
        ].join(" ")
      }
    >
      <item.icon className="orf-sidebar-icon h-5 w-5 shrink-0" />
      <span className="orf-sidebar-label truncate">{label}</span>
    </NavLink>
  );
}
