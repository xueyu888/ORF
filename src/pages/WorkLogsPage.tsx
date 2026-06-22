import { clsx } from "clsx";
import {
  Activity,
  BarChart3,
  BrainCircuit,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Loader2,
  NotebookPen,
  PencilLine,
  Plus,
  RefreshCw,
  Save,
  Tags,
  Target,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { FantasyDatePicker } from "../components/FantasyDatePicker";
import { FantasySelectMenu } from "../components/FantasySelectMenu";
import { PageScaffold } from "../components/PageScaffold";
import { Button, Card, IconButton } from "../components/ui";
import { UserAvatar } from "../components/UserAvatar";
import {
  OrfRichTextEditor,
  orfRichTextHasMeaningfulContent,
} from "../features/rich-text/OrfRichTextEditor";
import { OrfRichTextMarkdownViewer } from "../features/rich-text/OrfRichTextMarkdownViewer";
import { readModelInvalidationKey } from "../features/realtime/readModelInvalidations";
import {
  canSaveUnscopedWorkLog,
  canUseWorkLogCategories,
} from "../domain/orfWorkLogs";
import {
  applyWorkLogEditorDraftPatch,
  blankWorkLogEditorDraft,
  buildWorkLogClassificationChoices,
  canonicalWorkLogEditorDraft,
  canonicalWorkLogEntryForEdit,
  classificationSelectValueFromDraft,
  formatWorkLogDurationMinutes,
  parseWorkLogDurationInput,
  parseWorkLogEstimateInput,
  suggestionMatchesWorkLogDraft,
  validateWorkLogEditorDraft,
  workLogDraftPatchFromClassificationSelect,
  workLogDraftPatchFromSuggestion,
  workLogEditorDraftFromEntry,
  workLogEntryClassification,
  workLogEntryTargetLabel,
  workLogSuggestionLabel,
  type WorkLogClassificationChoice,
  type WorkLogEditorDraft,
  type WorkLogEditorDraftPatch,
} from "../features/work-logs/workLogEditorModel";
import {
  createMyWorkLogEntry,
  deleteMyWorkLogEntry,
  getMyWorkLogDay,
  getWorkLogActivity,
  getWorkLogObjectives,
  getWorkLogReport,
  suggestWorkLogClassification,
  updateMyWorkLogEntry,
} from "../state/apiClient";
import { useOrf } from "../state/OrfProvider";
import type {
  WorkLogActivityItem,
  WorkLogCategoryOption,
  WorkLogClassificationSuggestion,
  WorkLogEntry,
  WorkLogObjectiveOption,
  WorkLogReport,
  WorkLogReportDayCell,
  WorkLogReportScope,
} from "../types/orf";
import {
  addCalendarDays,
  isDateOnlyString,
  localDateString,
} from "../utils/date";

type WorkLogViewMode = "report" | "today";

type WorkLogReportCellPopoverState = {
  key: string;
  cell: WorkLogReportDayCell;
  userName: string;
  rect: {
    height: number;
    left: number;
    top: number;
    width: number;
  };
};

const workLogViewOptions = [
  {
    icon: NotebookPen,
    label: "日志",
    value: "today" as const,
  },
  {
    icon: BarChart3,
    label: "统计",
    value: "report" as const,
  },
];

const workLogActivityCollapsedLimit = 20;
const workLogActivityExpandedLimit = 80;

const todayValue = () => localDateString(new Date());
export function WorkLogsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    currentUser,
    dismissSystemBroadcast,
    notify,
    readModelInvalidations,
    refreshWorkLogReminderState,
    systemBroadcasts,
  } = useOrf();
  const [selectedDate, setSelectedDate] = useState(() =>
    dateFromSearch(location.search),
  );
  const [objectives, setObjectives] = useState<WorkLogObjectiveOption[]>([]);
  const [categories, setCategories] = useState<WorkLogCategoryOption[]>([]);
  const [classificationSuggestionEnabled, setClassificationSuggestionEnabled] =
    useState(false);
  const [classificationSuggestion, setClassificationSuggestion] =
    useState<WorkLogClassificationSuggestion | null>(null);
  const [classificationSuggestionLoading, setClassificationSuggestionLoading] =
    useState(false);
  const [myEntries, setMyEntries] = useState<WorkLogEntry[]>([]);
  const [editorDraft, setEditorDraft] = useState<WorkLogEditorDraft>(() =>
    blankWorkLogEditorDraft(),
  );
  const [activityEntries, setActivityEntries] = useState<WorkLogActivityItem[]>(
    [],
  );
  const [activityExpanded, setActivityExpanded] = useState(false);
  const [report, setReport] = useState<WorkLogReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [reportError, setReportError] = useState("");
  const [reportMonth, setReportMonth] = useState(() =>
    monthFromDate(dateFromSearch(location.search)),
  );
  const [reportScope, setReportScope] = useState<WorkLogReportScope>("mine");
  const [viewMode, setViewMode] = useState<WorkLogViewMode>(() =>
    viewFromSearch(location.search),
  );
  const workLogsInvalidationKey = useMemo(
    () => readModelInvalidationKey(readModelInvalidations, "workLogs"),
    [readModelInvalidations],
  );
  const canWrite =
    currentUser?.role === "admin" || currentUser?.role === "member";
  const canUseWorkLogCategoryControls = canUseWorkLogCategories(currentUser);
  const canSaveWithoutObjective = canSaveUnscopedWorkLog(currentUser);

  useEffect(() => {
    const nextDate = dateFromSearch(location.search);
    setSelectedDate(nextDate);
    setViewMode(viewFromSearch(location.search));
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
      setCategories(objectiveResponse.categories);
      setClassificationSuggestionEnabled(
        objectiveResponse.classificationSuggestionEnabled,
      );
      setMyEntries(dayResponse.entries);
      setEditorDraft(blankWorkLogEditorDraft());
      setClassificationSuggestion(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "工作日志加载失败",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadActivity = useCallback(async (expanded: boolean) => {
    setActivityLoading(true);
    try {
      const response = await getWorkLogActivity({
        limit: expanded
          ? workLogActivityExpandedLimit
          : workLogActivityCollapsedLimit + 1,
      });
      setActivityEntries(response.entries);
    } catch {
      setActivityEntries([]);
    } finally {
      setActivityLoading(false);
    }
  }, []);

  const loadReport = useCallback(
    async (month: string, scope: WorkLogReportScope) => {
      setReportLoading(true);
      setReportError("");
      try {
        const range = monthRange(month);
        const response = await getWorkLogReport({
          from: range.from,
          to: range.to,
          scope,
        });
        setReport(response.report);
      } catch (loadError) {
        setReport(null);
        setReportError(
          loadError instanceof Error
            ? loadError.message
            : "工作日志报表加载失败",
        );
      } finally {
        setReportLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadMyDay(selectedDate);
  }, [loadMyDay, selectedDate]);

  useEffect(() => {
    void loadActivity(activityExpanded);
  }, [activityExpanded, loadActivity, workLogsInvalidationKey]);

  useEffect(() => {
    void loadReport(reportMonth, reportScope);
  }, [loadReport, reportMonth, reportScope, workLogsInvalidationKey]);

  const changeDate = (date: string) => {
    const query = new URLSearchParams(location.search);
    query.set("date", date);
    navigate(
      {
        pathname: "/work-logs",
        search: query.toString() ? `?${query.toString()}` : "",
      },
      { replace: true },
    );
  };

  const changeView = (view: WorkLogViewMode) => {
    const query = new URLSearchParams(location.search);
    query.set("view", view);
    navigate(
      {
        pathname: "/work-logs",
        search: query.toString() ? `?${query.toString()}` : "",
      },
      { replace: true },
    );
  };

  const startNewEntry = () => {
    setEditorDraft(blankWorkLogEditorDraft());
    changeView("today");
  };

  const editExistingEntry = (entry: WorkLogEntry) => {
    setEditorDraft(workLogEditorDraftFromEntry(entry));
    changeView("today");
  };

  const updateEditorDraft = (patch: WorkLogEditorDraftPatch) => {
    setEditorDraft((item) => {
      return applyWorkLogEditorDraftPatch(item, patch);
    });
  };

  const editingEntry = editorDraft.editingEntryId
    ? (myEntries.find((entry) => entry.id === editorDraft.editingEntryId) ??
      null)
    : null;
  const draftInput = canonicalWorkLogEditorDraft(editorDraft);
  const draftHasInput = Boolean(
    draftInput.categoryId ||
    draftInput.categoryName ||
    draftInput.durationMinutes !== null ||
    draftInput.objectiveId ||
    orfRichTextHasMeaningfulContent(draftInput.bodyMarkdown),
  );
  const draftValidation = draftHasInput
    ? validateWorkLogEditorDraft(editorDraft, {
        allowCategories: canUseWorkLogCategoryControls,
        allowUncategorized: canSaveWithoutObjective,
      })
    : "";
  const editorBaselineKey = JSON.stringify(
    editingEntry
      ? canonicalWorkLogEntryForEdit(editingEntry)
      : {
          bodyMarkdown: "",
          categoryId: null,
          categoryName: null,
          durationMinutes: null,
          objectiveId: null,
          remainingEstimatePercent: null,
        },
  );
  const draftKey = JSON.stringify(draftInput);
  const hasChanges = draftKey !== editorBaselineKey;
  const saveDisabled =
    saving ||
    loading ||
    !canWrite ||
    !draftHasInput ||
    Boolean(draftValidation) ||
    !hasChanges;
  const memberHasNoWritableTargets =
    currentUser?.role === "member" &&
    !canSaveWithoutObjective &&
    objectives.length === 0 &&
    myEntries.length === 0;

  const saveEntry = async () => {
    if (saveDisabled) return;
    setSaving(true);
    setError("");
    try {
      const response = editorDraft.editingEntryId
        ? await updateMyWorkLogEntry(editorDraft.editingEntryId, draftInput)
        : await createMyWorkLogEntry(selectedDate, draftInput);
      setMyEntries(response.entries);
      if (draftInput.categoryName) {
        const objectiveResponse = await getWorkLogObjectives();
        setObjectives(objectiveResponse.objectives);
        setCategories(objectiveResponse.categories);
        setClassificationSuggestionEnabled(
          objectiveResponse.classificationSuggestionEnabled,
        );
      }
      setEditorDraft(blankWorkLogEditorDraft());
      setClassificationSuggestion(null);
      void loadActivity(activityExpanded);
      void loadReport(reportMonth, reportScope);
      void refreshWorkLogReminderState().catch(() => undefined);
      systemBroadcasts
        .filter(
          (broadcast) => broadcast.notificationKind === "worklog.reminder",
        )
        .forEach((broadcast) => dismissSystemBroadcast(broadcast.id));
      notify(editorDraft.editingEntryId ? "工作日志已更新" : "工作日志已提交");
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "工作日志保存失败",
      );
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async (entry: WorkLogEntry) => {
    const confirmed = window.confirm(
      "删除这条工作日志？删除后不会影响目标、进度、验收或积分。",
    );
    if (!confirmed) return;
    setDeletingEntryId(entry.id);
    setError("");
    try {
      const response = await deleteMyWorkLogEntry(entry.id);
      setMyEntries(response.entries);
      if (editorDraft.editingEntryId === entry.id) {
        setEditorDraft(blankWorkLogEditorDraft());
      }
      void loadActivity(activityExpanded);
      void loadReport(reportMonth, reportScope);
      void refreshWorkLogReminderState().catch(() => undefined);
      notify("工作日志已删除");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "工作日志删除失败",
      );
    } finally {
      setDeletingEntryId(null);
    }
  };

  const objectiveOptionsById = useMemo(
    () => new Map(objectives.map((objective) => [objective.id, objective])),
    [objectives],
  );
  const categoryOptionsById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );
  useEffect(() => {
    if (!canUseWorkLogCategoryControls || !classificationSuggestionEnabled) {
      setClassificationSuggestion(null);
      setClassificationSuggestionLoading(false);
      return undefined;
    }
    if (
      editorDraft.bodyMarkdown.trim().length < 8 ||
      !orfRichTextHasMeaningfulContent(editorDraft.bodyMarkdown)
    ) {
      setClassificationSuggestion(null);
      setClassificationSuggestionLoading(false);
      return undefined;
    }

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      setClassificationSuggestionLoading(true);
      void suggestWorkLogClassification({
        bodyMarkdown: editorDraft.bodyMarkdown,
      })
        .then((response) => {
          if (!cancelled) {
            setClassificationSuggestion(response.suggestion);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setClassificationSuggestion(null);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setClassificationSuggestionLoading(false);
          }
        });
    }, 700);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [
    canUseWorkLogCategoryControls,
    classificationSuggestionEnabled,
    editorDraft.bodyMarkdown,
  ]);

  const applyClassificationSuggestion = (
    suggestion: WorkLogClassificationSuggestion,
  ) => {
    updateEditorDraft(workLogDraftPatchFromSuggestion(suggestion));
  };
  const visibleActivityEntries = useMemo(
    () =>
      activityExpanded
        ? activityEntries
        : activityEntries.slice(0, workLogActivityCollapsedLimit),
    [activityEntries, activityExpanded],
  );
  const activityHasMore =
    !activityExpanded && activityEntries.length > workLogActivityCollapsedLimit;
  const activityGroups = useMemo(
    () => groupActivityByDate(visibleActivityEntries),
    [visibleActivityEntries],
  );
  const reportRange = useMemo(() => monthRange(reportMonth), [reportMonth]);

  return (
    <PageScaffold title="工作日志" hideHeader>
      <div className="work-logs-toolbar">
        <WorkLogViewTabs onChange={changeView} value={viewMode} />
        <WorkLogDateControl date={selectedDate} onChange={changeDate} />
      </div>

      {viewMode === "today" && (
        <div className="work-logs-today-view">
          <Card className="work-logs-panel work-logs-activity-panel">
            <div className="work-logs-panel-heading">
              <div>
                <h2>团队动态</h2>
                <p>
                  {activityExpanded
                    ? `已展开最新 ${visibleActivityEntries.length} 条`
                    : `历史最新 ${workLogActivityCollapsedLimit} 条`}
                </p>
              </div>
              <IconButton
                icon={RefreshCw}
                label="刷新动态"
                onClick={() => void loadActivity(activityExpanded)}
              />
            </div>
            {activityLoading ? (
              <div className="work-logs-loading">
                <Loader2 className="h-5 w-5 animate-spin" />
                加载中
              </div>
            ) : activityGroups.length > 0 ? (
              <>
                <div className="work-logs-activity-list">
                  {activityGroups.map((group) => (
                    <section
                      className="work-logs-activity-group"
                      key={group.date}
                    >
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
                {activityHasMore && (
                  <div className="work-logs-activity-footer">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setActivityExpanded(true)}
                    >
                      <Plus className="h-4 w-4" />
                      展开更多
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className="work-logs-empty">
                <Activity className="h-6 w-6" />
                <span>暂无团队日志</span>
              </div>
            )}
          </Card>

          <div className="work-logs-today-main">
            <Card className="work-logs-panel work-logs-editor-panel">
              <div className="work-logs-panel-heading">
                <div>
                  <h2>我的日志</h2>
                  <p>{currentUser?.name ?? ""}</p>
                </div>
                <div className="work-logs-editor-heading-actions">
                  {canUseWorkLogCategoryControls && classificationSuggestionEnabled && (
                    <WorkLogClassificationSuggestionSlot
                      categories={categories}
                      draft={editorDraft}
                      loading={classificationSuggestionLoading}
                      objectives={objectives}
                      onApply={applyClassificationSuggestion}
                      suggestion={classificationSuggestion}
                    />
                  )}
                  {editorDraft.editingEntryId && (
                    <Button
                      variant="secondary"
                      onClick={startNewEntry}
                      disabled={!canWrite || saving}
                    >
                      <Plus className="h-4 w-4" />
                      新日志
                    </Button>
                  )}
                </div>
              </div>

              {error && <div className="work-logs-error">{error}</div>}
              {draftValidation && (
                <div className="work-logs-error">{draftValidation}</div>
              )}

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
                    <WorkLogEditorCard
                      canUseCategories={canUseWorkLogCategoryControls}
                      category={
                        editorDraft.categoryId
                          ? categoryOptionsById.get(editorDraft.categoryId)
                          : undefined
                      }
                      currentUserId={currentUser?.id ?? ""}
                      draft={editorDraft}
                      editingEntry={editingEntry}
                      objective={
                        editorDraft.objectiveId
                          ? objectiveOptionsById.get(editorDraft.objectiveId)
                          : undefined
                      }
                      classificationOptions={buildWorkLogClassificationChoices(
                        editorDraft,
                        objectives,
                        {
                          allowCategories: canUseWorkLogCategoryControls,
                          allowUncategorized: canSaveWithoutObjective,
                        },
                        categories,
                      )}
                      onChange={updateEditorDraft}
                    />
                  </div>

                  <div className="work-logs-editor-actions">
                    <Button
                      variant="ghost"
                      onClick={() =>
                        setEditorDraft(
                          editingEntry
                            ? workLogEditorDraftFromEntry(editingEntry)
                            : blankWorkLogEditorDraft(),
                        )
                      }
                      disabled={
                        (!hasChanges && !editorDraft.editingEntryId) || saving
                      }
                    >
                      {editorDraft.editingEntryId ? "取消编辑" : "清空"}
                    </Button>
                    <Button
                      onClick={() => void saveEntry()}
                      disabled={saveDisabled}
                    >
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      {editorDraft.editingEntryId ? "更新日志" : "提交日志"}
                    </Button>
                  </div>
                </>
              )}
            </Card>

            <Card className="work-logs-panel work-logs-history-panel">
              {loading ? (
                <div className="work-logs-loading">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  加载中
                </div>
              ) : (
                <WorkLogHistoryList
                  currentEditingEntryId={editorDraft.editingEntryId}
                  deletingEntryId={deletingEntryId}
                  entries={myEntries}
                  onDelete={deleteEntry}
                  onEdit={editExistingEntry}
                />
              )}
            </Card>
          </div>
        </div>
      )}

      {viewMode === "report" && (
        <WorkLogReportPanel
          currentUserId={currentUser?.id ?? null}
          loading={reportLoading}
          onRefresh={() => void loadReport(reportMonth, reportScope)}
          onScopeChange={setReportScope}
          onSelectMonth={setReportMonth}
          rangeLabel={`${reportRange.from} - ${reportRange.to}`}
          report={report}
          reportError={reportError}
          reportMonth={reportMonth}
          scope={reportScope}
        />
      )}
    </PageScaffold>
  );
}

function WorkLogDateControl({
  date,
  onChange,
}: {
  date: string;
  onChange: (date: string) => void;
}) {
  return (
    <div className="work-logs-date-control">
      <IconButton
        icon={ChevronLeft}
        label="前一天"
        onClick={() => onChange(addCalendarDays(date, -1, date))}
      />
      <FantasyDatePicker
        ariaLabel="选择日志日期"
        value={date}
        onChange={onChange}
      >
        <CalendarDays className="h-4 w-4" />
        <span>{date}</span>
      </FantasyDatePicker>
      <IconButton
        icon={ChevronRight}
        label="后一天"
        onClick={() => onChange(addCalendarDays(date, 1, date))}
      />
      <Button variant="secondary" onClick={() => onChange(todayValue())}>
        今天
      </Button>
    </div>
  );
}

function WorkLogViewTabs({
  onChange,
  value,
}: {
  onChange: (value: WorkLogViewMode) => void;
  value: WorkLogViewMode;
}) {
  return (
    <div
      className="work-logs-view-tabs"
      role="tablist"
      aria-label="工作日志视图"
    >
      {workLogViewOptions.map((option) => {
        const Icon = option.icon;
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            className={clsx(
              "work-logs-view-tab",
              selected && "work-logs-view-tab-active",
            )}
            onClick={() => onChange(option.value)}
          >
            <span className="work-logs-view-tab-icon">
              <Icon className="h-4 w-4" />
            </span>
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function WorkLogEditorCard({
  canUseCategories,
  category,
  classificationOptions,
  currentUserId,
  draft,
  editingEntry,
  objective,
  onChange,
}: {
  canUseCategories: boolean;
  category?: WorkLogCategoryOption;
  classificationOptions: WorkLogClassificationChoice[];
  currentUserId: string;
  draft: WorkLogEditorDraft;
  editingEntry: WorkLogEntry | null;
  objective?: WorkLogObjectiveOption;
  onChange: (patch: WorkLogEditorDraftPatch) => void;
}) {
  const estimateEnabled = draft.classificationKind === "objective" && Boolean(draft.objectiveId);
  const estimateLabel =
    draft.remainingEstimatePercent === null
      ? "未填写"
      : `${draft.remainingEstimatePercent}%`;
  const classificationValue = classificationSelectValueFromDraft(draft);
  return (
    <section className="work-logs-draft-entry">
      <div className="work-logs-draft-entry-header">
        <FantasySelectMenu
          ariaLabel="日志归类"
          className="work-logs-objective-select"
          disabled={classificationOptions.length <= 1}
          leadingIcon={
            draft.classificationKind === "category" ? (
              <Tags className="h-4 w-4" />
            ) : draft.classificationKind === "objective" ? (
              <Target className="h-4 w-4" />
            ) : (
              <NotebookPen className="h-4 w-4" />
            )
          }
          onChange={(value) => onChange(workLogDraftPatchFromClassificationSelect(value))}
          options={classificationOptions}
          placeholder="选择目标"
          searchable
          searchPlaceholder={canUseCategories ? "搜索目标或分类" : "搜索目标"}
          value={classificationValue}
          variant="filter"
        />
        {editingEntry && (
          <span className="work-logs-editing-badge">编辑中</span>
        )}
      </div>
      {draft.classificationKind === "category" && !draft.categoryId && (
        <div className="work-logs-category-create-row">
          <Tags className="h-4 w-4" />
          <input
            aria-label="新建日志分类名称"
            maxLength={48}
            onChange={(event) => onChange({ categoryName: event.target.value })}
            placeholder="输入新分类名称"
            value={draft.categoryName}
          />
        </div>
      )}
      {draft.objectiveTitleSnapshot && !objective && draft.classificationKind === "objective" && (
        <div className="work-logs-snapshot-note">
          历史目标：{draft.objectiveTitleSnapshot}
        </div>
      )}
      {draft.categoryNameSnapshot && !category && draft.classificationKind === "category" && (
        <div className="work-logs-snapshot-note">
          历史分类：{draft.categoryNameSnapshot}
        </div>
      )}
      <div
        className="work-logs-estimate-control"
        data-disabled={!estimateEnabled}
      >
        <div className="work-logs-estimate-heading">
          <div>
            <span>目标剩余估计</span>
            <small>
              {estimateEnabled
                ? "只作为这条日志的主观快照"
                : "选择目标后可填写"}
            </small>
          </div>
          <strong>{estimateLabel}</strong>
        </div>
        <div className="work-logs-estimate-inputs">
          <input
            aria-label="目标剩余估计滑块"
            disabled={!estimateEnabled}
            max={100}
            min={0}
            onChange={(event) =>
              onChange({ remainingEstimatePercent: Number(event.target.value) })
            }
            type="range"
            value={draft.remainingEstimatePercent ?? 0}
          />
          <input
            aria-label="目标剩余估计百分比"
            disabled={!estimateEnabled}
            inputMode="numeric"
            max={100}
            min={0}
            onChange={(event) =>
              onChange({
                remainingEstimatePercent: parseWorkLogEstimateInput(
                  event.target.value,
                ),
              })
            }
            placeholder="--"
            type="number"
            value={draft.remainingEstimatePercent ?? ""}
          />
          <button
            type="button"
            disabled={
              !estimateEnabled || draft.remainingEstimatePercent === null
            }
            onClick={() => onChange({ remainingEstimatePercent: null })}
          >
            清除
          </button>
        </div>
      </div>
      <div className="work-logs-duration-control">
        <div>
          <Clock3 className="h-4 w-4" />
          <span>记录时间</span>
          <small>可选，想记就记</small>
        </div>
        <div className="work-logs-duration-inputs">
          <input
            aria-label="记录时间分钟数"
            inputMode="numeric"
            max={1440}
            min={1}
            onChange={(event) =>
              onChange({ durationMinutes: parseWorkLogDurationInput(event.target.value) })
            }
            placeholder="--"
            type="number"
            value={draft.durationMinutes ?? ""}
          />
          <span>分钟</span>
          <button
            type="button"
            disabled={draft.durationMinutes === null}
            onClick={() => onChange({ durationMinutes: null })}
          >
            清除
          </button>
        </div>
      </div>
      <OrfRichTextEditor
        className="work-logs-editor"
        currentUserId={currentUserId}
        idleHint="Markdown"
        mentionableUsers={[]}
        onChange={(bodyMarkdown) => onChange({ bodyMarkdown })}
        placeholder="写下今天完成了什么"
        submitOnEnter={false}
        value={draft.bodyMarkdown}
      />
    </section>
  );
}

function WorkLogClassificationSuggestionSlot({
  categories,
  draft,
  loading,
  objectives,
  onApply,
  suggestion,
}: {
  categories: WorkLogCategoryOption[];
  draft: WorkLogEditorDraft;
  loading: boolean;
  objectives: WorkLogObjectiveOption[];
  onApply: (suggestion: WorkLogClassificationSuggestion) => void;
  suggestion: WorkLogClassificationSuggestion | null;
}) {
  const hasContent =
    draft.bodyMarkdown.trim().length >= 8 &&
    orfRichTextHasMeaningfulContent(draft.bodyMarkdown);
  const label =
    suggestion && !suggestionMatchesWorkLogDraft(suggestion, draft)
      ? workLogSuggestionLabel(suggestion, { categories, objectives })
      : "";
  if (loading) {
    return (
      <div className="work-logs-ai-suggestion-slot" data-state="loading" aria-live="polite">
        <span className="work-logs-ai-suggestion-icon" aria-hidden="true">
          <Loader2 className="h-4 w-4 animate-spin" />
        </span>
        <div>
          <span>智能分析中</span>
          <small>正在匹配目标和分类</small>
        </div>
      </div>
    );
  }
  if (!label || !suggestion) {
    return (
      <div
        className="work-logs-ai-suggestion-slot"
        data-state={hasContent ? "ready" : "idle"}
        aria-live="polite"
      >
        <span className="work-logs-ai-suggestion-icon" aria-hidden="true">
          <BrainCircuit className="h-4 w-4" />
        </span>
        <div>
          <span>智能分析</span>
          <small>{hasContent ? "等待新的匹配结果" : "输入后自动建议"}</small>
        </div>
      </div>
    );
  }

  return (
    <div
      className="work-logs-ai-suggestion-slot"
      data-state="suggested"
      aria-live="polite"
      title={suggestion.reason ?? undefined}
    >
      <span className="work-logs-ai-suggestion-icon" aria-hidden="true">
        <BrainCircuit className="h-4 w-4" />
      </span>
      <div>
        <span>AI 建议</span>
        <strong>{label}</strong>
      </div>
      <button type="button" onClick={() => onApply(suggestion)}>
        采用
      </button>
    </div>
  );
}

function WorkLogHistoryList({
  currentEditingEntryId,
  deletingEntryId,
  entries,
  onDelete,
  onEdit,
}: {
  currentEditingEntryId: string | null;
  deletingEntryId: string | null;
  entries: WorkLogEntry[];
  onDelete: (entry: WorkLogEntry) => void;
  onEdit: (entry: WorkLogEntry) => void;
}) {
  return (
    <section className="work-logs-history">
      <div className="work-logs-history-heading">
        <h3>当天记录</h3>
        <span>{entries.length} 条</span>
      </div>
      {entries.length > 0 ? (
        <div className="work-logs-history-list">
          {entries.map((entry) => (
            <article
              className={clsx(
                "work-logs-history-entry",
                entry.id === currentEditingEntryId &&
                  "work-logs-history-entry-active",
              )}
              key={entry.id}
            >
              <div className="work-logs-history-entry-header">
                <div className="work-logs-history-entry-meta">
                  <span>{workLogEntryTargetLabel(entry)}</span>
                  <time>{formatActivityTime(entry.updatedAt)}</time>
                </div>
                <div className="work-logs-history-actions">
                  {entry.durationMinutes !== null &&
                    entry.durationMinutes !== undefined && (
                      <span className="work-logs-duration-pill">
                        {formatWorkLogDurationMinutes(entry.durationMinutes)}
                      </span>
                    )}
                  {entry.remainingEstimatePercent !== null &&
                    entry.remainingEstimatePercent !== undefined && (
                      <span className="work-logs-remaining-pill">
                        剩 {entry.remainingEstimatePercent}%
                      </span>
                    )}
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    aria-label={`编辑日志：${workLogEntryTargetLabel(entry)}`}
                    onClick={() => onEdit(entry)}
                  >
                    <PencilLine className="h-4 w-4" />
                    编辑
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    aria-label={`删除日志：${workLogEntryTargetLabel(entry)}`}
                    disabled={deletingEntryId === entry.id}
                    onClick={() => onDelete(entry)}
                  >
                    {deletingEntryId === entry.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    删除
                  </Button>
                </div>
              </div>
              <WorkLogMarkdown body={entry.bodyMarkdown} />
            </article>
          ))}
        </div>
      ) : (
        <div className="work-logs-history-empty">当天还没有提交记录</div>
      )}
    </section>
  );
}

function WorkLogActivityCard({
  currentUserId,
  entry,
}: {
  currentUserId: string | null;
  entry: WorkLogActivityItem;
}) {
  const authorName = entry.authorCurrentName ?? entry.authorNameSnapshot;
  const classification = workLogEntryClassification(entry);
  return (
    <article className="work-logs-activity-entry">
      <UserAvatar
        avatarUrl={entry.authorAvatarUrl}
        className="work-logs-activity-avatar"
        frame={false}
        name={authorName}
      />
      <div className="work-logs-activity-body">
        <div className="work-logs-activity-meta">
          <strong>{authorName}</strong>
          {entry.authorUserId === currentUserId && <span>我</span>}
          <time>{formatActivityTime(entry.updatedAt)}</time>
        </div>
        <div className="work-logs-activity-target">
          {classification.kind === "objective" ? (
            <Target className="h-3.5 w-3.5" />
          ) : classification.kind === "category" ? (
            <Tags className="h-3.5 w-3.5" />
          ) : (
            <NotebookPen className="h-3.5 w-3.5" />
          )}
          {classification.objectiveId ? (
            <a
              href={`/tasks#objective:${encodeURIComponent(classification.objectiveId)}`}
            >
              {classification.title}
            </a>
          ) : (
            <span>{classification.title}</span>
          )}
          {entry.durationMinutes !== null &&
            entry.durationMinutes !== undefined && (
              <em className="work-logs-duration-pill">
                {formatWorkLogDurationMinutes(entry.durationMinutes)}
              </em>
            )}
          {entry.remainingEstimatePercent !== null &&
            entry.remainingEstimatePercent !== undefined && (
              <em>剩 {entry.remainingEstimatePercent}%</em>
            )}
        </div>
        <WorkLogMarkdown body={entry.bodyMarkdown} />
      </div>
    </article>
  );
}

function WorkLogMarkdown({ body }: { body: string }) {
  return (
    <div className="work-logs-activity-markdown">
      <OrfRichTextMarkdownViewer
        body={body}
        classNamePrefix="orf-work-log-markdown"
        compact
      />
    </div>
  );
}

function WorkLogReportPanel({
  className,
  currentUserId,
  loading,
  onRefresh,
  onScopeChange,
  onSelectMonth,
  rangeLabel,
  report,
  reportError,
  reportMonth,
  scope,
}: {
  className?: string;
  currentUserId: string | null;
  loading: boolean;
  onRefresh: () => void;
  onScopeChange: (scope: WorkLogReportScope) => void;
  onSelectMonth: (month: string) => void;
  rangeLabel: string;
  report: WorkLogReport | null;
  reportError: string;
  reportMonth: string;
  scope: WorkLogReportScope;
}) {
  const cellsByKey = useMemo(
    () =>
      new Map(
        (report?.cells ?? []).map((cell) => [
          workLogReportCellKey(cell.userId, cell.date),
          cell,
        ]),
      ),
    [report],
  );
  const currentUserReport =
    report?.users.find((user) => user.id === currentUserId) ??
    report?.users[0] ??
    null;
  return (
    <Card className={clsx("work-logs-panel work-logs-report-panel", className)}>
      <div className="work-logs-report-toolbar">
        <div>
          <h2>工作日志报表</h2>
          <p>{rangeLabel}</p>
        </div>
        <div className="work-logs-report-controls">
          <div className="work-logs-report-month-control">
            <IconButton
              icon={ChevronLeft}
              label="上个月"
              onClick={() => onSelectMonth(addReportMonths(reportMonth, -1))}
            />
            <button
              type="button"
              className="work-logs-report-month-label"
              onClick={() => onSelectMonth(monthFromDate(todayValue()))}
            >
              <CalendarDays className="h-4 w-4" />
              {formatReportMonth(reportMonth)}
            </button>
            <IconButton
              icon={ChevronRight}
              label="下个月"
              onClick={() => onSelectMonth(addReportMonths(reportMonth, 1))}
            />
          </div>
          <div
            className="work-logs-report-scope"
            role="group"
            aria-label="报表范围"
          >
            <button
              type="button"
              aria-pressed={scope === "mine"}
              onClick={() => onScopeChange("mine")}
            >
              <UserRound className="h-4 w-4" />
              个人
            </button>
            <button
              type="button"
              aria-pressed={scope === "team"}
              onClick={() => onScopeChange("team")}
            >
              <UsersRound className="h-4 w-4" />
              全部
            </button>
          </div>
          <IconButton icon={RefreshCw} label="刷新报表" onClick={onRefresh} />
        </div>
      </div>

      {reportError && <div className="work-logs-error">{reportError}</div>}
      {loading ? (
        <div className="work-logs-loading">
          <Loader2 className="h-5 w-5 animate-spin" />
          加载报表
        </div>
      ) : report ? (
        <>
          <WorkLogReportSummary report={report} />
          {scope === "mine" ? (
            <WorkLogPersonalCalendar
              cellsByKey={cellsByKey}
              month={reportMonth}
              user={currentUserReport}
            />
          ) : (
            <WorkLogTeamMatrix cellsByKey={cellsByKey} report={report} />
          )}
        </>
      ) : (
        <div className="work-logs-empty">
          <BarChart3 className="h-6 w-6" />
          <span>暂无报表数据</span>
        </div>
      )}
    </Card>
  );
}

function WorkLogReportSummary({ report }: { report: WorkLogReport }) {
  const cards = [
    { label: "日志记录", value: `${report.totals.totalEntries} 条` },
    { label: "有记录日期", value: `${report.totals.activeDays} 天` },
    { label: "覆盖归类", value: `${report.totals.coveredClassificationCount} 个` },
    {
      label: "记录时间",
      value: formatWorkLogDurationMinutes(report.totals.totalDurationMinutes) || "--",
    },
    {
      label: "平均剩余估计",
      value: formatOptionalPercent(
        report.totals.averageRemainingEstimatePercent,
      ),
    },
  ];
  return (
    <div className="work-logs-report-summary">
      {cards.map((card) => (
        <div className="work-logs-report-summary-card" key={card.label}>
          <span>{card.label}</span>
          <strong>{card.value}</strong>
        </div>
      ))}
    </div>
  );
}

function WorkLogPersonalCalendar({
  cellsByKey,
  month,
  user,
}: {
  cellsByKey: Map<string, WorkLogReportDayCell>;
  month: string;
  user: WorkLogReport["users"][number] | null;
}) {
  const slots = monthCalendarSlots(month);
  return (
    <div className="work-logs-personal-report">
      <div className="work-logs-personal-report-heading">
        <div>
          <h3>{user?.name ?? "个人"}的月度记录</h3>
          <p>按日期查看记录、归类、可选时间和目标剩余估计</p>
        </div>
        {user && (
          <div className="work-logs-personal-report-user">
            <UserAvatar
              avatarUrl={user.avatarUrl}
              frame={false}
              name={user.name}
              size="sm"
            />
            <span>{user.activeDays} 天有记录</span>
          </div>
        )}
      </div>
      <div
        className="work-logs-calendar-grid"
        role="grid"
        aria-label="个人工作日志月历"
      >
        {weekdayLabels.map((label) => (
          <div className="work-logs-calendar-weekday" key={label}>
            {label}
          </div>
        ))}
        {slots.map((slot, index) => {
          const cell =
            slot.date && user
              ? cellsByKey.get(workLogReportCellKey(user.id, slot.date))
              : null;
          return (
            <div
              className="work-logs-calendar-day"
              data-empty={!slot.date || !cell || cell.entryCount === 0}
              data-today={slot.date === todayValue()}
              key={slot.date ?? `blank-${index}`}
            >
              {slot.date ? (
                <>
                  <div className="work-logs-calendar-day-head">
                    <span>{Number(slot.date.slice(8, 10))}</span>
                    {cell && cell.entryCount > 0 && (
                      <strong>{cell.entryCount}条</strong>
                    )}
                  </div>
                  {cell && cell.entryCount > 0 ? (
                    <div className="work-logs-calendar-day-body">
                      <div className="work-logs-calendar-day-meta">
                        <span>{cell.classificationCount} 个归类</span>
                        {cell.totalDurationMinutes > 0 && (
                          <span>
                            {formatWorkLogDurationMinutes(cell.totalDurationMinutes)}
                          </span>
                        )}
                        {cell.latestRemainingEstimatePercent !== null &&
                          cell.latestRemainingEstimatePercent !== undefined && (
                            <span>
                              剩 {cell.latestRemainingEstimatePercent}%
                            </span>
                          )}
                      </div>
                      <div className="work-logs-calendar-objectives">
                        {cell.classifications.slice(0, 3).map((classification) => (
                          <span
                            key={`${classification.kind}:${classification.objectiveId ?? classification.categoryId ?? classification.title}`}
                          >
                            {classification.title}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="work-logs-calendar-empty-label">未写</div>
                  )}
                </>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WorkLogTeamMatrix({
  cellsByKey,
  report,
}: {
  cellsByKey: Map<string, WorkLogReportDayCell>;
  report: WorkLogReport;
}) {
  const [openCell, setOpenCell] =
    useState<WorkLogReportCellPopoverState | null>(null);
  const days = dateRangeValues(report.from, report.to);
  const dayTotals = days.map((date) =>
    report.cells
      .filter((cell) => cell.date === date)
      .reduce((sum, cell) => sum + cell.entryCount, 0),
  );
  const gridStyle = {
    gridTemplateColumns: `minmax(168px, 210px) repeat(${days.length}, minmax(54px, 1fr))`,
  };
  const openReportCell = (
    cell: WorkLogReportDayCell,
    userName: string,
    anchor: HTMLElement,
  ) => {
    if (cell.entryCount <= 0) return;
    const rect = anchor.getBoundingClientRect();
    setOpenCell({
      key: workLogReportCellKey(cell.userId, cell.date),
      cell,
      userName,
      rect: {
        height: rect.height,
        left: rect.left,
        top: rect.top,
        width: rect.width,
      },
    });
  };

  useEffect(() => {
    if (!openCell) return undefined;

    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest("[data-work-log-report-popover-root='true']") ||
        target?.closest(`[data-work-log-cell-key='${openCell.key}']`)
      ) {
        return;
      }
      setOpenCell(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenCell(null);
      }
    };
    const closeOnViewportChange = () => setOpenCell(null);

    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [openCell]);

  return (
    <div className="work-logs-team-report">
      <div className="work-logs-team-matrix" style={gridStyle}>
        <div className="work-logs-team-matrix-corner">成员</div>
        {days.map((date) => (
          <div
            className="work-logs-team-matrix-day"
            data-today={date === todayValue()}
            key={date}
          >
            <strong>{Number(date.slice(8, 10))}</strong>
            <span>{shortWeekdayLabel(date)}</span>
          </div>
        ))}
        {report.users.map((user) => (
          <div className="work-logs-team-row" key={user.id} style={gridStyle}>
            <div className="work-logs-team-user">
              <UserAvatar
                avatarUrl={user.avatarUrl}
                frame={false}
                name={user.name}
                size="sm"
              />
              <div>
                <strong>{user.name}</strong>
                <span>
                  {user.totalEntries} 条 · {user.activeDays} 天
                  {user.totalDurationMinutes > 0
                    ? ` · ${formatWorkLogDurationMinutes(user.totalDurationMinutes)}`
                    : ""}
                </span>
              </div>
            </div>
            {days.map((date) => {
              const cell = cellsByKey.get(workLogReportCellKey(user.id, date));
              return (
                <WorkLogTeamMatrixCell
                  cell={cell}
                  key={`${user.id}:${date}`}
                  onOpen={openReportCell}
                  userName={user.name}
                />
              );
            })}
          </div>
        ))}
        <div
          className="work-logs-team-row work-logs-team-total-row"
          style={gridStyle}
        >
          <div className="work-logs-team-user">
            <div>
              <strong>总计</strong>
              <span>{report.totals.usersWithEntries} 人有记录</span>
            </div>
          </div>
          {days.map((date, index) => (
            <div
              className="work-logs-team-cell"
              data-density={workLogReportDensity(dayTotals[index])}
              key={`total:${date}`}
            >
              {dayTotals[index] > 0 ? (
                <strong>{dayTotals[index]}</strong>
              ) : (
                <span>-</span>
              )}
            </div>
          ))}
        </div>
      </div>
      {openCell && (
        <WorkLogReportCellPopover
          onClose={() => setOpenCell(null)}
          state={openCell}
        />
      )}
    </div>
  );
}

function WorkLogTeamMatrixCell({
  cell,
  onOpen,
  userName,
}: {
  cell?: WorkLogReportDayCell;
  onOpen: (
    cell: WorkLogReportDayCell,
    userName: string,
    anchor: HTMLElement,
  ) => void;
  userName: string;
}) {
  const count = cell?.entryCount ?? 0;
  if (!cell || count <= 0) {
    return (
      <div
        className="work-logs-team-cell"
        data-density={workLogReportDensity(count)}
        title={workLogReportCellTitle(cell)}
      >
        <span>-</span>
      </div>
    );
  }

  const cellKey = workLogReportCellKey(cell.userId, cell.date);
  return (
    <button
      type="button"
      aria-label={`${userName} ${cell.date} 的 ${count} 条工作日志`}
      className="work-logs-team-cell"
      data-work-log-cell-key={cellKey}
      data-density={workLogReportDensity(count)}
      title={workLogReportCellTitle(cell)}
      onClick={(event) => onOpen(cell, userName, event.currentTarget)}
      onFocus={(event) => onOpen(cell, userName, event.currentTarget)}
      onMouseEnter={(event) => onOpen(cell, userName, event.currentTarget)}
    >
      <strong>{count}</strong>
      {cell.totalDurationMinutes > 0 ? (
        <small>{formatWorkLogDurationMinutes(cell.totalDurationMinutes)}</small>
      ) : (
        cell.latestRemainingEstimatePercent !== null &&
        cell.latestRemainingEstimatePercent !== undefined && (
          <small>剩{cell.latestRemainingEstimatePercent}%</small>
        )
      )}
    </button>
  );
}

function WorkLogReportCellPopover({
  onClose,
  state,
}: {
  onClose: () => void;
  state: WorkLogReportCellPopoverState;
}) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="work-logs-report-popover"
      data-work-log-report-popover-root="true"
      role="dialog"
      aria-label={`${state.userName} ${state.cell.date} 工作日志明细`}
      style={workLogReportPopoverStyle(state.rect)}
    >
      <header className="work-logs-report-popover-header">
        <div>
          <strong>{state.userName}</strong>
          <span>
            {state.cell.date} · {state.cell.entryCount} 条日志
          </span>
        </div>
        <button type="button" onClick={onClose} aria-label="关闭日志明细">
          ×
        </button>
      </header>
      <div className="work-logs-report-popover-list">
        {state.cell.entries.map((entry) => (
          <article className="work-logs-report-popover-entry" key={entry.id}>
            <div className="work-logs-report-popover-entry-meta">
              <span>{entry.classificationTitle}</span>
              <time>{formatActivityTime(entry.updatedAt)}</time>
              {entry.durationMinutes !== null &&
                entry.durationMinutes !== undefined && (
                  <em className="work-logs-duration-pill">
                    {formatWorkLogDurationMinutes(entry.durationMinutes)}
                  </em>
                )}
              {entry.remainingEstimatePercent !== null &&
                entry.remainingEstimatePercent !== undefined && (
                  <em>剩 {entry.remainingEstimatePercent}%</em>
                )}
            </div>
            <WorkLogMarkdown body={entry.bodyMarkdown} />
          </article>
        ))}
      </div>
    </div>,
    document.body,
  );
}

function workLogReportPopoverStyle(
  rect: WorkLogReportCellPopoverState["rect"],
): CSSProperties {
  const viewportWidth =
    typeof window === "undefined" ? 1024 : window.innerWidth;
  const viewportHeight =
    typeof window === "undefined" ? 768 : window.innerHeight;
  const padding = 12;
  const gap = 8;
  const width = Math.min(380, viewportWidth - padding * 2);
  const left = Math.min(
    Math.max(padding, rect.left + rect.width / 2 - width / 2),
    Math.max(padding, viewportWidth - width - padding),
  );
  const preferredTop = rect.top + rect.height + gap;
  const maxHeight = Math.min(420, viewportHeight - padding * 2);
  const top =
    preferredTop + 240 <= viewportHeight - padding
      ? preferredTop
      : Math.max(padding, rect.top - maxHeight - gap);

  return {
    left,
    maxHeight,
    position: "fixed",
    top,
    width,
    zIndex: 70,
  };
}

function dateFromSearch(search: string) {
  const value = new URLSearchParams(search).get("date") ?? "";
  return isDateOnlyString(value) ? value : todayValue();
}

function viewFromSearch(search: string): WorkLogViewMode {
  const value = new URLSearchParams(search).get("view");
  return value === "report" ? "report" : "today";
}

function workLogReportCellKey(userId: string, date: string) {
  return `${userId}:${date}`;
}

function monthFromDate(date: string) {
  return date.slice(0, 7);
}

function monthRange(month: string) {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const first = new Date(year, monthIndex, 1);
  const last = new Date(year, monthIndex + 1, 0);
  return {
    from: localDateString(first),
    to: localDateString(last),
  };
}

function addReportMonths(month: string, offset: number) {
  const [yearText, monthText] = month.split("-");
  const date = new Date(Number(yearText), Number(monthText) - 1 + offset, 1);
  return monthFromDate(localDateString(date));
}

function formatReportMonth(month: string) {
  const [yearText, monthText] = month.split("-");
  return `${yearText}年${Number(monthText)}月`;
}

const weekdayLabels = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

function mondayWeekdayIndex(date: Date) {
  return (date.getDay() + 6) % 7;
}

function monthCalendarSlots(month: string) {
  const range = monthRange(month);
  const dates = dateRangeValues(range.from, range.to);
  const leadingBlankCount = mondayWeekdayIndex(
    new Date(`${range.from}T00:00:00`),
  );
  const trailingBlankCount = (7 - ((leadingBlankCount + dates.length) % 7)) % 7;
  return [
    ...Array.from({ length: leadingBlankCount }, () => ({
      date: null as string | null,
    })),
    ...dates.map((date) => ({ date })),
    ...Array.from({ length: trailingBlankCount }, () => ({
      date: null as string | null,
    })),
  ];
}

function dateRangeValues(from: string, to: string) {
  const values: string[] = [];
  const cursor = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  while (
    !Number.isNaN(cursor.getTime()) &&
    !Number.isNaN(end.getTime()) &&
    cursor.getTime() <= end.getTime() &&
    values.length <= 120
  ) {
    values.push(localDateString(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return values;
}

function shortWeekdayLabel(date: string) {
  const weekday =
    weekdayLabels[mondayWeekdayIndex(new Date(`${date}T00:00:00`))];
  return weekday.replace("周", "");
}

function formatOptionalPercent(value: number | null | undefined) {
  return value === null || value === undefined ? "--" : `${value}%`;
}

function workLogReportDensity(count: number) {
  if (count <= 0) return "empty";
  if (count === 1) return "light";
  if (count === 2) return "steady";
  return "busy";
}

function workLogReportCellTitle(cell?: WorkLogReportDayCell) {
  if (!cell || cell.entryCount === 0) return "未写";
  const classifications = cell.classifications
    .map((classification) => `${classification.title} ${classification.entryCount}条`)
    .join("，");
  const estimate =
    cell.latestRemainingEstimatePercent === null ||
    cell.latestRemainingEstimatePercent === undefined
      ? ""
      : `，最新剩余估计 ${cell.latestRemainingEstimatePercent}%`;
  const duration = cell.totalDurationMinutes > 0
    ? `，记录时间 ${formatWorkLogDurationMinutes(cell.totalDurationMinutes)}`
    : "";
  return `${cell.entryCount} 条日志，${cell.classificationCount} 个归类${duration}${estimate}${classifications ? `：${classifications}` : ""}`;
}

function groupActivityByDate(entries: WorkLogActivityItem[]) {
  const groups = new Map<string, WorkLogActivityItem[]>();
  for (const entry of entries) {
    const items = groups.get(entry.workDate) ?? [];
    items.push(entry);
    groups.set(entry.workDate, items);
  }
  return Array.from(groups.entries()).map(([date, groupEntries]) => ({
    date,
    entries: groupEntries,
  }));
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
