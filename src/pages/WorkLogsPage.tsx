import { clsx } from "clsx";
import { Activity, CalendarDays, ChevronLeft, ChevronRight, Loader2, NotebookPen, Plus, RefreshCw, Save, Target, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FantasyDatePicker } from "../components/FantasyDatePicker";
import { FantasySelectMenu, type FantasySelectOption } from "../components/FantasySelectMenu";
import { PageScaffold } from "../components/PageScaffold";
import { Button, Card, IconButton } from "../components/ui";
import { UserAvatar } from "../components/UserAvatar";
import { OrfRichTextEditor, orfRichTextHasMeaningfulContent } from "../features/rich-text/OrfRichTextEditor";
import { OrfRichTextMarkdownViewer } from "../features/rich-text/OrfRichTextMarkdownViewer";
import { readModelInvalidationKey } from "../features/realtime/readModelInvalidations";
import {
  getMyWorkLogDay,
  getWorkLogActivity,
  getWorkLogObjectives,
  saveMyWorkLogDay,
} from "../state/apiClient";
import { useOrf } from "../state/OrfProvider";
import type { WorkLogActivityItem, WorkLogEntry, WorkLogObjectiveOption } from "../types/orf";
import { addCalendarDays, isDateOnlyString, localDateString } from "../utils/date";

type WorkLogDraftEntry = {
  bodyMarkdown: string;
  clientId: string;
  objectiveId: string;
  objectiveTitleSnapshot?: string | null;
};

type WorkLogViewMode = "activity" | "write";

