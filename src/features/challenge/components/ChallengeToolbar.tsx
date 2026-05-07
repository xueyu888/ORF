import { CalendarDays, ChevronDown, Filter } from "lucide-react";
import type { ChallengeScope } from "../model/types";

export function ChallengeToolbar({
  isAdmin,
  onScopeChange,
  scope,
}: {
  isAdmin: boolean;
  onScopeChange: (scope: ChallengeScope) => void;
  scope: ChallengeScope;
}) {
  return (
    <div className="orf-task-toolbar">
      <ScopeTabs isAdmin={isAdmin} onChange={onScopeChange} value={scope} />
      <div className="orf-task-toolbar-actions">
        <button className="orf-floating-control orf-filter-chip inline-flex h-10 items-center gap-2 px-3 text-sm font-semibold">
          <CalendarDays className="h-4 w-4 text-[#667085]" />
          全部周期
          <ChevronDown className="h-4 w-4 text-[#667085]" />
        </button>
        <button className="orf-floating-control orf-filter-chip inline-flex h-10 items-center gap-2 px-3 text-sm font-semibold">
          <Filter className="h-4 w-4 text-[#667085]" />
          筛选
        </button>
      </div>
    </div>
  );
}

function ScopeTabs({ isAdmin, onChange, value }: { isAdmin: boolean; onChange: (scope: ChallengeScope) => void; value: ChallengeScope }) {
  const items = isAdmin
    ? [
        { value: "all" as const, label: "所有挑战" },
        { value: "mine" as const, label: "我的挑战" },
      ]
    : [{ value: "mine" as const, label: "我的挑战" }];

  return (
    <div className="orf-scope-tabs flex items-center gap-1 text-sm font-semibold">
      {items.map((item) => (
        <button
          key={item.value}
          className={`orf-scope-tab transition ${value === item.value ? "orf-scope-tab-active" : "orf-scope-tab-inactive"}`}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
