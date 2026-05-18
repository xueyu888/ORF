import { CalendarDays, Filter } from "lucide-react";
import type { ChallengeCycleFilter, ChallengeStatusFilter } from "../model/challengeFilters";
import type { BountyStatus, ChallengeScope } from "../model/types";

const statusOptions: Array<{ label: string; value: ChallengeStatusFilter }> = [
  { label: "全部状态", value: "all" },
  { label: "待认领", value: "open" },
  { label: "执行中", value: "active" },
  { label: "待验收", value: "review" },
  { label: "已结算", value: "settled" },
];

export function ChallengeToolbar({
  canShowAll,
  cycle,
  cycleOptions,
  onScopeChange,
  onCycleChange,
  onStatusChange,
  scope,
  status,
}: {
  canShowAll: boolean;
  cycle: ChallengeCycleFilter;
  cycleOptions: string[];
  onScopeChange: (scope: ChallengeScope) => void;
  onCycleChange: (cycle: ChallengeCycleFilter) => void;
  onStatusChange: (status: ChallengeStatusFilter) => void;
  scope: ChallengeScope;
  status: ChallengeStatusFilter;
}) {
  return (
    <div className="orf-task-toolbar">
      <ScopeTabs canShowAll={canShowAll} onChange={onScopeChange} value={scope} />
      <div className="orf-task-toolbar-actions">
        <label className="orf-floating-control orf-filter-chip inline-flex h-10 items-center gap-2 px-3 text-sm font-semibold">
          <CalendarDays className="h-4 w-4 text-[#667085]" />
          <select aria-label="挑战周期" className="bg-transparent text-sm font-semibold outline-none" value={cycle} onChange={(event) => onCycleChange(event.target.value)}>
            <option value="all">全部周期</option>
            {cycleOptions.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="orf-floating-control orf-filter-chip inline-flex h-10 items-center gap-2 px-3 text-sm font-semibold">
          <Filter className="h-4 w-4 text-[#667085]" />
          <select aria-label="挑战状态" className="bg-transparent text-sm font-semibold outline-none" value={status} onChange={(event) => onStatusChange(event.target.value as BountyStatus | "all")}>
            {statusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
      </div>
    </div>
  );
}

function ScopeTabs({ canShowAll, onChange, value }: { canShowAll: boolean; onChange: (scope: ChallengeScope) => void; value: ChallengeScope }) {
  const items = canShowAll
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
