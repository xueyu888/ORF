import { clsx } from "clsx";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Gauge,
  Target,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useOrf } from "../state/OrfProvider";
import type { Objective, Result, Task, TaskChecklistItem, TaskStatus, WorkStatus } from "../types/orf";
import { initials, resultProgress } from "../utils/format";
import { taskStatusLabel, workStatusLabel } from "../utils/labels";

const avatarColors = ["#54b7aa", "#a56be2", "#f4a261", "#45a8bf", "#eb6f92", "#6d7bdd"];
const currentMember = "Alex Chen";
type TaskScope = "team" | "personal";

export function TasksPage() {
  const { state, updateTaskStatus } = useOrf();
  const [scope, setScope] = useState<TaskScope>("team");
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

  const toggleResult = (resultId: string) => setCollapsedResultIds((items) => toggleSetItem(items, resultId));
  const toggleTask = (taskId: string) => setCollapsedTaskIds((items) => toggleSetItem(items, taskId));

  return (
    <div className="min-h-[calc(100vh-7rem)] rounded-lg bg-white p-5 text-[#1f1f1f]">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-black">任务管理</h1>
      </div>

      <ScopeTabs value={scope} onChange={setScope} />
      {scope === "team" && <TeamDashboard completedResults={completedResults} totalResults={totalResults} />}

      <div className="mt-5 grid gap-5">
        {groups.map((group) => (
          <ObjectivePanel
            key={group.objective.id}
            objective={group.objective}
            results={group.results}
            taskOwners={group.taskOwners}
            objectiveDue={group.objectiveDue}
            reviewDue={group.reviewDue}
            onStatusChange={updateTaskStatus}
            collapsedResultIds={collapsedResultIds}
            collapsedTaskIds={collapsedTaskIds}
            onToggleResult={toggleResult}
            onToggleTask={toggleTask}
          />
        ))}
      </div>
    </div>
  );
}

