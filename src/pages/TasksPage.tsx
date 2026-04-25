import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { PageScaffold } from "../components/PageScaffold";
import { TaskRow } from "../components/SharedCards";
import { Button, Card, StatusBadge } from "../components/ui";
import { useOrf } from "../state/OrfProvider";
import type { Task, TaskStatus } from "../types/orf";
import { taskStatusLabel } from "../utils/labels";

const statuses: TaskStatus[] = ["Backlog", "Todo", "In Progress", "In Review", "Done"];

export function TasksPage() {
  const { state, openModal, updateTaskStatus } = useOrf();
  const [view, setView] = useState<"List" | "Board">("List");
  const [status, setStatus] = useState<"All" | TaskStatus>("All");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const tasks = useMemo(() => state.tasks.filter((task) => status === "All" || task.status === status), [state.tasks, status]);

  return (
    <PageScaffold
      title="任务"
      subtitle="任务是执行单元，必须支撑可度量的结果。"
      action={<Button onClick={() => openModal({ type: "newTask" })}><Plus className="h-4 w-4" />新建任务</Button>}
    >
      <Card className="flex flex-wrap items-center gap-3 p-3">
        <select className="orf-input h-9 max-w-40 px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value as "All" | TaskStatus)}>
          {["All", ...statuses].map((item) => <option key={item} value={item}>{item === "All" ? "全部状态" : item === "Backlog" ? "待整理" : item === "Todo" ? "待办" : item === "In Progress" ? "进行中" : item === "In Review" ? "评审中" : "已完成"}</option>)}
        </select>
        <select className="orf-input h-9 max-w-48 px-3 text-sm"><option>全部执行人</option><option>Alex Chen</option><option>Kai Wang</option><option>Nora Patel</option></select>
        <select className="orf-input h-9 max-w-64 px-3 text-sm"><option>全部关联结果</option>{state.results.map((result) => <option key={result.id}>{result.title}</option>)}</select>
        <div className="ml-auto flex rounded-md border orf-border p-1">
          {(["List", "Board"] as const).map((item) => <button key={item} onClick={() => setView(item)} className={`rounded px-3 py-1 text-xs ${view === item ? "orf-selected orf-text-primary" : "orf-text-secondary orf-hover-text"}`}>{item === "List" ? "列表" : "看板"}</button>)}
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        {view === "List" ? (
          <Card className="overflow-hidden">
            <div className="grid grid-cols-[78px_minmax(240px,1fr)_120px_88px_108px_112px] gap-3 border-b orf-border px-3 py-3 text-xs font-medium orf-text-muted">
              <span>ID</span><span>任务</span><span>状态</span><span>优先级</span><span>执行人</span><span>截止</span>
            </div>
            {tasks.map((task) => (
              <div key={task.id} onClick={() => setSelectedTask(task)} className="block w-full text-left">
                <TaskRow task={task} resultTitle={state.results.find((result) => result.id === task.linkedResultId)?.title} onStatusChange={(next) => updateTaskStatus(task.id, next)} />
              </div>
            ))}
          </Card>
        ) : (
          <div className="grid gap-3 lg:grid-cols-5">
            {statuses.map((column) => (
              <Card key={column} className="min-h-[520px] p-3">
                <div className="mb-3 flex items-center justify-between"><span className="text-sm font-semibold orf-text-primary">{taskStatusLabel[column]}</span><span className="text-xs orf-text-muted">{tasks.filter((task) => task.status === column).length}</span></div>
                <div className="grid gap-2">
                  {tasks.filter((task) => task.status === column).map((task) => (
                    <button key={task.id} onClick={() => setSelectedTask(task)} className="rounded-lg border orf-border orf-surface-muted p-3 text-left orf-hover-muted">
                      <div className="text-sm font-medium orf-text-primary">{task.title}</div>
                      <div className="mt-2 text-xs orf-text-muted">{state.results.find((result) => result.id === task.linkedResultId)?.title}</div>
                      <div className="mt-3 flex items-center justify-between"><StatusBadge status={task.priority} /><span className="text-xs orf-text-muted">{task.assignee}</span></div>
                      {task.feedbackOriginId && <div className="orf-badge-accent mt-2 rounded-full border px-2 py-1 text-xs">来自反馈</div>}
                    </button>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}

        <Card className="p-4">
          {selectedTask ? (
            <div>
              <div className="flex items-start justify-between gap-3"><div><div className="font-mono text-xs orf-text-muted">{selectedTask.id}</div><div className="mt-1 text-lg font-semibold orf-text-primary">{selectedTask.title}</div></div><StatusBadge status={selectedTask.status} /></div>
              <p className="mt-4 text-sm orf-text-secondary">{selectedTask.description}</p>
              <div className="mt-4 grid gap-3 text-sm">
                <Info label="执行人" value={selectedTask.assignee} />
                <Info label="关联目标" value={state.objectives.find((objective) => objective.id === selectedTask.linkedObjectiveId)?.title ?? ""} />
                <Info label="关联结果" value={state.results.find((result) => result.id === selectedTask.linkedResultId)?.title ?? ""} />
                <Info label="来源反馈" value={selectedTask.feedbackOriginId ?? "无"} />
              </div>
              <div className="mt-4 flex gap-2"><Button onClick={() => updateTaskStatus(selectedTask.id, "Done")}>标记完成</Button><Button variant="secondary" onClick={() => openModal({ type: "newFeedback", objectiveId: selectedTask.linkedObjectiveId, resultId: selectedTask.linkedResultId })}>创建反馈</Button></div>
            </div>
          ) : (
            <div className="flex min-h-[420px] flex-col justify-center text-center text-sm orf-text-muted">选择一个任务，查看它的 ORF 关联和活动记录。</div>
          )}
        </Card>
      </div>
    </PageScaffold>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md orf-surface-muted p-3"><div className="text-xs orf-text-muted">{label}</div><div className="mt-1 orf-text-primary">{value}</div></div>;
}
