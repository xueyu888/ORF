import { ArrowLeft, CheckCircle2, CircleDot, Tag } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { feedbackRootPath } from "../../contracts/links";
import { FeedbackBadge, FeedbackEmptyState, FeedbackSelect, FeedbackTextInput } from "../components/controls";
import {
  feedbackIssueLabelIndexItems,
  type FeedbackIssueLabelIndexItem,
  type FeedbackIssueLabelIndexSortKey,
} from "../model/issueMetadata";
import { useFeedbackWebHost } from "../runtime";
import { useFeedbackIssueReadModel } from "../hooks";

export function FeedbackLabelsPage() {
  const host = useFeedbackWebHost();
  const { currentUser, feedbackInvalidationKey } = host.useSession();
  const feedbackReadModel = useFeedbackIssueReadModel(Boolean(currentUser), feedbackInvalidationKey);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<FeedbackIssueLabelIndexSortKey>("name-asc");
  const visibleFeedback = useMemo(
    () => currentUser?.status === "active" || currentUser?.role === "admin" ? feedbackReadModel.data.feedback : [],
    [currentUser, feedbackReadModel.data.feedback],
  );
  const labels = useMemo(() => feedbackIssueLabelIndexItems(visibleFeedback, sort), [sort, visibleFeedback]);
  const filteredLabels = useMemo(() => filterFeedbackIssueLabels(labels, query), [labels, query]);

  return (
    <div className="orf-feedback-workbench orf-feedback-index-page">
      <header className="feedback-index-header">
        <div className="feedback-index-title-block">
          <Link className="feedback-issue-back-link" to={feedbackRootPath}>
            <ArrowLeft aria-hidden="true" />
            反馈
          </Link>
          <h1>标签</h1>
          <p>按反馈原因和影响等级派生的只读索引。</p>
        </div>
        <div className="feedback-index-summary">
          <Tag aria-hidden="true" />
          <strong>{labels.length}</strong>
          <span>Labels</span>
        </div>
      </header>

      <div className="feedback-index-toolbar">
        <FeedbackTextInput ariaLabel="搜索标签" value={query} onValueChange={setQuery} placeholder="Search all labels" />
        <FeedbackSelect label="排序" value={sort} onChange={(value) => setSort(value as FeedbackIssueLabelIndexSortKey)}>
          <option value="name-asc">名称</option>
          <option value="feedback-desc">反馈数最多</option>
          <option value="open-desc">Open 数最多</option>
        </FeedbackSelect>
      </div>

      <section className="feedback-label-list">
        <div className="feedback-label-list-head">
          <span>{filteredLabels.length} labels</span>
          <span>点击标签查看匹配反馈</span>
        </div>
        {filteredLabels.length > 0 ? (
          <div className="feedback-label-rows">
            {filteredLabels.map((label) => (
              <FeedbackLabelRow key={label.key} label={label} />
            ))}
          </div>
        ) : (
          <FeedbackEmptyState title="没有匹配的标签" description="调整搜索条件后再看。" />
        )}
      </section>
    </div>
  );
}

function FeedbackLabelRow({ label }: { label: FeedbackIssueLabelIndexItem }) {
  return (
    <Link className="feedback-label-row" to={`/feedback?label=${encodeURIComponent(label.name)}`}>
      <div className="feedback-label-main">
        <span className="feedback-label-swatch" data-tone={label.tone} aria-hidden="true" />
        <div className="feedback-label-copy">
          <FeedbackBadge tone={label.tone}>{label.name}</FeedbackBadge>
          <p>{label.description}</p>
        </div>
      </div>
      <div className="feedback-label-stats" aria-label="标签反馈统计">
        <span><CircleDot aria-hidden="true" /> {label.openCount} Open</span>
        <span><CheckCircle2 aria-hidden="true" /> {label.closedCount} Closed</span>
        <strong>{label.feedbackCount}</strong>
      </div>
    </Link>
  );
}

function filterFeedbackIssueLabels(labels: readonly FeedbackIssueLabelIndexItem[], query: string) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return labels;
  return labels.filter((label) => {
    const searchable = normalizeSearchText(`${label.name} ${label.description}`);
    return normalizedQuery.split(" ").every((token) => searchable.includes(token));
  });
}

function normalizeSearchText(value: string) {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}
