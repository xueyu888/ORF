import { NavLink, Outlet } from "react-router-dom";
import { PageScaffold } from "../components/PageScaffold";
import { systemManagementPages } from "../config/navigation";

export function SystemManagementPage() {
  return (
    <PageScaffold title="系统管理" subtitle="管理影响全站的成员、角色权限和系统级设置。">
      <nav className="orf-system-management-tabs" aria-label="系统管理导航">
        {systemManagementPages.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => (isActive ? "orf-system-management-tab-active" : "")}
          >
            <item.icon className="h-4 w-4" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </PageScaffold>
  );
}
