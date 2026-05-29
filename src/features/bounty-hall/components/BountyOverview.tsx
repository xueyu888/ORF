import { CalendarCheck, ClipboardList, ShieldAlert, UserCheck, UsersRound, type LucideIcon } from "lucide-react";

export function BountyOverview({
  availableCount,
  challengerCount,
  cycle,
  publicCount,
  recruitmentCount,
}: {
  availableCount: number;
  challengerCount: number;
  cycle: string;
  publicCount: number;
  recruitmentCount: number;
}) {
  return (
    <section className="bounty-overview-band" aria-label="悬赏大厅概览">
      <div className="bounty-cycle-pill">
        <CalendarCheck className="h-5 w-5" />
        <span>当前周期 · {cycle}</span>
      </div>
      <div className="bounty-stat-grid">
        <BountyStatCard icon={UsersRound} label="公开悬赏" tone="cyan" value={publicCount} />
        <BountyStatCard icon={ClipboardList} label="可申请" tone="blue" value={availableCount} />
        <BountyStatCard icon={UserCheck} label="挑战者" tone="orange" value={challengerCount} />
        <BountyStatCard icon={ShieldAlert} label="征召" tone="gold" value={recruitmentCount} />
      </div>
    </section>
  );
}

function BountyStatCard({
  icon: Icon,
  label,
  tone,
  value,
}: {
  icon: LucideIcon;
  label: string;
  tone: "blue" | "gold" | "cyan" | "orange";
  value: number | string;
}) {
  return (
    <div className={`bounty-stat-card bounty-stat-card-${tone}`}>
      <div className="bounty-stat-icon">
        <Icon aria-hidden="true" />
      </div>
      <div className="bounty-stat-copy">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}
