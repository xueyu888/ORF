import { CalendarCheck, ChevronDown, ClipboardList, ShieldAlert, UserCheck, UsersRound, type LucideIcon } from "lucide-react";
import { useState } from "react";

export function BountyOverview({
  challengerCount,
  cycle,
  openCount,
  publicCount,
  recruitmentCount,
}: {
  challengerCount: number;
  cycle: string;
  openCount: number;
  publicCount: number;
  recruitmentCount: number;
}) {
  const [mobileExpanded, setMobileExpanded] = useState(false);

  return (
    <section className="bounty-overview-band" aria-label="悬赏大厅概览" data-mobile-expanded={mobileExpanded ? "true" : undefined}>
      <button
        type="button"
        className="bounty-overview-mobile-toggle"
        aria-expanded={mobileExpanded}
        onClick={() => setMobileExpanded((expanded) => !expanded)}
      >
        <span className="bounty-overview-mobile-cycle">
          <CalendarCheck aria-hidden="true" />
          <strong>当前周期 · {cycle}</strong>
        </span>
        <span className="bounty-overview-mobile-summary">{openCount} 开放 · {recruitmentCount} 征召</span>
        <ChevronDown aria-hidden="true" />
      </button>
      <div className="bounty-overview-content">
        <div className="bounty-cycle-pill">
          <CalendarCheck className="h-5 w-5" />
          <span>当前周期 · {cycle}</span>
        </div>
        <div className="bounty-stat-grid">
          <BountyStatCard icon={UsersRound} label="公开悬赏" tone="cyan" value={publicCount} />
          <BountyStatCard icon={ClipboardList} label="开放中" tone="blue" value={openCount} />
          <BountyStatCard icon={UserCheck} label="挑战者" tone="orange" value={challengerCount} />
          <BountyStatCard icon={ShieldAlert} label="征召" tone="gold" value={recruitmentCount} />
        </div>
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
