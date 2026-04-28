import { ChevronsUpDown, Command, Settings } from "lucide-react";
import { NavLink } from "react-router-dom";
import { navItems } from "../config/navigation";
import { Avatar } from "./ui";

const navItemByLabel = new Map(navItems.map((item) => [item.label, item]));
const focusItem = navItemByLabel.get("仪表盘");
const sidebarGroups = [
  { title: "WORK", labels: ["目标", "任务", "策略地图", "周复盘"] },
  { title: "REPORTS", labels: ["反馈", "AI 评估", "汇报"] },
  { title: "ORG", labels: ["设置"] },
].map((group) => ({
  ...group,
  items: group.labels.map((label) => navItemByLabel.get(label)).filter((item) => item !== undefined),
}));

export function Sidebar({ onCommand }: { onCommand: () => void }) {
  return (
    <aside className="orf-sidebar sticky top-0 flex h-screen shrink-0 flex-col border-r">
      <div className="orf-sidebar-brand flex items-center justify-between border-b px-7">
        <div className="flex items-center gap-3">
          <div className="orf-sidebar-logo flex h-12 w-12 items-center justify-center shadow-sm">
            <Command className="h-6 w-6" />
          </div>
          <div className="text-2xl font-bold tracking-tight">ORF Flow</div>
        </div>
        <button className="orf-sidebar-icon transition hover:text-white" type="button" aria-label="设置">
          <Settings className="h-7 w-7" />
        </button>
      </div>

      <div className="orf-sidebar-workspace flex items-center justify-between border-b px-7">
        <div className="flex items-center gap-4">
          <div className="orf-sidebar-workspace-logo flex h-14 w-14 items-center justify-center text-xl font-black">O</div>
          <div>
            <div className="text-xl font-bold tracking-tight">AI 应用团队</div>
            <div className="orf-sidebar-period mt-1 inline-flex px-2 py-0.5 text-xs font-semibold">2026 Q2</div>
          </div>
        </div>
        <ChevronsUpDown className="orf-sidebar-icon h-6 w-6" />
      </div>

      <nav className="flex-1 overflow-y-auto">
        {focusItem && (
          <div className="orf-sidebar-section border-b py-4">
            <SidebarLink item={focusItem} label="我的焦点" />
          </div>
        )}

        {sidebarGroups.map((group) => (
          <div key={group.title} className="orf-sidebar-section border-b py-5">
            <div className="px-7 pb-3 text-sm font-black uppercase tracking-[0.16em]">{group.title}</div>
            <div className="space-y-1">
              {group.items.map((item) => (
                <SidebarLink key={item.path} item={item} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="orf-sidebar-footer orf-card-padding space-y-4 border-t">
        <button
          onClick={onCommand}
          className="orf-sidebar-command flex w-full items-center gap-2 border px-3 py-2 text-left text-xs font-medium transition"
        >
          <Command className="h-4 w-4" />
          <span className="flex-1">⌘K 搜索</span>
        </button>
        <div className="flex items-center gap-3">
          <Avatar name="Alex Chen" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">Alex Chen</div>
            <div className="orf-sidebar-muted-text truncate text-xs">AI 产品经理</div>
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
      className={({ isActive }) =>
        [
          "orf-sidebar-link flex items-center gap-4 px-7 text-lg font-medium transition",
          isActive ? "orf-sidebar-link-active" : "orf-sidebar-link-inactive",
        ].join(" ")
      }
    >
      <item.icon className="orf-sidebar-icon h-6 w-6 shrink-0" />
      <span className="truncate">{label}</span>
    </NavLink>
  );
}
