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
import { designTokens } from "../config/designTokens";
import { useOrf } from "../state/OrfProvider";
import type { Objective, Result, Task, TaskChecklistItem, TaskStatus } from "../types/orf";
import { initials, resultProgress } from "../utils/format";
import { taskStatusLabel } from "../utils/labels";

const avatarColors = designTokens.palette.avatar;
const currentMember = "Alex Chen";

type TaskScope = "team" | "personal";
type FlowStage = "goalSetting" | "resultClaiming" | "orfReestimate" | "goalFrozen" | "supervisorConfirm";

const flowStages: { value: FlowStage; label: string; state: string }[] = [
  { value: "goalSetting", label: "目标设定", state: "已完成" },
  { value: "resultClaiming", label: "指标领取", state: "已完成" },
  { value: "orfReestimate", label: "ORF 重估", state: "进行中" },
  { value: "goalFrozen", label: "目标冻结", state: "待确认" },
  { value: "supervisorConfirm", label: "主管确认", state: "待确认" },
];

export function TasksPage() {
  const { state, updateTaskStatus } = useOrf();
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

  const completedResults = state.results.filter((result) => resultProgress(result) >= 100).length;
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
            onStatusChange={updateTaskStatus}
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
                <span className={clsx("mt-0.5 block truncate text-sm font-medium", active ? "text-[#0b8f7f]" : "text-[#98a2b3]")}>{stage.state}</span>
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
  onStatusChange,
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
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onToggleResult: (resultId: string) => void;
  onToggleTask: (taskId: string) => void;
}) {
  const progress = objective.progress;

  return (
    <section className={clsx("overflow-hidden rounded-xl border border-[#e7e9ee] shadow-[0_8px_24px_rgba(22,31,46,0.05)]", isGoalFrozen ? "bg-white" : "bg-[#fcfcfb]")}>
      <div className="grid min-h-[58px] items-center gap-4 border-b border-[#edf0f2] bg-white px-5 text-sm xl:grid-cols-[minmax(320px,1fr)_150px_150px_150px_28px]">
        <div className="flex min-w-0 items-center gap-3">
          <ChevronDown className="h-5 w-5 shrink-0 text-[#344054]" />
          <GoalIcon done={progress >= 100} />
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-3">
              <div className="truncate text-lg font-bold text-[#111827]">{objective.title}</div>
              <StatusChip tone={objective.status === "At Risk" || objective.status === "Blocked" ? "warning" : "success"}>{objective.status === "At Risk" || objective.status === "Blocked" ? "有风险" : "正常"}</StatusChip>
            </div>
          </div>
        </div>
        <AvatarStack names={taskOwners} />
        <DateValue date={objectiveDue || reviewDue} />
        <ProgressValue value={progress} tone={progress >= 80 ? "success" : "neutral"} />
        <ChevronDown className="ml-auto h-5 w-5 rotate-180 text-[#344054]" />
      </div>

      <div className="divide-y divide-[#edf0f2]">
        {results.map(({ result, tasks, updatedAt }) => (
          <ResultBlock
            key={result.id}
            result={result}
            tasks={tasks}
            updatedAt={updatedAt}
            collapsed={collapsedResultIds.has(result.id)}
            collapsedTaskIds={collapsedTaskIds}
            canEditTasks={canEditTasks}
            onStatusChange={onStatusChange}
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
  collapsed,
  collapsedTaskIds,
  canEditTasks,
  onStatusChange,
  onToggleResult,
  onToggleTask,
}: {
  result: Result;
  tasks: Task[];
  updatedAt: string;
  collapsed: boolean;
  collapsedTaskIds: Set<string>;
  canEditTasks: boolean;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onToggleResult: (resultId: string) => void;
  onToggleTask: (taskId: string) => void;
}) {
  const progress = resultProgress(result);
  const open = !collapsed;
  const complete = progress >= 100;

  return (
    <div>
      <div className="grid min-h-[50px] items-center gap-4 px-5 text-sm xl:grid-cols-[minmax(360px,1fr)_160px_130px_260px]">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" className="text-[#475467]" onClick={() => onToggleResult(result.id)} aria-label={open ? "折叠指标" : "展开指标"}>
            {open ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
          </button>
          <StatusDot done={complete} active={!complete && progress > 0} />
          <div className="truncate text-base font-semibold text-[#1d2939]">{result.title}</div>
        </div>
        <PersonValue name={result.owner} />
        <CompletionChip complete={complete} active={!complete && progress > 0} />
        <div className="grid grid-cols-[120px_1fr] items-center gap-4">
          <DateValue date={updatedAt} />
          <ProgressValue value={progress} tone={complete ? "success" : "accent"} />
        </div>
      </div>

      {open && tasks.length > 0 && (
        <div className="pb-2">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              level={1}
              collapsed={collapsedTaskIds.has(task.id)}
              canEditTasks={canEditTasks}
              onToggleTask={onToggleTask}
              onStatusChange={onStatusChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TaskRow({
  task,
  level,
  collapsed,
  canEditTasks,
  onToggleTask,
  onStatusChange,
}: {
  task: Task;
  level: number;
  collapsed: boolean;
  canEditTasks: boolean;
  onToggleTask: (taskId: string) => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
}) {
  const complete = task.status === "Done";
  const active = task.status === "In Progress" || task.status === "In Review";
  const open = !collapsed;
  const hasSubtasks = task.checklist.length > 0;
  const progress = taskProgress(task.status);

  return (
    <div>
      <div
        className={clsx(
          "mx-4 grid min-h-[42px] items-center gap-4 rounded-lg px-2 text-sm xl:grid-cols-[minmax(360px,1fr)_160px_130px_260px]",
          complete && "bg-[#f4fffc] ring-1 ring-[#b7e7df]",
        )}
      >
        <div className="relative flex min-w-0 items-center gap-3" style={{ paddingLeft: `${level * 28}px` }}>
          {level > 0 && <span className="absolute left-0 top-1/2 h-px w-5 bg-[#d0d5dd]" />}
          {hasSubtasks ? (
            <button type="button" className="text-[#667085]" onClick={() => onToggleTask(task.id)} aria-label={open ? "折叠任务" : "展开任务"}>
              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : (
            <span className="h-4 w-4 shrink-0" />
          )}
          <StatusDot done={complete} active={active} />
          <div className="truncate text-base font-medium text-[#1d2939]">{task.title}</div>
        </div>
        <PersonValue name={task.assignee} />
        <TaskStatusSelect value={task.status} disabled={!canEditTasks} onChange={(status) => onStatusChange(task.id, status)} />
        <div className="grid grid-cols-[120px_1fr] items-center gap-4">
          <DateValue date={task.updatedAt} />
          <ProgressValue value={progress} tone={complete ? "success" : active ? "accent" : "neutral"} />
        </div>
      </div>

      {open &&
        hasSubtasks &&
        task.checklist.map((item) => (
          <SubtaskRow key={item.id} item={item} level={level + 1} />
        ))}
    </div>
  );
}

function SubtaskRow({ item, level }: { item: TaskChecklistItem; level: number }) {
  return (
    <div className="mx-4 grid min-h-[36px] items-center gap-4 px-2 text-sm xl:grid-cols-[minmax(360px,1fr)_160px_130px_260px]">
      <div className="relative flex min-w-0 items-center gap-3" style={{ paddingLeft: `${level * 28}px` }}>
        <span className="absolute left-0 top-1/2 h-px w-5 bg-[#d0d5dd]" />
        <span className="h-4 w-4 shrink-0" />
        <StatusDot done={item.done} active={false} />
        <div className="truncate text-sm font-medium text-[#344054]">{item.label}</div>
      </div>
      <span className="text-sm text-[#98a2b3]">-</span>
      <CompletionChip complete={item.done} active={false} />
      <div className="grid grid-cols-[120px_1fr] items-center gap-4">
        <span className="text-sm text-[#98a2b3]">-</span>
        <ProgressValue value={item.done ? 100 : 0} tone={item.done ? "success" : "neutral"} />
      </div>
    </div>
  );
}

function GoalIcon({ done }: { done: boolean }) {
  return (
    <div className={clsx("flex h-7 w-7 shrink-0 items-center justify-center rounded-full", done ? "bg-[#0b8f7f]" : "bg-[#e4fbf6] ring-1 ring-[#a4ded4]")}>
      {done ? <Check className="h-4 w-4 text-white" /> : <Target className="h-4 w-4 text-[#0b8f7f]" />}
    </div>
  );
}

function StatusDot({ done, active }: { done: boolean; active: boolean }) {
  return (
    <span
      className={clsx(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
        done && "border-[#0b8f7f] bg-[#0b8f7f]",
        active && !done && "border-[#1f8fff] bg-white",
        !done && !active && "border-[#98a2b3] bg-white",
      )}
    >
      {done && <Check className="h-3.5 w-3.5 text-white" />}
      {active && !done && <span className="h-2 w-2 rounded-full bg-[#1f8fff]" />}
    </span>
  );
}

function AvatarStack({ names }: { names: string[] }) {
  if (names.length === 0) {
    return <span className="text-sm font-medium text-[#98a2b3]">未分配</span>;
  }

  return (
    <div className="flex items-center">
      {names.slice(0, 4).map((name, index) => (
        <PersonAvatar key={name} name={name} index={index} overlap={index > 0} />
      ))}
      {names.length > 4 && <span className="ml-1 rounded-full bg-[#f2f4f7] px-2 py-1 text-xs font-semibold text-[#475467]">+{names.length - 4}</span>}
    </div>
  );
}

function PersonAvatar({ name, index = 0, overlap }: { name: string; index?: number; overlap?: boolean }) {
  return (
    <div
      title={name}
      className={clsx("flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-white shadow-sm", overlap && "-ml-2")}
      style={{ backgroundColor: avatarColors[index % avatarColors.length] }}
    >
      {initials(name)}
    </div>
  );
}

function PersonValue({ name }: { name: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#e4fbf6] text-xs font-bold text-[#0b8f7f]">{initials(name)}</div>
      <span className="truncate text-sm font-medium text-[#667085]">{name}</span>
    </div>
  );
}

function DateValue({ date }: { date: string }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-sm font-medium text-[#667085]">
      <CalendarDays className="h-4 w-4 text-[#98a2b3]" />
      {date || "未设置"}
    </span>
  );
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

function CompletionChip({ complete, active }: { complete: boolean; active: boolean }) {
  if (complete) {
    return <StatusChip tone="success">已完成</StatusChip>;
  }

  return <StatusChip tone={active ? "accent" : "neutral"}>{active ? "进行中" : "待办"}</StatusChip>;
}

function StatusChip({ tone, children }: { tone: "success" | "warning" | "accent" | "neutral"; children: React.ReactNode }) {
  return (
    <span
      className={clsx(
        "inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-bold",
        tone === "success" && "bg-[#e4fbf6] text-[#0b8f7f]",
        tone === "warning" && "bg-[#fff4e5] text-[#b54708]",
        tone === "accent" && "bg-[#e8f2ff] text-[#0d7df2]",
        tone === "neutral" && "bg-[#f2f4f7] text-[#667085]",
      )}
    >
      {children}
    </span>
  );
}

function TaskStatusSelect({ value, disabled = false, onChange }: { value: TaskStatus; disabled?: boolean; onChange: (status: TaskStatus) => void }) {
  return (
    <div className="relative inline-flex">
      <select
        className={clsx(
          "h-8 appearance-none rounded-full border-0 py-1 pl-3 pr-7 text-xs font-bold outline-none",
          disabled && "cursor-not-allowed opacity-80",
          value === "Done" && "bg-[#e4fbf6] text-[#0b8f7f]",
          (value === "In Progress" || value === "In Review") && "bg-[#e8f2ff] text-[#0d7df2]",
          (value === "Todo" || value === "Backlog") && "bg-[#f2f4f7] text-[#667085]",
        )}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as TaskStatus)}
      >
        {(["Backlog", "Todo", "In Progress", "In Review", "Done"] as TaskStatus[]).map((status) => (
          <option key={status} value={status}>
            {taskStatusLabel[status]}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-current" />
    </div>
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

function taskProgress(status: TaskStatus) {
  if (status === "Done") return 100;
  if (status === "In Progress" || status === "In Review") return 50;
  return 0;
}
