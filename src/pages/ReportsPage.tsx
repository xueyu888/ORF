import { BarChart3, CalendarDays, Minus, Target, TrendingDown, TrendingUp, Trophy, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { PageScaffold } from "../components/PageScaffold";
import { UserAvatar } from "../components/UserAvatar";
import { Card, ProgressBar } from "../components/ui";
import { buildLeaderboardRows, type LeaderboardRankChange, type LeaderboardRow, type TimeRange } from "../features/reports/model/leaderboard";
import { useOrf } from "../state/OrfProvider";

const timeRangeOptions: { label: string; value: TimeRange }[] = [
  { label: "月度", value: "month" },
  { label: "季度", value: "quarter" },
  { label: "年度", value: "year" },
  { label: "全部", value: "all" },
];

export function ReportsPage() {
  const { state } = useOrf();
  const [timeRange, setTimeRange] = useState<TimeRange>("quarter");

  const rows = useMemo<LeaderboardRow[]>(() => buildLeaderboardRows(state, timeRange), [state, timeRange]);
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
          <div className="orf-stat-note">{rankChangeSummary(summary, timeRange)}</div>
        </Card>
      </div>

      <Card className="reports-leaderboard-card">
        <div className="reports-leaderboard-heading">
          <div>
            <h2>成员积分排行榜</h2>
            <p>{leaderboardDescription(timeRange)}</p>
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
                  <th scope="col">积分占比</th>
                  <th scope="col">完成率</th>
                  <th scope="col">变化</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <LeaderboardRowItem
                    key={row.userId}
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

function LeaderboardRowItem({ maxPoints, row }: { maxPoints: number; row: LeaderboardRow }) {
  const percentage = Math.max(0, Math.min(100, (row.points / maxPoints) * 100));

  return (
    <tr data-rank={row.rank <= 3 ? row.rank : undefined}>
      <td data-label="排名">
        <span className="reports-rank">{row.rank}</span>
      </td>
      <td data-label="成员">
        <div className="reports-member">
          <UserAvatar avatarUrl={row.avatarUrl} className="reports-member-avatar" frame={false} name={row.memberName} />
          <span className="reports-member-name">{row.memberName}</span>
        </div>
      </td>
      <td className="reports-number-cell" data-label="积分">{row.points.toFixed(1)}</td>
      <td className="reports-progress-cell" data-label="积分占比">
        <div className="reports-progress-meter" aria-label={`积分占榜首 ${Math.round(percentage)}%`}>
          <ProgressBar value={percentage} />
        </div>
      </td>
      <td className="reports-number-cell" data-label="完成率">{row.completionRate}%</td>
      <td data-label="变化">
        <RankChange change={row.rankChange} />
      </td>
    </tr>
  );
}

function RankChange({ change }: { change: LeaderboardRankChange }) {
  if (change.kind === "unavailable") {
    return <span className="reports-rank-change reports-rank-change-flat" aria-label="全部时间没有可比较的上一周期">-</span>;
  }

  if (change.kind === "new") {
    return (
      <span className="reports-rank-change reports-rank-change-new" aria-label="上一周期未上榜">
        新
      </span>
    );
  }

  if (change.kind === "flat") {
    return (
      <span className="reports-rank-change reports-rank-change-flat" aria-label={`较上一周期排名不变，上一周期第 ${change.previousRank} 名`}>
        <Minus className="h-4 w-4" />
        0
      </span>
    );
  }

  const isUp = change.direction === "up";
  const Icon = isUp ? TrendingUp : TrendingDown;
  return (
    <span
      className={isUp ? "reports-rank-change reports-rank-change-up" : "reports-rank-change reports-rank-change-down"}
      aria-label={`较上一周期${isUp ? "上升" : "下降"} ${change.delta} 名，上一周期第 ${change.previousRank} 名`}
    >
      <Icon className="h-4 w-4" />
      {isUp ? "+" : "-"}
      {change.delta}
    </span>
  );
}

function buildReportSummary(rows: LeaderboardRow[]) {
  const totalPoints = rows.reduce((total, row) => total + row.points, 0);
  const averageCompletion = rows.length === 0 ? 0 : Math.round(rows.reduce((total, row) => total + row.completionRate, 0) / rows.length);

  return {
    averageCompletion,
    downCount: rows.filter((row) => row.rankChange.kind === "moved" && row.rankChange.direction === "down").length,
    leaderName: rows[0]?.memberName ?? "暂无",
    memberCount: rows.length,
    newCount: rows.filter((row) => row.rankChange.kind === "new").length,
    totalPoints,
    upCount: rows.filter((row) => row.rankChange.kind === "moved" && row.rankChange.direction === "up").length,
  };
}

function previousRangeLabel(timeRange: TimeRange) {
  if (timeRange === "month") return "上月";
  if (timeRange === "quarter") return "上一季度";
  if (timeRange === "year") return "上一年度";
  return "上一周期";
}

function leaderboardDescription(timeRange: TimeRange) {
  if (timeRange === "all") {
    return "汇总全部公开积分流水，全部时间不计算排名变化。";
  }

  return `当前时间范围内的积分和完成率，并对比${previousRangeLabel(timeRange)}排名。`;
}

function rankChangeSummary(summary: ReturnType<typeof buildReportSummary>, timeRange: TimeRange) {
  if (timeRange === "all") {
    return "全部时间无上一周期";
  }

  const parts = [
    summary.upCount > 0 ? `${summary.upCount} 人上升` : "",
    summary.downCount > 0 ? `${summary.downCount} 人下降` : "",
    summary.newCount > 0 ? `${summary.newCount} 人新上榜` : "",
  ].filter(Boolean);

  return parts.length > 0 ? `较${previousRangeLabel(timeRange)}：${parts.join("，")}` : `较${previousRangeLabel(timeRange)}暂无变化`;
}
