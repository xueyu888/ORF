import { CheckCircle2, Flag, Gauge, Target, type LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { summarizeDashboard } from "../model/challengeTreeModel";
import type { ObjectiveNode } from "../model/types";

export function TeamDashboard({ groups }: { groups: ObjectiveNode[] }) {
  const summary = summarizeDashboard(groups);

  return (
    <section className="orf-team-dashboard">
      <DashboardMetric icon={CheckCircle2} value={`${summary.settled}`} label="已结算" color="#0b8f7f" progress={summary.settledProgress} />
      <DashboardMetric icon={Target} value={`${summary.objectiveProgress}%`} label="目标总体进度" color="#e78a16" progress={summary.objectiveProgress} />
      <DashboardMetric icon={Flag} value={`${summary.unassigned}`} label="待征召" color="#7a3ff2" progress={summary.unassignedProgress} />
      <DashboardMetric icon={Gauge} value={`${summary.review}`} label="待验收" color="#1f8fff" progress={summary.reviewProgress} />
    </section>
  );
}

function DashboardMetric({
  color,
  icon: Icon,
  label,
  progress,
  value,
}: {
  color: string;
  icon: LucideIcon;
  label: string;
  progress: number;
  value: string;
}) {
  return (
    <div className="orf-dashboard-metric flex flex-col items-center justify-center gap-2 text-center" style={{ "--orf-dashboard-color": color } as CSSProperties}>
      <div className="orf-dashboard-emblem flex h-12 w-12 items-center justify-center">
        <Icon className="h-6 w-6" />
      </div>
      <div className="min-w-0">
        <div className="text-3xl font-semibold leading-none text-[#1f2f45]">{value}</div>
        <div className="mt-1 text-xs font-semibold text-[#7b6a50]">{label}</div>
      </div>
      <div className="orf-dashboard-progress h-1.5 w-full max-w-[150px] overflow-hidden" aria-hidden="true">
        <span style={{ width: `${Math.max(0, Math.min(100, Math.round(progress)))}%` }} />
      </div>
    </div>
  );
}
