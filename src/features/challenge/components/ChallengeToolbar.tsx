import { CalendarDays, Filter, FolderKanban, Plus, UserRound } from "lucide-react";
import { useState } from "react";
import { FantasyMultiSelectMenu, FantasySelectMenu, type FantasySelectOption } from "../../../components/FantasySelectMenu";
import { Button, IconButton } from "../../../components/ui";
import {
  challengeStatusFilterMenuValues,
  challengeStatusFilterOptions,
  normalizeChallengeStatusFilterSelection,
  type ChallengeCycleFilter,
  type ChallengeMemberFilter,
  type ChallengeMemberOption,
  type ChallengeProjectFilter,
  type ChallengeStatusFilterSelection,
} from "../model/challengeFilters";
import type { ChallengeScope } from "../model/types";

export function ChallengeToolbar({
  canShowAll,
  canManageProjects,
  cycle,
  cycleOptions,
  member,
  memberOptions,
  onCreateProject,
  onScopeChange,
  onCycleChange,
  onMemberChange,
  onProjectChange,
  onStatusChange,
  project,
  projectOptions,
  showMemberFilter,
  scope,
  status,
}: {
  canShowAll: boolean;
  canManageProjects: boolean;
  cycle: ChallengeCycleFilter;
  cycleOptions: string[];
  member: ChallengeMemberFilter;
  memberOptions: ChallengeMemberOption[];
  onCreateProject: (name: string) => Promise<{ id: string } | null>;
  onScopeChange: (scope: ChallengeScope) => void;
  onCycleChange: (cycle: ChallengeCycleFilter) => void;
  onMemberChange: (member: ChallengeMemberFilter) => void;
  onProjectChange: (project: ChallengeProjectFilter) => void;
  onStatusChange: (status: ChallengeStatusFilterSelection) => void;
  project: ChallengeProjectFilter;
  projectOptions: Array<FantasySelectOption<ChallengeProjectFilter>>;
  showMemberFilter: boolean;
  scope: ChallengeScope;
  status: ChallengeStatusFilterSelection;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const cycleSelectOptions = [
    { label: "全部周期", value: "all", alwaysVisible: true },
    ...cycleOptions.map((item) => ({ label: item, value: item })),
  ];
  const memberSelectOptions = [
    { label: "全部成员", value: "all", alwaysVisible: true },
    ...memberOptions,
  ];
  const submitProject = async () => {
    const value = newProjectName.trim();
    if (!value) return;
    setCreating(true);
    try {
      const createdProject = await onCreateProject(value);
      if (createdProject) {
        setNewProjectName("");
        setCreateOpen(false);
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="orf-task-toolbar">
      <ScopeTabs canShowAll={canShowAll} onChange={onScopeChange} value={scope} />
      <div className="orf-task-toolbar-actions">
        {canManageProjects && (
          createOpen ? (
            <form
              className="orf-toolbar-project-create"
              onSubmit={(event) => {
                event.preventDefault();
                void submitProject();
              }}
            >
              <input
                aria-label="新项目名称"
                disabled={creating}
                onChange={(event) => setNewProjectName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Escape") return;
                  setNewProjectName("");
                  setCreateOpen(false);
                }}
                placeholder="项目名"
                value={newProjectName}
              />
              <IconButton icon={Plus} label="创建项目" disabled={creating || !newProjectName.trim()} size="sm" type="submit" />
            </form>
          ) : (
            <Button size="sm" variant="secondary" type="button" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              项目
            </Button>
          )
        )}
        <FantasySelectMenu
          ariaLabel="挑战项目"
          className="orf-filter-chip orf-project-filter-chip"
          leadingIcon={<FolderKanban className="h-4 w-4" />}
          onChange={onProjectChange}
          options={projectOptions}
          searchable
          searchPlaceholder="搜索项目"
          value={project}
        />
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
        <FantasyMultiSelectMenu
          ariaLabel="挑战状态"
          className="orf-filter-chip"
          allValue="all"
          leadingIcon={<Filter className="h-4 w-4" />}
          onChange={(values) => onStatusChange(normalizeChallengeStatusFilterSelection(values))}
          options={challengeStatusFilterOptions}
          values={challengeStatusFilterMenuValues(status)}
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
