import { CheckCircle2, CircleDot, Plus, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { filterFeedbackForVisibleObjectives, visibleObjectiveIdsForUser } from "../features/challenge/model/objectiveVisibility";
import { BountyBadge, BountyButton, BountyEmptyState, BountySelect, BountyTextInput } from "../features/bounty-hall/BountyHallSkin";
import { FeedbackLinkedText } from "../features/feedback/components/FeedbackLinkedText";
import { canCreateFeedbackFromVisibleState } from "../features/feedback/model/feedbackCapabilities";
import { summarizeFeedbackInsights } from "../features/feedback/model/feedbackInsights";
import { useOrf } from "../state/OrfProvider";
import type { Feedback, FeedbackStatus, Impact } from "../types/orf";
import { feedbackStatusLabel, impactLabel } from "../utils/labels";

type FeedbackListState = "open" | "closed" | "all";

const feedbackStatusOptions: FeedbackStatus[] = ["New", "Reviewing", "Action Created", "Result Updated", "Closed"];

export function FeedbackInboxPage() {
  const { currentUser, state, openModal } = useOrf();
  const [query, setQuery] = useState("");
  const [listState, setListState] = useState<FeedbackListState>("open");
  const [cause, setCause] = useState("All");
  const [status, setStatus] = useState<"All" | FeedbackStatus>("All");
  const visibleObjectiveIds = useMemo(() => visibleObjectiveIdsForUser(state.objectives, currentUser), [currentUser, state.objectives]);
  const visibleFeedback = useMemo(() => filterFeedbackForVisibleObjectives(state.feedback, visibleObjectiveIds, currentUser), [currentUser, state.feedback, visibleObjectiveIds]);
  const canCreateFeedback = canCreateFeedbackFromVisibleState(state, currentUser);
  const insights = useMemo(() => summarizeFeedbackInsights(visibleFeedback), [visibleFeedback]);
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
        const searchableText = [
          item.id,
          item.phenomenon,
          item.suggestedAdjustment,
          item.owner,
          item.source,
          feedbackStatusLabel[item.status],
          impactLabel[item.impact],
          ...item.causeCategories,
        ].join(" ").toLowerCase();
        const queryMatch = normalizedQuery.length === 0 || searchableText.includes(normalizedQuery);
        return stateMatch && causeMatch && statusMatch && queryMatch;
      }),
    [cause, listState, normalizedQuery, status, visibleFeedback],
  );

  const hasActiveFilters = normalizedQuery.length > 0 || listState !== "open" || cause !== "All" || status !== "All";

  const resetFilters = () => {
    setQuery("");
    setListState("open");
    setCause("All");
    setStatus("All");
  };

  return (
    <div className="bounty-hall-page feedback-issue-page">
      <header className="feedback-issue-header">
        <div className="feedback-issue-title-block">
          <span className="bounty-page-eyebrow">REPORT / TEAM ISSUE BOARD</span>
          <h1 className="bounty-page-title">反馈</h1>
          <p>团队内部的技术、管理和系统问题都会进入同一个 issue 池。</p>
        </div>
        {canCreateFeedback && (
          <BountyButton onClick={() => openModal({ type: "newFeedback" })}>
            <Plus aria-hidden="true" />
            新建反馈
          </BountyButton>
        )}
      </header>

      <div className="bounty-toolbar feedback-issue-toolbar">
        <BountyTextInput ariaLabel="搜索反馈" value={query} onValueChange={setQuery} placeholder="搜索反馈" />
        <div className="bounty-toolbar-controls">
          <BountySelect label="分类" value={cause} onChange={setCause}>
            <option value="All">全部分类</option>
            {insights.causeChart.map((item) => <option key={item.cause} value={item.cause}>{item.cause}</option>)}
          </BountySelect>
          <BountySelect label="状态" value={status} onChange={(value) => setStatus(value as "All" | FeedbackStatus)}>
            <option value="All">全部状态</option>
            {feedbackStatusOptions.map((item) => <option key={item} value={item}>{feedbackStatusLabel[item]}</option>)}
          </BountySelect>
          <BountyButton className="feedback-reset-button" disabled={!hasActiveFilters} onClick={resetFilters} variant="secondary">
            <RotateCcw aria-hidden="true" />
            重置
          </BountyButton>
        </div>
      </div>

      <section className="feedback-issue-list bounty-list-table">
        <div className="feedback-issue-list-head">
          <div className="feedback-issue-state-tabs">
            <IssueStateButton active={listState === "open"} onClick={() => setListState("open")}>
              <CircleDot aria-hidden="true" className="feedback-state-icon-open" />
              Open <strong>{openCount}</strong>
            </IssueStateButton>
            <IssueStateButton active={listState === "closed"} onClick={() => setListState("closed")}>
              <CheckCircle2 aria-hidden="true" className="feedback-state-icon-closed" />
              Closed <strong>{closedCount}</strong>
            </IssueStateButton>
            <IssueStateButton active={listState === "all"} onClick={() => setListState("all")}>
              All <strong>{visibleFeedback.length}</strong>
            </IssueStateButton>
          </div>
          <span className="feedback-issue-match-count">{filteredFeedback.length} 条匹配</span>
        </div>

        {filteredFeedback.length > 0 ? (
          <div className="feedback-issue-rows">
            {filteredFeedback.map((item) => (
              <FeedbackIssueRow key={item.id} feedback={item} />
            ))}
          </div>
        ) : (
          <BountyEmptyState title="没有匹配的反馈" description="调整搜索或筛选条件后再看。" />
        )}
      </section>
    </div>
  );
}

function IssueStateButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button className="feedback-issue-state-button" data-active={active ? "true" : "false"} type="button" onClick={onClick}>
      {children}
    </button>
  );
}

function FeedbackIssueRow({ feedback }: { feedback: Feedback }) {
  const open = feedback.status !== "Closed";
  const causes = feedback.causeCategories.map((item) => item.trim()).filter(Boolean);
  const preview = feedback.suggestedAdjustment.trim();

  return (
    <article className="feedback-issue-row">
      <div className="feedback-issue-row-icon" data-open={open ? "true" : "false"}>
        {open ? <CircleDot aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
      </div>
      <div className="feedback-issue-row-main">
        <div className="feedback-issue-row-title-line">
          <h2>{feedback.phenomenon}</h2>
          <div className="feedback-issue-labels">
            {causes.map((item) => (
              <BountyBadge key={item} tone={causeTone(item)}>{item}</BountyBadge>
            ))}
            <BountyBadge tone={impactTone(feedback.impact)}>{impactLabel[feedback.impact]}</BountyBadge>
          </div>
        </div>
        {preview && (
          <p className="feedback-issue-preview">
            <FeedbackLinkedText text={preview} />
          </p>
        )}
        <div className="feedback-issue-meta">
          <span title={feedback.id}>#{displayFeedbackId(feedback.id)}</span>
          <span>{feedback.owner} 更新于 {formatFeedbackDate(feedback.updatedAt)}</span>
          <span>{feedbackStatusLabel[feedback.status]}</span>
        </div>
      </div>
    </article>
  );
}

function displayFeedbackId(value: string) {
  const normalized = value.replace(/^fb-/, "");
  return normalized.length > 8 ? normalized.slice(0, 8) : normalized;
}

function causeTone(value: string) {
  if (/管理|流程|协作/.test(value)) return "gold" as const;
  if (/技术|系统|质量|缺陷|bug/i.test(value)) return "accent" as const;
  if (/风险|事故|阻塞/.test(value)) return "warning" as const;
  return "neutral" as const;
}

function impactTone(value: Impact) {
  if (value === "Critical") return "danger" as const;
  if (value === "High") return "warning" as const;
  if (value === "Medium") return "accent" as const;
  return "neutral" as const;
}

function formatFeedbackDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(date);
}
