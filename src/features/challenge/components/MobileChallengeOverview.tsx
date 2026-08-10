import { ArrowLeft, CalendarDays, ChevronRight, ListChecks, Target } from "lucide-react";
import { useEffect, useState } from "react";
import type { OrfProject } from "../../../types/orf";
import { objectiveStatusLabel, objectiveStatusTone } from "../model/challengeStatus";
import type { ObjectiveNode } from "../model/types";

export function MobileChallengeOverview({
  groups,
  onSelect,
  projects,
}: {
  groups: ObjectiveNode[];
  onSelect: (objectiveId: string) => void;
  projects: OrfProject[];
}) {
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  const resultCount = groups.reduce((count, group) => count + group.bounties.length, 0);
  const actionCount = groups.reduce((count, group) => count + group.actions.length, 0);

  return (
    <section className="orf-mobile-challenge-overview" aria-label="挑战目标概览">
      <header className="orf-mobile-challenge-overview-header">
        <div>
          <span className="orf-mobile-challenge-eyebrow">当前工作区</span>
          <h2>选择一个目标继续</h2>
        </div>
        <span className="orf-mobile-challenge-total">{groups.length} 个目标</span>
      </header>

      <div className="orf-mobile-challenge-summary" aria-label="当前目标摘要">
        <span><Target aria-hidden="true" />{resultCount} 个指标</span>
        <span><ListChecks aria-hidden="true" />{actionCount} 个行动项</span>
      </div>

      <div className="orf-mobile-objective-list">
        {groups.map((group) => {
          const progress = Math.max(0, Math.min(100, Math.round(group.objective.progress)));
          const projectName = group.objective.projectId ? projectNames.get(group.objective.projectId) : null;
          const statusTone = objectiveStatusTone(group.objective);
          return (
            <button
              className="orf-mobile-objective-card"
              key={group.objective.id}
              onClick={() => onSelect(group.objective.id)}
              type="button"
            >
              <span className="orf-mobile-objective-card-topline">
                <span className="orf-mobile-objective-project">{projectName ?? "未归属项目"}</span>
                <span className="orf-mobile-objective-status" data-tone={statusTone}>{objectiveStatusLabel(group.objective)}</span>
              </span>
              <strong>{group.objective.title}</strong>
              <span className="orf-mobile-objective-evidence">
                <span>{group.bounties.length} 个指标</span>
                <span>{group.actions.length} 个行动项</span>
                <span><CalendarDays aria-hidden="true" />{formatMobileDate(group.deadline)}</span>
              </span>
              <span className="orf-mobile-objective-progress-row">
                <span className="orf-mobile-objective-progress" aria-label={`目标进度 ${progress}%`}>
                  <span style={{ width: `${progress}%` }} />
                </span>
                <span>{progress}%</span>
                <ChevronRight aria-hidden="true" />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function MobileChallengeFocusBar({ objectiveTitle, onBack }: { objectiveTitle: string; onBack: () => void }) {
  const [stickyTop, setStickyTop] = useState(0);

  useEffect(() => {
    const topbar = document.querySelector<HTMLElement>(".orf-topbar");
    if (!topbar) return undefined;
    const sync = () => setStickyTop(Math.max(0, Math.round(topbar.getBoundingClientRect().bottom)));
    const observer = new ResizeObserver(sync);
    observer.observe(topbar);
    window.addEventListener("resize", sync);
    sync();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, []);

  return (
    <div className="orf-mobile-challenge-focus-bar" style={{ top: stickyTop }}>
      <button type="button" onClick={onBack}>
        <ArrowLeft aria-hidden="true" />
        全部目标
      </button>
      <span>
        <small>当前目标</small>
        <strong>{objectiveTitle.trim() || "新建目标"}</strong>
      </span>
    </div>
  );
}

function formatMobileDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未设置日期";
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(date);
}