const todayValue = () => localDateString(new Date());
const blankDraftEntry = (): WorkLogDraftEntry => ({
  bodyMarkdown: "",
  clientId: `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  objectiveId: "",
});

export function WorkLogsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    currentUser,
    dismissSystemBroadcast,
    notify,
    readModelInvalidations,
    systemBroadcasts,
  } = useOrf();
  const [selectedDate, setSelectedDate] = useState(() => dateFromSearch(location.search));
  const [objectives, setObjectives] = useState<WorkLogObjectiveOption[]>([]);
  const [myEntries, setMyEntries] = useState<WorkLogEntry[]>([]);
  const [draftEntries, setDraftEntries] = useState<WorkLogDraftEntry[]>([]);
  const [activityEntries, setActivityEntries] = useState<WorkLogActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<WorkLogViewMode>("write");
  const workLogsInvalidationKey = useMemo(() => readModelInvalidationKey(readModelInvalidations, "workLogs"), [readModelInvalidations]);
  const canWrite = currentUser?.role === "admin" || currentUser?.role === "member";
  const canWriteGeneralLog = currentUser?.role === "admin";

  useEffect(() => {
    const nextDate = dateFromSearch(location.search);
    setSelectedDate(nextDate);
  }, [location.search]);

  const loadMyDay = useCallback(async (date: string) => {
    setLoading(true);
    setError("");
    try {
      const [objectiveResponse, dayResponse] = await Promise.all([
        getWorkLogObjectives(),
        getMyWorkLogDay(date),
      ]);
      setObjectives(objectiveResponse.objectives);
      setMyEntries(dayResponse.entries);
      setDraftEntries(draftEntriesFromSaved(dayResponse.entries));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "工作日志加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadActivity = useCallback(async (date: string) => {
    setActivityLoading(true);
    try {
      const response = await getWorkLogActivity({ from: date, to: date, limit: 120 });
      setActivityEntries(response.entries);
    } catch {
      setActivityEntries([]);
    } finally {
      setActivityLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMyDay(selectedDate);
  }, [loadMyDay, selectedDate]);

  useEffect(() => {
    void loadActivity(selectedDate);
  }, [loadActivity, selectedDate, workLogsInvalidationKey]);

  const changeDate = (date: string) => {
    const query = new URLSearchParams(location.search);
    query.set("date", date);
    navigate({ pathname: "/work-logs", search: query.toString() ? `?${query.toString()}` : "" }, { replace: true });
  };

  const addEntry = () => {
    setDraftEntries((items) => [...items, blankDraftEntry()]);
    setViewMode("write");
  };

  const updateDraftEntry = (clientId: string, patch: Partial<Pick<WorkLogDraftEntry, "bodyMarkdown" | "objectiveId">>) => {
    setDraftEntries((items) => items.map((item) => (item.clientId === clientId ? { ...item, ...patch } : item)));
  };

  const removeDraftEntry = (clientId: string) => {
    setDraftEntries((items) => items.filter((item) => item.clientId !== clientId));
  };

  const draftValidation = validateDraftEntries(draftEntries, canWriteGeneralLog);
  const saveEntries = canonicalDraftEntries(draftEntries);
  const savedKey = useMemo(() => JSON.stringify(canonicalSavedEntries(myEntries)), [myEntries]);
  const draftKey = useMemo(() => JSON.stringify(saveEntries), [saveEntries]);
  const hasChanges = draftKey !== savedKey;
  const saveDisabled = saving || loading || !canWrite || Boolean(draftValidation) || !hasChanges;
  const memberHasNoWritableTargets = currentUser?.role === "member" && objectives.length === 0 && myEntries.length === 0;

  const saveDay = async () => {
    if (saveDisabled) return;
    setSaving(true);
    setError("");
    try {
      const response = await saveMyWorkLogDay(selectedDate, { entries: saveEntries });
      setMyEntries(response.entries);
      setDraftEntries(draftEntriesFromSaved(response.entries));
      void loadActivity(selectedDate);
      systemBroadcasts
        .filter((broadcast) => broadcast.notificationKind === "worklog.reminder")
        .forEach((broadcast) => dismissSystemBroadcast(broadcast.id));
      notify("工作日志已保存");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "工作日志保存失败");
    } finally {
      setSaving(false);
    }
  };

  const objectiveOptionsById = useMemo(() => new Map(objectives.map((objective) => [objective.id, objective])), [objectives]);
  const activityGroups = useMemo(() => groupActivityByDate(activityEntries), [activityEntries]);

  return (
    <PageScaffold
      title="工作日志"
      subtitle="个人工作记录与团队动态。"
      action={
        <WorkLogDateControl
          date={selectedDate}
          onChange={changeDate}
        />
      }
    >
      <div className="work-logs-mobile-tabs" role="tablist" aria-label="工作日志视图">
        <button type="button" aria-selected={viewMode === "write"} onClick={() => setViewMode("write")}>
          <NotebookPen className="h-4 w-4" />
          填写
        </button>
        <button type="button" aria-selected={viewMode === "activity"} onClick={() => setViewMode("activity")}>
          <Activity className="h-4 w-4" />
          动态
        </button>
      </div>

      <div className="work-logs-layout">
        <Card className={clsx("work-logs-panel work-logs-activity-panel", viewMode !== "activity" && "work-logs-mobile-hidden")}>
          <div className="work-logs-panel-heading">
            <div>
              <h2>团队动态</h2>
              <p>{selectedDate}</p>
            </div>
            <IconButton icon={RefreshCw} label="刷新动态" onClick={() => void loadActivity(selectedDate)} />
          </div>
          {activityLoading ? (
            <div className="work-logs-loading">
              <Loader2 className="h-5 w-5 animate-spin" />
              加载中
            </div>
          ) : activityGroups.length > 0 ? (
            <div className="work-logs-activity-list">
              {activityGroups.map((group) => (
                <section className="work-logs-activity-group" key={group.date}>
                  <h3>{activityDateLabel(group.date)}</h3>
                  {group.entries.map((entry) => (
                    <WorkLogActivityCard
                      currentUserId={currentUser?.id ?? null}
                      entry={entry}
                      key={entry.id}
                    />
                  ))}
                </section>
              ))}
            </div>
          ) : (
            <div className="work-logs-empty">
              <Activity className="h-6 w-6" />
              <span>当天暂无日志</span>
            </div>
          )}
        </Card>

        <Card className={clsx("work-logs-panel work-logs-editor-panel", viewMode !== "write" && "work-logs-mobile-hidden")}>
          <div className="work-logs-panel-heading">
            <div>
              <h2>我的日志</h2>
              <p>{currentUser?.name ?? ""}</p>
            </div>
            <Button variant="secondary" onClick={addEntry} disabled={!canWrite}>
              <Plus className="h-4 w-4" />
              新增
            </Button>
          </div>

          {error && <div className="work-logs-error">{error}</div>}
          {draftValidation && <div className="work-logs-error">{draftValidation}</div>}

          {!canWrite ? (
            <div className="work-logs-empty">
              <NotebookPen className="h-6 w-6" />
              <span>当前账号不能填写个人工作日志</span>
            </div>
          ) : loading ? (
            <div className="work-logs-loading">
              <Loader2 className="h-5 w-5 animate-spin" />
              加载中
            </div>
          ) : memberHasNoWritableTargets ? (
            <div className="work-logs-empty">
              <NotebookPen className="h-6 w-6" />
              <span>当前账号没有可填写的个人目标日志</span>
            </div>
          ) : (
            <>
              <div className="work-logs-draft-list">
                {draftEntries.map((entry, index) => (
                  <WorkLogDraftCard
                    currentUserId={currentUser?.id ?? ""}
                    entry={entry}
                    index={index}
                    key={entry.clientId}
                    objective={entry.objectiveId ? objectiveOptionsById.get(entry.objectiveId) : undefined}
                    objectiveOptions={objectiveSelectOptionsForEntry(entry, draftEntries, objectives, canWriteGeneralLog)}
                    onChange={updateDraftEntry}
                    onRemove={removeDraftEntry}
                  />
                ))}
                {draftEntries.length === 0 && (
                  <button type="button" className="work-logs-add-empty" onClick={addEntry}>
                    <Plus className="h-5 w-5" />
                    添加工作日志
                  </button>
                )}
              </div>

              <div className="work-logs-editor-actions">
                <Button variant="ghost" onClick={() => setDraftEntries(draftEntriesFromSaved(myEntries))} disabled={!hasChanges || saving}>
                  撤销
                </Button>
                <Button onClick={() => void saveDay()} disabled={saveDisabled}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  保存
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </PageScaffold>
  );
}

function WorkLogDateControl({ date, onChange }: { date: string; onChange: (date: string) => void }) {
  return (
    <div className="work-logs-date-control">
      <IconButton icon={ChevronLeft} label="前一天" onClick={() => onChange(addCalendarDays(date, -1, date))} />
      <FantasyDatePicker ariaLabel="选择日志日期" value={date} onChange={onChange}>
        <CalendarDays className="h-4 w-4" />
        <span>{date}</span>
      </FantasyDatePicker>
      <IconButton icon={ChevronRight} label="后一天" onClick={() => onChange(addCalendarDays(date, 1, date))} />
      <Button variant="secondary" onClick={() => onChange(todayValue())}>
        今天
      </Button>
    </div>
  );
}

function WorkLogDraftCard({
  currentUserId,
  entry,
  index,
  objective,
  objectiveOptions,
  onChange,
  onRemove,
}: {
  currentUserId: string;
  entry: WorkLogDraftEntry;
  index: number;
  objective?: WorkLogObjectiveOption;
  objectiveOptions: Array<FantasySelectOption<string>>;
  onChange: (clientId: string, patch: Partial<Pick<WorkLogDraftEntry, "bodyMarkdown" | "objectiveId">>) => void;
  onRemove: (clientId: string) => void;
}) {
  return (
    <section className="work-logs-draft-entry">
      <div className="work-logs-draft-entry-header">
        <FantasySelectMenu
          ariaLabel={`第 ${index + 1} 条日志目标`}
          className="work-logs-objective-select"
          disabled={objectiveOptions.length <= 1}
          leadingIcon={<Target className="h-4 w-4" />}
          onChange={(objectiveId) => onChange(entry.clientId, { objectiveId })}
          options={objectiveOptions}
          placeholder="选择目标"
          searchable
          searchPlaceholder="搜索目标"
          value={entry.objectiveId}
          variant="filter"
        />
        <button type="button" className="work-logs-remove-entry" aria-label="删除日志" title="删除日志" onClick={() => onRemove(entry.clientId)}>
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {entry.objectiveTitleSnapshot && !objective && (
        <div className="work-logs-snapshot-note">历史目标：{entry.objectiveTitleSnapshot}</div>
      )}
      <OrfRichTextEditor
        className="work-logs-editor"
        currentUserId={currentUserId}
        idleHint="Markdown"
        mentionableUsers={[]}
        onChange={(bodyMarkdown) => onChange(entry.clientId, { bodyMarkdown })}
        placeholder="写下今天完成了什么"
        submitOnEnter={false}
        value={entry.bodyMarkdown}
      />
    </section>
  );
}

function WorkLogActivityCard({ currentUserId, entry }: { currentUserId: string | null; entry: WorkLogActivityItem }) {
  const authorName = entry.authorCurrentName ?? entry.authorNameSnapshot;
  const hasObjectiveSnapshot = Boolean(entry.objectiveIdSnapshot || entry.objectiveTitleSnapshot);
  const objectiveTitle = entry.objectiveTitleSnapshot ?? (entry.objectiveId ? entry.objectiveId : "日常工作");
  return (
    <article className="work-logs-activity-entry">
      <UserAvatar avatarUrl={entry.authorAvatarUrl} className="work-logs-activity-avatar" frame={false} name={authorName} />
      <div className="work-logs-activity-body">
        <div className="work-logs-activity-meta">
          <strong>{authorName}</strong>
          {entry.authorUserId === currentUserId && <span>我</span>}
          <time>{formatActivityTime(entry.updatedAt)}</time>
        </div>
        <div className="work-logs-activity-target">
          {hasObjectiveSnapshot ? <Target className="h-3.5 w-3.5" /> : <NotebookPen className="h-3.5 w-3.5" />}
          {entry.objectiveId ? (
            <a href={`/tasks#objective:${encodeURIComponent(entry.objectiveId)}`}>{objectiveTitle}</a>
          ) : (
            <span>{objectiveTitle}</span>
          )}
        </div>
        <div className="work-logs-activity-markdown">
          <OrfRichTextMarkdownViewer body={entry.bodyMarkdown} compact />
        </div>
      </div>
    </article>
  );
}

