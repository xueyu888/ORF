import { clsx } from "clsx";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  File,
  FileText,
  Folder,
  Image,
  Loader2,
  NotebookPen,
  PencilLine,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
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
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { FantasyDatePicker } from "../components/FantasyDatePicker";
import { FantasySelectMenu } from "../components/FantasySelectMenu";
import { PageScaffold } from "../components/PageScaffold";
import { Button, Card, IconButton } from "../components/ui";
import { UserAvatar } from "../components/UserAvatar";
import { RelatedResourcesPanel } from "../features/drive/RelatedResourcesPanel";
import { driveNodeMetaLabel, formatDriveDateTime } from "../features/drive/drivePresentation";
import {
  OrfRichTextEditor,
  orfRichTextHasMeaningfulContent,
} from "../features/rich-text/OrfRichTextEditor";
import { OrfRichTextMarkdownViewer } from "../features/rich-text/OrfRichTextMarkdownViewer";
import { readModelInvalidationKey } from "../features/realtime/readModelInvalidations";
import {
  canSaveUnscopedWorkLog,
  canUseWorkLogCategories,
  isWorkLogSearchOnlyObjective,
  requiresObjectiveProgressEstimate,
} from "../domain/orfWorkLogs";
import {
  applyWorkLogEditorSessionDraftPatch,
  blankWorkLogEditorDraft,
  buildWorkLogClassificationChoices,
  canonicalWorkLogEditorDraft,
  canonicalWorkLogEntryForEdit,
  classificationSelectValueFromDraft,
  createWorkLogEditorSession,
  formatWorkLogDurationMinutes,
  moveWorkLogEditorSession,
  parseWorkLogProgressEstimateInput,
  suggestionMatchesWorkLogDraft,
  validateWorkLogEditorDraft,
  workLogDraftPatchFromClassificationSelect,
  workLogDraftPatchFromSuggestion,
  workLogEditorDraftHasContent,
  workLogEditorDraftFromEntry,
  workLogEditorSessionShouldFollowViewDate,
  workLogEntryClassification,
  workLogProgressEstimatePercentFromRemaining,
  workLogEntryTargetLabel,
  workLogSuggestionLabel,
  type WorkLogClassificationChoice,
  type WorkLogEditorDraft,
  type WorkLogEditorDraftPatch,
  type WorkLogEditorSession,
} from "../features/work-logs/workLogEditorModel";
import {
  createMyWorkLogEntry,
  deleteMyWorkLogEntry,
  getWorkLogObjectives,
  searchDriveRequest,
  suggestWorkLogClassification,
  updateMyWorkLogEntry,
} from "../state/apiClient";
import {
  invalidateWorkLogActivity,
  invalidateWorkLogObjectives,
  invalidateWorkLogReports,
  loadWorkLogActivity,
  loadWorkLogDay,
  loadWorkLogObjectives,
  loadWorkLogReport,
  setWorkLogDaySnapshot,
  workLogActivitySnapshot,
  workLogDaySnapshot,
  workLogObjectivesSnapshot,
  workLogReportSnapshot,
} from "../state/readModelQueries";
import { useOrf } from "../state/OrfProvider";
import type {
  WorkLogActivityItem,
  WorkLogCategoryOption,
  WorkLogClassificationSuggestion,
  DriveNode,
  WorkLogEntry,
  WorkLogObjectiveOption,
  WorkLogReport,
  WorkLogReportDayCell,
  WorkLogReportScope,
} from "../types/orf";
import {
  clearStoredWorkLogEditorDraft,
  moveStoredWorkLogEditorDraft,
  readStoredWorkLogEditorDraft,
  writeStoredWorkLogEditorDraft,
} from "../features/work-logs/workLogDraftStorage";
import { workLogActivityCollapsedLimit, workLogActivityExpandedLimit } from "../features/work-logs/workLogReadModelConfig";
import {
  addCalendarDays,
  isDateOnlyString,
  localDateString,
} from "../utils/date";

type WorkLogViewMode = "report" | "today";

type WorkLogClassificationObservation = {
  bodyMarkdown: string;
  suggestion: WorkLogClassificationSuggestion;
};

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


const todayValue = () => localDateString(new Date());

function mergeWorkLogObjectiveOptions(...groups: WorkLogObjectiveOption[][]) {
  const merged = new Map<string, WorkLogObjectiveOption>();
  for (const group of groups) {
    for (const objective of group) {
      if (!merged.has(objective.id)) {
        merged.set(objective.id, objective);
      }
    }
  }
  return [...merged.values()];
}

function completedObjectiveStatusLabel(objective: WorkLogObjectiveOption) {
  if (objective.flowStatus === "settled") return "已结算";
  if (objective.flowStatus === "closed") return "已关闭";
  return "已验收";
}

function completedObjectiveWorkLogNotice(objective: WorkLogObjectiveOption) {
  if (objective.flowStatus === "closed") {
    return "这个目标已关闭，本次日志只会作为历史记录，不会改变目标状态。";
  }
  return `这个目标${completedObjectiveStatusLabel(objective)}，本次日志会作为验收后工作/返工日志记录，不会改变目标状态。`;
}

function nonChallengerObjectiveWorkLogNotice(objective: WorkLogObjectiveOption) {
  return objective.isUserChallenger ? "" : "你不是这个目标的挑战者，本次日志会记录到该目标下，请确认目标选择无误。";
}

function workLogObjectiveSelectionNotices(objective: WorkLogObjectiveOption) {
  return [
    isWorkLogSearchOnlyObjective(objective) ? completedObjectiveWorkLogNotice(objective) : "",
    nonChallengerObjectiveWorkLogNotice(objective),
  ].filter(Boolean);
}

