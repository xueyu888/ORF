import { CalendarDays, Filter, UserRound } from "lucide-react";
import { FantasySelectMenu } from "../../../components/FantasySelectMenu";
import type { ChallengeCycleFilter, ChallengeMemberFilter, ChallengeStatusFilter } from "../model/challengeFilters";
import type { ChallengeScope } from "../model/types";

const statusOptions: Array<{ label: string; value: ChallengeStatusFilter }> = [
  { label: "全部状态", value: "all" },
  { label: "未分配", value: "unassigned" },
  { label: "待认领", value: "open" },
  { label: "执行中", value: "active" },
  { label: "待验收", value: "review" },
  { label: "已结算", value: "settled" },
];

export function ChallengeToolbar({
  canShowAll,
  cycle,
  cycleOptions,
  member,
  memberOptions,
  onScopeChange,
  onCycleChange,
  onMemberChange,
  onStatusChange,
  showMemberFilter,
  scope,
  status,
}: {
  canShowAll: boolean;
  cycle: ChallengeCycleFilter;
  cycleOptions: string[];
  member: ChallengeMemberFilter;
  memberOptions: string[];
  onScopeChange: (scope: ChallengeScope) => void;
  onCycleChange: (cycle: ChallengeCycleFilter) => void;
  onMemberChange: (member: ChallengeMemberFilter) => void;
  onStatusChange: (status: ChallengeStatusFilter) => void;
  showMemberFilter: boolean;
  scope: ChallengeScope;
  status: ChallengeStatusFilter;
}) {
  const cycleSelectOptions = [
    { label: "全部周期", value: "all", alwaysVisible: true },
    ...cycleOptions.map((item) => ({ label: item, value: item })),
  ];
  const memberSelectOptions = [
    { label: "全部成员", value: "all", alwaysVisible: true },
    ...memberOptions.map((item) => ({ label: item, value: item })),
  ];

  return (
    <div className="orf-task-toolbar">
      <ScopeTabs canShowAll={canShowAll} onChange={onScopeChange} value={scope} />
      <div className="orf-task-toolbar-actions">
        <FantasySelectMenu
          ariaLabel="挑战周期"
          className="orf-filter-chip"
          leadingIcon={<CalendarDays className="h-4 w-4" />}
          onChange={onCycleChange}
          options={cycleSelectOptions}
          searchable
          searchPlaceholder="搜索周期"
          value={cycle}
        />
        {showMemberFilter && (
          <FantasySelectMenu
            ariaLabel="挑战成员"
            className="orf-filter-chip"
            leadingIcon={<UserRound className="h-4 w-4" />}
            onChange={onMemberChange}
            options={memberSelectOptions}
            searchable
            searchPlaceholder="搜索成员"
            value={member}
          />
        )}
        <FantasySelectMenu
          ariaLabel="挑战状态"
          className="orf-filter-chip"
          leadingIcon={<Filter className="h-4 w-4" />}
          onChange={onStatusChange}
          options={statusOptions}
          value={status}
        />
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
    <div className="orf-scope-tabs flex items-center gap-1 font-semibold">
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
