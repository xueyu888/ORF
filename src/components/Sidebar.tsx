import { Command, PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";
import { type CSSProperties, useState } from "react";
import { NavLink } from "react-router-dom";
import { orfAssetLibrary, toCssImageUrl } from "../config/assetLibrary";
import { navItems } from "../config/navigation";
import { Avatar } from "./ui";

const navItemByLabel = new Map(navItems.map((item) => [item.label, item]));
const sidebarGroups = [
  { title: "work", labels: ["计划", "周复盘"] },
  { title: "report", labels: ["反馈", "统计"] },
].map((group) => ({
  ...group,
  items: group.labels.map((label) => navItemByLabel.get(label)).filter((item) => item !== undefined),
}));

export function Sidebar({ onCommand }: { onCommand: () => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const sidebarStyle = {
    "--orf-sidebar-bg-image": toCssImageUrl(orfAssetLibrary.sidebar.energyBackground.src),
  } as CSSProperties;

  return (
    <aside
      className={[
        "orf-sidebar sticky top-0 flex h-screen shrink-0 flex-col border-r",
        collapsed ? "orf-sidebar-collapsed" : "orf-sidebar-expanded",
      ].join(" ")}
      style={sidebarStyle}
      aria-label="主导航"
    >
      <div className="orf-sidebar-brand flex items-center justify-between border-b px-5">
        <div className="orf-sidebar-brand-main flex items-center gap-3">
          <div className="orf-sidebar-logo flex h-11 w-11 items-center justify-center shadow-sm">
            <Command className="h-5 w-5" />
          </div>
          <div className="orf-sidebar-label orf-sidebar-brand-title whitespace-nowrap">ORF Flow</div>
        </div>
        <button
          className="orf-sidebar-toggle orf-sidebar-icon inline-flex items-center justify-center transition hover:text-white"
          type="button"
          aria-label={collapsed ? "展开侧边栏" : "折叠侧边栏"}
          title={collapsed ? "展开侧边栏" : "折叠侧边栏"}
          onClick={() => setCollapsed((current) => !current)}
        >
          {collapsed ? <PanelLeftOpen className="h-6 w-6" /> : <PanelLeftClose className="h-6 w-6" />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {sidebarGroups.map((group) => (
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

      <div className="orf-sidebar-footer space-y-3 border-t p-4">
        <button
          onClick={onCommand}
          className="orf-sidebar-command flex w-full items-center border text-left transition"
          aria-label="搜索"
          title="搜索"
        >
          <Command className="orf-sidebar-icon h-5 w-5 shrink-0" />
          <span className="orf-sidebar-label flex-1">搜索</span>
        </button>
        <NavLink
          to="/settings"
          className="orf-sidebar-command flex w-full items-center border text-left transition"
          aria-label="设置"
          title="设置"
        >
          <Settings className="orf-sidebar-icon h-5 w-5 shrink-0" />
          <span className="orf-sidebar-label flex-1">设置</span>
        </NavLink>
        <div className="orf-sidebar-user flex items-center gap-3 px-2" title="Alex Chen">
          <Avatar name="Alex Chen" />
          <div className="orf-sidebar-label min-w-0">
            <div className="orf-sidebar-user-name truncate">Alex Chen</div>
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
