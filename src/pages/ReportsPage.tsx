import { CalendarDays } from "lucide-react";
import { useMemo, useState } from "react";
import brandLogo from "../assets/brand/orf-logo.png";
import { useOrf } from "../state/OrfProvider";
import { avatarStyleForName } from "../utils/avatar";
import { initials } from "../utils/format";

type TimeRange = "quarter" | "year" | "all";

type LeaderboardRow = {
  completionRate: number;
  memberName: string;
  points: number;
  rank: number;
  rankChange: number;
};

const timeRangeOptions: { label: string; value: TimeRange }[] = [
  { label: "按季度", value: "quarter" },
  { label: "按年度", value: "year" },
  { label: "全部时间", value: "all" },
];

const fallbackMembers = ["Alex Chen", "Mia Zhang", "Ethan Liu", "Nora Patel", "Kai Wang"];
const baseRows = [
  { completionRate: 92, points: 169.5, rankChange: 2 },
  { completionRate: 80, points: 132.0, rankChange: -1 },
  { completionRate: 75, points: 98.0, rankChange: 0 },
  { completionRate: 68, points: 84.5, rankChange: 1 },
  { completionRate: 61, points: 73.0, rankChange: -2 },
];

export function ReportsPage() {
  const { state } = useOrf();
  const [timeRange, setTimeRange] = useState<TimeRange>("quarter");

  const rows = useMemo<LeaderboardRow[]>(() => {
    const owners = [
      ...state.users.map((user) => user.name),
      ...state.objectives.flatMap((objective) => objective.challengers),
    ];
    const memberNames = Array.from(new Set(owners.filter(Boolean)));
    const names = [...memberNames, ...fallbackMembers].filter((name, index, list) => list.indexOf(name) === index).slice(0, 5);

    return names.map((memberName, index) => ({
      ...baseRows[index],
      memberName,
      rank: index + 1,
    }));
  }, [state.objectives, state.results, state.users]);

  const maxPoints = Math.max(...rows.map((row) => row.points));

  return (
    <section className="reports-scoreboard-page" aria-labelledby="reports-scoreboard-title">
      <div className="reports-scoreboard-cloud reports-scoreboard-cloud-left" aria-hidden="true" />
      <div className="reports-scoreboard-cloud reports-scoreboard-cloud-right" aria-hidden="true" />
      <div className="reports-scoreboard-shell">
        <span className="reports-frame-corner reports-frame-corner-tl" aria-hidden="true" />
        <span className="reports-frame-corner reports-frame-corner-tr" aria-hidden="true" />
        <span className="reports-frame-corner reports-frame-corner-bl" aria-hidden="true" />
        <span className="reports-frame-corner reports-frame-corner-br" aria-hidden="true" />
        <span className="reports-frame-gem reports-frame-gem-top" aria-hidden="true" />
        <span className="reports-frame-gem reports-frame-gem-bottom" aria-hidden="true" />
        <div className="reports-petal reports-petal-one" aria-hidden="true" />
        <div className="reports-petal reports-petal-two" aria-hidden="true" />
        <div className="reports-petal reports-petal-three" aria-hidden="true" />

        <header className="reports-scoreboard-header">
          <div className="reports-logo-medallion" aria-hidden="true">
            <img src={brandLogo} alt="" />
          </div>
          <h1 id="reports-scoreboard-title" className="reports-scoreboard-title">
            ORF 飞升战力榜
          </h1>
          <PaimonSticker />
        </header>

        <div className="reports-time-controls" aria-label="时间范围">
          <div className="reports-time-icon" aria-hidden="true">
            <CalendarDays className="h-7 w-7" />
          </div>
          <div className="reports-time-options">
            {timeRangeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={timeRange === option.value}
                className={timeRange === option.value ? "reports-time-option reports-time-option-active" : "reports-time-option"}
                onClick={() => setTimeRange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="reports-title-divider" aria-hidden="true">
          <span />
        </div>
        <h2 className="reports-leaderboard-title">成员积分排行榜</h2>

        <div className="reports-leaderboard" role="table" aria-label="成员积分排行榜">
          <div className="reports-leaderboard-head" role="row">
            <div role="columnheader">排名</div>
            <div role="columnheader">变化</div>
            <div role="columnheader">成员</div>
            <div role="columnheader">积分条</div>
            <div role="columnheader">积分</div>
            <div role="columnheader">完成率</div>
          </div>
          <div className="reports-leaderboard-body">
            {rows.map((row) => (
              <LeaderboardRowItem key={row.memberName} maxPoints={maxPoints} row={row} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function LeaderboardRowItem({ maxPoints, row }: { maxPoints: number; row: LeaderboardRow }) {
  const percentage = Math.max(0, Math.min(100, (row.points / maxPoints) * 100));
  const isUp = row.rankChange > 0;
  const isDown = row.rankChange < 0;

  return (
    <div className="reports-leaderboard-row" role="row">
      <div className="reports-rank-cell" role="cell">
        <div className={`reports-rank-medal reports-rank-medal-${Math.min(row.rank, 4)}`}>
          <span>{row.rank}</span>
        </div>
      </div>
      <div className="reports-change-cell" role="cell">
        <span className={isUp ? "reports-change reports-change-up" : isDown ? "reports-change reports-change-down" : "reports-change"}>
          <span>{Math.abs(row.rankChange)}</span>
          <span aria-hidden="true">{isUp ? "↑" : isDown ? "↓" : "-"}</span>
        </span>
      </div>
      <div className="reports-member-cell" role="cell">
        <div className="reports-member-avatar" style={avatarStyleForName(row.memberName)} title={row.memberName} aria-label={row.memberName}>
          {initials(row.memberName)}
        </div>
      </div>
      <div className="reports-bar-cell" role="cell">
        <div className="reports-points-track" aria-label={`${row.points} 积分`}>
          <span className="reports-points-fill" style={{ width: `${percentage}%` }} />
        </div>
      </div>
      <div className="reports-points-cell" role="cell">
        {row.points.toFixed(1)}
      </div>
      <div className="reports-rate-cell" role="cell">
        <span className="reports-rate-gem" aria-hidden="true" />
        <span>{row.completionRate}%</span>
      </div>
    </div>
  );
}

function PaimonSticker() {
  return (
    <div className="reports-paimon-sticker" aria-label="派蒙贴图">
      <div className="reports-paimon-halo" aria-hidden="true" />
      <div className="reports-paimon-head" aria-hidden="true">
        <span className="reports-paimon-hair reports-paimon-hair-left" />
        <span className="reports-paimon-hair reports-paimon-hair-right" />
        <span className="reports-paimon-eye reports-paimon-eye-left" />
        <span className="reports-paimon-eye reports-paimon-eye-right" />
        <span className="reports-paimon-smile" />
      </div>
      <div className="reports-paimon-body" aria-hidden="true" />
      <div className="reports-paimon-cape" aria-hidden="true" />
      <span className="reports-paimon-star reports-paimon-star-one" aria-hidden="true" />
      <span className="reports-paimon-star reports-paimon-star-two" aria-hidden="true" />
    </div>
  );
}
