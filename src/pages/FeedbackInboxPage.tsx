import { CheckCircle2, CircleDot, Clock3, Flag, Inbox, MessageSquare, Plus, RotateCcw, Tag, UserCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { UserAvatar } from "../components/UserAvatar";
import { BountyBadge, BountyButton, BountyEmptyState, BountySelect, BountyTextInput } from "../features/bounty-hall/BountyHallSkin";
import { canCreateTeamFeedback } from "../features/feedback/model/feedbackCapabilities";
import { feedbackIssueHref, feedbackIssueStateLabel, isFeedbackIssueOpen } from "../features/feedback/model/feedbackIssue";
import {
  buildFeedbackIssueListItems,
  feedbackIssueAssigneeOptions,
  feedbackIssueAuthorOptions,
  feedbackIssueLabelOptions,
  feedbackIssueListCountsForFilters,
  filterFeedbackIssueListItems,
  type FeedbackIssueListFilters,
  type FeedbackIssueListItem,
} from "../features/feedback/model/feedbackIssueList";
import {
  clearStoredFeedbackIssueListFilterParams,
  feedbackIssueListFilterParamsFromPreferenceRecord,
  feedbackIssueListFilterPreferenceKey,
  feedbackIssueListFilterPreferenceRecordFromSearchParams,
  feedbackIssueListUrlStateFromSearchParams,
  readStoredFeedbackIssueListFilterParams,
} from "../features/feedback/model/feedbackIssueListViewState";
import { useFeedbackIssueReadModel } from "../features/feedback/useFeedbackIssueReadModel";
import { getProjectChatChannels, getUserPreferences, saveUserPreferences } from "../state/apiClient";
import { useOrf } from "../state/OrfProvider";
import type { ProjectChatChannel } from "../types/orf";
import { feedbackImpactLabel } from "../utils/labels";

export function FeedbackInboxPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentUser } = useOrf();
  const feedbackReadModel = useFeedbackIssueReadModel(Boolean(currentUser));
  const feedbackData = feedbackReadModel.data;
  const currentUserId = currentUser?.id ?? null;
  const suppressNextPreferenceRestoreRef = useRef(false);
  const searchParamSignature = searchParams.toString();
  const {
    assigneeUserId,
    authorUserId,
    cause,
    impact,
    listState,
    projectId,
    query,
    sort,
  } = useMemo(() => feedbackIssueListUrlStateFromSearchParams(searchParams), [searchParamSignature, searchParams]);
  const [projectChannels, setProjectChannels] = useState<ProjectChatChannel[]>([]);
  const [projectChannelsLoading, setProjectChannelsLoading] = useState(false);
  const selectedProject = useMemo(
    () => feedbackData.projects.find((project) => project.id === projectId) ?? null,
    [feedbackData.projects, projectId],
  );
  const visibleFeedback = useMemo(() => currentUser?.status === "active" || currentUser?.role === "admin" ? feedbackData.feedback : [], [currentUser, feedbackData.feedback]);
  const canCreateFeedback = canCreateTeamFeedback(currentUser);
  const issueItems = useMemo(
    () => buildFeedbackIssueListItems({ comments: feedbackData.comments, feedback: visibleFeedback, projects: feedbackData.projects, users: feedbackData.users }),
    [feedbackData.comments, feedbackData.projects, feedbackData.users, visibleFeedback],
  );
  const issueFilters = useMemo<FeedbackIssueListFilters>(
    () => ({ assigneeUserId, authorUserId, cause, impact, listState, projectId, query, sort }),
    [assigneeUserId, authorUserId, cause, impact, listState, projectId, query, sort],
  );
  const issueCounts = useMemo(
    () => feedbackIssueListCountsForFilters(issueItems, issueFilters),
    [issueFilters, issueItems],
  );
  const labelOptions = useMemo(() => feedbackIssueLabelOptions(issueItems), [issueItems]);
  const assigneeOptions = useMemo(() => feedbackIssueAssigneeOptions(issueItems), [issueItems]);
  const authorOptions = useMemo(() => feedbackIssueAuthorOptions(issueItems), [issueItems]);
  const projectOptions = useMemo(
    () => [...feedbackData.projects].sort((left, right) => left.name.localeCompare(right.name, "zh-Hans-CN")),
    [feedbackData.projects],
  );

  const persistFilterPreference = useCallback((nextSearchParams: URLSearchParams) => {
    const record = feedbackIssueListFilterPreferenceRecordFromSearchParams(nextSearchParams);
    clearStoredFeedbackIssueListFilterParams();
    if (!record) suppressNextPreferenceRestoreRef.current = true;
    if (!currentUserId) return;
    void saveUserPreferences({
      filterPreferences: {
        [feedbackIssueListFilterPreferenceKey]: record,
      },
    }).catch(() => {
      // Filter persistence is an optional personal preference; the URL remains the current view state.
    });
  }, [currentUserId]);

  useEffect(() => {
    let cancelled = false;
    if (searchParamSignature) return () => {
      cancelled = true;
    };
    if (suppressNextPreferenceRestoreRef.current) {
      suppressNextPreferenceRestoreRef.current = false;
      return () => {
        cancelled = true;
      };
    }

    async function restoreFilterPreference() {
      if (currentUserId) {
        try {
          const preferences = await getUserPreferences({ userId: currentUserId });
          if (cancelled) return;
          const preferenceParams = feedbackIssueListFilterParamsFromPreferenceRecord(
            preferences.filterPreferences[feedbackIssueListFilterPreferenceKey],
          );
          if (preferenceParams) {
            setSearchParams(preferenceParams, { replace: true });
            return;
          }
        } catch {
          // Fall through to the legacy local preference migration path.
        }
      }

      const storedParams = readStoredFeedbackIssueListFilterParams();
      if (storedParams) {
        setSearchParams(storedParams, { replace: true });
        const record = feedbackIssueListFilterPreferenceRecordFromSearchParams(storedParams);
        if (currentUserId && record) {
          void saveUserPreferences({
            filterPreferences: {
              [feedbackIssueListFilterPreferenceKey]: record,
            },
          }).catch(() => {
            // Legacy migration failure does not affect the current URL-restored view.
          });
        }
        clearStoredFeedbackIssueListFilterParams();
        return;
      }
      clearStoredFeedbackIssueListFilterParams();
    }

    void restoreFilterPreference();
    return () => {
      cancelled = true;
    };
  }, [currentUserId, searchParamSignature, setSearchParams]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedProject) {
      setProjectChannels([]);
      setProjectChannelsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setProjectChannelsLoading(true);
    getProjectChatChannels(selectedProject.id)
      .then((response) => {
        if (cancelled) return;
        setProjectChannels(response.channels);
      })
      .catch(() => {
        if (cancelled) return;
        setProjectChannels([]);
      })
      .finally(() => {
        if (!cancelled) setProjectChannelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedProject]);

  const filteredFeedback = useMemo(
    () => filterFeedbackIssueListItems(issueItems, issueFilters),
    [issueFilters, issueItems],
  );

  const hasActiveFilters =
    query.trim().length > 0 ||
    listState !== "open" ||
    cause !== "All" ||
    impact !== "All" ||
    assigneeUserId !== "All" ||
    authorUserId !== "All" ||
    projectId !== "All" ||
    sort !== "updated-desc";

  const setFilter = (key: string, value: string, defaultValue: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === defaultValue || !value.trim()) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    persistFilterPreference(next);
    setSearchParams(next, { replace: true });
  };

  const resetFilters = () => {
    const next = new URLSearchParams();
    persistFilterPreference(next);
    setSearchParams(next, { replace: true });
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
            <BountyButton onClick={() => navigate(newFeedbackHref(projectId))}>
              <Plus aria-hidden="true" />
              新建反馈
            </BountyButton>
          )}
        </div>
      </header>

      {selectedProject && (
        <section className="feedback-project-chat-panel" aria-label="项目绑定群">
          <div className="feedback-project-chat-summary">
            <span>绑定群</span>
            <strong>{projectChannelsLoading ? "..." : projectChannels.length}</strong>
          </div>
          <div className="feedback-project-chat-list">
            {projectChannelsLoading ? (
              <span>加载中</span>
            ) : projectChannels.length > 0 ? (
              projectChannels.slice(0, 4).map((channel) => (
                <Link key={channel.id} className="feedback-project-chat-link" to={`/chat/${encodeURIComponent(channel.id)}`}>
                  <MessageSquare aria-hidden="true" />
                  {channel.displayName}
                </Link>
              ))
            ) : (
              <span>未绑定</span>
            )}
          </div>
          <div className="feedback-project-chat-actions">
            <Link to={`/chat?create=channel&projectId=${encodeURIComponent(selectedProject.id)}`}>新建项目群</Link>
            <Link to="/chat">去聊天</Link>
          </div>
        </section>
      )}

      <div className="feedback-issue-query-panel" aria-label="反馈筛选">
        <BountySelect label="项目" value={projectId} onChange={(value) => setFilter("project", value, "All")}>
          <option value="All">全部项目</option>
          <option value="unassigned">未归属项目</option>
          {projectOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </BountySelect>
        <BountyTextInput ariaLabel="搜索反馈" value={query} onValueChange={(value) => setFilter("q", value, "")} placeholder="is:open label:技术问题 assignee:薛雨 project:客户端" />
        <BountySelect label="处理人" value={assigneeUserId} onChange={(value) => setFilter("assignee", value, "All")}>
          <option value="All">全部处理人</option>
          {assigneeOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </BountySelect>
        <BountySelect label="作者" value={authorUserId} onChange={(value) => setFilter("author", value, "All")}>
          <option value="All">全部作者</option>
          {authorOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </BountySelect>
        <BountySelect label="标签" value={cause} onChange={(value) => setFilter("label", value, "All")}>
          <option value="All">全部标签</option>
          {labelOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </BountySelect>
        <BountySelect label="影响" value={impact} onChange={(value) => setFilter("impact", value, "All")}>
          <option value="All">全部影响</option>
          <option value="critical">{feedbackImpactLabel.critical}</option>
          <option value="high">{feedbackImpactLabel.high}</option>
          <option value="medium">{feedbackImpactLabel.medium}</option>
          <option value="low">{feedbackImpactLabel.low}</option>
        </BountySelect>
        <BountySelect label="排序" value={sort} onChange={(value) => setFilter("sort", value, "updated-desc")}>
          <option value="updated-desc">最近更新</option>
          <option value="created-desc">最近创建</option>
          <option value="comments-desc">评论最多</option>
          <option value="updated-asc">最早更新</option>
        </BountySelect>
        <BountyButton className="feedback-reset-button" disabled={!hasActiveFilters} onClick={resetFilters} variant="secondary">
          <RotateCcw aria-hidden="true" />
          重置
        </BountyButton>
      </div>

      <div className="feedback-issue-work-queue" aria-label="反馈工作队列">
        <IssueStateButton active={listState === "assigned"} onClick={() => setFilter("state", "assigned", "open")}>
          <UserCheck aria-hidden="true" />
          待我处理 <strong>{issueCounts.assigned}</strong>
        </IssueStateButton>
        <IssueStateButton active={listState === "verification"} onClick={() => setFilter("state", "verification", "open")}>
          <CheckCircle2 aria-hidden="true" />
          待我验证 <strong>{issueCounts.verification}</strong>
        </IssueStateButton>
        <IssueStateButton active={listState === "unread"} onClick={() => setFilter("state", "unread", "open")}>
          <Inbox aria-hidden="true" />
          新动态 <strong>{issueCounts.unread}</strong>
        </IssueStateButton>
        <IssueStateButton active={listState === "triage"} onClick={() => setFilter("state", "triage", "open")}>
          <Flag aria-hidden="true" />
          待分诊 <strong>{issueCounts.triage}</strong>
        </IssueStateButton>
      </div>

      <section className="feedback-issue-list bounty-list-table">
        <div className="feedback-issue-list-head">
          <div className="feedback-issue-state-tabs">
            <IssueStateButton active={listState === "open"} onClick={() => setFilter("state", "open", "open")}>
              <CircleDot aria-hidden="true" className="feedback-state-icon-open" />
              Open <strong>{issueCounts.open}</strong>
            </IssueStateButton>
            <IssueStateButton active={listState === "closed"} onClick={() => setFilter("state", "closed", "open")}>
              <CheckCircle2 aria-hidden="true" className="feedback-state-icon-closed" />
              Closed <strong>{issueCounts.closed}</strong>
            </IssueStateButton>
            <IssueStateButton active={listState === "all"} onClick={() => setFilter("state", "all", "open")}>
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
        ) : feedbackReadModel.loading ? (
          <BountyEmptyState title="反馈加载中" description="正在读取反馈列表。" />
        ) : feedbackReadModel.error ? (
          <BountyEmptyState title="反馈读取失败" description={feedbackReadModel.error} />
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
    <Link className="feedback-issue-row" data-requires-action={feedback.requiresAction ? "true" : "false"} data-unread={feedback.unread ? "true" : "false"} to={feedbackIssueHref(feedback.id)}>
      <div className="feedback-issue-row-icon" data-open={open ? "true" : "false"}>
        {feedback.unread && <span className="feedback-issue-row-unread-dot" aria-label="有新动态" />}
        {open ? <CircleDot aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
      </div>
      <div className="feedback-issue-row-main">
        <div className="feedback-issue-row-title-line">
          <h2>{feedback.title}</h2>
          <div className="feedback-issue-labels">
            {feedback.unread && <BountyBadge tone="accent">新动态</BountyBadge>}
            {feedback.requiresAction && <BountyBadge tone="warning">待处理</BountyBadge>}
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
          <span>{item.projectName ?? "未归属项目"}</span>
          <span>更新于 {formatFeedbackDate(item.lastActivityAt)}</span>
          <span>{feedbackIssueStateLabel(feedback)}</span>
        </div>
      </div>
      <div className="feedback-issue-row-side" aria-label="反馈元数据">
        <div className="feedback-issue-assignee" title={`处理人：${item.assigneeName}`}>
          <UserAvatar avatarUrl={item.assigneeAvatarUrl} className="h-6 w-6 text-[10px]" frame={false} name={item.assigneeName} />
          <span>{item.assigneeName}</span>
        </div>
        <div className="feedback-issue-side-stat" title="项目">
          <Flag aria-hidden="true" />
          <span>{item.projectName ?? "未归属"}</span>
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

function newFeedbackHref(projectId: string) {
  if (!projectId || projectId === "All" || projectId === "unassigned") return "/feedback/new";
  return `/feedback/new?project=${encodeURIComponent(projectId)}`;
}
