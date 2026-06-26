import { ArrowLeft, CheckCircle2, CircleDot, Flag } from "lucide-react";
import { Link } from "react-router-dom";
import { BountyEmptyState } from "../features/bounty-hall/BountyHallSkin";

export function FeedbackMilestonesPage() {
  return (
    <div className="bounty-hall-page orf-workbench-surface feedback-index-page">
      <header className="feedback-index-header">
        <div className="feedback-index-title-block">
          <Link className="feedback-issue-back-link" to="/feedback">
            <ArrowLeft aria-hidden="true" />
            反馈
          </Link>
          <h1>里程碑</h1>
          <p>当前 ORF 反馈模型没有里程碑事实源，只展示只读索引状态。</p>
        </div>
        <div className="feedback-index-summary">
          <Flag aria-hidden="true" />
          <strong>0</strong>
          <span>Milestones</span>
        </div>
      </header>

      <section className="feedback-milestone-list bounty-list-table">
        <div className="feedback-milestone-list-head">
          <div className="feedback-issue-state-tabs">
            <span className="feedback-milestone-state-pill" data-active="true">
              <CircleDot aria-hidden="true" />
              Open <strong>0</strong>
            </span>
            <span className="feedback-milestone-state-pill">
              <CheckCircle2 aria-hidden="true" />
              Closed <strong>0</strong>
            </span>
          </div>
          <span className="feedback-issue-match-count">0 个里程碑</span>
        </div>
        <div className="feedback-milestone-empty">
          <BountyEmptyState title="还没有里程碑" description="需要先确定 ORF 反馈的里程碑模型、创建权限和旧反馈迁移规则，前端才应展示可写入口。" />
        </div>
      </section>
    </div>
  );
}