function workLogObjectiveSelectionSubmitMessage(objective: WorkLogObjectiveOption) {
  return `${workLogObjectiveSelectionNotices(objective).join("\n")}\n\n继续提交？`;
}

export function WorkLogsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const viewDate = dateFromSearch(location.search);
  const viewMode = viewFromSearch(location.search);
  const {
    currentUser,
    dismissSystemBroadcast,
    notify,
    readModelInvalidations,
    refreshWorkLogReminderState,
    systemBroadcasts,
  } = useOrf();
  const [objectives, setObjectives] = useState<WorkLogObjectiveOption[]>(() => workLogObjectivesSnapshot()?.objectives ?? []);
  const [objectiveSearchQuery, setObjectiveSearchQuery] = useState("");
  const [objectiveSearchResults, setObjectiveSearchResults] = useState<WorkLogObjectiveOption[]>([]);
  const [selectedObjectiveCache, setSelectedObjectiveCache] = useState<WorkLogObjectiveOption[]>([]);
  const [categories, setCategories] = useState<WorkLogCategoryOption[]>(() => workLogObjectivesSnapshot()?.categories ?? []);
  const [classificationSuggestionEnabled, setClassificationSuggestionEnabled] =
    useState(false);
  const [classificationObservation, setClassificationObservation] =
    useState<WorkLogClassificationObservation | null>(null);
  const [classificationSuggestionLoading, setClassificationSuggestionLoading] =
    useState(false);
  const [myEntries, setMyEntries] = useState<WorkLogEntry[]>(() => workLogDaySnapshot(dateFromSearch(location.search))?.entries ?? []);
  const [editorSession, setEditorSessionState] =
    useState<WorkLogEditorSession | null>(null);
  const editorSessionRef = useRef<WorkLogEditorSession | null>(editorSession);
  const myDayLoadRevisionRef = useRef(0);
  const viewDateRef = useRef(viewDate);
  viewDateRef.current = viewDate;
  const [activityEntries, setActivityEntries] = useState<WorkLogActivityItem[]>(() =>
    workLogActivitySnapshot(workLogActivityCollapsedLimit + 1)?.entries ?? [],
  );
  const [activityExpanded, setActivityExpanded] = useState(false);
  const [reportMonth, setReportMonth] = useState(() =>
    monthFromDate(dateFromSearch(location.search)),
  );
  const [reportScope, setReportScope] = useState<WorkLogReportScope>("mine");
  const initialReportRange = monthRange(reportMonth);
  const [report, setReport] = useState<WorkLogReport | null>(() =>
    workLogReportSnapshot(initialReportRange.from, initialReportRange.to, reportScope)?.report ?? null,
  );
  const [dayLoading, setDayLoading] = useState(
    () => !workLogObjectivesSnapshot() || !workLogDaySnapshot(viewDate),
  );
  const [activityLoading, setActivityLoading] = useState(() =>
    workLogActivitySnapshot(workLogActivityCollapsedLimit + 1) === undefined,
  );
  const [reportLoading, setReportLoading] = useState(() =>
    workLogReportSnapshot(initialReportRange.from, initialReportRange.to, reportScope) === undefined,
  );
  const [saving, setSaving] = useState(false);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [reportError, setReportError] = useState("");
  const [workLogResourceRevision, setWorkLogResourceRevision] = useState(0);
  const handledWorkLogsInvalidationKeyRef = useRef("");
  const editorDraft = editorSession?.draft ?? blankWorkLogEditorDraft();
  const workLogsInvalidationKey = useMemo(
    () => readModelInvalidationKey(readModelInvalidations, "workLogs"),
    [readModelInvalidations],
  );
  const canWrite =
    currentUser?.role === "admin" || currentUser?.role === "member";
  const canManageWorkLogCategories = canUseWorkLogCategories(currentUser);
  const canSelectWorkLogCategories = canManageWorkLogCategories || categories.length > 0;
  const canSaveWithoutObjective = canSaveUnscopedWorkLog(currentUser);
  const objectiveProgressEstimateRequired = requiresObjectiveProgressEstimate(currentUser);
  const objectiveSelectionOptions = useMemo(
    () =>
      mergeWorkLogObjectiveOptions(
        objectives,
        objectiveSearchResults,
        selectedObjectiveCache.filter((objective) => objective.id === editorDraft.objectiveId),
      ),
    [editorDraft.objectiveId, objectiveSearchResults, objectives, selectedObjectiveCache],
  );
  const objectiveOptionsById = useMemo(
    () => new Map(objectiveSelectionOptions.map((objective) => [objective.id, objective])),
    [objectiveSelectionOptions],
  );
  const categoryOptionsById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );
  const classificationSuggestion = classificationObservation?.suggestion ?? null;
  const editorWorkDate = editorSession?.workDate ?? viewDate;

  const commitEditorSession = useCallback((nextSession: WorkLogEditorSession | null) => {
    editorSessionRef.current = nextSession;
    setEditorSessionState(nextSession);
  }, []);

  const replaceEditorSession = useCallback((input: {
    draft?: WorkLogEditorDraft;
    userId: string;
    workDate: string;
  }) => {
    const nextSession = createWorkLogEditorSession({
      ...input,
      previousRevision: editorSessionRef.current?.revision,
    });
    commitEditorSession(nextSession);
    return nextSession;
  }, [commitEditorSession]);

  const loadMyDay = useCallback(async (date: string, force = false) => {
    const loadRevision = myDayLoadRevisionRef.current + 1;
    myDayLoadRevisionRef.current = loadRevision;
    const isCurrentLoad = () =>
      myDayLoadRevisionRef.current === loadRevision && viewDateRef.current === date;
    const cachedObjectives = workLogObjectivesSnapshot();
    const cachedDay = workLogDaySnapshot(date);
    if (isCurrentLoad()) {
      if (cachedObjectives) {
        setObjectives(cachedObjectives.objectives);
        setCategories(cachedObjectives.categories);
        setClassificationSuggestionEnabled(cachedObjectives.classificationSuggestionEnabled);
      }
      setMyEntries(cachedDay?.entries ?? []);
      setDayLoading(!cachedObjectives || !cachedDay);
      setError("");
    }
    try {
      const [objectiveResponse, dayResponse] = await Promise.all([
        loadWorkLogObjectives({ force }),
        loadWorkLogDay(date, { force }),
      ]);
      if (!isCurrentLoad()) return;
      setObjectives(objectiveResponse.objectives);
      setCategories(objectiveResponse.categories);
      setClassificationSuggestionEnabled(
        objectiveResponse.classificationSuggestionEnabled,
      );
      setMyEntries(dayResponse.entries);
    } catch (loadError) {
      if (!isCurrentLoad()) return;
      setError(
        loadError instanceof Error ? loadError.message : "工作日志加载失败",
      );
    } finally {
      if (isCurrentLoad()) setDayLoading(false);
    }
  }, []);

  useEffect(() => {
    const query = objectiveSearchQuery.trim();
    if (!query) {
      setObjectiveSearchResults([]);
      return undefined;
    }

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void getWorkLogObjectives({ mode: "search", q: query })
        .then((response) => {
          if (!cancelled) {
            setObjectiveSearchResults(response.objectives);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setObjectiveSearchResults([]);
          }
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [objectiveSearchQuery]);

  const loadActivity = useCallback(async (expanded: boolean, force = false) => {
    const limit = expanded ? workLogActivityExpandedLimit : workLogActivityCollapsedLimit + 1;
    const cached = workLogActivitySnapshot(limit);
    setActivityEntries(cached?.entries ?? []);
    setActivityLoading(!cached);
    try {
      const response = await loadWorkLogActivity(limit, { force });
      setActivityEntries(response.entries);
    } catch {
      if (!cached) setActivityEntries([]);
    } finally {
      setActivityLoading(false);
    }
  }, []);

  const loadReport = useCallback(
    async (month: string, scope: WorkLogReportScope, force = false) => {
      setReportError("");
      try {
        const range = monthRange(month);
        const cached = workLogReportSnapshot(range.from, range.to, scope);
        setReport(cached?.report ?? null);
        setReportLoading(!cached);
        const response = await loadWorkLogReport(range.from, range.to, scope, { force });
        setReport(response.report);
      } catch (loadError) {
        const range = monthRange(month);
        if (!workLogReportSnapshot(range.from, range.to, scope)) setReport(null);
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
    const userId = currentUser?.id;
    if (!userId) {
      if (editorSessionRef.current) commitEditorSession(null);
      return;
    }
    if (!workLogEditorSessionShouldFollowViewDate(editorSessionRef.current, userId, viewDate)) {
      return;
    }

    const storedDraft = readStoredWorkLogEditorDraft({ userId, workDate: viewDate });
    const cachedDay = workLogDaySnapshot(viewDate);
    const storedDraftAvailable = Boolean(
      storedDraft &&
        (!storedDraft.draft.editingEntryId ||
          !cachedDay ||
          cachedDay.entries.some((entry) => entry.id === storedDraft.draft.editingEntryId)),
    );
    if (storedDraft && !storedDraftAvailable) {
      clearStoredWorkLogEditorDraft({ userId, workDate: viewDate });
    }
    replaceEditorSession({
      draft: storedDraftAvailable && storedDraft
        ? storedDraft.draft
        : blankWorkLogEditorDraft(),
      userId,
      workDate: viewDate,
    });
    setObjectiveSearchQuery("");
    setObjectiveSearchResults([]);
    setSelectedObjectiveCache(
      storedDraftAvailable && storedDraft?.selectedObjective
        ? [storedDraft.selectedObjective]
        : [],
    );
    setClassificationObservation(null);
  }, [commitEditorSession, currentUser?.id, replaceEditorSession, viewDate]);

  useEffect(() => {
    const session = editorSessionRef.current;
    const editingEntryId = session?.draft.editingEntryId;
    if (
      !session ||
      !editingEntryId ||
      session.userId !== currentUser?.id ||
      session.workDate !== viewDate
    ) {
      return;
    }
    const daySnapshot = workLogDaySnapshot(viewDate);
    if (!daySnapshot || daySnapshot.entries.some((entry) => entry.id === editingEntryId)) {
      return;
    }
    clearStoredWorkLogEditorDraft(session);
    replaceEditorSession({ userId: session.userId, workDate: session.workDate });
    setSelectedObjectiveCache([]);
    setClassificationObservation(null);
  }, [currentUser?.id, editorSession?.revision, myEntries, replaceEditorSession, viewDate]);

  useEffect(() => {
    void loadMyDay(viewDate, false);
  }, [loadMyDay, viewDate]);

  useEffect(() => {
    void loadActivity(activityExpanded, false);
  }, [activityExpanded, loadActivity]);

  useEffect(() => {
    void loadReport(reportMonth, reportScope, false);
  }, [loadReport, reportMonth, reportScope]);

  useEffect(() => {
    if (!workLogsInvalidationKey || handledWorkLogsInvalidationKeyRef.current === workLogsInvalidationKey) return;
    handledWorkLogsInvalidationKeyRef.current = workLogsInvalidationKey;
    invalidateWorkLogObjectives();
    invalidateWorkLogActivity();
    invalidateWorkLogReports();
    void loadMyDay(viewDate, true);
    void loadActivity(activityExpanded, true);
    void loadReport(reportMonth, reportScope, true);
  }, [activityExpanded, loadActivity, loadMyDay, loadReport, reportMonth, reportScope, viewDate, workLogsInvalidationKey]);

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
    if (!currentUser?.id || saving) return;
    if (editorSessionRef.current) {
      clearStoredWorkLogEditorDraft(editorSessionRef.current);
    }
    replaceEditorSession({ userId: currentUser.id, workDate: viewDate });
    setObjectiveSearchQuery("");
    setObjectiveSearchResults([]);
    setSelectedObjectiveCache([]);
    setClassificationObservation(null);
    changeView("today");
  };

  const editExistingEntry = (entry: WorkLogEntry) => {
    if (!currentUser?.id || saving) return;
    if (editorSessionRef.current) {
      clearStoredWorkLogEditorDraft(editorSessionRef.current);
    }
    replaceEditorSession({
      draft: workLogEditorDraftFromEntry(entry),
      userId: currentUser.id,
      workDate: entry.workDate,
    });
    setObjectiveSearchQuery("");
    setObjectiveSearchResults([]);
    setSelectedObjectiveCache([]);
    setClassificationObservation(null);
    changeView("today");
  };

  const resetEditorDraft = () => {
    const currentSession = editorSessionRef.current;
    if (!currentSession || saving) return;
    if (currentSession.draft.editingEntryId) {
      startNewEntry();
      return;
    }
    clearStoredWorkLogEditorDraft(currentSession);
    replaceEditorSession({
      userId: currentSession.userId,
      workDate: currentSession.workDate,
    });
    setObjectiveSearchQuery("");
    setObjectiveSearchResults([]);
    setSelectedObjectiveCache([]);
    setClassificationObservation(null);
  };

  const updateEditorDraft = (patch: WorkLogEditorDraftPatch) => {
    const currentSession = editorSessionRef.current;
    if (!currentSession || saving) return;
    commitEditorSession(
      applyWorkLogEditorSessionDraftPatch(currentSession, patch),
    );
  };

  const rememberSelectedObjective = (objective: WorkLogObjectiveOption) => {
    setSelectedObjectiveCache((current) => mergeWorkLogObjectiveOptions([objective], current));
  };

  const changeEditorWorkDate = (date: string) => {
    const currentSession = editorSessionRef.current;
    if (
      !currentUser?.id ||
      !currentSession ||
      saving ||
      currentSession.draft.editingEntryId ||
      !isDateOnlyString(date) ||
      date === currentSession.workDate
    ) return;
    const currentDraft = currentSession.draft;
    const selectedObjective = currentDraft.objectiveId
      ? objectiveOptionsById.get(currentDraft.objectiveId) ?? null
      : null;
    if (workLogEditorDraftHasContent(currentDraft)) {
      const moveResult = moveStoredWorkLogEditorDraft({
        draft: currentDraft,
        fromWorkDate: currentSession.workDate,
        selectedObjective,
        toWorkDate: date,
        userId: currentUser.id,
      });
      if (moveResult === "targetOccupied") {
        setError(`${date} 已有未提交草稿，请先提交或清空该日期草稿。`);
        return;
      }
      if (moveResult === "unavailable") {
        setError("本机草稿暂时无法迁移，填写日期未改变。请稍后重试。");
        return;
      }
      commitEditorSession(moveWorkLogEditorSession(currentSession, date));
    } else {
      let storedDraft = readStoredWorkLogEditorDraft({ userId: currentUser.id, workDate: date });
      if (storedDraft?.draft.editingEntryId) {
        const storedEditingEntryId = storedDraft.draft.editingEntryId;
        const cachedTargetDay = workLogDaySnapshot(date);
        if (!cachedTargetDay) {
          setError(`${date} 有历史日志编辑草稿，请先通过顶部查看日期打开。`);
          return;
        }
        if (!cachedTargetDay.entries.some((entry) => entry.id === storedEditingEntryId)) {
          clearStoredWorkLogEditorDraft({ userId: currentUser.id, workDate: date });
          storedDraft = null;
        }
      }
      replaceEditorSession({
        draft: storedDraft?.draft ?? blankWorkLogEditorDraft(),
        userId: currentUser.id,
        workDate: date,
      });
      setSelectedObjectiveCache(storedDraft?.selectedObjective ? [storedDraft.selectedObjective] : []);
      setClassificationObservation(null);
    }
    setError("");
  };

  const editingEntry = editorDraft.editingEntryId
    ? ((editorWorkDate === viewDate ? myEntries : workLogDaySnapshot(editorWorkDate)?.entries ?? [])
        .find((entry) => entry.id === editorDraft.editingEntryId) ??
      null)
    : null;
  const draftInput = canonicalWorkLogEditorDraft(editorDraft);
  const draftHasInput = Boolean(
    draftInput.categoryId ||
    draftInput.categoryName ||
    draftInput.objectiveId ||
    orfRichTextHasMeaningfulContent(draftInput.bodyMarkdown),
  );
  const draftValidation = draftHasInput
    ? validateWorkLogEditorDraft(editorDraft, {
        allowCategories: canSelectWorkLogCategories,
        allowNewCategory: canManageWorkLogCategories,
        allowUncategorized: canSaveWithoutObjective,
        requireObjectiveProgressEstimate: objectiveProgressEstimateRequired,
      })
    : "";
  const editorBaselineKey = JSON.stringify(
    editingEntry
      ? canonicalWorkLogEntryForEdit(editingEntry)
      : {
          bodyMarkdown: "",
          categoryId: null,
          categoryName: null,
          objectiveId: null,
          remainingEstimatePercent: null,
        },
  );
  const draftKey = JSON.stringify(draftInput);
  const hasChanges = draftKey !== editorBaselineKey;
  const saveDisabled =
    saving ||
    !editorSession ||
    !canWrite ||
    !draftHasInput ||
    Boolean(draftValidation) ||
    !hasChanges;

  const saveEntry = async () => {
    const submittedSession = editorSessionRef.current;
    if (saveDisabled || !submittedSession) return;
    const submittedDraft = submittedSession.draft;
    const submittedDraftInput = canonicalWorkLogEditorDraft(submittedDraft);
    const selectedObjective = submittedDraftInput.objectiveId
      ? objectiveOptionsById.get(submittedDraftInput.objectiveId)
      : undefined;
    if (selectedObjective && workLogObjectiveSelectionNotices(selectedObjective).length > 0) {
      const confirmed = window.confirm(workLogObjectiveSelectionSubmitMessage(selectedObjective));
      if (!confirmed) return;
    }
    setSaving(true);
    setError("");
    try {
      const savedWorkDate = submittedSession.workDate;
      const classificationSuggestionForSave = classificationObservation?.bodyMarkdown === submittedDraft.bodyMarkdown
        ? classificationObservation.suggestion
        : null;
      const saveInput = {
        ...submittedDraftInput,
        classificationSuggestion: classificationSuggestionForSave,
      };
      const response = submittedDraft.editingEntryId
        ? await updateMyWorkLogEntry(submittedDraft.editingEntryId, saveInput)
        : await createMyWorkLogEntry(savedWorkDate, saveInput);
      setWorkLogDaySnapshot(savedWorkDate, response);
      if (viewDateRef.current === savedWorkDate) {
        setMyEntries(response.entries);
      }
      if (submittedDraftInput.categoryName) {
        invalidateWorkLogObjectives();
        void loadWorkLogObjectives({ force: true })
          .then((objectiveResponse) => {
            setObjectives(objectiveResponse.objectives);
            setCategories(objectiveResponse.categories);
            setClassificationSuggestionEnabled(
              objectiveResponse.classificationSuggestionEnabled,
            );
          })
          .catch(() => undefined);
      }
      const currentSession = editorSessionRef.current;
      if (currentSession?.revision === submittedSession.revision) {
        clearStoredWorkLogEditorDraft(submittedSession);
        replaceEditorSession({
          userId: submittedSession.userId,
          workDate: savedWorkDate,
        });
        setObjectiveSearchQuery("");
        setObjectiveSearchResults([]);
        setSelectedObjectiveCache([]);
        setClassificationObservation(null);
      } else if (
        currentSession?.userId !== submittedSession.userId ||
        currentSession?.workDate !== submittedSession.workDate
      ) {
        clearStoredWorkLogEditorDraft(submittedSession);
      }
      invalidateWorkLogActivity();
      invalidateWorkLogReports();
      void loadActivity(activityExpanded, true);
      void loadReport(reportMonth, reportScope, true);
      void refreshWorkLogReminderState().catch(() => undefined);
      systemBroadcasts
        .filter(
          (broadcast) => broadcast.notificationKind === "worklog.reminder",
        )
        .forEach((broadcast) => dismissSystemBroadcast(broadcast.id));
      if (viewDate !== savedWorkDate) {
        changeDate(savedWorkDate);
      }
      notify(submittedDraft.editingEntryId ? "工作日志已更新" : "工作日志已提交");
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "工作日志保存失败",
      );
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!editorSession || editorSession.userId !== currentUser?.id) {
      return;
    }

    const selectedObjective = editorSession.draft.objectiveId
      ? objectiveOptionsById.get(editorSession.draft.objectiveId) ?? null
      : null;
    try {
      writeStoredWorkLogEditorDraft({
        draft: editorSession.draft,
        selectedObjective,
        userId: editorSession.userId,
        workDate: editorSession.workDate,
      });
    } catch {
      // Draft autosave is best-effort local recovery and must not block editing.
    }
  }, [
    currentUser?.id,
    editorSession,
    objectiveOptionsById,
  ]);

  const deleteEntry = async (entry: WorkLogEntry) => {
    if (saving) return;
    const confirmed = window.confirm(
      "删除这条工作日志？删除后不会影响目标、进度、验收或积分。",
    );
    if (!confirmed) return;
    setDeletingEntryId(entry.id);
    setError("");
    try {
      const response = await deleteMyWorkLogEntry(entry.id);
      setMyEntries(response.entries);
      setWorkLogDaySnapshot(viewDate, response);
      const currentSession = editorSessionRef.current;
      if (currentSession?.draft.editingEntryId === entry.id) {
        clearStoredWorkLogEditorDraft(currentSession);
        replaceEditorSession({
          userId: currentSession.userId,
          workDate: currentSession.workDate,
        });
        setSelectedObjectiveCache([]);
        setClassificationObservation(null);
      }
      invalidateWorkLogActivity();
      invalidateWorkLogReports();
      void loadActivity(activityExpanded, true);
      void loadReport(reportMonth, reportScope, true);
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

  useEffect(() => {
    if (!canManageWorkLogCategories || !classificationSuggestionEnabled) {
      setClassificationObservation(null);
      setClassificationSuggestionLoading(false);
      return undefined;
    }
    if (
      editorDraft.bodyMarkdown.trim().length < 8 ||
      !orfRichTextHasMeaningfulContent(editorDraft.bodyMarkdown)
    ) {
      setClassificationObservation(null);
      setClassificationSuggestionLoading(false);
      return undefined;
    }

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      const analyzedBodyMarkdown = editorDraft.bodyMarkdown;
      setClassificationSuggestionLoading(true);
      void suggestWorkLogClassification({
        bodyMarkdown: analyzedBodyMarkdown,
      })
        .then((response) => {
          if (!cancelled) {
            setClassificationObservation(
              response.suggestion
                ? { bodyMarkdown: analyzedBodyMarkdown, suggestion: response.suggestion }
                : null,
            );
          }
        })
        .catch(() => {
          if (!cancelled) {
            setClassificationObservation(null);
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
    canManageWorkLogCategories,
    classificationSuggestionEnabled,
    editorDraft.bodyMarkdown,
  ]);

  const applyClassificationSuggestion = (
    suggestion: WorkLogClassificationSuggestion,
  ) => {
    updateEditorDraft(workLogDraftPatchFromSuggestion(suggestion, { objectives }));
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
  const refreshWorkLogResources = useCallback(() => {
    setWorkLogResourceRevision((value) => value + 1);
  }, []);
  const activityGroups = useMemo(
    () => groupActivityByDate(visibleActivityEntries),
    [visibleActivityEntries],
  );
  const reportRange = useMemo(() => monthRange(reportMonth), [reportMonth]);

  return (
    <PageScaffold title="工作日志" hideHeader>
      <div className="work-logs-toolbar">
        <WorkLogViewTabs onChange={changeView} value={viewMode} />
        <WorkLogDateControl date={viewDate} onChange={changeDate} />
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
                onClick={() => void loadActivity(activityExpanded, true)}
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
                  {canManageWorkLogCategories && classificationSuggestionEnabled && (
                    <WorkLogClassificationSuggestionSlot
                      categories={categories}
                      disabled={saving}
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
              ) : !editorSession ? (
                <div className="work-logs-loading">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  加载中
                </div>
              ) : (
                  <>
                    <div className="work-logs-draft-list">
                      <WorkLogEditorCard
                        canUseCategories={canSelectWorkLogCategories}
                        category={
                          editorDraft.categoryId
                            ? categoryOptionsById.get(editorDraft.categoryId)
                            : undefined
                        }
                        currentUserId={currentUser?.id ?? ""}
                        disabled={saving}
                        draft={editorDraft}
                        editingEntry={editingEntry}
                        key={editorSession.revision}
                        onWorkDateChange={changeEditorWorkDate}
                        objective={
                          editorDraft.objectiveId
                            ? objectiveOptionsById.get(editorDraft.objectiveId)
                            : undefined
                        }
                        classificationOptions={buildWorkLogClassificationChoices(
                          editorDraft,
                          objectiveSelectionOptions,
                          {
                            allowCategories: canSelectWorkLogCategories,
                            allowNewCategory: canManageWorkLogCategories,
                            allowUncategorized: canSaveWithoutObjective,
                          },
                          categories,
                        )}
                        objectives={objectiveSelectionOptions}
                        onChange={updateEditorDraft}
                        onObjectiveSearchQueryChange={setObjectiveSearchQuery}
                        onObjectiveSelect={rememberSelectedObjective}
                        requireProgressEstimate={objectiveProgressEstimateRequired}
                        workDate={editorWorkDate}
                      />
                    </div>

                  <div className="work-logs-editor-actions">
                    <Button
                      variant="ghost"
                      onClick={resetEditorDraft}
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
              {dayLoading ? (
                <div className="work-logs-loading">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  加载中
                </div>
              ) : (
                <>
                  <WorkLogDayResourcesSummary
                    entries={myEntries}
                    notify={notify}
                    revision={workLogResourceRevision}
                  />
                  <WorkLogHistoryList
                    canEditResources={Boolean(currentUser)}
                    currentEditingEntryId={editorDraft.editingEntryId}
                    deletingEntryId={deletingEntryId}
                    entries={myEntries}
                    notify={notify}
                    onDelete={deleteEntry}
                    onEdit={editExistingEntry}
                    onResourceChanged={refreshWorkLogResources}
                  />
                </>
              )}
            </Card>
          </div>
        </div>
      )}

      {viewMode === "report" && (
        <WorkLogReportPanel
          currentUserId={currentUser?.id ?? null}
          loading={reportLoading}
          onRefresh={() => void loadReport(reportMonth, reportScope, true)}
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
  disabled,
  draft,
  editingEntry,
  objective,
  objectives,
  onChange,
  onObjectiveSearchQueryChange,
  onObjectiveSelect,
  onWorkDateChange,
  requireProgressEstimate,
  workDate,
}: {
  canUseCategories: boolean;
  category?: WorkLogCategoryOption;
  classificationOptions: WorkLogClassificationChoice[];
  currentUserId: string;
  disabled: boolean;
  draft: WorkLogEditorDraft;
  editingEntry: WorkLogEntry | null;
  objective?: WorkLogObjectiveOption;
  objectives: WorkLogObjectiveOption[];
  onChange: (patch: WorkLogEditorDraftPatch) => void;
  onObjectiveSearchQueryChange: (query: string) => void;
  onObjectiveSelect: (objective: WorkLogObjectiveOption) => void;
  onWorkDateChange: (date: string) => void;
  requireProgressEstimate: boolean;
  workDate: string;
}) {
  const estimateEnabled = draft.classificationKind === "objective" && Boolean(draft.objectiveId);
  const estimateLabel =
    draft.progressEstimatePercent === null
      ? "未填写"
      : `${draft.progressEstimatePercent}%`;
  const inheritedProgressEstimate = workLogProgressEstimatePercentFromRemaining(objective?.latestRemainingEstimatePercent);
  const estimateHint = !estimateEnabled
    ? (requireProgressEstimate ? "选择目标后必须填写" : "选择目标后可填写")
    : requireProgressEstimate
      ? (inheritedProgressEstimate === null ? "本次日志必须填写" : "默认沿用上次估计，可调整")
      : "只作为这条日志的主观快照";
  const classificationValue = classificationSelectValueFromDraft(draft);
  const objectiveSelectionNotices = objective ? workLogObjectiveSelectionNotices(objective) : [];
  const changeClassification = (value: WorkLogClassificationChoice["value"]) => {
    if (value.startsWith("objective:")) {
      const objectiveId = value.slice("objective:".length);
      const selectedObjective = objectives.find((item) => item.id === objectiveId);
      if (selectedObjective) {
        onObjectiveSelect(selectedObjective);
      }
    }
    onChange(workLogDraftPatchFromClassificationSelect(value, { objectives }));
  };
  return (
    <section className="work-logs-draft-entry">
      <div className="work-logs-entry-date-control" data-readonly={Boolean(draft.editingEntryId)}>
        <div className="work-logs-entry-date-label">
          <CalendarDays className="h-4 w-4" />
          <div>
            <span>填写日期</span>
            <small>{draft.editingEntryId ? "历史日志日期不可修改" : "这条日志实际归属的日期"}</small>
          </div>
        </div>
        <FantasyDatePicker
          ariaLabel="选择填写日期"
          disabled={disabled || Boolean(draft.editingEntryId)}
          onChange={onWorkDateChange}
          value={workDate}
        >
          <CalendarDays className="h-4 w-4" />
          <span>{workDate}</span>
        </FantasyDatePicker>
      </div>
      <div className="work-logs-draft-entry-header">
        <FantasySelectMenu
          ariaLabel="日志归类"
          className="work-logs-objective-select"
          disabled={disabled}
          leadingIcon={
            draft.classificationKind === "category" ? (
              <Tags className="h-4 w-4" />
            ) : draft.classificationKind === "objective" ? (
              <Target className="h-4 w-4" />
            ) : (
              <NotebookPen className="h-4 w-4" />
            )
          }
          onChange={changeClassification}
          onSearchQueryChange={onObjectiveSearchQueryChange}
          options={classificationOptions}
          placeholder="选择目标"
          searchable
          searchPlaceholder={canUseCategories ? "搜索目标或分类" : "搜索目标，可搜已验收/已结算"}
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
            disabled={disabled}
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
      {objectiveSelectionNotices.length > 0 && (
        <div className="work-logs-completed-objective-note">
          <AlertTriangle className="h-4 w-4" />
          <span>{objectiveSelectionNotices.join(" ")}</span>
        </div>
      )}
      {draft.categoryNameSnapshot && !category && draft.classificationKind === "category" && (
        <div className="work-logs-snapshot-note">
          历史分类：{draft.categoryNameSnapshot}
        </div>
      )}
      <div
        className="work-logs-estimate-control"
        data-disabled={disabled || !estimateEnabled}
      >
        <div className="work-logs-estimate-heading">
          <div>
            <span>目标进度估计</span>
            <small>{estimateHint}</small>
          </div>
          <strong>{estimateLabel}</strong>
        </div>
        <div className="work-logs-estimate-inputs">
          <input
            aria-label="目标进度估计滑块"
            disabled={disabled || !estimateEnabled}
            max={100}
            min={0}
            onChange={(event) =>
              onChange({ progressEstimatePercent: Number(event.target.value) })
            }
            type="range"
            value={draft.progressEstimatePercent ?? 0}
          />
          <input
            aria-label="目标进度估计百分比"
            disabled={disabled || !estimateEnabled}
            inputMode="numeric"
            max={100}
            min={0}
            onChange={(event) =>
              onChange({
                progressEstimatePercent: parseWorkLogProgressEstimateInput(
                  event.target.value,
                ),
              })
            }
            placeholder="--"
            type="number"
            value={draft.progressEstimatePercent ?? ""}
          />
          <button
            type="button"
            disabled={
              disabled || !estimateEnabled || draft.progressEstimatePercent === null
            }
            onClick={() => onChange({ progressEstimatePercent: null })}
          >
            清除
          </button>
        </div>
      </div>
      <OrfRichTextEditor
        autoGrow
        className="work-logs-editor"
        currentUserId={currentUserId}
        disabled={disabled}
        idleHint="Markdown"
        mentionableUsers={[]}
        onChange={(bodyMarkdown) => onChange({ bodyMarkdown })}
        placeholder="写下这一天完成了什么"
        submitOnEnter={false}
        value={draft.bodyMarkdown}
      />
    </section>
  );
}

function WorkLogClassificationSuggestionSlot({
  categories,
  disabled,
  draft,
  loading,
  objectives,
  onApply,
  suggestion,
}: {
  categories: WorkLogCategoryOption[];
  disabled: boolean;
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
          <Sparkles className="h-4 w-4" />
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
        <Sparkles className="h-4 w-4" />
      </span>
      <div>
        <span>AI 建议</span>
        <strong>{label}</strong>
      </div>
      <button disabled={disabled} type="button" onClick={() => onApply(suggestion)}>
        采用
      </button>
    </div>
  );
}

type WorkLogDayResourceItem = {
  entry: WorkLogEntry;
  node: DriveNode;
};

function WorkLogDayResourcesSummary({
  entries,
  notify,
  revision,
}: {
  entries: WorkLogEntry[];
  notify: (message: string) => void;
  revision: number;
}) {
  const [items, setItems] = useState<WorkLogDayResourceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const entrySignature = useMemo(() => entries.map((entry) => entry.id).join("|"), [entries]);

  useEffect(() => {
    let disposed = false;
    if (entries.length === 0) {
      setItems([]);
      setErrorMessage("");
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    setErrorMessage("");
    Promise.allSettled(
      entries.map(async (entry) => {
        const response = await searchDriveRequest({
          contextId: entry.id,
          contextType: "workLog",
          limit: 8,
          status: "active",
          type: "all",
        });
        return response.nodes.map((node): WorkLogDayResourceItem => ({ entry, node }));
      }),
    )
      .then((results) => {
        if (disposed) return;
        const nextItems: WorkLogDayResourceItem[] = [];
        let failed = false;
        for (const result of results) {
          if (result.status === "fulfilled") nextItems.push(...result.value);
          else failed = true;
        }
        setItems(dedupeWorkLogDayResources(nextItems));
        if (failed) {
          const message = "部分日志资源加载失败";
          setErrorMessage(message);
          notify(message);
        }
      })
      .catch((error) => {
        if (disposed) return;
        const message = error instanceof Error ? error.message : "当天资源加载失败";
        setErrorMessage(message);
        notify(message);
        setItems([]);
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [entrySignature, entries, notify, revision]);

  return (
    <section className="work-logs-day-resources" aria-label="当天相关资源">
      <div className="work-logs-day-resources-heading">
        <span>
          <strong>当天资源</strong>
          <small>{loading ? "同步中" : `${items.length} 项`}</small>
        </span>
      </div>
      {errorMessage ? (
        <div className="work-logs-day-resources-empty is-error">{errorMessage}</div>
      ) : loading && items.length === 0 ? (
        <div className="work-logs-day-resources-empty">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>正在同步资源</span>
        </div>
      ) : items.length > 0 ? (
        <div className="work-logs-day-resources-list">
          {items.map((item) => (
            <WorkLogDayResourceRow item={item} key={`${item.entry.id}:${item.node.id}`} />
          ))}
        </div>
      ) : (
        <div className="work-logs-day-resources-empty">当天日志还没有关联资源</div>
      )}
    </section>
  );
}

function WorkLogDayResourceRow({ item }: { item: WorkLogDayResourceItem }) {
  const Icon = iconForDriveNode(item.node);
  const meta = [workLogEntryTargetLabel(item.entry), driveNodeMetaLabel(item.node), formatDriveDateTime(item.node.updatedAt)]
    .filter(Boolean)
    .join(" · ");
  return (
    <Link className="work-logs-day-resource-row" to={`/resources/${encodeURIComponent(item.node.id)}/preview`} title={item.node.name}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span>
        <strong>{item.node.name}</strong>
        <small>{meta}</small>
      </span>
    </Link>
  );
}

function dedupeWorkLogDayResources(items: WorkLogDayResourceItem[]) {
  const byNodeId = new Map<string, WorkLogDayResourceItem>();
  for (const item of items) {
    if (!byNodeId.has(item.node.id)) byNodeId.set(item.node.id, item);
  }
  return [...byNodeId.values()].sort((left, right) => {
    const leftTime = new Date(left.node.updatedAt).getTime();
    const rightTime = new Date(right.node.updatedAt).getTime();
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) return rightTime - leftTime;
    return left.node.name.localeCompare(right.node.name, "zh-CN");
  });
}

function iconForDriveNode(node: DriveNode) {
  if (node.type === "folder") return Folder;
  if (node.file?.previewKind === "image") return Image;
  if (node.file?.previewKind === "docx" || node.file?.previewKind === "pdf" || node.file?.previewKind === "markdown" || node.file?.previewKind === "text") return FileText;
  return File;
}

function WorkLogHistoryList({
  canEditResources,
  currentEditingEntryId,
  deletingEntryId,
  entries,
  notify,
  onDelete,
  onEdit,
  onResourceChanged,
}: {
  canEditResources: boolean;
  currentEditingEntryId: string | null;
  deletingEntryId: string | null;
  entries: WorkLogEntry[];
  notify: (message: string) => void;
  onDelete: (entry: WorkLogEntry) => void;
  onEdit: (entry: WorkLogEntry) => void;
  onResourceChanged: () => void;
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
                  {formatWorkLogProgressEstimate(entry.remainingEstimatePercent) && (
                    <span className="work-logs-progress-pill">
                      {formatWorkLogProgressEstimate(entry.remainingEstimatePercent)}
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
              {entry.id === currentEditingEntryId && (
                <RelatedResourcesPanel
                  canEdit={canEditResources}
                  className="work-logs-entry-related-resources"
                  compact
                  contextId={entry.id}
                  contextType="workLog"
                  emptyLabel="这条日志还没有资源"
                  limit={4}
                  notify={notify}
                  onChanged={onResourceChanged}
                  title="日志资源"
                />
              )}
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
          {formatWorkLogProgressEstimate(entry.remainingEstimatePercent) && (
            <em>{formatWorkLogProgressEstimate(entry.remainingEstimatePercent)}</em>
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
      label: "平均进度估计",
      value: formatOptionalPercent(
        workLogProgressEstimatePercentFromRemaining(report.totals.averageRemainingEstimatePercent),
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
          <p>按日期查看记录、归类、可选时间和目标进度估计</p>
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
                        {formatWorkLogProgressEstimate(cell.latestRemainingEstimatePercent) && (
                          <span>
                            {formatWorkLogProgressEstimate(cell.latestRemainingEstimatePercent)}
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
        formatWorkLogProgressEstimate(cell.latestRemainingEstimatePercent) && (
          <small>{formatWorkLogProgressEstimate(cell.latestRemainingEstimatePercent, { compact: true })}</small>
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
              {formatWorkLogProgressEstimate(entry.remainingEstimatePercent) && (
                <em>{formatWorkLogProgressEstimate(entry.remainingEstimatePercent)}</em>
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

function formatWorkLogProgressEstimate(value: number | null | undefined, options?: { compact?: boolean }) {
  const progressEstimate = workLogProgressEstimatePercentFromRemaining(value);
  if (progressEstimate === null) return "";
  return `${options?.compact ? "进" : "进 "}${progressEstimate}%`;
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
      : `，最新进度估计 ${workLogProgressEstimatePercentFromRemaining(cell.latestRemainingEstimatePercent)}%`;
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
