import { clsx } from "clsx";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  Filter,
  Gauge,
  GripVertical,
  MessageSquare,
  Move,
  Pencil,
  Plus,
  Repeat2,
  Send,
  SlidersHorizontal,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { type CSSProperties, type FormEvent, useMemo, useState } from "react";
import { HierarchyCell, HierarchyTreeOverlay } from "../components/OrfHierarchyTree";
import { CompletionCircleIcon, MetricSquareIcon, ObjectiveFlagIcon } from "../components/OrfIconAssets";
import { useOrf } from "../state/OrfProvider";
import type { CommentTargetType, CommentThread, Objective, Result, Task, TaskChecklistItem, TaskStatus } from "../types/orf";
import { avatarStyleForName } from "../utils/avatar";
import { initials, resultProgress } from "../utils/format";

const currentMember = "Alex Chen";

type TaskScope = "team" | "personal";
type FlowStage = "goalSetting" | "resultClaiming" | "orfReestimate" | "goalFrozen";
type SimpleStatus = "todo" | "active" | "done";
type IndicatorStatus = "todo" | "active" | "review" | "done";
type BlockAction = "convert" | "move" | "copyLink" | "comment" | "askAi" | "delete";
type BlockTarget =
  | { type: "objective"; id: string; title: string }
  | { type: "result"; id: string; title: string; objectiveId: string }
  | { type: "task"; id: string; title: string; resultId: string; objectiveId: string; hasSubtasks: boolean }
  | { type: "subtask"; id: string; title: string; taskId: string; resultId: string; objectiveId: string };

const flowStages: { value: FlowStage; label: string }[] = [
  { value: "goalSetting", label: "目标设定" },
  { value: "resultClaiming", label: "指标领取" },
  { value: "orfReestimate", label: "ORF 重估" },
  { value: "goalFrozen", label: "目标冻结" },
];

const flowStageTheme: Record<FlowStage, { bg: string; border: string; color: string; soft: string }> = {
  goalSetting: { bg: "#eefaf7", border: "#9fd8cf", color: "#2f9c89", soft: "#dff4ef" },
  resultClaiming: { bg: "#eff6ff", border: "#a7c7f4", color: "#2563eb", soft: "#dbeafe" },
  orfReestimate: { bg: "#fff7e8", border: "#f4c27a", color: "#d97706", soft: "#fde7bd" },
  goalFrozen: { bg: "#f5f3ff", border: "#c4b5fd", color: "#7c3aed", soft: "#e9d5ff" },
};