function dateFromSearch(search: string) {
  const value = new URLSearchParams(search).get("date") ?? "";
  return isDateOnlyString(value) ? value : todayValue();
}

function draftEntriesFromSaved(entries: WorkLogEntry[]): WorkLogDraftEntry[] {
  return entries.map((entry) => ({
    bodyMarkdown: entry.bodyMarkdown,
    clientId: entry.id,
    objectiveId: entry.objectiveIdSnapshot ?? "",
    objectiveTitleSnapshot: entry.objectiveTitleSnapshot,
  }));
}

function canonicalDraftEntries(entries: WorkLogDraftEntry[]) {
  return entries
    .map((entry) => ({
      objectiveId: entry.objectiveId.trim() || null,
      bodyMarkdown: entry.bodyMarkdown.trim(),
    }))
    .filter((entry) => entry.objectiveId || orfRichTextHasMeaningfulContent(entry.bodyMarkdown));
}

function canonicalSavedEntries(entries: WorkLogEntry[]) {
  return entries.map((entry) => ({
    objectiveId: entry.objectiveIdSnapshot ?? null,
    bodyMarkdown: entry.bodyMarkdown.trim(),
  }));
}

function validateDraftEntries(entries: WorkLogDraftEntry[], allowGeneralLog: boolean) {
  const objectiveIds = new Set<string>();
  let hasGeneralEntry = false;
  for (const entry of canonicalDraftEntries(entries)) {
    if (!orfRichTextHasMeaningfulContent(entry.bodyMarkdown)) return "工作日志内容不能为空";
    if (!entry.objectiveId) {
      if (!allowGeneralLog) return "请选择目标";
      if (hasGeneralEntry) return "同一天只能保留一条不指定目标的工作日志";
      hasGeneralEntry = true;
      continue;
    }
    if (objectiveIds.has(entry.objectiveId)) return "同一天同一个目标只能保留一条工作日志";
    objectiveIds.add(entry.objectiveId);
  }
  return "";
}

