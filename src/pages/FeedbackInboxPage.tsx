import { CheckCircle2, CircleDot, Plus, RotateCcw, Search } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { PageScaffold } from "../components/PageScaffold";
import { Button, Card, StatusBadge } from "../components/ui";
import { filterFeedbackForVisibleObjectives, filterResultsForVisibleObjectives, visibleObjectiveIdsForUser, visibleObjectivesForUser } from "../features/challenge/model/objectiveVisibility";
import { canCreateFeedbackFromVisibleState } from "../features/feedback/model/feedbackCapabilities";
import { summarizeFeedbackInsights } from "../features/feedback/model/feedbackInsights";
import { useOrf } from "../state/OrfProvider";
import type { Feedback, FeedbackStatus } from "../types/orf";
import { feedbackStatusLabel } from "../utils/labels";

type FeedbackListState = "open" | "closed" | "all";

const feedbackStatusOptions: FeedbackStatus[] = ["New", "Reviewing", "Action Created", "Result Updated", "Closed"];

export function FeedbackInboxPage() {
  const { currentUser, state, openModal } = useOrf();
  const [query, setQuery] = useState("");
  const [listState, setListState] = useState<FeedbackListState>("open");
  const [cause, setCause] = useState("All");
  const [status, setStatus] = useState<"All" | FeedbackStatus>("All");
  const visibleObjectiveIds = useMemo(() => visibleObjectiveIdsForUser(state.objectives, currentUser), [currentUser, state.objectives]);
  const visibleObjectives = useMemo(() => visibleObjectivesForUser(state.objectives, currentUser), [currentUser, state.objectives]);
  const visibleResults = useMemo(() => filterResultsForVisibleObjectives(state.results, visibleObjectiveIds, currentUser), [currentUser, state.results, visibleObjectiveIds]);
  const visibleFeedback = useMemo(() => filterFeedbackForVisibleObjectives(state.feedback, visibleObjectiveIds, currentUser), [currentUser, state.feedback, visibleObjectiveIds]);
  const canCreateFeedback = canCreateFeedbackFromVisibleState({ objectives: visibleObjectives, results: visibleResults }, currentUser);
  const insights = useMemo(() => summarizeFeedbackInsights(visibleFeedback), [visibleFeedback]);
  const resultTitleById = useMemo(() => new Map(visibleResults.map((result) => [result.id, result.title])), [visibleResults]);

  const openCount = visibleFeedback.filter((item) => item.status !== "Closed").length;
  const closedCount = visibleFeedback.length - openCount;
  const normalizedQuery = query.trim().toLowerCase();

  const filteredFeedback = useMemo(
    () =>
      visibleFeedback.filter((item) => {
        const itemIsOpen = item.status !== "Closed";
        const stateMatch = listState === "all" || (listState === "open" ? itemIsOpen : !itemIsOpen);
        const causeMatch = cause === "All" || item.causeCategories.includes(cause);
        const statusMatch = status === "All" || item.status === status;
        const resultTitle = resultTitleById.get(item.linkedResultId) ?? "";
        const searchableText = [
          item.id,
          item.phenomenon,
          item.suggestedAdjustment,
          item.owner,
          resultTitle,
          ...item.causeCategories,
        ].join(" ").toLowerCase();
        const queryMatch = normalizedQuery.length === 0 || searchableText.includes(normalizedQuery);
        return stateMatch && causeMatch && statusMatch && queryMatch;
      }),
    [cause, listState, normalizedQuery, resultTitleById, status, visibleFeedback],
  );

  const hasActiveFilters = normalizedQuery.length > 0 || listState !== "open" || cause !== "All" || status !== "All";

  const resetFilters = () => {
    setQuery("");
    setListState("open");
    setCause("All");
    setStatus("All");
  };

  return (
    <PageScaffold
      title="反馈"
      subtitle="像 issue 一样收集、筛选和处理内部反馈。"
      action={canCreateFeedback ? <Button onClick={() => openModal({ type: "newFeedback" })}><Plus className="h-4 w-4" />新建反馈</Button> : null}
    >
      <div className="flex flex-col gap-3 lg:flex-row">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 orf-text-muted" />
          <input
            className="orf-input h-10 px-9 text-sm"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索全部反馈"
            aria-label="搜索反馈"
          />
        </label>
        <FilterSelect ariaLabel="按原因筛选" value={cause} onChange={setCause}>
          <option value="All">全部原因</option>
          {insights.causeChart.map((item) => <option key={item.cause} value={item.cause}>{item.cause}</option>)}
        </FilterSelect>
        <FilterSelect ariaLabel="按状态筛选" value={status} onChange={(value) => setStatus(value as "All" | FeedbackStatus)}>
          <option value="All">全部状态</option>
          {feedbackStatusOptions.map((item) => <option key={item} value={item}>{feedbackStatusLabel[item]}</option>)}
        </FilterSelect>
        <Button className="h-10 px-3" variant="secondary" type="button" disabled={!hasActiveFilters} onClick={resetFilters}>
          <RotateCcw className="h-4 w-4" />
          重置
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b orf-border bg-[var(--orf-bg-muted)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <IssueStateButton active={listState === "open"} onClick={() => setListState("open")}>
              <CircleDot className="h-4 w-4 text-[var(--orf-success-text)]" />
              Open <span className="orf-text-muted">{openCount}</span>
            </IssueStateButton>
            <IssueStateButton active={listState === "closed"} onClick={() => setListState("closed")}>
              <CheckCircle2 className="h-4 w-4 text-[var(--orf-neutral-text)]" />
              Closed <span className="orf-text-muted">{closedCount}</span>
            </IssueStateButton>
            <IssueStateButton active={listState === "all"} onClick={() => setListState("all")}>
              All <span className="orf-text-muted">{visibleFeedback.length}</span>
            </IssueStateButton>
          </div>
          <div className="text-xs orf-text-muted">{filteredFeedback.length} 条匹配</div>
        </div>

        {filteredFeedback.length > 0 ? (
          <div className="divide-y divide-[var(--orf-border)]">
            {filteredFeedback.map((item) => (
              <FeedbackIssueRow key={item.id} feedback={item} resultTitle={resultTitleById.get(item.linkedResultId)} />
            ))}
          </div>
        ) : (
          <div className="px-4 py-12 text-center">
            <div className="text-sm font-semibold orf-text-primary">没有匹配的反馈</div>
            <div className="mt-1 text-sm orf-text-secondary">调整搜索或筛选条件后再看。</div>
          </div>
        )}
      </Card>
    </PageScaffold>
  );
}

function FilterSelect({ ariaLabel, value, onChange, children }: { ariaLabel: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <div className="w-full lg:w-40">
      <select className="orf-input h-10 px-3 text-sm" aria-label={ariaLabel} value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </div>
  );
}

function IssueStateButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      className={active ? "inline-flex items-center gap-1.5 font-semibold orf-text-primary" : "inline-flex items-center gap-1.5 orf-text-secondary hover:text-[var(--orf-text-primary)]"}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function FeedbackIssueRow({ feedback, resultTitle }: { feedback: Feedback; resultTitle?: string }) {
  const open = feedback.status !== "Closed";
  const causes = feedback.causeCategories.map((item) => item.trim()).filter(Boolean);

  return (
    <article className="flex gap-3 px-4 py-4 transition hover:bg-[var(--orf-bg-row-hover)]">
      <div className="pt-0.5">
        {open ? <CircleDot className="h-4 w-4 text-[var(--orf-success-text)]" /> : <CheckCircle2 className="h-4 w-4 text-[var(--orf-neutral-text)]" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="min-w-0 text-sm font-semibold leading-5 orf-text-primary">{feedback.phenomenon}</h2>
          {causes.map((item) => (
            <span key={item} className="rounded-full border orf-border bg-[var(--orf-bg-muted)] px-2 py-0.5 text-xs font-medium orf-text-secondary">{item}</span>
          ))}
          <StatusBadge status={feedback.impact} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs orf-text-muted">
          <span>#{feedback.id}</span>
          <span>·</span>
          <span>{feedback.owner} 更新于 {formatFeedbackDate(feedback.updatedAt)}</span>
          <span>·</span>
          <span>{feedbackStatusLabel[feedback.status]}</span>
          {resultTitle && (
            <>
              <span>·</span>
              <span className="truncate">关联指标：{resultTitle}</span>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

function formatFeedbackDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(date);
}
