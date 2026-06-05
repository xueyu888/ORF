import { ArrowRight, ChevronDown, Clock3, ListChecks } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { PendingChallengeApplication } from "../../../domain/orfReadModel";
import { challengePathForTarget } from "../model/challengeLinks";
import { objectiveStatusLabel } from "../model/challengeStatus";

export function PendingChallengeApplicationsPanel({
  applications,
}: {
  applications: PendingChallengeApplication[];
}) {
  const [expanded, setExpanded] = useState(applications.length > 0);

  useEffect(() => {
    if (applications.length > 0) setExpanded(true);
  }, [applications.length]);

  if (applications.length === 0) return null;

  return (
    <section className="orf-pending-applications" aria-label="我的申请">
      <button
        aria-expanded={expanded}
        className="orf-pending-applications-header"
        type="button"
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="orf-pending-applications-title">
          <Clock3 aria-hidden="true" />
          我的申请
        </span>
        <span className="orf-pending-applications-count">{applications.length}</span>
        <ChevronDown aria-hidden="true" className="orf-pending-applications-chevron" data-expanded={expanded ? "true" : "false"} />
      </button>

      {expanded && (
        <div className="orf-pending-application-list">
          {applications.map((item) => (
            <article key={`${item.objective.id}:${item.application.id}`} className="orf-pending-application-row">
              <div className="orf-pending-application-main">
                <div className="orf-pending-application-title-line">
                  <h2>{item.objective.title}</h2>
                  <span className="orf-pending-application-state">等待确认</span>
                </div>
                <div className="orf-pending-application-meta">
                  <span>{objectiveStatusLabel(item.objective)}</span>
                  <span>{item.objective.cycle}</span>
                  <span>{formatApplicationDate(item.application.createdAt)}</span>
                </div>
                {item.application.reason && <p className="orf-pending-application-reason">{item.application.reason}</p>}
              </div>

              <div className="orf-pending-application-results" aria-label="指标预览">
                <ListChecks aria-hidden="true" />
                <span>{metricPreview(item)}</span>
              </div>

              <Link className="orf-pending-application-link" to={challengePathForTarget({ id: item.objective.id, type: "objective" }, "/bounties")}>
                <ArrowRight aria-hidden="true" />
                查看悬赏
              </Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function metricPreview(item: PendingChallengeApplication) {
  if (item.results.length === 0) return "暂无指标";
  const titles = item.results.slice(0, 2).map((result) => result.title);
  const rest = item.results.length - titles.length;
  return rest > 0 ? `${titles.join("、")} 等 ${item.results.length} 项` : titles.join("、");
}

function formatApplicationDate(value: string | null | undefined) {
  if (!value) return "申请中";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(date);
}