export function TasksPage() {
  const {
    state,
    openModal,
    notify,
    createTaskChecklistItem,
    setTaskCompletion,
    updateTaskChecklistItem,
    addComment,
    updateCommentMessage,
    deleteCommentMessage,
  } = useOrf();
  const [scope, setScope] = useState<TaskScope>("team");
  const [flowStage, setFlowStage] = useState<FlowStage>("orfReestimate");
  const [collapsedResultIds, setCollapsedResultIds] = useState<Set<string>>(() => new Set());
  const [collapsedTaskIds, setCollapsedTaskIds] = useState<Set<string>>(() => new Set());
  const [commentTarget, setCommentTarget] = useState<BlockTarget | null>(null);
  const [activeBlockActionId, setActiveBlockActionId] = useState<string | null>(null);
  const [openBlockActionId, setOpenBlockActionId] = useState<string | null>(null);

  const groups = useMemo(
    () =>
      state.objectives
        .map((objective) => {
          const objectiveTasks = state.tasks.filter((task) => task.linkedObjectiveId === objective.id);
          const results = state.results
            .filter((result) => objective.resultIds.includes(result.id))
            .filter((result) => scope === "team" || result.owner === currentMember)
            .map((result) => {
              const resultTasks = objectiveTasks.filter((task) => task.linkedResultId === result.id);

              return {
                result,
                tasks: resultTasks,
                updatedAt: latestDate([
                  ...resultTasks.map((task) => task.updatedAt),
                  ...resultTasks.flatMap((task) => task.checklist.map((item) => item.updatedAt)),
                  ...state.evidence.filter((item) => item.linkedResultId === result.id).map((item) => item.date),
                  ...state.feedback.filter((item) => item.linkedResultId === result.id).map((item) => item.updatedAt),
                ]),
              };
            })
            .filter((group) => scope === "team" || group.result.owner === currentMember);
          const visibleObjectiveTasks = results.flatMap((group) => group.tasks);

          return {
            objective,
            results,
            resultOwners: unique(results.map((group) => group.result.owner)),
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
  const commentCounts = useMemo(() => getCommentCounts(state.comments), [state.comments]);
  const completedResults = state.results.filter((result) => indicatorStatus(result, resultTaskMap.get(result.id) ?? []) === "done").length;
  const totalResults = state.results.length;
  const overallObjectiveProgress = Math.round(average(groups.map((group) => objectiveProgress(group.results))));
  const flowStageIndex = flowStages.findIndex((stage) => stage.value === flowStage);
  const isGoalFrozen = flowStage === "goalFrozen";
  const canEditTasks = true;

  const toggleResult = (resultId: string) => setCollapsedResultIds((items) => toggleSetItem(items, resultId));
  const toggleTask = (taskId: string) => setCollapsedTaskIds((items) => toggleSetItem(items, taskId));
  const handleAddResult = (objectiveId: string) => openModal({ type: "newResult", objectiveId });
  const handleAddTask = (result: Result) => openModal({ type: "newTask", objectiveId: result.objectiveId, resultId: result.id });
  const handleAddSubtask = (taskId: string, afterItemId?: string) => {
    createTaskChecklistItem(taskId, afterItemId);
    setCollapsedTaskIds((items) => {
      const next = new Set(items);
      next.delete(taskId);
      return next;
    });
  };
  const handleBlockAction = (action: BlockAction, target: BlockTarget) => {
    setOpenBlockActionId(null);

    if (action === "copyLink") {
      const link = blockLinkForTarget(target);
      const write = navigator.clipboard?.writeText(link);
      if (!write) {
        notify("当前浏览器不支持复制链接");
        return;
      }

      void write.then(() => notify("链接已复制")).catch(() => notify("复制链接失败"));
      return;
    }

    if (action === "move") {
      notify(target.type === "objective" || target.type === "result" ? "目标和指标不支持移动" : "移动选择器待实现");
      return;
    }

    if (action === "convert") {
      if (target.type === "task" && target.hasSubtasks) {
        notify("有子任务的任务不能转为子任务");
        return;
      }

      notify(target.type === "objective" || target.type === "result" ? "目标和指标暂不支持转换" : "转换功能待实现");
      return;
    }

    if (action === "comment") {
      setCommentTarget((current) => (current?.type === target.type && current.id === target.id ? null : target));
      return;
    }

    if (action === "askAi") {
      notify("问 AI 功能待实现");
      return;
    }

    notify("删除确认待实现");
  };

  return (
    <div className="grid gap-4">
      {scope === "team" && (
        <TeamDashboard
          completedResults={completedResults}
          totalResults={totalResults}
          overallObjectiveProgress={overallObjectiveProgress}
          activeTaskCount={state.tasks.filter((task) => task.status === "In Progress" || task.status === "In Review").length}
        />
      )}

      <div className="orf-task-toolbar flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ScopeTabs value={scope} onChange={setScope} />
        <div className="flex flex-wrap items-center gap-2">
          <PlanModeControl value={flowStage} activeIndex={flowStageIndex} onChange={setFlowStage} />
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

      <div className="grid gap-3">
        {groups.map((group) => (
          <ObjectivePanel
            key={group.objective.id}
            objective={group.objective}
            results={group.results}
            resultOwners={group.resultOwners}
            objectiveDue={group.objectiveDue}
            reviewDue={group.reviewDue}
            collapsedResultIds={collapsedResultIds}
            collapsedTaskIds={collapsedTaskIds}
            commentCounts={commentCounts}
            canEditTasks={canEditTasks}
            isGoalFrozen={isGoalFrozen}
            onTaskCompletionChange={setTaskCompletion}
            onChecklistItemChange={updateTaskChecklistItem}
            onToggleResult={toggleResult}
            onToggleTask={toggleTask}
            onAddResult={handleAddResult}
            onAddTask={handleAddTask}
            onAddSubtask={handleAddSubtask}
            onBlockAction={handleBlockAction}
            activeBlockActionId={activeBlockActionId}
            openBlockActionId={openBlockActionId}
            onActiveBlockActionChange={setActiveBlockActionId}
            onOpenBlockActionChange={setOpenBlockActionId}
          />
        ))}
      </div>

      {commentTarget && (
        <CommentPanel
          key={`${commentTarget.type}:${commentTarget.id}`}
          threads={state.comments.filter((thread) => thread.targetType === commentTarget.type && thread.targetId === commentTarget.id)}
          onAddComment={(body) =>
            addComment({
              targetType: commentTarget.type,
              targetId: commentTarget.id,
              targetTitle: commentTarget.title,
              body,
              author: currentMember,
            })
          }
          onUpdateComment={updateCommentMessage}
          onDeleteComment={deleteCommentMessage}
        />
      )}
    </div>
  );
}

function PlanModeControl({
  value,
  activeIndex,
  onChange,
}: {
  value: FlowStage;
  activeIndex: number;
  onChange: (stage: FlowStage) => void;
}) {
  const [open, setOpen] = useState(false);
  const activeStage = flowStages.find((stage) => stage.value === value) ?? flowStages[0];

  return (
    <div className="relative">
      <button
        type="button"
        className="orf-floating-control orf-plan-mode-control inline-flex h-10 items-center gap-2 px-3 text-sm font-semibold"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
      >
        <StageProgressDot index={activeIndex} stage={activeStage.value} />
        <span>{activeStage.label}</span>
        <ChevronDown className="h-4 w-4 text-[#667085]" />
      </button>

      {open && (
        <div className="orf-popover orf-plan-popover absolute right-0 z-40 mt-2 w-72 p-2" role="menu">
          {flowStages.map((stage, index) => {
            const active = value === stage.value;
            const theme = flowStageTheme[stage.value];

            return (
            <button
              key={stage.value}
              type="button"
              role="menuitemradio"
              aria-checked={active}
              onClick={() => {
                onChange(stage.value);
                setOpen(false);
              }}
              className={clsx(
                "orf-plan-stage-option flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition",
                active ? "text-[#1d2939]" : "text-[#667085] hover:bg-[var(--orf-bg-muted)]",
              )}
              style={active ? { backgroundColor: "var(--orf-bg-muted)" } : undefined}
            >
              <StageProgressDot index={index} stage={stage.value} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{stage.label}</span>
              </span>
            </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StageProgressDot({ index, stage }: { index: number; stage: FlowStage }) {
  const theme = flowStageTheme[stage];
  const progress = ((Math.max(0, index) + 1) / flowStages.length) * 100;

  return (
    <span
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
      style={{ background: `conic-gradient(${theme.color} 0 ${progress}%, #e5e7eb ${progress}% 100%)` }}
      aria-hidden="true"
    >
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: theme.bg, boxShadow: `inset 0 0 0 1px ${theme.border}` }} />
    </span>
  );
}

function TeamDashboard({
  completedResults,
  totalResults,
  overallObjectiveProgress,
  activeTaskCount,
}: {
  completedResults: number;
  totalResults: number;
  overallObjectiveProgress: number;
  activeTaskCount: number;
}) {
  const progress = Math.round((completedResults / Math.max(1, totalResults)) * 100);

  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <DashboardMetric icon={Target} value={`${completedResults} / ${totalResults}`} label="指标完成" color="#0b8f7f" progress={progress} />
      <DashboardMetric icon={Clock3} value={`${overallObjectiveProgress}%`} label="目标总体进度" color="#e78a16" progress={overallObjectiveProgress} />
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
  const progressWidth = `${Math.max(0, Math.min(100, progress))}%`;
  const metricStyle = { "--orf-dashboard-color": color } as CSSProperties;

  return (
    <div className="orf-dashboard-metric flex min-h-[126px] flex-col items-center justify-center gap-2 px-5 py-4 text-center" style={metricStyle}>
      <div className="orf-dashboard-emblem flex h-12 w-12 items-center justify-center">
        <Icon className="h-6 w-6" />
      </div>
      <div className="min-w-0">
        <div className="text-3xl font-semibold leading-none text-[#1f2f45]">{value}</div>
        <div className="mt-1 text-xs font-semibold text-[#7b6a50]">{label}</div>
      </div>
      <div className="orf-dashboard-progress h-1.5 w-full max-w-[150px] overflow-hidden" aria-hidden="true">
        <span style={{ width: progressWidth }} />
      </div>
    </div>
  );
}

function ScopeTabs({ value, onChange }: { value: TaskScope; onChange: (scope: TaskScope) => void }) {
  return (
    <div className="orf-scope-tabs flex items-center gap-1 text-sm font-semibold">
      {[
        { value: "team" as const, label: "团队" },
        { value: "personal" as const, label: "个人" },
      ].map((item) => (
        <button
          key={item.value}
          onClick={() => onChange(item.value)}
          className={clsx("orf-scope-tab transition", value === item.value ? "orf-scope-tab-active" : "orf-scope-tab-inactive")}
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
  resultOwners,
  objectiveDue,
  reviewDue,
  collapsedResultIds,
  collapsedTaskIds,
  commentCounts,
  canEditTasks,
  isGoalFrozen,
  onTaskCompletionChange,
  onChecklistItemChange,
  onToggleResult,
  onToggleTask,
  onAddResult,
  onAddTask,
  onAddSubtask,
  onBlockAction,
  activeBlockActionId,
  openBlockActionId,
  onActiveBlockActionChange,
  onOpenBlockActionChange,
}: {
  objective: Objective;
  results: { result: Result; tasks: Task[]; updatedAt: string }[];
  resultOwners: string[];
  objectiveDue: string;
  reviewDue: string;
  collapsedResultIds: Set<string>;
  collapsedTaskIds: Set<string>;
  commentCounts: Map<string, number>;
  canEditTasks: boolean;
  isGoalFrozen: boolean;
  onTaskCompletionChange: (taskId: string, done: boolean) => void;
  onChecklistItemChange: (taskId: string, itemId: string, done: boolean) => void;
  onToggleResult: (resultId: string) => void;
  onToggleTask: (taskId: string) => void;
  onAddResult: (objectiveId: string) => void;
  onAddTask: (result: Result) => void;
  onAddSubtask: (taskId: string, afterItemId?: string) => void;
  onBlockAction: (action: BlockAction, target: BlockTarget) => void;
  activeBlockActionId: string | null;
  openBlockActionId: string | null;
  onActiveBlockActionChange: (id: string | null) => void;
  onOpenBlockActionChange: (id: string | null) => void;
}) {
  const progress = objectiveProgress(results);
  const complete = progress >= 100;
  const objectiveActionId = `objective:${objective.id}`;
  const objectiveAnchorId = `objective:${objective.id}`;
  const [objectiveElement, setObjectiveElement] = useState<HTMLElement | null>(null);
  const objectiveRowActive = activeBlockActionId === objectiveActionId || openBlockActionId === objectiveActionId;

  return (
    <section
      ref={setObjectiveElement}
      className={clsx("orf-objective-panel relative", isGoalFrozen ? "orf-objective-panel-frozen" : "orf-objective-panel-editable")}
    >
      <HierarchyTreeOverlay container={objectiveElement} />
      <div
        className={clsx(
          "orf-objective-header group relative grid min-h-[58px] items-center gap-4 px-5 text-sm xl:grid-cols-[minmax(320px,1fr)_150px_150px_150px_28px]",
          objectiveRowActive && "orf-row-active",
        )}
        onPointerEnter={() => onActiveBlockActionChange(objectiveActionId)}
        onPointerLeave={() => {
          if (activeBlockActionId === objectiveActionId) {
            onActiveBlockActionChange(null);
          }
        }}
      >
        <BlockActions
          actionId={objectiveActionId}
          addLabel="添加指标"
          left={blockActionLeft.objective}
          activeActionId={activeBlockActionId}
          openActionId={openBlockActionId}
          onActiveActionChange={onActiveBlockActionChange}
          onOpenActionChange={onOpenBlockActionChange}
          onAdd={() => onAddResult(objective.id)}
          onAction={(action) => onBlockAction(action, { type: "objective", id: objective.id, title: objective.title })}
        />
        <div className="relative z-30 flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center" data-hierarchy-anchor={objectiveAnchorId}>
            <ObjectiveFlagIcon complete={complete} />
          </span>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-3">
              <div className={clsx("orf-objective-title truncate text-lg font-bold", complete ? "text-[#98a2b3] line-through" : "text-[#111827]")}>{objective.title}</div>
              <CommentCountBadge
                count={commentCountFor(commentCounts, "objective", objective.id)}
                onClick={() => onBlockAction("comment", { type: "objective", id: objective.id, title: objective.title })}
              />
              <StatusChip tone={complete ? "done" : objective.status === "At Risk" || objective.status === "Blocked" ? "warning" : "success"}>
                {complete ? "已完成" : objective.status === "At Risk" || objective.status === "Blocked" ? "有风险" : "正常"}
              </StatusChip>
            </div>
          </div>
        </div>
        <AvatarStack names={resultOwners} />
        <ObjectiveTimeValue deadline={objectiveDue || reviewDue} updatedAt={objective.updatedAt} />
        <ProgressValue value={progress} tone={progress >= 80 ? "success" : "neutral"} />
        <span aria-hidden="true" />
      </div>

      <div className="orf-objective-body">
        {results.map(({ result, tasks, updatedAt }, index) => (
          <ResultBlock
            key={result.id}
            result={result}
            tasks={tasks}
            updatedAt={updatedAt}
            isLast={index === results.length - 1}
            collapsed={collapsedResultIds.has(result.id)}
            parentAnchorId={objectiveAnchorId}
            collapsedTaskIds={collapsedTaskIds}
            commentCounts={commentCounts}
            canEditTasks={canEditTasks}
            onTaskCompletionChange={onTaskCompletionChange}
            onChecklistItemChange={onChecklistItemChange}
            onToggleResult={onToggleResult}
            onToggleTask={onToggleTask}
            onAddTask={onAddTask}
            onAddSubtask={onAddSubtask}
            onBlockAction={onBlockAction}
            activeBlockActionId={activeBlockActionId}
            openBlockActionId={openBlockActionId}
            onActiveBlockActionChange={onActiveBlockActionChange}
            onOpenBlockActionChange={onOpenBlockActionChange}
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
  parentAnchorId,
  collapsedTaskIds,
  commentCounts,
  canEditTasks,
  onTaskCompletionChange,
  onChecklistItemChange,
  onToggleResult,
  onToggleTask,
  onAddTask,
  onAddSubtask,
  onBlockAction,
  activeBlockActionId,
  openBlockActionId,
  onActiveBlockActionChange,
  onOpenBlockActionChange,
}: {
  result: Result;
  tasks: Task[];
  updatedAt: string;
  isLast: boolean;
  collapsed: boolean;
  parentAnchorId: string;
  collapsedTaskIds: Set<string>;
  commentCounts: Map<string, number>;
  canEditTasks: boolean;
  onTaskCompletionChange: (taskId: string, done: boolean) => void;
  onChecklistItemChange: (taskId: string, itemId: string, done: boolean) => void;
  onToggleResult: (resultId: string) => void;
  onToggleTask: (taskId: string) => void;
  onAddTask: (result: Result) => void;
  onAddSubtask: (taskId: string, afterItemId?: string) => void;
  onBlockAction: (action: BlockAction, target: BlockTarget) => void;
  activeBlockActionId: string | null;
  openBlockActionId: string | null;
  onActiveBlockActionChange: (id: string | null) => void;
  onOpenBlockActionChange: (id: string | null) => void;
}) {
  const status = indicatorStatus(result, tasks);
  const open = !collapsed;
  const complete = status === "done";
  const resultAnchorId = `metric:${result.id}`;
  const resultActionId = `result:${result.id}`;
  const resultRowActive = activeBlockActionId === resultActionId || openBlockActionId === resultActionId;

  return (
    <div className="relative">
      <div
        className={clsx(
          "orf-result-row orf-row-depth-1 group relative grid min-h-[50px] items-center gap-4 px-5 text-sm xl:grid-cols-[minmax(340px,1fr)_170px_120px_150px]",
          resultRowActive && "orf-row-active",
        )}
        onPointerEnter={() => onActiveBlockActionChange(resultActionId)}
        onPointerLeave={() => {
          if (activeBlockActionId === resultActionId) {
            onActiveBlockActionChange(null);
          }
        }}
      >
        <BlockActions
          actionId={resultActionId}
          addLabel="添加任务"
          left={blockActionLeft.result}
          activeActionId={activeBlockActionId}
          openActionId={openBlockActionId}
          onActiveActionChange={onActiveBlockActionChange}
          onOpenActionChange={onOpenBlockActionChange}
          onAdd={() => onAddTask(result)}
          onAction={(action) => onBlockAction(action, { type: "result", id: result.id, title: result.title, objectiveId: result.objectiveId })}
        />
        {tasks.length > 0 && (
          <DisclosureAction
            actionId={resultActionId}
            expanded={open}
            label={open ? "折叠指标" : "展开指标"}
            activeActionId={activeBlockActionId}
            openActionId={openBlockActionId}
            onActiveActionChange={onActiveBlockActionChange}
            onOpenActionChange={onOpenBlockActionChange}
            onToggle={() => onToggleResult(result.id)}
            className="absolute left-9 top-1/2 -translate-y-1/2"
          />
        )}
        <HierarchyCell depth={1} isLast={isLast && (!open || tasks.length === 0)}>
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center"
            data-hierarchy-anchor={resultAnchorId}
            data-hierarchy-branch-end-offset="0"
            data-hierarchy-branch-target={resultAnchorId}
            data-hierarchy-parent={parentAnchorId}
          >
            <MetricSquareIcon tone={status} />
          </span>
          <div className={clsx("orf-result-title truncate text-base font-semibold", complete ? "text-[#98a2b3] line-through" : "text-[#1d2939]")}>{result.title}</div>
          <CommentCountBadge
            count={commentCountFor(commentCounts, "result", result.id)}
            onClick={() => onBlockAction("comment", { type: "result", id: result.id, title: result.title, objectiveId: result.objectiveId })}
          />
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
              commentCounts={commentCounts}
              onToggleTask={onToggleTask}
              onTaskCompletionChange={onTaskCompletionChange}
              onChecklistItemChange={onChecklistItemChange}
              onAddSubtask={onAddSubtask}
              onBlockAction={onBlockAction}
              activeBlockActionId={activeBlockActionId}
              openBlockActionId={openBlockActionId}
              onActiveBlockActionChange={onActiveBlockActionChange}
              onOpenBlockActionChange={onOpenBlockActionChange}
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
  commentCounts,
  onToggleTask,
  onTaskCompletionChange,
  onChecklistItemChange,
  onAddSubtask,
  onBlockAction,
  activeBlockActionId,
  openBlockActionId,
  onActiveBlockActionChange,
  onOpenBlockActionChange,
}: {
  task: Task;
  depth: 2;
  isLast: boolean;
  parentAnchorId: string;
  collapsed: boolean;
  canEditTasks: boolean;
  commentCounts: Map<string, number>;
  onToggleTask: (taskId: string) => void;
  onTaskCompletionChange: (taskId: string, done: boolean) => void;
  onChecklistItemChange: (taskId: string, itemId: string, done: boolean) => void;
  onAddSubtask: (taskId: string, afterItemId?: string) => void;
  onBlockAction: (action: BlockAction, target: BlockTarget) => void;
  activeBlockActionId: string | null;
  openBlockActionId: string | null;
  onActiveBlockActionChange: (id: string | null) => void;
  onOpenBlockActionChange: (id: string | null) => void;
}) {
  const status = taskDisplayStatus(task);
  const complete = status === "done";
  const open = !collapsed;
  const hasSubtasks = task.checklist.length > 0;
  const taskAnchorId = `task:${task.id}`;
  const taskActionId = `task:${task.id}`;
  const taskRowActive = activeBlockActionId === taskActionId || openBlockActionId === taskActionId;

  return (
    <div className="relative">
      <div
        className={clsx(
          "orf-task-row orf-row-depth-2 group relative grid min-h-[42px] items-center gap-4 px-5 text-sm xl:grid-cols-[minmax(340px,1fr)_170px_120px_150px]",
          taskRowActive && "orf-row-active",
        )}
        onPointerEnter={() => onActiveBlockActionChange(taskActionId)}
        onPointerLeave={() => {
          if (activeBlockActionId === taskActionId) {
            onActiveBlockActionChange(null);
          }
        }}
      >
        <BlockActions
          actionId={taskActionId}
          addLabel="添加子任务"
          left={blockActionLeft.task}
          activeActionId={activeBlockActionId}
          openActionId={openBlockActionId}
          onActiveActionChange={onActiveBlockActionChange}
          onOpenActionChange={onOpenBlockActionChange}
          onAdd={() => onAddSubtask(task.id)}
          onAction={(action) =>
            onBlockAction(action, {
              type: "task",
              id: task.id,
              title: task.title,
              resultId: task.linkedResultId,
              objectiveId: task.linkedObjectiveId,
              hasSubtasks,
            })
          }
        />
        <HierarchyCell depth={depth} isLast={isLast && !hasSubtasks}>
          <span className="flex shrink-0 items-center gap-2">
            {hasSubtasks ? (
              <DisclosureAction
                actionId={taskActionId}
                expanded={open}
                label={open ? "折叠任务" : "展开任务"}
                activeActionId={activeBlockActionId}
                openActionId={openBlockActionId}
                onActiveActionChange={onActiveBlockActionChange}
                onOpenActionChange={onOpenBlockActionChange}
                onToggle={() => onToggleTask(task.id)}
              />
            ) : (
              <span className="h-5 w-5 shrink-0" aria-hidden="true" />
            )}
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center"
              data-hierarchy-anchor={taskAnchorId}
              data-hierarchy-branch-end-offset="0"
              data-hierarchy-branch-target={taskAnchorId}
              data-hierarchy-parent={parentAnchorId}
            >
              <CompletionCheckbox checked={complete} disabled={!canEditTasks} onChange={(checked) => onTaskCompletionChange(task.id, checked)} />
            </span>
          </span>
          <div className={clsx("orf-task-title truncate text-base font-medium", complete ? "text-[#98a2b3] line-through" : "text-[#1d2939]")}>{task.title}</div>
          <CommentCountBadge
            count={commentCountFor(commentCounts, "task", task.id)}
            onClick={() =>
              onBlockAction("comment", {
                type: "task",
                id: task.id,
                title: task.title,
                resultId: task.linkedResultId,
                objectiveId: task.linkedObjectiveId,
                hasSubtasks,
              })
            }
          />
        </HierarchyCell>
        <EmptySlot />
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
            commentCounts={commentCounts}
            onChecklistItemChange={onChecklistItemChange}
            onAddSubtask={onAddSubtask}
            onBlockAction={onBlockAction}
            activeBlockActionId={activeBlockActionId}
            openBlockActionId={openBlockActionId}
            onActiveBlockActionChange={onActiveBlockActionChange}
            onOpenBlockActionChange={onOpenBlockActionChange}
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
  commentCounts,
  onChecklistItemChange,
  onAddSubtask,
  onBlockAction,
  activeBlockActionId,
  openBlockActionId,
  onActiveBlockActionChange,
  onOpenBlockActionChange,
}: {
  item: TaskChecklistItem;
  task: Task;
  itemIndex: number;
  depth: 3;
  isLast: boolean;
  parentAnchorId: string;
  canEditTasks: boolean;
  commentCounts: Map<string, number>;
  onChecklistItemChange: (taskId: string, itemId: string, done: boolean) => void;
  onAddSubtask: (taskId: string, afterItemId?: string) => void;
  onBlockAction: (action: BlockAction, target: BlockTarget) => void;
  activeBlockActionId: string | null;
  openBlockActionId: string | null;
  onActiveBlockActionChange: (id: string | null) => void;
  onOpenBlockActionChange: (id: string | null) => void;
}) {
  const status = subtaskDisplayStatus(task, item, itemIndex);
  const complete = status === "done";
  const subtaskActionId = `subtask:${task.id}:${item.id}`;
  const subtaskRowActive = activeBlockActionId === subtaskActionId || openBlockActionId === subtaskActionId;

  return (
    <div
      className={clsx(
        "orf-subtask-row orf-row-depth-3 group relative grid min-h-[36px] items-center gap-4 px-5 text-sm xl:grid-cols-[minmax(340px,1fr)_170px_120px_150px]",
        subtaskRowActive && "orf-row-active",
      )}
      onPointerEnter={() => onActiveBlockActionChange(subtaskActionId)}
      onPointerLeave={() => {
        if (activeBlockActionId === subtaskActionId) {
          onActiveBlockActionChange(null);
        }
      }}
    >
      <BlockActions
        actionId={subtaskActionId}
        addLabel="添加同级子任务"
        left={blockActionLeft.subtask}
        activeActionId={activeBlockActionId}
        openActionId={openBlockActionId}
        onActiveActionChange={onActiveBlockActionChange}
        onOpenActionChange={onOpenBlockActionChange}
        onAdd={() => onAddSubtask(task.id, item.id)}
        onAction={(action) =>
          onBlockAction(action, {
            type: "subtask",
            id: item.id,
            title: item.label,
            taskId: task.id,
            resultId: task.linkedResultId,
            objectiveId: task.linkedObjectiveId,
          })
        }
      />
      <HierarchyCell depth={depth} isLast={isLast}>
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center"
          data-hierarchy-anchor={`subtask:${task.id}:${item.id}`}
          data-hierarchy-branch-end-offset="0"
          data-hierarchy-branch-target={`subtask:${task.id}:${item.id}`}
          data-hierarchy-parent={parentAnchorId}
        >
          <CompletionCheckbox checked={complete} disabled={!canEditTasks} onChange={(checked) => onChecklistItemChange(task.id, item.id, checked)} />
        </span>
        <div className={clsx("orf-subtask-title truncate text-sm font-medium", complete ? "text-[#98a2b3] line-through" : "text-[#344054]")}>{item.label}</div>
        <CommentCountBadge
          count={commentCountFor(commentCounts, "subtask", item.id)}
          onClick={() =>
            onBlockAction("comment", {
              type: "subtask",
              id: item.id,
              title: item.label,
              taskId: task.id,
              resultId: task.linkedResultId,
              objectiveId: task.linkedObjectiveId,
            })
          }
        />
      </HierarchyCell>
      <EmptySlot />
      <EmptySlot />
      <UpdatedTimeValue date={item.updatedAt ?? task.updatedAt} />
    </div>
  );
}

const blockMenuItems: { action: BlockAction; label: string; icon: LucideIcon }[] = [
  { action: "convert", label: "转换", icon: Repeat2 },
  { action: "move", label: "移动", icon: Move },
  { action: "copyLink", label: "复制链接", icon: Copy },
  { action: "comment", label: "评论", icon: MessageSquare },
  { action: "askAi", label: "问 AI", icon: Sparkles },
  { action: "delete", label: "删除", icon: Trash2 },
];

const blockActionLeft = {
  objective: 22,
  result: 34,
  task: 64,
  subtask: 122,
} as const;

function BlockActions({
  actionId,
  addLabel,
  left,
  activeActionId,
  openActionId,
  onActiveActionChange,
  onOpenActionChange,
  onAdd,
  onAction,
}: {
  actionId: string;
  addLabel: string;
  left: number;
  activeActionId: string | null;
  openActionId: string | null;
  onActiveActionChange: (id: string | null) => void;
  onOpenActionChange: (id: string | null) => void;
  onAdd: () => void;
  onAction: (action: BlockAction) => void;
}) {
  const open = openActionId === actionId;
  const visible = open || (!openActionId && activeActionId === actionId);

  return (
    <div
      data-open={open ? "true" : undefined}
      data-visible={visible ? "true" : undefined}
      className="orf-block-actions pointer-events-none absolute top-1/2 z-40 flex -translate-x-full -translate-y-1/2 items-center gap-px p-0.5 transition"
      style={{ left, zIndex: open ? 100 : 40 }}
      onPointerEnter={() => onActiveActionChange(actionId)}
    >
      <button
        type="button"
        className="orf-block-action-button pointer-events-auto flex h-7 w-7 items-center justify-center rounded text-[#667085] transition hover:bg-[var(--orf-bg-muted)] hover:text-[#1d2939]"
        aria-label={addLabel}
        title={addLabel}
        onClick={onAdd}
      >
        <Plus className="h-4 w-4" />
      </button>
      <div className="relative">
        <button
          type="button"
          className="orf-block-action-button pointer-events-auto flex h-7 w-7 items-center justify-center rounded text-[#98a2b3] transition hover:bg-[var(--orf-bg-muted)] hover:text-[#1d2939]"
          aria-label="打开块菜单"
          title="块菜单"
          onClick={() => {
            onActiveActionChange(actionId);
            onOpenActionChange(open ? null : actionId);
          }}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        {open && (
          <div className="orf-popover orf-block-menu pointer-events-auto absolute left-0 top-9 z-50 w-40 p-1">
            {blockMenuItems.map((item) => {
              const Icon = item.icon;

              return (
                <button
                  key={item.action}
                  type="button"
                  className={clsx(
                    "orf-block-menu-item flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition hover:bg-[var(--orf-bg-muted)]",
                    item.action === "delete" ? "text-[#d92d20]" : "text-[#344054]",
                  )}
                  onClick={() => {
                    onAction(item.action);
                    onOpenActionChange(null);
                  }}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function DisclosureAction({
  actionId,
  expanded,
  label,
  activeActionId,
  openActionId,
  onActiveActionChange,
  onOpenActionChange,
  onToggle,
  className,
}: {
  actionId: string;
  expanded: boolean;
  label: string;
  activeActionId: string | null;
  openActionId: string | null;
  onActiveActionChange: (id: string | null) => void;
  onOpenActionChange: (id: string | null) => void;
  onToggle: () => void;
  className?: string;
}) {
  const open = openActionId === actionId;
  const visible = open || (!openActionId && activeActionId === actionId);

  return (
    <button
      type="button"
      data-visible={visible ? "true" : undefined}
      className={clsx("orf-disclosure-action flex h-6 w-6 shrink-0 items-center justify-center rounded text-[#344054] transition hover:bg-[var(--orf-bg-card)]", className)}
      aria-label={label}
      title={label}
      onPointerEnter={() => onActiveActionChange(actionId)}
      onClick={() => {
        onActiveActionChange(actionId);
        onOpenActionChange(null);
        onToggle();
      }}
    >
      {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
    </button>
  );
}

function CommentCountBadge({ count, onClick }: { count: number; onClick: () => void }) {
  if (count <= 0) {
    return null;
  }

  return (
    <button
      type="button"
      className="orf-comment-count-badge"
      title={`打开 ${count} 条评论`}
      aria-label={`打开 ${count} 条评论`}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <MessageSquare className="h-3.5 w-3.5" />
      <span>{count}</span>
    </button>
  );
}

type CommentEntry = {
  threadId: string;
  message: CommentThread["messages"][number];
};

function CommentPanel({
  threads,
  onAddComment,
  onUpdateComment,
  onDeleteComment,
}: {
  threads: CommentThread[];
  onAddComment: (body: string) => void;
  onUpdateComment: (threadId: string, messageId: string, body: string) => void;
  onDeleteComment: (threadId: string, messageId: string) => void;
}) {
  const [body, setBody] = useState("");
  const [editingComment, setEditingComment] = useState<{ threadId: string; messageId: string } | null>(null);
  const commentEntries = useMemo<CommentEntry[]>(
    () =>
      threads
        .flatMap((thread) => thread.messages.map((message) => ({ threadId: thread.id, message })))
        .sort((left, right) => right.message.createdAt.localeCompare(left.message.createdAt)),
    [threads],
  );

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const value = body.trim();
    if (!value) {
      return;
    }

    if (editingComment) {
      onUpdateComment(editingComment.threadId, editingComment.messageId, value);
      setEditingComment(null);
    } else {
      onAddComment(value);
    }

    setBody("");
  };

  const handleEdit = (threadId: string, message: CommentThread["messages"][number]) => {
    setEditingComment({ threadId, messageId: message.id });
    setBody(message.body);
  };

  return (
    <aside
      data-comment-panel="true"
      className="orf-comment-panel fixed bottom-4 right-4 z-[90] w-[382px] max-w-[calc(100vw-24px)]"
    >
      <div className="orf-comment-box">
        {commentEntries.length > 0 && (
          <div className="orf-comment-message-list">
            {commentEntries.map((entry) => (
              <CommentMessageRow
                key={`${entry.threadId}:${entry.message.id}`}
                entry={entry}
                onEdit={handleEdit}
                onDelete={onDeleteComment}
              />
            ))}
          </div>
        )}
        <CommentComposer body={body} editing={Boolean(editingComment)} onBodyChange={setBody} onSubmit={handleSubmit} />
      </div>
    </aside>
  );
}

function CommentMessageRow({
  entry,
  onEdit,
  onDelete,
}: {
  entry: CommentEntry;
  onEdit: (threadId: string, message: CommentThread["messages"][number]) => void;
  onDelete: (threadId: string, messageId: string) => void;
}) {
  const { threadId, message } = entry;

  const deleteMessage = () => {
    if (!window.confirm("删除这条评论？")) {
      return;
    }

    onDelete(threadId, message.id);
  };

  return (
    <article className="orf-comment-message-row">
      <PersonAvatar name={message.author} />
      <div className="orf-comment-message-main">
        <div className="orf-comment-message-header">
          <span className="orf-comment-author-name">{message.author}</span>
          <div className="orf-comment-meta">
            <button type="button" className="orf-comment-icon-button orf-comment-icon-button-danger" aria-label="删除评论" title="删除" onClick={deleteMessage}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <time>{formatCommentTime(message.createdAt)}</time>
            <button type="button" className="orf-comment-icon-button" aria-label="编辑评论" title="编辑" onClick={() => onEdit(threadId, message)}>
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <p className="orf-comment-body" onDoubleClick={() => onEdit(threadId, message)}>{message.body}</p>
      </div>
    </article>
  );
}

function CommentComposer({
  body,
  editing,
  onBodyChange,
  onSubmit,
}: {
  body: string;
  editing: boolean;
  onBodyChange: (body: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <form className="orf-comment-composer" onSubmit={onSubmit}>
      <PersonAvatar name={currentMember} />
      <div className="orf-comment-composer-main">
        <span className="orf-comment-author-name">{currentMember}</span>
      </div>
      <textarea
        value={body}
        onChange={(event) => onBodyChange(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
        rows={3}
        className="orf-comment-compose-field"
        placeholder={editing ? "编辑评论..." : "添加评论..."}
      />
      <div className="orf-comment-composer-footer">
        <span className="orf-comment-hint">Ctrl / Cmd + Enter 发送</span>
        <button type="submit" className="orf-comment-send-button" disabled={!body.trim()} aria-label={editing ? "保存评论" : "发送评论"} title={editing ? "保存" : "发送"}>
          <Send className="h-4 w-4" />
        </button>
      </div>
    </form>
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
    <div className="orf-person-value flex min-w-0 items-center gap-2">
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
    <span className="orf-time-value inline-flex h-7 items-center gap-2 whitespace-nowrap text-sm font-medium text-[#667085]" title="更新时间" aria-label={`更新时间 ${date || "未设置"}`}>
      <Clock3 className="h-4 w-4 text-[#98a2b3]" />
      {date || "未设置"}
    </span>
  );
}

function EmptySlot() {
  return <span className="inline-flex h-7" aria-hidden="true" />;
}

function ProgressValue({ value, tone }: { value: number; tone: "success" | "accent" | "neutral" }) {
  const color = tone === "success" ? "#0b8f7f" : tone === "accent" ? "#0d7df2" : "#7f8da3";

  return (
    <div className={clsx("orf-progress-value flex items-center gap-3", `orf-progress-value-${tone}`)}>
      <div className="orf-progress-track h-1.5 w-20 overflow-hidden rounded-full bg-[#dfe4eb]">
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

type StatusTone = "success" | "warning" | "accent" | "neutral" | "review" | "done";

function StatusChip({ tone, children }: { tone: StatusTone; children: React.ReactNode }) {
  return (
    <span
      className={clsx(
        "orf-status-chip inline-flex h-7 w-fit min-w-[62px] justify-self-start items-center justify-center whitespace-nowrap rounded-full px-2 text-xs font-bold leading-none",
        `orf-status-chip-${tone}`,
      )}
    >
      <span className="orf-status-chip-dot" aria-hidden="true" />
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

function blockLinkForTarget(target: BlockTarget) {
  return `${window.location.origin}${window.location.pathname}#${target.type}:${target.id}`;
}

function getCommentCounts(threads: CommentThread[]) {
  const counts = new Map<string, number>();

  for (const thread of threads) {
    const count = thread.messages.length;
    if (count === 0) {
      continue;
    }

    const key = commentTargetKey(thread.targetType, thread.targetId);
    counts.set(key, (counts.get(key) ?? 0) + count);
  }

  return counts;
}

function commentCountFor(counts: Map<string, number>, targetType: CommentTargetType, targetId: string) {
  return counts.get(commentTargetKey(targetType, targetId)) ?? 0;
}

function commentTargetKey(targetType: CommentTargetType, targetId: string) {
  return `${targetType}:${targetId}`;
}

function formatCommentTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
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

function statusTone(status: SimpleStatus): StatusTone {
  if (status === "done") return "done";
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
