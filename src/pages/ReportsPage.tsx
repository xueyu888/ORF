import { BarChart3, CalendarDays, ChevronLeft, ChevronRight, Minus, Target, TrendingDown, TrendingUp, Trophy, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { buildDateGrid, monthLabel } from "../components/DatePicker";
import { PageScaffold } from "../components/PageScaffold";
import { UserAvatar } from "../components/UserAvatar";
import { Button, Card, IconButton, ProgressBar } from "../components/ui";
import {
  buildLeaderboardRangeBounds,
  buildLeaderboardRows,
  buildSettlementDaySummaries,
  shiftLeaderboardEndDate,
  type LeaderboardDateRange,
  type LeaderboardRangeBounds,
  type LeaderboardRangeSelection,
  type LeaderboardRankChange,
  type LeaderboardRow,
  type ReportsPageData,
  type SettlementDaySummary,
  type TimeRange,
} from "../domain/reportsLeaderboard";
import { useOrf } from "../state/OrfProvider";
import { reportsPageSnapshot } from "../state/readModelQueries";
import { isDateOnlyString, localDateString } from "../utils/date";

const timeRangeOptions: { label: string; value: TimeRange }[] = [
  { label: "月度", value: "month" },
  { label: "季度", value: "quarter" },
  { label: "年度", value: "year" },
  { label: "自定义", value: "custom" },
  { label: "全部", value: "all" },
];

const emptyReportsData: ReportsPageData = {
  objectives: [],
  objectiveAcceptanceReviews: [],
  pointLedger: [],
  userProfiles: [],
};

export function ReportsPage() {
  const { reportsData } = useOrf();
  const [searchParams] = useSearchParams();
  const today = useMemo(() => localDateString(new Date()), []);
  const linkedSettlementDate = useMemo(() => reportsDateFromSearch(searchParams, today), [searchParams, today]);
  const linkedObjectiveId = useMemo(() => searchParams.get("objective")?.trim() || null, [searchParams]);
  const [timeRange, setTimeRange] = useState<TimeRange>("quarter");
  const [endDate, setEndDate] = useState(() => linkedSettlementDate);
  const [customRange, setCustomRange] = useState<LeaderboardDateRange>(() => defaultCustomRange(linkedSettlementDate));
  const [customDateBoundary, setCustomDateBoundary] = useState<CustomDateBoundary>("end");
  const [calendarDisplayMonth, setCalendarDisplayMonth] = useState(() => monthForDate(linkedSettlementDate));
  const appliedReportsLinkRef = useRef("");

  const reportsProjection = reportsData ?? reportsPageSnapshot() ?? emptyReportsData;
  const leaderboardRangeSelection = useMemo<LeaderboardRangeSelection | string>(
    () => timeRange === "custom" ? { customRange, endDate: customRange.end } : endDate,
    [customRange, endDate, timeRange],
  );
  const rangeBounds = useMemo(() => buildLeaderboardRangeBounds(timeRange, leaderboardRangeSelection), [leaderboardRangeSelection, timeRange]);
  const rows = useMemo<LeaderboardRow[]>(
    () => buildLeaderboardRows(reportsProjection, timeRange, leaderboardRangeSelection),
    [leaderboardRangeSelection, reportsProjection, timeRange],
  );
  const summary = useMemo(() => buildReportSummary(rows), [rows]);
  const settlementDaySummaries = useMemo(() => buildSettlementDaySummaries(reportsProjection.pointLedger), [reportsProjection.pointLedger]);
  const settlementDaySummaryByDate = useMemo(
    () => new Map(settlementDaySummaries.map((item) => [item.date, item])),
    [settlementDaySummaries],
  );
  const linkedSettlement = useMemo(
    () => linkedObjectiveId ? reportsLinkedSettlement(reportsProjection, linkedObjectiveId, linkedSettlementDate) : null,
    [linkedObjectiveId, linkedSettlementDate, reportsProjection],
  );
  const maxPoints = Math.max(1, ...rows.map((row) => row.points));
  const changeEndDate = (nextDate: string) => {
    setEndDate(nextDate);
    setCalendarDisplayMonth(monthForDate(nextDate));
  };
  const changeTimeRange = (nextRange: TimeRange) => {
    if (nextRange === "custom" && timeRange !== "custom") {
      const nextCustomRange = rangeBounds ? { end: rangeBounds.end, start: rangeBounds.start } : defaultCustomRange(endDate);
      setCustomRange(nextCustomRange);
      setCustomDateBoundary("end");
      setCalendarDisplayMonth(monthForDate(nextCustomRange.end));
    }
    setTimeRange(nextRange);
  };
  const changeCustomDate = (nextDate: string) => {
    setCustomRange((current) => customRangeWithBoundary(current, customDateBoundary, nextDate));
    setCalendarDisplayMonth(monthForDate(nextDate));
    if (customDateBoundary === "start") {
      setCustomDateBoundary("end");
    }
  };

  useEffect(() => {
    if (!linkedObjectiveId && searchParams.get("date") === null) return;
    const linkKey = `${linkedObjectiveId ?? ""}:${linkedSettlementDate}`;
    if (appliedReportsLinkRef.current === linkKey) return;
    appliedReportsLinkRef.current = linkKey;
    setTimeRange("quarter");
    setEndDate(linkedSettlementDate);
    setCalendarDisplayMonth(monthForDate(linkedSettlementDate));
  }, [linkedObjectiveId, linkedSettlementDate, searchParams]);

  return (
    <PageScaffold title="统计">
      <ReportsPeriodCard
        customDateBoundary={customDateBoundary}
        customRange={customRange}
        dailySummaryByDate={settlementDaySummaryByDate}
        displayMonth={calendarDisplayMonth}
        endDate={endDate}
        onCustomDateBoundaryChange={(boundary) => {
          setCustomDateBoundary(boundary);
          setCalendarDisplayMonth(monthForDate(customRange[boundary]));
        }}
        onDisplayMonthChange={setCalendarDisplayMonth}
        onSelectDate={timeRange === "custom" ? changeCustomDate : changeEndDate}
        onShiftEndDate={(amount) => changeEndDate(shiftLeaderboardEndDate(endDate, timeRange, amount))}
        onTimeRangeChange={changeTimeRange}
        rangeBounds={rangeBounds}
        timeRange={timeRange}
        today={today}
      />

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

      {linkedSettlement && (
        <Card className="reports-linked-settlement-card">
          <div className="reports-linked-settlement-icon">
            <Target className="h-4 w-4" />
          </div>
          <div>
            <h2>目标结算定位</h2>
            <p>
              {linkedSettlement.objectiveTitle} · {linkedSettlementDate}
              {linkedSettlement.ledgerCount > 0 ? ` · ${formatSignedPoints(linkedSettlement.points)} 分 · ${linkedSettlement.ledgerCount} 条流水` : " · 暂无匹配流水"}
            </p>
          </div>
        </Card>
      )}

      <Card className="reports-leaderboard-card">
        <div className="reports-leaderboard-heading">
          <div>
            <h2>成员积分排行榜</h2>
            <p>{leaderboardDescription(timeRange, rangeBounds)}</p>
          </div>
          <div className="reports-leaderboard-count">
            <Trophy className="h-4 w-4" />
            {rows.length} 名成员
          </div>
        </div>

        {rows.length > 0 ? (
          <>
            <div className="orf-table-wrap reports-desktop-leaderboard">
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
            <MobileLeaderboard maxPoints={maxPoints} rows={rows} />
          </>
        ) : (
          <div className="reports-empty-state">暂无积分记录</div>
        )}
      </Card>
    </PageScaffold>
  );
}

function ReportsPeriodCard({
  customDateBoundary,
  customRange,
  dailySummaryByDate,
  displayMonth,
  endDate,
  onCustomDateBoundaryChange,
  onDisplayMonthChange,
  onSelectDate,
  onShiftEndDate,
  onTimeRangeChange,
  rangeBounds,
  timeRange,
  today,
}: {
  customDateBoundary: CustomDateBoundary;
  customRange: LeaderboardDateRange;
  dailySummaryByDate: Map<string, SettlementDaySummary>;
  displayMonth: Date;
  endDate: string;
  onCustomDateBoundaryChange: (boundary: CustomDateBoundary) => void;
  onDisplayMonthChange: (date: Date) => void;
  onSelectDate: (date: string) => void;
  onShiftEndDate: (amount: number) => void;
  onTimeRangeChange: (value: TimeRange) => void;
  rangeBounds: LeaderboardRangeBounds | null;
  timeRange: TimeRange;
  today: string;
}) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const monthTotal = settlementMonthTotal(dailySummaryByDate, displayMonth);
  const selectedCalendarDate = timeRange === "custom" ? customRange[customDateBoundary] : endDate;
  const changeCustomBoundary = (boundary: CustomDateBoundary) => {
    onCustomDateBoundaryChange(boundary);
    setCalendarOpen(true);
  };
  const openCalendarForEndDate = () => {
    onDisplayMonthChange(monthForDate(endDate));
    setCalendarOpen(true);
  };
  const selectDate = (date: string) => {
    onSelectDate(date);
    setCalendarOpen(true);
  };
  const changeTimeRange = (value: TimeRange) => {
    onTimeRangeChange(value);
    setCalendarOpen(false);
  };
  return (
    <Card className="reports-period-card">
      <div className="reports-period-main-control">
        <TimeRangeControl timeRange={timeRange} onChange={changeTimeRange} />
        <div className="reports-period-summary" aria-live="polite">
          <span>积分归属日</span>
          <strong>{periodRangeSummary(timeRange, rangeBounds)}</strong>
          {timeRange !== "all" && <small>含结束日</small>}
        </div>
        <div className="reports-period-actions">
          {timeRange === "custom" ? (
            <div className="reports-custom-range-controls" aria-label="自定义统计日期">
              <Button
                aria-pressed={customDateBoundary === "start"}
                className="reports-custom-boundary-button"
                data-active={customDateBoundary === "start"}
                onClick={() => changeCustomBoundary("start")}
                size="sm"
                type="button"
                variant="secondary"
              >
                <CalendarDays className="h-4 w-4" />
                <span>开始</span>
                <strong>{customRange.start}</strong>
              </Button>
              <Button
                aria-pressed={customDateBoundary === "end"}
                className="reports-custom-boundary-button"
                data-active={customDateBoundary === "end"}
                onClick={() => changeCustomBoundary("end")}
                size="sm"
                type="button"
                variant="secondary"
              >
                <CalendarDays className="h-4 w-4" />
                <span>结束</span>
                <strong>{customRange.end}</strong>
              </Button>
            </div>
          ) : timeRange !== "all" && (
            <div className="reports-period-stepper" aria-label="统计结束日期">
              <IconButton
                icon={ChevronLeft}
                label={`上一${periodWindowName(timeRange)}`}
                onClick={() => onShiftEndDate(-1)}
                size="sm"
              />
              <Button aria-expanded={calendarOpen} className="reports-period-date-button" onClick={openCalendarForEndDate} size="sm" type="button" variant="secondary">
                <CalendarDays className="h-4 w-4" />
                {endDate}
              </Button>
              <IconButton
                icon={ChevronRight}
                label={`下一${periodWindowName(timeRange)}`}
                onClick={() => onShiftEndDate(1)}
                size="sm"
              />
            </div>
          )}
          {timeRange !== "all" && (
            <Button disabled={selectedCalendarDate === today} onClick={() => selectDate(today)} size="sm" type="button" variant="secondary">
              今天
            </Button>
          )}
        </div>
      </div>

      {calendarOpen && timeRange !== "all" && (
        <div className="reports-calendar-shell">
          <div className="reports-calendar-header">
            <IconButton
              icon={ChevronLeft}
              label="上个月"
              onClick={() => onDisplayMonthChange(addDisplayMonths(displayMonth, -1))}
              size="sm"
            />
            <div className="reports-calendar-title">
              <CalendarDays className="h-4 w-4" />
              <span>{monthLabel(displayMonth)}</span>
            </div>
            <IconButton
              icon={ChevronRight}
              label="下个月"
              onClick={() => onDisplayMonthChange(addDisplayMonths(displayMonth, 1))}
              size="sm"
            />
            <div className="reports-calendar-month-total">
              <span>本月结算</span>
              <strong>{formatSignedPoints(monthTotal)} 分</strong>
            </div>
            <Button onClick={() => setCalendarOpen(false)} size="sm" type="button" variant="secondary">
              收起
            </Button>
          </div>
          <SettlementCalendar
            dailySummaryByDate={dailySummaryByDate}
            displayMonth={displayMonth}
            onSelectDate={selectDate}
            rangeBounds={rangeBounds}
            selectedDate={selectedCalendarDate}
          />
        </div>
      )}
    </Card>
  );
}

