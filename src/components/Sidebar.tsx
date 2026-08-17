import { Eye, Info, LogOut, PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
} from "react";
import { NavLink } from "react-router-dom";
import brandLogo from "../assets/brand/orf-mark.png";
import { canShowFrontend, canShowFrontendPath } from "../config/frontendVisibility";
import { navItems } from "../config/navigation";
import type { VisualBackgroundCrop } from "../domain/settings/visualBackgrounds";
import { VisualMaterialLayer } from "../features/appearance/material/VisualMaterialLayer";
import type { AdaptiveMaterial } from "../features/appearance/material/materialTokens";
import { AttentionWorkbar } from "../features/attention/AttentionWorkbar";
import { useOrf } from "../state/OrfProvider";
import { ImagePreviewDialog } from "./ImagePreviewDialog";
import { VisualBackgroundSlot } from "./VisualBackgroundSlot";
import { Avatar } from "./ui";

const navItemByLabel = new Map(navItems.map((item) => [item.label, item]));
const sidebarGroups = [
  { title: "work", labels: ["悬赏大厅", "我的挑战", "工作日志", "聊天", "资源"] },
  { title: "report", labels: ["反馈", "统计"] },
  { title: "admin", labels: ["系统管理"] },
].map((group) => ({
  ...group,
  items: group.labels.map((label) => navItemByLabel.get(label)).filter((item) => item !== undefined),
}));

