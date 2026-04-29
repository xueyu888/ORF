import { clsx } from "clsx";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Filter,
  Gauge,
  SlidersHorizontal,
  Target,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { HierarchyCell, HierarchyTreeOverlay } from "../components/OrfHierarchyTree";
import { CompletionCircleIcon, MetricSquareIcon, ObjectiveFlagIcon } from "../components/OrfIconAssets";
import { useOrf } from "../state/OrfProvider";
import type { Objective, Result, Task, TaskChecklistItem, TaskStatus } from "../types/orf";
import { avatarStyleForName } from "../utils/avatar";
import { initials, resultProgress } from "../utils/format";

const currentMember = "Alex Chen";

type TaskScope = "team" | "personal";
type FlowStage = "goalSetting" | "resultClaiming" | "orfReestimate" | "goalFrozen" | "supervisorConfirm";
type FlowStageState = "已完成" | "进行中" | "待确认";
type SimpleStatus = "todo" | "active" | "done";
type IndicatorStatus = "todo" | "active" | "review" | "done";

const flowStages: { value: FlowStage; label: string; state: FlowStageState }[] = [
  { value: "goalSetting", label: "目标设定", state: "已完成" },
  { value: "resultClaiming", label: "指标领取", state: "已完成" },
  { value: "orfReestimate", label: "ORF 重估", state: "进行中" },
  { value: "goalFrozen", label: "目标冻结", state: "待确认" },
  { value: "supervisorConfirm", label: "主管确认", state: "待确认" },
];