function ScopeTabs({ value, onChange }: { value: TaskScope; onChange: (scope: TaskScope) => void }) {
  return (
    <div className="mb-5 flex items-end gap-6 border-b border-[#d7d7d7] text-sm font-semibold">
      {[
        { value: "team" as const, label: "团队" },
        { value: "personal" as const, label: "个人" },
      ].map((item) => (
        <button
          key={item.value}
          onClick={() => onChange(item.value)}
          className={clsx("border-b-2 px-0 pb-3", value === item.value ? "border-black text-black" : "border-transparent text-[#777]")}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function TeamDashboard({ completedResults, totalResults }: { completedResults: number; totalResults: number }) {
  const progress = Math.round((completedResults / Math.max(1, totalResults)) * 100);

  return (
    <section className="overflow-hidden rounded-lg border border-[#cfcfcf] bg-white">
      <div className="border-b border-[#d5d5d5] px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-black">Overview</div>
      <div className="grid divide-y divide-[#d2d2d2] md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-4">
        <OverviewMetric icon={Target} value={`${completedResults}/${totalResults}`} progress={progress} color="#3452de" />
        <OverviewMetric icon={Clock3} value="待定" progress={0} color="#3452de" />
        <OverviewMetric icon={CheckCircle2} value="待定" progress={0} color="#3452de" />
        <OverviewMetric icon={Gauge} value="待定" progress={0} color="#3452de" />
      </div>
    </section>
  );
}

function OverviewMetric({
  icon: Icon,
  value,
  progress,
  color,
  accentColor,
}: {
  icon: LucideIcon;
  value: string;
  progress: number;
  color: string;
  accentColor?: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-4">
      <Ring value={progress} color={color} accentColor={accentColor}>
        <Icon className="h-5 w-5 text-[#7b7b7b]" />
      </Ring>
      <div>
        <div className="text-lg font-bold leading-none text-black">{value}</div>
      </div>
    </div>
  );
}

function ObjectivePanel({
  objective,
  results,
  taskOwners,
  objectiveDue,
  reviewDue,
  onStatusChange,
  collapsedResultIds,
  collapsedTaskIds,
  onToggleResult,
  onToggleTask,
}: {
  objective: Objective;
  results: { result: Result; tasks: Task[]; updatedAt: string }[];
  taskOwners: string[];
  objectiveDue: string;
  reviewDue: string;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  collapsedResultIds: Set<string>;
  collapsedTaskIds: Set<string>;
  onToggleResult: (resultId: string) => void;
  onToggleTask: (taskId: string) => void;
}) {
  const complete = objective.progress >= 100 || (results.length > 0 && results.every(({ result }) => resultProgress(result) >= 100));

  return (
    <section className="overflow-hidden rounded-lg border border-[#cfcfcf] bg-white">
      <div className="grid items-center gap-4 border-b border-[#d5d5d5] px-4 py-3 xl:grid-cols-[minmax(280px,1fr)_105px_132px_118px_132px]">
        <Link to={`/objectives/${objective.id}`} className="flex min-w-0 items-center gap-3">
          <FlagBox done={complete} />
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold leading-tight text-black">{objective.title}</div>
          </div>
        </Link>
        <FieldBlock label="目标状态">
          <ObjectiveStatusPill status={objective.status} />
        </FieldBlock>
        <FieldBlock label="负责任务成员头像">
          <AvatarStack names={taskOwners} />
        </FieldBlock>
        <FieldBlock label="目标截止日期">
          <DatePill date={objectiveDue} />
        </FieldBlock>
        <FieldBlock label="评估窗口截止日期">
          <DatePill date={reviewDue} />
        </FieldBlock>
      </div>

      <div className="divide-y divide-[#d9d9d9]">
        {results.map(({ result, tasks, updatedAt }, resultIndex) => (
          <ResultBranch
            key={result.id}
            result={result}
            tasks={tasks}
            updatedAt={updatedAt}
            resultIndex={resultIndex}
            collapsed={collapsedResultIds.has(result.id)}
            collapsedTaskIds={collapsedTaskIds}
            onToggleResult={onToggleResult}
            onToggleTask={onToggleTask}
            onStatusChange={onStatusChange}
          />
        ))}
      </div>
    </section>
  );
}

function ResultBranch({
  result,
  tasks,
  updatedAt,
  resultIndex,
  collapsed,
  collapsedTaskIds,
  onToggleResult,
  onToggleTask,
  onStatusChange,
}: {
  result: Result;
  tasks: Task[];
  updatedAt: string;
  resultIndex: number;
  collapsed: boolean;
  collapsedTaskIds: Set<string>;
  onToggleResult: (resultId: string) => void;
  onToggleTask: (taskId: string) => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
}) {
  const progress = resultProgress(result);
  const complete = progress >= 100;
  const open = !collapsed;

  return (
    <div className="relative px-4 py-3">
      <div className="grid grid-cols-[24px_minmax(0,1fr)] gap-3">
        <TreeControl open={open} label={`${open ? "折叠" : "展开"}指标`} onClick={() => onToggleResult(result.id)} />
        <div className="min-w-0">
          <div className="grid items-center gap-3 xl:grid-cols-[minmax(260px,1fr)_160px_116px]">
            <Link to={`/objectives/${result.objectiveId}/results/${result.id}`} className="flex min-w-0 items-center gap-3">
              <SquareMarker color={resultIndex % 2 === 0 ? "#3f987e" : "#f04a3a"} done={complete} />
              <div className="min-w-0">
                <div className="truncate text-base font-medium text-black">{result.title}</div>
              </div>
            </Link>
            <FieldBlock label="完成状态">
              <CompletionValue complete={complete} value={progress} />
            </FieldBlock>
            <FieldBlock label="更新时间">
              <InlineDate date={updatedAt} />
            </FieldBlock>
          </div>

          {open && tasks.length > 0 && (
            <div className="ml-3 mt-3 border-l border-[#d6d6d6]">
              {tasks.map((task) => (
                <TaskBranch
                  key={task.id}
                  task={task}
                  collapsed={collapsedTaskIds.has(task.id)}
                  onToggleTask={onToggleTask}
                  onStatusChange={onStatusChange}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TaskBranch({
  task,
  collapsed,
  onToggleTask,
  onStatusChange,
}: {
  task: Task;
  collapsed: boolean;
  onToggleTask: (taskId: string) => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
}) {
  const complete = task.status === "Done";
  const open = !collapsed;
  const hasSubtasks = task.checklist.length > 0;

  return (
    <div className="relative py-2.5 pl-6">
      <div className="absolute left-0 top-6 h-0 w-5 border-t border-[#d6d6d6]" />
      <div className="grid items-center gap-3 xl:grid-cols-[minmax(260px,1fr)_96px_112px_112px]">
        <div className="flex min-w-0 items-center gap-2">
          {hasSubtasks ? (
            <TreeControl compact open={open} label={`${open ? "折叠" : "展开"}任务`} onClick={() => onToggleTask(task.id)} />
          ) : (
            <span className="h-5 w-5 shrink-0" />
          )}
          <CircleMarker done={complete} />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-black">{task.title}</div>
          </div>
        </div>
        <FieldBlock label="完成状态">
          <DonePill done={complete} />
        </FieldBlock>
        <FieldBlock label="任务状态">
          <TaskStatusSelect value={task.status} onChange={(status) => onStatusChange(task.id, status)} />
        </FieldBlock>
        <FieldBlock label="更新时间">
          <InlineDate date={task.updatedAt} />
        </FieldBlock>
      </div>

      {open && hasSubtasks && (
        <div className="ml-3 mt-2 border-l border-[#d6d6d6]">
          {task.checklist.map((item) => (
            <SubtaskRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function SubtaskRow({ item }: { item: TaskChecklistItem }) {
  return (
    <div className="relative py-1.5 pl-6">
      <div className="absolute left-0 top-4 h-0 w-5 border-t border-[#d6d6d6]" />
      <div className="grid items-center gap-3 xl:grid-cols-[minmax(260px,1fr)_96px_112px_112px]">
        <div className="flex min-w-0 items-center gap-2">
          <CircleMarker done={item.done} small />
          <div className="min-w-0">
            <div className={clsx("truncate text-sm font-medium", item.done ? "text-[#666]" : "text-black")}>{item.label}</div>
          </div>
        </div>
        <FieldBlock label="完成状态">
          <DonePill done={item.done} />
        </FieldBlock>
        <FieldBlock label="任务状态">
          <span className={clsx("inline-flex rounded-md px-2 py-1 text-xs font-semibold", item.done ? "bg-[#efefef] text-[#777]" : "bg-[#e8edff] text-[#3864dd]")}>
            {item.done ? "Done" : "Ready"}
          </span>
        </FieldBlock>
        <FieldBlock label="更新时间">
          <span className="text-xs font-medium text-[#8a8a8a]">-</span>
        </FieldBlock>
      </div>
    </div>
  );
}

function FieldBlock({ children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0">{children}</div>;
}

function FlagBox({ done }: { done: boolean }) {
  return (
    <div className={clsx("flex h-8 w-8 shrink-0 items-center justify-center rounded-md", done ? "bg-[#d9f2e9]" : "bg-[#dff5f8]")}>
      {done ? <Check className="h-5 w-5 text-[#36997d]" /> : <Target className="h-5 w-5 text-[#79cdda]" />}
    </div>
  );
}

function TreeControl({ open, label, onClick, compact }: { open: boolean; label: string; onClick: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={clsx("shrink-0 text-[#777] transition hover:text-black", compact ? "h-5 w-5" : "mt-1 h-6 w-6")}
    >
      {open ? <ChevronDown className={compact ? "h-5 w-5" : "h-6 w-6"} /> : <ChevronRight className={compact ? "h-5 w-5" : "h-6 w-6"} />}
    </button>
  );
}

function SquareMarker({ color, done }: { color: string; done: boolean }) {
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: done ? "#bdbdbd" : color }}>
      {done && <Check className="h-4 w-4 text-white" />}
    </div>
  );
}

function CircleMarker({ done, small }: { done: boolean; small?: boolean }) {
  return (
    <div
      className={clsx(
        "flex shrink-0 items-center justify-center rounded-full border-[3px]",
        small ? "h-5 w-5 border-2" : "h-7 w-7 border-2",
        done ? "border-[#bcbcbc] bg-[#bcbcbc]" : "border-[#bcbcbc] bg-white",
      )}
    >
      {done && <Check className={small ? "h-3 w-3 text-white" : "h-4 w-4 text-white"} />}
    </div>
  );
}

function CompletionValue({ complete, value }: { complete: boolean; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className={clsx("whitespace-nowrap text-xs font-bold", complete ? "text-[#39987d]" : "text-[#b28a16]")}>{complete ? "已完成" : "未完成"}</span>
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-[#e4e4e4]">
        <div className="h-full rounded-full bg-[#3f987e]" style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs font-semibold text-[#777]">{value}%</span>
    </div>
  );
}

function DonePill({ done }: { done: boolean }) {
  return (
    <span className={clsx("inline-flex whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold", done ? "bg-[#efefef] text-[#777]" : "bg-[#f3f3f3] text-[#777]")}>
      {done ? "已完成" : "未完成"}
    </span>
  );
}

function TaskStatusSelect({ value, onChange }: { value: TaskStatus; onChange: (status: TaskStatus) => void }) {
  return (
    <div className="relative inline-flex">
      <select
        className={clsx(
          "h-8 appearance-none rounded-md border-0 py-1 pl-2 pr-7 text-xs font-semibold outline-none",
          value === "Done" && "bg-[#efefef] text-[#777]",
          value === "In Progress" && "bg-[#e8edff] text-[#3864dd]",
          value === "In Review" && "bg-[#eee8ff] text-[#7655d9]",
          value === "Todo" && "bg-[#e8f7f9] text-[#397982]",
          value === "Backlog" && "bg-[#f1f1f1] text-[#777]",
        )}
        value={value}
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

function ObjectiveStatusPill({ status }: { status: WorkStatus }) {
  return (
    <span
      className={clsx(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-bold",
        status === "On Track" && "bg-[#e0f4eb] text-[#338b73]",
        status === "At Risk" && "bg-[#fff0c9] text-[#a77a0b]",
        status === "Blocked" && "bg-[#ffe1de] text-[#c64538]",
        status === "Draft" && "bg-[#eeeeee] text-[#777]",
      )}
    >
      {workStatusLabel[status]}
    </span>
  );
}

function AvatarStack({ names }: { names: string[] }) {
  if (names.length === 0) {
    return <span className="text-xs font-medium text-[#888]">未分配</span>;
  }

  return (
    <div className="flex items-center">
      {names.slice(0, 5).map((name, index) => (
        <PersonAvatar key={name} name={name} index={index} overlap={index > 0} />
      ))}
      {names.length > 5 && <span className="ml-2 text-xs font-semibold text-[#777]">+{names.length - 5}</span>}
    </div>
  );
}

function PersonAvatar({ name, index = 0, size = "md", overlap }: { name: string; index?: number; size?: "md" | "lg"; overlap?: boolean }) {
  return (
    <div
      title={name}
      className={clsx(
        "flex shrink-0 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow-sm",
        size === "lg" ? "h-8 w-8" : "h-6 w-6 text-[10px]",
        overlap && "-ml-2",
      )}
      style={{ backgroundColor: avatarColors[index % avatarColors.length] }}
    >
      {initials(name)}
    </div>
  );
}

function DatePill({ date }: { date: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-[#f2f2f2] px-2 py-1 text-xs font-semibold text-[#777]">
      <CalendarDays className="h-3.5 w-3.5 text-[#777]" />
      {formatMonthDay(date)}
    </span>
  );
}

function InlineDate({ date }: { date: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#777]">
      <Clock3 className="h-3.5 w-3.5 text-[#888]" />
      {date || "未设置"}
    </span>
  );
}

function Ring({
  value,
  color,
  accentColor,
  children,
}: {
  value: number;
  color: string;
  accentColor?: string;
  children: React.ReactNode;
}) {
  const clipped = Math.max(0, Math.min(100, value));
  const background = accentColor
    ? `conic-gradient(${accentColor} 0 26%, #f7b928 26% 34%, ${color} 34% ${clipped}%, #d6d6d6 ${clipped}% 100%)`
    : `conic-gradient(${color} 0 ${clipped}%, #d6d6d6 ${clipped}% 100%)`;

  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background }}>
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white">{children}</div>
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

function formatMonthDay(value: string) {
  if (!value) {
    return "未设置";
  }

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