export function Sidebar({
  backgroundCrop,
  backgroundUrl,
  collapsed,
  material,
  onCollapsedChange,
  onOpenClientUpdateCenter,
}: {
  backgroundCrop: VisualBackgroundCrop;
  backgroundUrl: string;
  collapsed: boolean;
  material: AdaptiveMaterial;
  onCollapsedChange: (collapsed: boolean) => void;
  onOpenClientUpdateCenter: () => void;
}) {
  const { chatUnreadSummary, currentUser, logout } = useOrf();
  const visibleGroups = sidebarGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => canShowFrontendPath(currentUser, item.path)) }))
    .filter((group) => group.items.length > 0);
  const backgroundImageUrl = backgroundUrl;
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [avatarPreviewOpen, setAvatarPreviewOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const avatarPreview = currentUser?.avatarUrl
    ? { alt: `${currentUser.name} 头像`, label: `${currentUser.name} 头像`, src: currentUser.avatarUrl }
    : null;

  useEffect(() => {
    if (!userMenuOpen) return undefined;

    const closeOnPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !userMenuRef.current?.contains(event.target)) {
        setUserMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setUserMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointerDown);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [userMenuOpen]);

  useEffect(() => {
    if (!currentUser?.avatarUrl) {
      setAvatarPreviewOpen(false);
    }
  }, [currentUser?.avatarUrl]);

  if (!backgroundImageUrl) {
    throw new Error("Sidebar background image URL is missing");
  }

  return (
    <aside
      className={[
        "orf-sidebar sticky top-0 flex h-screen shrink-0 flex-col",
        collapsed ? "orf-sidebar-collapsed" : "orf-sidebar-expanded",
      ].join(" ")}
      aria-label="主导航"
    >
      <VisualBackgroundSlot
        frameClassName="orf-sidebar-background-frame"
        imageClassName="orf-sidebar-background-image"
        imageUrl={backgroundImageUrl}
        crop={backgroundCrop}
      />
      <VisualMaterialLayer className="orf-sidebar-material" material={material} role="sidebar" />
      <div className="orf-sidebar-brand flex items-center justify-between border-b px-4">
        <div className="orf-sidebar-brand-main flex items-center gap-2.5">
          <div className="orf-sidebar-logo flex h-10 w-10 items-center justify-center shadow-sm">
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
          {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {visibleGroups.map((group) => (
          <div key={group.title} className="orf-sidebar-section border-b py-4">
            <div className="orf-sidebar-group-title px-6 pb-2 uppercase">{group.title}</div>
            <div className="space-y-1">
              {group.items.map((item) => (
                <SidebarLink
                  key={item.path}
                  item={item}
                  unreadCount={item.path === "/chat" ? chatUnreadSummary.totalUnreadCount : 0}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <AttentionWorkbar collapsed={collapsed} />

      <div className="orf-sidebar-footer border-t p-4">
        <div ref={userMenuRef} className="orf-sidebar-user-wrap relative">
          <div className="orf-sidebar-user flex w-full items-center gap-3 text-left" title={currentUser?.name ?? "User"}>
            <button
              type="button"
              className="orf-sidebar-user-profile flex min-w-0 flex-1 items-center gap-3 text-left"
              aria-haspopup="menu"
              aria-expanded={userMenuOpen}
              aria-label="用户菜单"
              onClick={() => setUserMenuOpen((open) => !open)}
            >
              <Avatar avatarUrl={currentUser?.avatarUrl} name={currentUser?.name ?? "User"} />
              <span className="orf-sidebar-label min-w-0 flex-1">
                <span className="orf-sidebar-user-name block truncate">{currentUser?.name ?? "User"}</span>
              </span>
            </button>
          </div>
          {userMenuOpen && (
            <div className="orf-sidebar-user-menu" role="menu" aria-label="用户菜单">
              {avatarPreview && (
                <button
                  type="button"
                  className="orf-sidebar-user-menu-item"
                  role="menuitem"
                  onClick={() => {
                    setUserMenuOpen(false);
                    setAvatarPreviewOpen(true);
                  }}
                >
                  <Eye className="h-4 w-4" />
                  查看头像
                </button>
              )}
              {canShowFrontend(currentUser, "nav.personalSettings") && (
                <NavLink
                  to="/settings"
                  className="orf-sidebar-user-menu-item"
                  role="menuitem"
                  onClick={() => setUserMenuOpen(false)}
                >
                  <Settings className="h-4 w-4" />
                  个人设置
                </NavLink>
              )}
              <button
                type="button"
                className="orf-sidebar-user-menu-item"
                role="menuitem"
                onClick={() => {
                  setUserMenuOpen(false);
                  onOpenClientUpdateCenter();
                }}
              >
                <Info className="h-4 w-4" />
                关于与更新
              </button>
              <button
                type="button"
                className="orf-sidebar-user-menu-item"
                role="menuitem"
                onClick={() => {
                  setUserMenuOpen(false);
                  logout();
                }}
              >
                <LogOut className="h-4 w-4" />
                退出登录
              </button>
            </div>
          )}
        </div>
      </div>
      {avatarPreviewOpen && avatarPreview && <ImagePreviewDialog preview={avatarPreview} onClose={() => setAvatarPreviewOpen(false)} />}
    </aside>
  );
}

function SidebarLink({
  item,
  label = item.label,
  unreadCount = 0,
}: {
  item: (typeof navItems)[number];
  label?: string;
  unreadCount?: number;
}) {
  const visibleUnreadCount = Math.max(0, unreadCount);
  const unreadBadgeText = visibleUnreadCount > 99 ? "99+" : String(visibleUnreadCount);
  const ariaLabel = visibleUnreadCount > 0 ? `${label}，${visibleUnreadCount} 条未读聊天消息` : label;
  return (
    <NavLink
      to={item.path}
      title={ariaLabel}
      aria-label={ariaLabel}
      className={({ isActive }) =>
        [
          "orf-sidebar-link flex items-center transition",
          isActive ? "orf-sidebar-link-active" : "orf-sidebar-link-inactive",
        ].join(" ")
      }
    >
      <item.icon className="orf-sidebar-icon h-4 w-4 shrink-0" />
      <span className="orf-sidebar-label orf-sidebar-link-label truncate">{label}</span>
      {visibleUnreadCount > 0 && (
        <span className="orf-sidebar-chat-badge" aria-hidden="true">
          {unreadBadgeText}
        </span>
      )}
    </NavLink>
  );
}