export function TasksPage() {
  const { state, setTaskCompletion, updateTaskChecklistItem } = useOrf();
  const [scope, setScope] = useState<TaskScope>("team");
  const [flowStage, setFlowStage] = useState<FlowStage>("orfReestimate");
  const [collapsedResultIds, setCollapsedResultIds] = useState<Set<string>>(() => new Set());
  const [collapsedTaskIds, setCollapsedTaskIds] = useState<Set<string>>(() => new Set());

  const groups = useMemo(
    () =>
      state.objectives
        .map((objective) => {
          const objectiveTasks = state.tasks.filter((task) => task.linkedObjectiveId === objective.id);
          const visibleObjectiveTasks = objectiveTasks.filter((task) => scope === "team" || task.assignee === currentMember);
          const results = state.results
            .filter((result) => objective.resultIds.includes(result.id))
            .map((result) => {
              const resultTasks = objectiveTasks.filter((task) => task.linkedResultId === result.id);
              const visibleTasks = resultTasks.filter((task) => scope === "team" || task.assignee === currentMember);

              return {
                result,
                tasks: visibleTasks,
                updatedAt: latestDate([
                  ...visibleTasks.map((task) => task.updatedAt),
                  ...state.evidence.filter((item) => item.linkedResultId === result.id).map((item) => item.date),
                  ...state.feedback.filter((item) => item.linkedResultId === result.id).map((item) => item.updatedAt),
                ]),
              };
            })
            .filter((group) => scope === "team" || group.tasks.length > 0);

          return {
            objective,
            results,
            taskOwners: unique(visibleObjectiveTasks.map((task) => task.assignee)),
            objectiveDue: latestDate(visibleObjectiveTasks.map((task) => task.dueDate)),
            reviewDue: addDays(latestDate([objective.updatedAt, ...visibleObjectiveTasks.map((task) => task.updatedAt)]), 7),
          };
        })
        .filter((group) => scope === "team" || group.results.length > 0),
    [scope, state.evidence, state.feedback, state.objectives, state.results, state.tasks],
  );

  const resultTaskMap = useMemo(
    () => new Map(state.results.map((result) => [result.id, state.tasks.filter((task) => task.linkedResultId === result.id)])),
    [state.results, state.tasks],
  );
  const completedResults = state.results.filter((result) => indicatorStatus(result, resultTaskMap.get(result.id) ?? []) === "done").length;
  const totalResults = state.results.length;
  const waitingResults = Math.max(0, totalResults - completedResults);
  const flowStageIndex = flowStages.findIndex((stage) => stage.value === flowStage);
  const isGoalFrozen = flowStage === "goalFrozen" || flowStage === "supervisorConfirm";
  const canEditTasks = flowStage === "orfReestimate";

  const toggleResult = (resultId: string) => setCollapsedResultIds((items) => toggleSetItem(items, resultId));
  const toggleTask = (taskId: string) => setCollapsedTaskIds((items) => toggleSetItem(items, taskId));

  return (
    <div className="grid gap-4">
      <section className="rounded-xl border border-[#e7e9ee] bg-white p-5 shadow-[0_8px_28px_rgba(22,31,46,0.06)]">
        <h1 className="mb-4 text-xl font-bold tracking-tight text-[#111827]">任务管理</h1>
        <FlowStageControl value={flowStage} activeIndex={flowStageIndex} onChange={setFlowStage} />
      </section>

      {scope === "team" && (
        <TeamDashboard
          completedResults={completedResults}
          totalResults={totalResults}
          waitingResults={waitingResults}
          activeTaskCount={state.tasks.filter((task) => task.status === "In Progress" || task.status === "In Review").length}
        />
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ScopeTabs value={scope} onChange={setScope} />
        <div className="flex items-center gap-2">
          <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#e4e7ec] bg-white px-3 text-sm font-semibold text-[#344054] shadow-sm">
            <CalendarDays className="h-4 w-4 text-[#667085]" />
            全部周期
            <ChevronDown className="h-4 w-4 text-[#667085]" />
          </button>
          <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#e4e7ec] bg-white px-3 text-sm font-semibold text-[#344054] shadow-sm">
            <Filter className="h-4 w-4 text-[#667085]" />
            筛选
          </button>
        </div>
      </div>

      <div className="grid gap-3">
        {groups.map((group) => (
          <ObjectivePanel
            key={group.objective.id}
            objective={group.objective}
            results={group.results}
            taskOwners={group.taskOwners}
            objectiveDue={group.objectiveDue}
            reviewDue={group.reviewDue}
            collapsedResultIds={collapsedResultIds}
            collapsedTaskIds={collapsedTaskIds}
            canEditTasks={canEditTasks}
            isGoalFrozen={isGoalFrozen}
            onTaskCompletionChange={setTaskCompletion}
            onChecklistItemChange={updateTaskChecklistItem}
            onToggleResult={toggleResult}
            onToggleTask={toggleTask}
          />
        ))}
      </div>
    </div>
  );
}

function FlowStageControl({
  value,
  activeIndex,
  onChange,
}: {
  value: FlowStage;
  activeIndex: number;
  onChange: (stage: FlowStage) => void;
}) {
  return (
    <div className="grid gap-3 xl:grid-cols-[1fr_24px_1fr_24px_1fr_24px_1fr_24px_1fr]">
      {flowStages.map((stage, index) => {
        const active = value === stage.value;
        const complete = index < activeIndex;

        return (
          <div key={stage.value} className="contents">
            <button
              type="button"
              onClick={() => onChange(stage.value)}
              className={clsx(
                "flex min-h-[74px] items-center gap-3 rounded-xl border px-4 text-left transition",
                active && "border-[#09927f] bg-[#f4fffc] shadow-[0_0_0_1px_rgba(9,146,127,0.12)]",
                complete && !active && "border-[#e4e7ec] bg-[#fcfcfd]",
                !complete && !active && "border-[#e4e7ec] bg-[#f9fafb] text-[#667085]",
              )}
            >
              <span
                className={clsx(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                  active && "bg-[#0b8f7f] text-white",
                  complete && !active && "bg-[#0b8f7f] text-white",
                  !complete && !active && "bg-[#eaecf0] text-[#475467]",
                )}
              >
                {complete ? <Check className="h-5 w-5" /> : index + 1}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-base font-bold text-[#1d2939]">{stage.label}</span>
                <span className="mt-2 block">
                  <FlowStageStatusChip state={stage.state} />
                </span>
              </span>
            </button>
            {index < flowStages.length - 1 && (
              <div className="hidden items-center justify-center text-[#344054] xl:flex">
                <ChevronRight className="h-5 w-5" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FlowStageStatusChip({ state }: { state: FlowStageState }) {
  return <StatusChip tone={state === "已完成" ? "success" : state === "进行中" ? "accent" : "neutral"}>{state}</StatusChip>;
}

function TeamDashboard({
  completedResults,
  totalResults,
  waitingResults,
  activeTaskCount,
}: {
  completedResults: number;
  totalResults: number;
  waitingResults: number;
  activeTaskCount: number;
}) {
  const progress = Math.round((completedResults / Math.max(1, totalResults)) * 100);

  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <DashboardMetric icon={Target} value={`${completedResults} / ${totalResults}`} label="指标完成" color="#0b8f7f" progress={progress} />
      <DashboardMetric icon={Clock3} value={`${waitingResults}`} label="待定 指标" color="#e78a16" progress={42} />
      <DashboardMetric icon={SlidersHorizontal} value="1" label="待定 指标" color="#7a3ff2" progress={26} />
      <DashboardMetric icon={Gauge} value={`${activeTaskCount}`} label="待定 指标" color="#1f8fff" progress={68} />
    </section>
  );
}

function DashboardMetric({
  icon: Icon,
  value,
  label,
  color,
  progress,
}: {
  icon: LucideIcon;
  value: string;
  label: string;
  color: string;
  progress: number;
}) {
  return (
    <div className="flex min-h-[96px] items-center gap-4 rounded-xl border border-[#e7e9ee] bg-white px-6 shadow-[0_8px_24px_rgba(22,31,46,0.05)]">
      <div className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: `conic-gradient(${color} 0 ${progress}%, #eef1f5 ${progress}% 100%)` }}>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white">
          <Icon className="h-6 w-6" style={{ color }} />
        </div>
      </div>
      <div>
        <div className="text-2xl font-bold leading-none text-[#111827]">{value}</div>
        <div className="mt-1 text-sm font-medium text-[#667085]">{label}</div>
      </div>
    </div>
  );
}

function ScopeTabs({ value, onChange }: { value: TaskScope; onChange: (scope: TaskScope) => void }) {
  return (
    <div className="flex items-end gap-8 border-b border-[#e4e7ec] text-base font-semibold">
      {[
        { value: "team" as const, label: "团队" },
        { value: "personal" as const, label: "个人" },
      ].map((item) => (
        <button
          key={item.value}
          onClick={() => onChange(item.value)}
          className={clsx("border-b-2 pb-3 transition", value === item.value ? "border-[#0b8f7f] text-[#0b8f7f]" : "border-transparent text-[#667085] hover:text-[#344054]")}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function ObjectivePanel({
  objective,
  results,
  taskOwners,
  objectiveDue,
  reviewDue,
  collapsedResultIds,
  collapsedTaskIds,
  canEditTasks,
  isGoalFrozen,
  onTaskCompletionChange,
  onChecklistItemChange,
  onToggleResult,
  onToggleTask,
}: {
  objective: Objective;
  results: { result: Result; tasks: Task[]; updatedAt: string }[];
  taskOwners: string[];
  objectiveDue: string;
  reviewDue: string;
  collapsedResultIds: Set<string>;
  collapsedTaskIds: Set<string>;
  canEditTasks: boolean;
  isGoalFrozen: boolean;
  onTaskCompletionChange: (taskId: string, done: boolean) => void;
  onChecklistItemChange: (taskId: string, itemId: string, done: boolean) => void;
  onToggleResult: (resultId: string) => void;
  onToggleTask: (taskId: string) => void;
}) {
  const progress = objectiveProgress(results);
  const complete = progress >= 100;

  return (
    <section className={clsx("overflow-hidden rounded-xl border border-[#e7e9ee] shadow-[0_8px_24px_rgba(22,31,46,0.05)]", isGoalFrozen ? "bg-white" : "bg-[#fcfcfb]")}>
      <div className="grid min-h-[58px] items-center gap-4 border-b border-[#edf0f2] bg-white px-5 text-sm xl:grid-cols-[minmax(320px,1fr)_150px_150px_150px_28px]">
        <div className="flex min-w-0 items-center gap-3">
          <ObjectiveFlagIcon />
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-3">
              <div className={clsx("truncate text-lg font-bold", complete ? "text-[#98a2b3] line-through" : "text-[#111827]")}>{objective.title}</div>
              <StatusChip tone={complete ? "success" : objective.status === "At Risk" || objective.status === "Blocked" ? "warning" : "success"}>
                {complete ? "已完成" : objective.status === "At Risk" || objective.status === "Blocked" ? "有风险" : "正常"}
              </StatusChip>
            </div>
          </div>
        </div>
        <AvatarStack names={taskOwners} />
        <ObjectiveTimeValue deadline={objectiveDue || reviewDue} updatedAt={objective.updatedAt} />
        <ProgressValue value={progress} tone={progress >= 80 ? "success" : "neutral"} />
        <span aria-hidden="true" />
      </div>

      <div className="divide-y divide-[#edf0f2]">
        {results.map(({ result, tasks, updatedAt }, index) => (
          <ResultBlock
            key={result.id}
            result={result}
            tasks={tasks}
            updatedAt={updatedAt}
            isLast={index === results.length - 1}
            collapsed={collapsedResultIds.has(result.id)}
            collapsedTaskIds={collapsedTaskIds}
            canEditTasks={canEditTasks}
            onTaskCompletionChange={onTaskCompletionChange}
            onChecklistItemChange={onChecklistItemChange}
            onToggleResult={onToggleResult}
            onToggleTask={onToggleTask}
          />
        ))}
      </div>
    </section>
  );
}

function ResultBlock({
  result,
  tasks,
  updatedAt,
  isLast,
  collapsed,
  collapsedTaskIds,
  canEditTasks,
  onTaskCompletionChange,
  onChecklistItemChange,
  onToggleResult,
  onToggleTask,
}: {
  result: Result;
  tasks: Task[];
  updatedAt: string;
  isLast: boolean;
  collapsed: boolean;
  collapsedTaskIds: Set<string>;
  canEditTasks: boolean;
  onTaskCompletionChange: (taskId: string, done: boolean) => void;
  onChecklistItemChange: (taskId: string, itemId: string, done: boolean) => void;
  onToggleResult: (resultId: string) => void;
  onToggleTask: (taskId: string) => void;
}) {
  const status = indicatorStatus(result, tasks);
  const open = !collapsed;
  const complete = status === "done";
  const [resultElement, setResultElement] = useState<HTMLDivElement | null>(null);
  const resultAnchorId = `metric:${result.id}`;

  return (
    <div ref={setResultElement} className="relative">
      <HierarchyTreeOverlay container={resultElement} />
      <div className={clsx("grid min-h-[50px] items-center gap-4 px-5 text-sm xl:grid-cols-[minmax(340px,1fr)_170px_120px_150px]", complete && "bg-[#f6f7f9]")}>
        <HierarchyCell depth={1} isLast={isLast && (!open || tasks.length === 0)}>
          <button type="button" className="flex h-5 w-5 shrink-0 items-center justify-center text-[#667085]" onClick={() => onToggleResult(result.id)} aria-label={open ? "折叠指标" : "展开指标"}>
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center" data-hierarchy-anchor={resultAnchorId}>
            <MetricSquareIcon tone={status} />
          </span>
          <div className={clsx("truncate text-base font-semibold", complete ? "text-[#98a2b3] line-through" : "text-[#1d2939]")}>{result.title}</div>
        </HierarchyCell>
        <PersonValue name={result.owner} />
        <IndicatorStatusChip status={status} />
        <UpdatedTimeValue date={updatedAt} />
      </div>

      {open && tasks.length > 0 && (
        <div className="pb-2">
          {tasks.map((task, index) => (
            <TaskRow
              key={task.id}
              task={task}
              depth={2}
              isLast={index === tasks.length - 1}
              parentAnchorId={resultAnchorId}
              collapsed={collapsedTaskIds.has(task.id)}
              canEditTasks={canEditTasks}
              onToggleTask={onToggleTask}
              onTaskCompletionChange={onTaskCompletionChange}
              onChecklistItemChange={onChecklistItemChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TaskRow({
  task,
  depth,
  isLast,
  parentAnchorId,
  collapsed,
  canEditTasks,
  onToggleTask,
  onTaskCompletionChange,
  onChecklistItemChange,
}: {
  task: Task;
  depth: 2;
  isLast: boolean;
  parentAnchorId: string;
  collapsed: boolean;
  canEditTasks: boolean;
  onToggleTask: (taskId: string) => void;
  onTaskCompletionChange: (taskId: string, done: boolean) => void;
  onChecklistItemChange: (taskId: string, itemId: string, done: boolean) => void;
}) {
  const status = taskDisplayStatus(task);
  const complete = status === "done";
  const open = !collapsed;
  const hasSubtasks = task.checklist.length > 0;
  const taskAnchorId = `task:${task.id}`;

  return (
    <div className="relative">
      <div
        className={clsx(
          "grid min-h-[42px] items-center gap-4 px-5 text-sm xl:grid-cols-[minmax(340px,1fr)_170px_120px_150px]",
          complete && "bg-[#f6f7f9]",
        )}
      >
        <HierarchyCell depth={depth} isLast={isLast && !hasSubtasks}>
          {hasSubtasks ? (
            <button
              type="button"
              className="flex h-5 w-5 shrink-0 items-center justify-center text-[#667085]"
              data-hierarchy-branch-target={taskAnchorId}
              onClick={() => onToggleTask(task.id)}
              aria-label={open ? "折叠任务" : "展开任务"}
            >
              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : (
            <span className="h-5 w-5 shrink-0" data-hierarchy-branch-target={taskAnchorId} aria-hidden="true" />
          )}
          <span className="flex h-5 w-5 shrink-0 items-center justify-center" data-hierarchy-anchor={taskAnchorId} data-hierarchy-parent={parentAnchorId}>
            <CompletionCheckbox checked={complete} disabled={!canEditTasks} onChange={(checked) => onTaskCompletionChange(task.id, checked)} />
          </span>
          <div className={clsx("truncate text-base font-medium", complete ? "text-[#98a2b3] line-through" : "text-[#1d2939]")}>{task.title}</div>
        </HierarchyCell>
        <PersonValue name={task.assignee} />
        <EmptySlot />
        <UpdatedTimeValue date={task.updatedAt} />
      </div>

      {open &&
        hasSubtasks &&
        task.checklist.map((item, index) => (
          <SubtaskRow
            key={item.id}
            item={item}
            task={task}
            itemIndex={index}
            depth={3}
            isLast={index === task.checklist.length - 1}
            parentAnchorId={taskAnchorId}
            canEditTasks={canEditTasks}
            onChecklistItemChange={onChecklistItemChange}
          />
        ))}
    </div>
  );
}

function SubtaskRow({
  item,
  task,
  itemIndex,
  depth,
  isLast,
  parentAnchorId,
  canEditTasks,
  onChecklistItemChange,
}: {
  item: TaskChecklistItem;
  task: Task;
  itemIndex: number;
  depth: 3;
  isLast: boolean;
  parentAnchorId: string;
  canEditTasks: boolean;
  onChecklistItemChange: (taskId: string, itemId: string, done: boolean) => void;
}) {
  const status = subtaskDisplayStatus(task, item, itemIndex);
  const complete = status === "done";

  return (
    <div className={clsx("grid min-h-[36px] items-center gap-4 px-5 text-sm xl:grid-cols-[minmax(340px,1fr)_170px_120px_150px]", complete && "bg-[#f6f7f9]")}>
      <HierarchyCell depth={depth} isLast={isLast}>
        <span className="flex h-5 w-5 shrink-0 items-center justify-center" data-hierarchy-anchor={`subtask:${task.id}:${item.id}`} data-hierarchy-parent={parentAnchorId}>
          <CompletionCheckbox checked={complete} disabled={!canEditTasks} onChange={(checked) => onChecklistItemChange(task.id, item.id, checked)} />
        </span>
        <div className={clsx("truncate text-sm font-medium", complete ? "text-[#98a2b3] line-through" : "text-[#344054]")}>{item.label}</div>
      </HierarchyCell>
      <EmptySlot />
      <EmptySlot />
      <EmptySlot />
    </div>
  );
}

function CompletionCheckbox({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition hover:[&>span]:border-[#0b8f7f]",
        disabled && "cursor-not-allowed opacity-60",
      )}
      aria-pressed={checked}
      aria-label={checked ? "取消完成" : "标记完成"}
    >
      <CompletionCircleIcon checked={checked} />
    </button>
  );
}

function AvatarStack({ names }: { names: string[] }) {
  if (names.length === 0) {
    return <span className="text-sm font-medium text-[#98a2b3]">未分配</span>;
  }

  return (
    <div className="flex items-center">
      {names.slice(0, 4).map((name, index) => (
        <PersonAvatar key={name} name={name} overlap={index > 0} />
      ))}
      {names.length > 4 && <span className="ml-1 rounded-full bg-[#f2f4f7] px-2 py-1 text-xs font-semibold text-[#475467]">+{names.length - 4}</span>}
    </div>
  );
}

function PersonAvatar({ name, overlap }: { name: string; overlap?: boolean }) {
  return (
    <div
      title={name}
      className={clsx("flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-white shadow-sm", overlap && "-ml-2")}
      style={avatarStyleForName(name)}
    >
      {initials(name)}
    </div>
  );
}

function PersonValue({ name }: { name: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-white text-xs font-bold shadow-sm" style={avatarStyleForName(name)} title={name}>
        {initials(name)}
      </div>
      <span className="truncate text-sm font-medium text-[#667085]">{name}</span>
    </div>
  );
}

function ObjectiveTimeValue({ deadline, updatedAt }: { deadline: string; updatedAt: string }) {
  return (
    <div className="grid gap-1 text-sm font-medium">
      <span className="inline-flex h-5 items-center gap-2 whitespace-nowrap text-[#344054]" title="截止时间" aria-label={`截止时间 ${deadline || "未设置"}`}>
        <CalendarDays className="h-4 w-4 text-[#667085]" />
        {deadline || "未设置"}
      </span>
      <span className="inline-flex h-5 items-center gap-2 whitespace-nowrap text-[#667085]" title="更新时间" aria-label={`更新时间 ${updatedAt || "未设置"}`}>
        <Clock3 className="h-4 w-4 text-[#98a2b3]" />
        {updatedAt || "未设置"}
      </span>
    </div>
  );
}

function UpdatedTimeValue({ date }: { date: string }) {
  return (
    <span className="inline-flex h-7 items-center gap-2 whitespace-nowrap text-sm font-medium text-[#667085]" title="更新时间" aria-label={`更新时间 ${date || "未设置"}`}>
      <Clock3 className="h-4 w-4 text-[#98a2b3]" />
      {date || "未设置"}
    </span>
  );
}

function EmptySlot() {
  return <span className="inline-flex h-7" aria-hidden="true" />;
}

function ProgressValue({ value, tone }: { value: number; tone: "success" | "accent" | "neutral" }) {
  const color = tone === "success" ? "#0b8f7f" : tone === "accent" ? "#0d7df2" : "#e4e7ec";

  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[#eaecf0]">
        <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: color }} />
      </div>
      <span className="w-10 text-right text-sm font-bold text-[#344054]">{value}%</span>
    </div>
  );
}

const indicatorStatusLabel: Record<IndicatorStatus, string> = {
  todo: "待办",
  active: "进行中",
  review: "待验收",
  done: "已完成",
};

function IndicatorStatusChip({ status }: { status: IndicatorStatus }) {
  return <StatusChip tone={status === "review" ? "review" : statusTone(status)}>{indicatorStatusLabel[status]}</StatusChip>;
}

function StatusChip({ tone, children }: { tone: "success" | "warning" | "accent" | "neutral" | "review"; children: React.ReactNode }) {
  return (
    <span
      className={clsx(
        "inline-flex h-7 w-fit min-w-[66px] justify-self-start items-center justify-center rounded-full px-3 text-xs font-bold leading-none",
        tone === "success" && "bg-[#e4fbf6] text-[#0b8f7f]",
        tone === "warning" && "bg-[#fff4e5] text-[#b54708]",
        tone === "accent" && "bg-[#e8f2ff] text-[#0d7df2]",
        tone === "review" && "bg-[#fff7e8] text-[#d56b00]",
        tone === "neutral" && "bg-[#f2f4f7] text-[#667085]",
      )}
    >
      {children}
    </span>
  );
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function toggleSetItem<T>(items: Set<T>, item: T) {
  const next = new Set(items);

  if (next.has(item)) {
    next.delete(item);
  } else {
    next.add(item);
  }

  return next;
}

function latestDate(values: string[]) {
  const dates = values.filter(Boolean).sort();
  return dates.at(-1) ?? "";
}

function addDays(value: string, days: number) {
  if (!value) {
    return "";
  }

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function statusTone(status: SimpleStatus): "success" | "accent" | "neutral" {
  if (status === "done") return "success";
  if (status === "active") return "accent";
  return "neutral";
}

function taskStatusToSimpleStatus(status: TaskStatus): SimpleStatus {
  if (status === "Done") return "done";
  if (status === "In Progress" || status === "In Review") return "active";
  return "todo";
}

function statusProgress(status: SimpleStatus) {
  if (status === "done") return 1;
  if (status === "active") return 0.5;
  return 0;
}

function taskDisplayStatus(task: Task): SimpleStatus {
  if (task.checklist.length > 0) {
    const completedCount = task.checklist.filter((item) => item.done).length;

    if (completedCount === task.checklist.length) return "done";
    if (completedCount > 0 || taskStatusToSimpleStatus(task.status) === "active") return "active";
    return "todo";
  }

  return taskStatusToSimpleStatus(task.status);
}

function firstIncompleteChecklistIndex(task: Task) {
  return task.checklist.findIndex((item) => !item.done);
}

function subtaskDisplayStatus(task: Task, item: TaskChecklistItem, itemIndex: number): SimpleStatus {
  if (item.done) return "done";
  if (taskStatusToSimpleStatus(task.status) === "active" && firstIncompleteChecklistIndex(task) === itemIndex) return "active";
  return "todo";
}

function subtaskProgress(task: Task, item: TaskChecklistItem, itemIndex: number) {
  return statusProgress(subtaskDisplayStatus(task, item, itemIndex));
}

function taskWorkProgress(task: Task) {
  if (task.checklist.length > 0) {
    return average(task.checklist.map((item, index) => subtaskProgress(task, item, index)));
  }

  return statusProgress(taskStatusToSimpleStatus(task.status));
}

function indicatorWorkProgress(result: Result, tasks: Task[]) {
  if (tasks.length > 0) {
    return average(tasks.map((task) => taskWorkProgress(task)));
  }

  return resultProgress(result) / 100;
}

function indicatorStatus(result: Result, tasks: Task[]): IndicatorStatus {
  const workProgress = indicatorWorkProgress(result, tasks);

  if (workProgress >= 1) {
    return resultProgress(result) >= 100 ? "done" : "review";
  }

  if (workProgress > 0) return "active";
  return "todo";
}

function objectiveProgress(results: { result: Result; tasks: Task[] }[]) {
  return Math.round(average(results.map(({ result, tasks }) => indicatorWorkProgress(result, tasks))) * 100);
}
