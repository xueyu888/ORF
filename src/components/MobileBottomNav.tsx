import { NavLink } from "react-router-dom";
import { canShowFrontendPath } from "../config/frontendVisibility";
import { navItems } from "../config/navigation";
import { useOrf } from "../state/OrfProvider";

const mobileBottomNavLabels = ["悬赏大厅", "我的挑战", "聊天", "反馈", "消息"];

const mobileBottomNavItems = mobileBottomNavLabels
  .map((label) => navItems.find((item) => item.label === label))
  .filter((item) => item !== undefined);

export function MobileBottomNav() {
  const { chatUnreadSummary, currentUser, unreadNotificationCount } = useOrf();
  const visibleItems = mobileBottomNavItems.filter((item) => canShowFrontendPath(currentUser, item.path));

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <nav className="orf-mobile-bottom-nav" aria-label="移动端导航">
      {visibleItems.map((item) => {
        const badgeCount = item.path === "/chat"
          ? chatUnreadSummary.totalUnreadCount
          : item.path === "/notifications"
            ? unreadNotificationCount
            : 0;
        const badgeText = badgeCount > 99 ? "99+" : String(badgeCount);
        const ariaLabel = badgeCount > 0 ? `${item.label}，${badgeCount} 条未读` : item.label;
        return (
          <NavLink
            key={item.path}
            to={item.path}
            aria-label={ariaLabel}
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
    </nav>
  );
}