function MobileLeaderboard({ maxPoints, rows }: { maxPoints: number; rows: LeaderboardRow[] }) {
  return (
    <ol className="reports-mobile-leaderboard" aria-label="成员积分排行榜">
      {rows.map((row) => {
        const percentage = Math.max(0, Math.min(100, (row.points / maxPoints) * 100));
        return (
          <li key={row.userId} data-rank={row.rank <= 3 ? row.rank : undefined}>
            <span className="reports-mobile-rank" aria-label={`第 ${row.rank} 名`}>{row.rank}</span>
            <UserAvatar avatarUrl={row.avatarUrl} className="reports-mobile-member-avatar" frame={false} name={row.memberName} />
            <div className="reports-mobile-member-copy">
              <strong>{row.memberName}</strong>
              <span>{row.points.toFixed(1)} 分 · {row.completionRate}% 完成</span>
            </div>
            <RankChange change={row.rankChange} />
            <div className="reports-mobile-progress">
              <ProgressBar value={percentage} />
              <span>相对榜首 {Math.round(percentage)}%</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function SettlementCalendar({
  dailySummaryByDate,
  displayMonth,
  onSelectDate,
  rangeBounds,
  selectedDate,
}: {
  dailySummaryByDate: Map<string, SettlementDaySummary>;
  displayMonth: Date;
  onSelectDate: (date: string) => void;
  rangeBounds: LeaderboardRangeBounds | null;
  selectedDate: string;
}) {
  const cells = buildDateGrid(displayMonth, selectedDate);
  return (
    <div className="reports-calendar-grid" role="grid" aria-label={`${monthLabel(displayMonth)}每日结算分`}>
      {["一", "二", "三", "四", "五", "六", "日"].map((label) => (
        <div className="reports-calendar-weekday" key={label} role="columnheader">
          {label}
        </div>
      ))}
      {cells.map((cell) => {
        const summary = dailySummaryByDate.get(cell.value);
        const hasLedger = Boolean(summary?.count);
        const inActiveRange = Boolean(rangeBounds && cell.value >= rangeBounds.start && cell.value <= rangeBounds.end);
        return (
          <button
            aria-current={cell.isToday ? "date" : undefined}
            aria-label={`${cell.value}${hasLedger ? `，结算 ${formatPlainPoints(summary?.points ?? 0)} 分` : "，无结算积分"}`}
            aria-selected={cell.value === selectedDate}
            className="reports-calendar-day"
            data-has-points={hasLedger}
            data-in-range={inActiveRange}
            data-outside-month={!cell.inMonth}
            data-points-tone={pointsTone(summary?.points ?? 0)}
            data-range-end={rangeBounds?.end === cell.value}
            data-range-start={rangeBounds?.start === cell.value}
            data-selected={cell.value === selectedDate}
            data-today={cell.isToday}
            key={cell.value}
            onClick={() => onSelectDate(cell.value)}
            role="gridcell"
            type="button"
          >
            <span className="reports-calendar-day-number">{cell.day}</span>
            <span className={hasLedger ? "reports-calendar-day-points" : "reports-calendar-day-points reports-calendar-day-points-empty"}>
              {hasLedger ? formatCalendarPoints(summary?.points ?? 0) : ""}
            </span>
          </button>
        );
      })}
    </div>
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
  if (timeRange === "month") return "上一月度窗口";
  if (timeRange === "quarter") return "上一季度窗口";
  if (timeRange === "year") return "上一年度窗口";
  if (timeRange === "custom") return "自定义上一周期";
  return "上一周期";
}

function leaderboardDescription(timeRange: TimeRange, rangeBounds: LeaderboardRangeBounds | null) {
  if (timeRange === "all") {
    return "汇总全部公开积分流水，全部时间不计算排名变化。";
  }
  if (timeRange === "custom") {
    return `${rangeBounds?.start ?? "--"} 至 ${rangeBounds?.end ?? "--"}（含结束日）的积分和完成率；自定义范围不计算排名变化。`;
  }

  return `${rangeBounds?.start ?? "--"} 至 ${rangeBounds?.end ?? "--"}（含结束日）的积分和完成率，并对比${previousRangeLabel(timeRange)}排名。`;
}

function rankChangeSummary(summary: ReturnType<typeof buildReportSummary>, timeRange: TimeRange) {
  if (timeRange === "all") {
    return "全部时间无上一周期";
  }
  if (timeRange === "custom") {
    return "自定义范围无上一周期";
  }

  const parts = [
    summary.upCount > 0 ? `${summary.upCount} 人上升` : "",
    summary.downCount > 0 ? `${summary.downCount} 人下降` : "",
    summary.newCount > 0 ? `${summary.newCount} 人新上榜` : "",
  ].filter(Boolean);

  return parts.length > 0 ? `较${previousRangeLabel(timeRange)}：${parts.join("，")}` : `较${previousRangeLabel(timeRange)}暂无变化`;
}

function periodRangeSummary(timeRange: TimeRange, rangeBounds: LeaderboardRangeBounds | null) {
  if (timeRange === "all") {
    return "全部时间";
  }
  return `${rangeBounds?.start ?? "--"} 至 ${rangeBounds?.end ?? "--"}`;
}

function periodWindowName(timeRange: TimeRange) {
  if (timeRange === "month") return "月度窗口";
  if (timeRange === "quarter") return "季度窗口";
  if (timeRange === "year") return "年度窗口";
  return "窗口";
}

type CustomDateBoundary = "end" | "start";

function defaultCustomRange(endDate: string): LeaderboardDateRange {
  const bounds = buildLeaderboardRangeBounds("month", endDate);
  return {
    end: bounds?.end ?? endDate,
    start: bounds?.start ?? endDate,
  };
}

function reportsDateFromSearch(searchParams: URLSearchParams, fallback: string) {
  const value = searchParams.get("date") ?? "";
  return isDateOnlyString(value) ? value : fallback;
}

function reportsLinkedSettlement(data: ReportsPageData, objectiveId: string, date: string) {
  const objective = data.objectives.find((item) => item.id === objectiveId);
  const ledger = data.pointLedger.filter((entry) => entry.objectiveId === objectiveId && pointLedgerDate(entry) === date);
  return {
    ledgerCount: ledger.length,
    objectiveTitle: objective?.title?.trim() || objectiveId,
    points: ledger.reduce((total, entry) => total + entry.points, 0),
  };
}

function pointLedgerDate(entry: ReportsPageData["pointLedger"][number]) {
  const value = entry.settlementPeriodAt || entry.createdAt;
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

function customRangeWithBoundary(current: LeaderboardDateRange, boundary: CustomDateBoundary, value: string): LeaderboardDateRange {
  if (boundary === "start") {
    return value <= current.end
      ? { ...current, start: value }
      : { end: value, start: current.end };
  }

  return value >= current.start
    ? { ...current, end: value }
    : { end: current.start, start: value };
}

function monthForDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : new Date(parsed.getFullYear(), parsed.getMonth(), 1);
}

function addDisplayMonths(value: Date, amount: number) {
  return new Date(value.getFullYear(), value.getMonth() + amount, 1);
}

function settlementMonthTotal(dailySummaryByDate: Map<string, SettlementDaySummary>, displayMonth: Date) {
  const monthKey = `${displayMonth.getFullYear()}-${String(displayMonth.getMonth() + 1).padStart(2, "0")}`;
  return Array.from(dailySummaryByDate.values())
    .filter((summary) => summary.date.startsWith(monthKey))
    .reduce((total, summary) => total + summary.points, 0);
}

function pointsTone(points: number) {
  if (points > 0) return "positive";
  if (points < 0) return "negative";
  return "zero";
}

function formatPlainPoints(points: number) {
  return points.toFixed(1);
}

function formatSignedPoints(points: number) {
  const prefix = points > 0 ? "+" : "";
  return `${prefix}${formatPlainPoints(points)}`;
}

function formatCalendarPoints(points: number) {
  const prefix = points > 0 ? "+" : points < 0 ? "-" : "";
  const absolute = Math.abs(points);
  if (absolute >= 1000) {
    return `${prefix}${(absolute / 1000).toFixed(absolute >= 10000 ? 0 : 1)}k`;
  }
  return `${prefix}${absolute.toFixed(absolute >= 100 ? 0 : 1)}`;
}
