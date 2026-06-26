import { CheckCircle2, CircleDot, Clock3, Flag, MessageSquare, Plus, RotateCcw, Tag } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { UserAvatar } from "../components/UserAvatar";
import { BountyBadge, BountyButton, BountyEmptyState, BountySelect, BountyTextInput } from "../features/bounty-hall/BountyHallSkin";
import { canCreateFeedbackFromVisibleState } from "../features/feedback/model/feedbackCapabilities";
import { feedbackIssueHref, feedbackIssueStateLabel, isFeedbackIssueOpen } from "../features/feedback/model/feedbackIssue";
import {
  buildFeedbackIssueListItems,
  feedbackIssueAssigneeOptions,
  feedbackIssueAuthorOptions,
  feedbackIssueLabelOptions,
  feedbackIssueListCounts,
  filterFeedbackIssueListItems,
  type FeedbackIssueListItem,
  type FeedbackIssueListState,
  type FeedbackIssueSortKey,
} from "../features/feedback/model/feedbackIssueList";
import { useOrf } from "../state/OrfProvider";
import type { Impact } from "../types/orf";
import { impactLabel } from "../utils/labels";

export function FeedbackInboxPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const labelFilterParam = searchParams.get("label");
  const { currentUser, state } = useOrf();
  const [query, setQuery] = useState("");
  const [listState, setListState] = useState<FeedbackIssueListState>("open");
  const [cause, setCause] = useState(labelFilterParam ?? "All");
  const [impact, setImpact] = useState<"All" | Impact>("All");
  const [assigneeUserId, setAssigneeUserId] = useState("All");
  const [authorUserId, setAuthorUserId] = useState("All");
  const [sort, setSort] = useState<FeedbackIssueSortKey>("updated-desc");
  const visibleFeedback = useMemo(() => currentUser?.status === "active" || currentUser?.role === "admin" ? state.feedback : [], [currentUser, state.feedback]);
  const canCreateFeedback = canCreateFeedbackFromVisibleState(state, currentUser);
  const issueItems = useMemo(
    () => buildFeedbackIssueListItems({ comments: state.comments, feedback: visibleFeedback, users: state.users }),
    [state.comments, state.users, visibleFeedback],
  );
  const issueCounts = useMemo(() => feedbackIssueListCounts(issueItems), [issueItems]);
  const labelOptions = useMemo(() => feedbackIssueLabelOptions(issueItems), [issueItems]);
  const assigneeOptions = useMemo(() => feedbackIssueAssigneeOptions(issueItems), [issueItems]);
  const authorOptions = useMemo(() => feedbackIssueAuthorOptions(issueItems), [issueItems]);

  useEffect(() => {
    if (labelFilterParam) setCause(labelFilterParam);
  }, [labelFilterParam]);

  const filteredFeedback = useMemo(
    () => filterFeedbackIssueListItems(issueItems, { assigneeUserId, authorUserId, cause, impact, listState, query, sort }),
    [assigneeUserId, authorUserId, cause, impact, issueItems, listState, query, sort],
  );

  const hasActiveFilters =
    query.trim().length > 0 ||
    listState !== "open" ||
    cause !== "All" ||
    impact !== "All" ||
    assigneeUserId !== "All" ||
    authorUserId !== "All" ||
    sort !== "updated-desc";

  const resetFilters = () => {
    setQuery("");
    setListState("open");
    setCause("All");
    setImpact("All");
    setAssigneeUserId("All");
    setAuthorUserId("All");
    setSort("updated-desc");
  };

  return (
    <div className="bounty-hall-page orf-workbench-surface feedback-issue-page">
      <header className="feedback-issue-header">
        <div className="feedback-issue-title-block">
          <h1>反馈</h1>
          <div className="feedback-issue-header-counts">
            <span><CircleDot aria-hidden="true" /> {issueCounts.open} Open</span>
            <span><CheckCircle2 aria-hidden="true" /> {issueCounts.closed} Closed</span>
          </div>
        </div>
        <div className="feedback-issue-header-actions">
          <div className="feedback-issue-index-links" aria-label="反馈索引">
            <Link className="feedback-issue-index-link" to="/feedback/labels"><Tag aria-hidden="true" /> 标签 <strong>{labelOptions.length}</strong></Link>
            <Link className="feedback-issue-index-link" to="/feedback/milestones"><Flag aria-hidden="true" /> 里程碑 <strong>0</strong></Link>
          </div>
          {canCreateFeedback && (
            <BountyButton onClick={() => navigate("/feedback/new")}>
              <Plus aria-hidden="true" />
              新建反馈
            </BountyButton>
          )}
        </div>
      </header>

      <div className="feedback-issue-query-panel">
        <div className="feedback-issue-query-row">
          <BountyTextInput ariaLabel="搜索反馈" value={query} onValueChange={setQuery} placeholder="is:open label:技术问题 assignee:薛雨" />
          <BountyButton className="feedback-reset-button" disabled={!hasActiveFilters} onClick={resetFilters} variant="secondary">
            <RotateCcw aria-hidden="true" />
            重置
          </BountyButton>
        </div>
        <div className="feedback-issue-filter-row">
          <BountySelect label="处理人" value={assigneeUserId} onChange={setAssigneeUserId}>
            <option value="All">全部处理人</option>
            {assigneeOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </BountySelect>
          <BountySelect label="作者" value={authorUserId} onChange={setAuthorUserId}>
            <option value="All">全部作者</option>
            {authorOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </BountySelect>
          <BountySelect label="标签" value={cause} onChange={setCause}>
            <option value="All">全部标签</option>
            {labelOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </BountySelect>
          <BountySelect label="影响" value={impact} onChange={(value) => setImpact(value as "All" | Impact)}>
            <option value="All">全部影响</option>
            <option value="Critical">{impactLabel.Critical}</option>
            <option value="High">{impactLabel.High}</option>
            <option value="Medium">{impactLabel.Medium}</option>
            <option value="Low">{impactLabel.Low}</option>
          </BountySelect>
          <BountySelect label="排序" value={sort} onChange={(value) => setSort(value as FeedbackIssueSortKey)}>
            <option value="updated-desc">最近更新</option>
            <option value="created-desc">最近创建</option>
            <option value="comments-desc">评论最多</option>
            <option value="updated-asc">最早更新</option>
          </BountySelect>
        </div>
      </div>

      <section className="feedback-issue-list bounty-list-table">
        <div className="feedback-issue-list-head">
          <div className="feedback-issue-state-tabs">
            <IssueStateButton active={listState === "open"} onClick={() => setListState("open")}>
              <CircleDot aria-hidden="true" className="feedback-state-icon-open" />
              Open <strong>{issueCounts.open}</strong>
            </IssueStateButton>
            <IssueStateButton active={listState === "closed"} onClick={() => setListState("closed")}>
              <CheckCircle2 aria-hidden="true" className="feedback-state-icon-closed" />
              Closed <strong>{issueCounts.closed}</strong>
            </IssueStateButton>
            <IssueStateButton active={listState === "all"} onClick={() => setListState("all")}>
              All <strong>{issueCounts.all}</strong>
            </IssueStateButton>
          </div>
          <span className="feedback-issue-match-count">{filteredFeedback.length} 条匹配</span>
        </div>

        {filteredFeedback.length > 0 ? (
          <div className="feedback-issue-rows">
            {filteredFeedback.map((item) => (
              <FeedbackIssueRow key={item.feedback.id} item={item} />
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

function FeedbackIssueRow({ item }: { item: FeedbackIssueListItem }) {
  const feedback = item.feedback;
  const open = isFeedbackIssueOpen(feedback);

  return (
    <Link className="feedback-issue-row" to={feedbackIssueHref(feedback.id)}>
      <div className="feedback-issue-row-icon" data-open={open ? "true" : "false"}>
        {open ? <CircleDot aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
      </div>
      <div className="feedback-issue-row-main">
        <div className="feedback-issue-row-title-line">
          <h2>{feedback.phenomenon}</h2>
          <div className="feedback-issue-labels">
            {item.labels.map((label) => (
              <BountyBadge key={label.key} tone={label.tone}>{label.name}</BountyBadge>
            ))}
          </div>
        </div>
        {item.preview && (
          <p className="feedback-issue-preview">
            {item.preview}
          </p>
        )}
        <div className="feedback-issue-meta">
          <span title={feedback.id}>#{item.issueNumber}</span>
          <span>{item.authorName} 创建于 {formatFeedbackDate(feedback.createdAt)}</span>
          <span>更新于 {formatFeedbackDate(item.lastActivityAt)}</span>
          <span>{feedbackIssueStateLabel(feedback)}</span>
        </div>
      </div>
      <div className="feedback-issue-row-side" aria-label="反馈元数据">
        <div className="feedback-issue-assignee" title={`处理人：${item.assigneeName}`}>
          <UserAvatar avatarUrl={item.assigneeAvatarUrl} className="h-6 w-6 text-[10px]" frame={false} name={item.assigneeName} />
          <span>{item.assigneeName}</span>
        </div>
        <div className="feedback-issue-side-stat" title="评论">
          <MessageSquare aria-hidden="true" />
          <span>{item.commentCount}</span>
        </div>
        <div className="feedback-issue-side-stat" title="最近更新">
          <Clock3 aria-hidden="true" />
          <span>{formatFeedbackDate(item.lastActivityAt)}</span>
        </div>
      </div>
    </Link>
  );
}

function formatFeedbackDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(date);
}
