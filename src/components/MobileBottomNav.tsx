import { BellRing } from "lucide-react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { canShowFrontendPath } from "../config/frontendVisibility";
import { navItems } from "../config/navigation";
import { useOrf } from "../state/OrfProvider";
import { preloadRouteExperience } from "../routing/routePreload";

const mobileBottomNavLabels = ["悬赏大厅", "我的挑战", "工作日志", "聊天"];

const mobileBottomNavItems = mobileBottomNavLabels
  .map((label) => navItems.find((item) => item.label === label))
  .filter((item) => item !== undefined);

export function MobileBottomNav({ onNavigateIntent }: { onNavigateIntent?: (path: string) => void }) {
  const { attentionState, chatUnreadSummary, currentUser, markNotificationRead, notify } = useOrf();
  const navigate = useNavigate();
  const visibleItems = mobileBottomNavItems.filter((item) => canShowFrontendPath(currentUser, item.path));

  if (visibleItems.length === 0) {
    return null;
  }

  const attentionTargetPath = attentionState.latestTargetPath ?? "/chat/system/personalNotifications";
  const attentionBadgeText = attentionState.count > 99 ? "99+" : String(attentionState.count);
  const attentionAriaLabel = attentionState.count > 0 ? `待办，${attentionState.count} 条提醒` : "待办";
  const showAttentionItem = attentionState.count > 0;
  const openAttentionTarget = async () => {
    const latestItem = attentionState.items[0] ?? null;
    if (latestItem?.source === "notification") {
      try {
        await markNotificationRead(latestItem.eventId);
      } catch (error) {
        notify(error instanceof Error ? error.message : "标记通知已读失败");
      }
    }
    onNavigateIntent?.(attentionTargetPath);
    navigate(attentionTargetPath);
  };

  return (
    <nav className="orf-mobile-bottom-nav" aria-label="移动端导航">
      {visibleItems.map((item) => {
        const badgeCount = item.path === "/chat"
          ? chatUnreadSummary.totalUnreadCount
          : 0;
        const badgeText = badgeCount > 99 ? "99+" : String(badgeCount);
        const ariaLabel = badgeCount > 0 ? `${item.label}，${badgeCount} 条未读` : item.label;
        const handleNavigateIntent = (event: ReactMouseEvent<HTMLAnchorElement> | ReactPointerEvent<HTMLAnchorElement>) => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          onNavigateIntent?.(item.path);
          void preloadRouteExperience(item.path);
        };
        return (
          <NavLink
            key={item.path}
            to={item.path}
            aria-label={ariaLabel}
            onClick={handleNavigateIntent}
            onPointerDown={handleNavigateIntent}
            onFocus={() => void preloadRouteExperience(item.path)}
            className={({ isActive }) => [
              "orf-mobile-bottom-nav-item",
              isActive ? "is-active" : "",
            ].join(" ")}
          >
            <span className="orf-mobile-bottom-nav-icon">
              <item.icon className="h-5 w-5" />
              {badgeCount > 0 && <span className="orf-mobile-bottom-nav-badge">{badgeText}</span>}
            </span>
            <span className="orf-mobile-bottom-nav-label">{item.label}</span>
          </NavLink>
        );
      })}
      {showAttentionItem && (
        <button
          type="button"
          className="orf-mobile-bottom-nav-item orf-mobile-bottom-nav-attention has-attention"
          aria-label={attentionAriaLabel}
          onClick={() => void openAttentionTarget()}
        >
          <span className="orf-mobile-bottom-nav-icon">
            <BellRing className="h-5 w-5" />
            <span className="orf-mobile-bottom-nav-badge">{attentionBadgeText}</span>
          </span>
          <span className="orf-mobile-bottom-nav-label">待办</span>
        </button>
      )}
    </nav>
  );
}
