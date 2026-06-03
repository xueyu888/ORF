import { BarChart3, CalendarDays, Minus, Target, TrendingDown, TrendingUp, Trophy, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { PageScaffold } from "../components/PageScaffold";
import { UserAvatar } from "../components/UserAvatar";
import { Card, ProgressBar } from "../components/ui";
import { buildLeaderboardRows, type LeaderboardRow, type TimeRange } from "../features/reports/model/leaderboard";
import { useOrf } from "../state/OrfProvider";

const timeRangeOptions: { label: string; value: TimeRange }[] = [
  { label: "季度", value: "quarter" },
  { label: "年度", value: "year" },
  { label: "全部", value: "all" },
];

export function ReportsPage() {
  const { state } = useOrf();
  const [timeRange, setTimeRange] = useState<TimeRange>("quarter");

  const rows = useMemo<LeaderboardRow[]>(() => buildLeaderboardRows(state, timeRange), [state, timeRange]);
  const usersByName = useMemo(() => new Map(state.users.map((user) => [user.name, user])), [state.users]);
  const summary = useMemo(() => buildReportSummary(rows), [rows]);
  const maxPoints = Math.max(1, ...rows.map((row) => row.points));

  return (
    <PageScaffold
      title="统计"
      subtitle="成员积分、完成率和排名变化。"
      action={<TimeRangeControl timeRange={timeRange} onChange={setTimeRange} />}
    >
      <div className="orf-stat-grid">
        <Card className="orf-stat-card">
          <div className="orf-stat-icon orf-stat-icon-accent">
            <Users className="h-4 w-4" />
          </div>
          <div className="orf-stat-label">上榜成员</div>
          <div className="orf-stat-value">{summary.memberCount}</div>
          <div className="orf-stat-note">当前范围内有积分记录</div>
        </Card>
        <Card className="orf-stat-card">
          <div className="orf-stat-icon orf-stat-icon-success">
            <BarChart3 className="h-4 w-4" />
          </div>
          <div className="orf-stat-label">总积分</div>
          <div className="orf-stat-value">{summary.totalPoints.toFixed(1)}</div>
          <div className="orf-stat-note">按成员目标结果汇总</div>
        </Card>
        <Card className="orf-stat-card">
          <div className="orf-stat-icon orf-stat-icon-info">
            <Target className="h-4 w-4" />
          </div>
          <div className="orf-stat-label">平均完成率</div>
          <div className="orf-stat-value">{summary.averageCompletion}%</div>
          <div className="orf-stat-note">只统计当前榜单成员</div>
        </Card>
        <Card className="orf-stat-card">
          <div className="orf-stat-icon orf-stat-icon-warning">
            <Trophy className="h-4 w-4" />
          </div>
          <div className="orf-stat-label">榜首</div>
          <div className="orf-stat-value orf-stat-value-compact">{summary.leaderName}</div>
          <div className="orf-stat-note">{summary.movingCount} 人排名发生变化</div>
        </Card>
      </div>

      <Card className="reports-leaderboard-card">
        <div className="reports-leaderboard-heading">
          <div>
            <h2>成员积分排行榜</h2>
            <p>当前时间范围内的积分、完成率和排名变化。</p>
          </div>
          <div className="reports-leaderboard-count">
            <Trophy className="h-4 w-4" />
            {rows.length} 名成员
          </div>
        </div>

        {rows.length > 0 ? (
          <div className="orf-table-wrap">
            <table className="orf-data-table reports-data-table">
              <thead>
                <tr>
                  <th scope="col">排名</th>
                  <th scope="col">成员</th>
                  <th scope="col">积分</th>
                  <th scope="col">进度</th>
                  <th scope="col">完成率</th>
                  <th scope="col">变化</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <LeaderboardRowItem
                    avatarUrl={usersByName.get(row.memberName)?.avatarUrl}
                    key={row.memberName}
                    maxPoints={maxPoints}
                    row={row}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="reports-empty-state">暂无积分记录</div>
        )}
      </Card>
    </PageScaffold>
  );
}

function TimeRangeControl({ onChange, timeRange }: { onChange: (value: TimeRange) => void; timeRange: TimeRange }) {
  return (
    <div className="orf-segmented-control" aria-label="时间范围">
      <CalendarDays className="h-4 w-4" />
      {timeRangeOptions.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={timeRange === option.value}
          className={timeRange === option.value ? "orf-segmented-option is-active" : "orf-segmented-option"}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function LeaderboardRowItem({ avatarUrl, maxPoints, row }: { avatarUrl?: string | null; maxPoints: number; row: LeaderboardRow }) {
  const percentage = Math.max(0, Math.min(100, (row.points / maxPoints) * 100));

  return (
    <tr>
      <td>
        <span className="reports-rank">{row.rank}</span>
      </td>
      <td>
        <div className="reports-member">
          <UserAvatar avatarUrl={avatarUrl} className="reports-member-avatar" frame={false} name={row.memberName} />
          <span className="reports-member-name">{row.memberName}</span>
        </div>
      </td>
      <td className="reports-number-cell">{row.points.toFixed(1)}</td>
      <td className="reports-progress-cell">
        <ProgressBar value={percentage} />
      </td>
      <td className="reports-number-cell">{row.completionRate}%</td>
      <td>
        <RankChange value={row.rankChange} />
      </td>
    </tr>
  );
}

function RankChange({ value }: { value: number }) {
  if (value === 0) {
    return (
      <span className="reports-rank-change reports-rank-change-flat">
        <Minus className="h-4 w-4" />
        0
      </span>
    );
  }

  const isUp = value > 0;
  const Icon = isUp ? TrendingUp : TrendingDown;
  return (
    <span className={isUp ? "reports-rank-change reports-rank-change-up" : "reports-rank-change reports-rank-change-down"}>
      <Icon className="h-4 w-4" />
      {Math.abs(value)}
    </span>
  );
}

function buildReportSummary(rows: LeaderboardRow[]) {
  const totalPoints = rows.reduce((total, row) => total + row.points, 0);
  const averageCompletion = rows.length === 0 ? 0 : Math.round(rows.reduce((total, row) => total + row.completionRate, 0) / rows.length);

  return {
    averageCompletion,
    leaderName: rows[0]?.memberName ?? "暂无",
    memberCount: rows.length,
    movingCount: rows.filter((row) => row.rankChange !== 0).length,
    totalPoints,
  };
}
