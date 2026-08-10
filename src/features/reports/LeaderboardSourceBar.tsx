import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { LeaderboardPointSource } from "../../domain/reportsLeaderboard";

type DisplayPointSource = LeaderboardPointSource & {
  tone: string;
};

type SourceTooltip = {
  pinned: boolean;
  rect: DOMRect;
  source: DisplayPointSource;
};

export function LeaderboardSourceBar({
  maxPoints,
  pointSources,
  points,
}: {
  maxPoints: number;
  pointSources: LeaderboardPointSource[];
  points: number;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const tooltipId = useId();
  const [tooltip, setTooltip] = useState<SourceTooltip | null>(null);
  const sources = useMemo(() => displayPointSources(pointSources), [pointSources]);
  const fillPercentage = maxPoints > 0 ? Math.max(0, Math.min(100, (points / maxPoints) * 100)) : 0;
  const visibleFillPercentage = sources.length > 0 ? Math.max(fillPercentage, points > 0 ? 7 : 12) : 0;

  useEffect(() => {
    if (!tooltip?.pinned) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setTooltip(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTooltip(null);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [tooltip?.pinned]);

  useEffect(() => {
    if (!tooltip) return;
    const close = () => setTooltip(null);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [tooltip]);

  const showTooltip = (source: DisplayPointSource, target: HTMLButtonElement, pinned: boolean) => {
    setTooltip({ pinned, rect: target.getBoundingClientRect(), source });
  };

  return (
    <div className="reports-source-bar-wrap" ref={rootRef}>
      <div
        aria-label={`积分 ${formatPlainPoints(points)}，共 ${pointSources.length} 个目标来源`}
        className="reports-source-bar"
        role="img"
      >
        <div
          className="reports-source-bar-fill"
          style={{ "--reports-source-fill": `${visibleFillPercentage}%` } as CSSProperties}
        >
          {sources.map((source) => (
            <button
              aria-describedby={tooltip?.source.objectiveId === source.objectiveId ? tooltipId : undefined}
              aria-label={`${source.objectiveTitle}，${formatSignedPoints(source.points)} 积分`}
              className="reports-source-segment"
              data-active={tooltip?.source.objectiveId === source.objectiveId}
              data-tone={source.tone}
              key={source.objectiveId}
              onBlur={() => setTooltip((current) => current?.pinned ? current : null)}
              onClick={(event) => {
                event.stopPropagation();
                const alreadyPinned = tooltip?.pinned && tooltip.source.objectiveId === source.objectiveId;
                setTooltip(alreadyPinned ? null : { pinned: true, rect: event.currentTarget.getBoundingClientRect(), source });
              }}
              onFocus={(event) => showTooltip(source, event.currentTarget, false)}
              onMouseEnter={(event) => {
                if (!tooltip?.pinned) showTooltip(source, event.currentTarget, false);
              }}
              onMouseLeave={() => setTooltip((current) => current?.pinned ? current : null)}
              style={{ flexGrow: Math.max(0.6, Math.abs(source.points)) }}
              type="button"
            />
          ))}
        </div>
      </div>
      {tooltip && createPortal(
        <PointSourceTooltip id={tooltipId} tooltip={tooltip} />,
        document.body,
      )}
    </div>
  );
}

function PointSourceTooltip({ id, tooltip }: { id: string; tooltip: SourceTooltip }) {
  const placeAbove = tooltip.rect.top > 142;
  const tooltipWidth = Math.min(288, Math.max(228, window.innerWidth - 24));
  const left = Math.max(12, Math.min(window.innerWidth - tooltipWidth - 12, tooltip.rect.left + tooltip.rect.width / 2 - tooltipWidth / 2));
  const top = placeAbove ? tooltip.rect.top - 10 : tooltip.rect.bottom + 10;
  return (
    <div
      className="reports-source-tooltip"
      data-placement={placeAbove ? "above" : "below"}
      data-tone={tooltip.source.tone}
      id={id}
      role="tooltip"
      style={{ left, top, width: tooltipWidth }}
    >
      <div className="reports-source-tooltip-heading">
        <span className="reports-source-tooltip-swatch" />
        <strong>{tooltip.source.objectiveTitle}</strong>
      </div>
      <p>
        {tooltip.source.primaryReason}
        {tooltip.source.reasonCount > 1 ? `等 ${tooltip.source.reasonCount} 类说明` : ""}
      </p>
      <div className="reports-source-tooltip-meta">
        <strong>{formatSignedPoints(tooltip.source.points)} 积分</strong>
        <span>{tooltip.source.entryCount} 条结算 · {formatSettlementDate(tooltip.source.latestSettlementAt)}</span>
      </div>
    </div>
  );
}

function displayPointSources(pointSources: LeaderboardPointSource[]): DisplayPointSource[] {
  const sorted = pointSources
    .filter((source) => source.points !== 0)
    .map((source) => ({ ...source, tone: source.points < 0 ? "negative" : sourceTone(source.objectiveId) }))
    .sort((left, right) => Math.abs(right.points) - Math.abs(left.points));
  if (sorted.length <= 6) return sorted;

  const visible = sorted.slice(0, 5);
  const remainder = sorted.slice(5);
  const remainderPoints = remainder.reduce((total, source) => total + source.points, 0);
  return [
    ...visible,
    {
      entryCount: remainder.reduce((total, source) => total + source.entryCount, 0),
      latestSettlementAt: remainder.map((source) => source.latestSettlementAt).sort().at(-1) ?? "",
      objectiveId: "__other_sources__",
      objectiveTitle: `其他 ${remainder.length} 个目标`,
      points: remainderPoints,
      primaryReason: "合并显示较小的积分来源",
      reasonCount: remainder.reduce((total, source) => total + source.reasonCount, 0),
      tone: remainderPoints < 0 ? "negative" : "other",
    },
  ];
}

function sourceTone(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  return String(hash % 5);
}

function formatSettlementDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${Number(match[2])} 月 ${Number(match[3])} 日` : "日期未知";
}

function formatPlainPoints(points: number) {
  return points.toFixed(1);
}

function formatSignedPoints(points: number) {
  return `${points > 0 ? "+" : ""}${formatPlainPoints(points)}`;
}
