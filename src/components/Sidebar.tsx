import { Command } from "lucide-react";
import { NavLink } from "react-router-dom";
import { navItems } from "../config/navigation";
import { Avatar } from "./ui";

export function Sidebar({ onCommand }: { onCommand: () => void }) {
  return (
    <aside className="orf-sidebar sticky top-0 flex h-screen w-[248px] shrink-0 flex-col border-r orf-border">
      <div className="border-b orf-border p-4">
        <div className="orf-text-primary text-lg font-semibold tracking-tight">ORF Flow</div>
        <div className="orf-surface-muted mt-4 rounded-lg border orf-border p-3">
          <div className="orf-text-muted text-xs">工作区</div>
          <div className="orf-text-primary mt-1 text-sm font-medium">AI 应用团队</div>
          <div className="orf-accent-soft orf-accent-border mt-2 inline-flex rounded-full border px-2 py-0.5 text-xs">2026 Q2</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              [
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition",
                isActive ? "orf-surface-muted orf-text-primary" : "orf-text-secondary orf-hover-muted orf-hover-text",
              ].join(" ")
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="space-y-3 border-t orf-border p-4">
        <button onClick={onCommand} className="orf-surface-muted orf-hover-muted orf-text-secondary orf-hover-text flex w-full items-center gap-2 rounded-md border orf-border px-3 py-2 text-left text-xs">
          <Command className="h-4 w-4" />
          <span className="flex-1">⌘K 搜索</span>
        </button>
        <div className="flex items-center gap-3">
          <Avatar name="Alex Chen" />
          <div className="min-w-0">
            <div className="orf-text-primary truncate text-sm font-medium">Alex Chen</div>
            <div className="orf-text-muted truncate text-xs">AI 产品经理</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