function objectiveSelectOptionsForEntry(
  entry: WorkLogDraftEntry,
  entries: WorkLogDraftEntry[],
  objectives: WorkLogObjectiveOption[],
  allowGeneralLog: boolean,
): Array<FantasySelectOption<string>> {
  const usedObjectiveIds = new Set(entries.filter((item) => item.clientId !== entry.clientId).map((item) => item.objectiveId).filter(Boolean));
  const options: Array<FantasySelectOption<string>> = [
    allowGeneralLog
      ? { value: "", label: "不指定目标", description: "日常工作", alwaysVisible: true }
      : { value: "", label: "选择目标", disabled: true, alwaysVisible: true },
    ...objectives.map((objective) => ({
      value: objective.id,
      label: objective.title,
      description: `${flowStatusLabel(objective.flowStatus)} · 截止 ${objective.finalDueAt}`,
      disabled: usedObjectiveIds.has(objective.id),
    })),
  ];
  if (entry.objectiveId && !objectives.some((objective) => objective.id === entry.objectiveId)) {
    options.push({
      value: entry.objectiveId,
      label: entry.objectiveTitleSnapshot ?? entry.objectiveId,
      description: "历史目标快照",
    });
  }
  return options;
}

function groupActivityByDate(entries: WorkLogActivityItem[]) {
  const groups = new Map<string, WorkLogActivityItem[]>();
  for (const entry of entries) {
    const items = groups.get(entry.workDate) ?? [];
    items.push(entry);
    groups.set(entry.workDate, items);
  }
  return Array.from(groups.entries()).map(([date, groupEntries]) => ({ date, entries: groupEntries }));
}

function activityDateLabel(date: string) {
  if (date === todayValue()) return "今天";
  if (date === addCalendarDays(todayValue(), -1, date)) return "昨天";
  return date;
}

function formatActivityTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function flowStatusLabel(status: WorkLogObjectiveOption["flowStatus"]) {
  const labels: Record<WorkLogObjectiveOption["flowStatus"], string> = {
    applying: "申请中",
    candidate: "候选",
    closed: "关闭",
    frozen: "实施",
    open: "开放",
    recruiting: "征召",
    reestimating: "重估",
    settled: "已结算",
    submitted: "待验收",
  };
  return labels[status];
}
