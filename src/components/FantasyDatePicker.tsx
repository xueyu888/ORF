import { clsx } from "clsx";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import type { CSSProperties, MouseEvent, ReactNode, RefObject } from "react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { localDateString } from "../utils/date";

type PopoverPosition = {
  left: number;
  maxHeight: number;
  minWidth: number;
  placement: "bottom" | "top";
  top: number;
};

export type FantasyDateCell = {
  date: Date;
  day: number;
  disabled: boolean;
  inMonth: boolean;
  isSelected: boolean;
  isToday: boolean;
  value: string;
};

export function buildFantasyDateGrid(displayMonth: Date, selectedValue: string, minValue?: string): FantasyDateCell[] {
  const monthStart = new Date(displayMonth.getFullYear(), displayMonth.getMonth(), 1);
  const mondayOffset = (monthStart.getDay() + 6) % 7;
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - mondayOffset);
  const todayValue = localDateString(new Date());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const value = localDateString(date);

    return {
      date,
      day: date.getDate(),
      disabled: Boolean(minValue && value < minValue),
      inMonth: date.getMonth() === monthStart.getMonth(),
      isSelected: value === selectedValue,
      isToday: value === todayValue,
      value,
    };
  });
}

export function fantasyMonthLabel(date: Date) {
  return `${date.getFullYear()}年${String(date.getMonth() + 1).padStart(2, "0")}月`;
}

export function FantasyDatePicker({
  ariaLabel,
  children,
  className,
  disabled = false,
  min,
  onChange,
  stopPropagation = false,
  title,
  triggerClassName,
  value,
}: {
  ariaLabel: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  min?: string;
  onChange: (value: string) => void;
  stopPropagation?: boolean;
  title?: string;
  triggerClassName?: string;
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const [displayMonth, setDisplayMonth] = useState(() => monthForValue(value));
  const [popoverPosition, setPopoverPosition] = useState<PopoverPosition | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const dialogId = useId();

  const updatePopoverPosition = () => {
    const trigger = rootRef.current;
    if (!trigger || typeof window === "undefined") return;

    const viewportPadding = 12;
    const popoverGap = 7;
    const triggerRect = trigger.getBoundingClientRect();
    const fallbackWidth = 284;
    const popoverWidth = popoverRef.current?.offsetWidth ?? fallbackWidth;
    const fallbackHeight = 350;
    const popoverHeight = popoverRef.current?.offsetHeight ?? fallbackHeight;
    const belowTop = triggerRect.bottom + popoverGap;
    const belowSpace = window.innerHeight - belowTop - viewportPadding;
    const aboveSpace = triggerRect.top - popoverGap - viewportPadding;
    const placement = belowSpace < Math.min(popoverHeight, 220) && aboveSpace > belowSpace ? "top" : "bottom";
    const maxHeight = Math.max(240, Math.min(360, placement === "top" ? aboveSpace : belowSpace));
    const top = placement === "top"
      ? Math.max(viewportPadding, triggerRect.top - popoverGap - Math.min(popoverHeight, maxHeight))
      : Math.min(belowTop, window.innerHeight - viewportPadding - Math.min(popoverHeight, maxHeight));
    const left = Math.min(
      Math.max(viewportPadding, triggerRect.left),
      Math.max(viewportPadding, window.innerWidth - viewportPadding - popoverWidth),
    );

    setPopoverPosition({
      left,
      maxHeight,
      minWidth: fallbackWidth,
      placement,
      top,
    });
  };

  useEffect(() => {
    if (!open) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!rootRef.current?.contains(target) && !popoverRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const syncPosition = () => updatePopoverPosition();

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", syncPosition);
    window.addEventListener("scroll", syncPosition, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", syncPosition);
      window.removeEventListener("scroll", syncPosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (open) setDisplayMonth(monthForValue(value));
  }, [open, value]);

  useLayoutEffect(() => {
    if (open) {
      updatePopoverPosition();
    } else {
      setPopoverPosition(null);
    }
  }, [displayMonth, open]);

  const openPicker = () => {
    if (disabled) return;
    if (!open) updatePopoverPosition();
    setOpen((current) => !current);
  };

  const selectDate = (nextValue: string) => {
    if (disabled) return;
    setOpen(false);
    if (nextValue !== value) onChange(nextValue);
  };

  const stopEvents = stopPropagation
    ? {
      onClick: (event: MouseEvent) => event.stopPropagation(),
      onDoubleClick: (event: MouseEvent) => event.stopPropagation(),
    }
    : {};

  return (
    <div
      ref={rootRef}
      className={clsx("orf-fantasy-date-picker", open && "orf-fantasy-date-picker-open", className)}
      data-no-row-edit={stopPropagation ? "true" : undefined}
      {...stopEvents}
    >
      <button
        aria-controls={open ? dialogId : undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={ariaLabel}
        className={clsx("orf-fantasy-date-trigger", triggerClassName)}
        disabled={disabled}
        onClick={openPicker}
        role="button"
        title={title}
        type="button"
      >
        {children}
      </button>
      <FantasyDatePopover
        dialogId={dialogId}
        displayMonth={displayMonth}
        min={min}
        onDisplayMonthChange={setDisplayMonth}
        onSelect={selectDate}
        open={open}
        popoverRef={popoverRef}
        position={popoverPosition}
        value={value}
      />
    </div>
  );
}

function FantasyDatePopover({
  dialogId,
  displayMonth,
  min,
  onDisplayMonthChange,
  onSelect,
  open,
  popoverRef,
  position,
  value,
}: {
  dialogId: string;
  displayMonth: Date;
  min?: string;
  onDisplayMonthChange: (date: Date) => void;
  onSelect: (value: string) => void;
  open: boolean;
  popoverRef: RefObject<HTMLDivElement | null>;
  position: PopoverPosition | null;
  value: string;
}) {
  if (!open || typeof document === "undefined") return null;

  const cells = buildFantasyDateGrid(displayMonth, value, min);
  const todayValue = localDateString(new Date());
  const todayDisabled = Boolean(min && todayValue < min);
  const style: CSSProperties = {
    left: position?.left ?? -9999,
    maxHeight: position?.maxHeight,
    minWidth: position?.minWidth,
    top: position?.top ?? -9999,
  };

  return createPortal(
    <div
      ref={popoverRef}
      aria-label="选择目标截止日期"
      className={clsx("orf-fantasy-date-popover", position?.placement === "top" && "orf-fantasy-date-popover-top")}
      id={dialogId}
      role="dialog"
      style={style}
    >
      <div className="orf-fantasy-date-header">
        <button
          aria-label="上个月"
          className="orf-fantasy-date-nav"
          onClick={() => onDisplayMonthChange(addMonths(displayMonth, -1))}
          type="button"
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        <div className="orf-fantasy-date-title">
          <CalendarDays aria-hidden="true" />
          <span>{fantasyMonthLabel(displayMonth)}</span>
        </div>
        <button
          aria-label="下个月"
          className="orf-fantasy-date-nav"
          onClick={() => onDisplayMonthChange(addMonths(displayMonth, 1))}
          type="button"
        >
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
      <div className="orf-fantasy-date-weekdays" aria-hidden="true">
        {["一", "二", "三", "四", "五", "六", "日"].map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="orf-fantasy-date-grid" role="grid" aria-label={fantasyMonthLabel(displayMonth)}>
        {cells.map((cell) => (
          <button
            key={cell.value}
            aria-current={cell.isToday ? "date" : undefined}
            aria-label={`${cell.value}${cell.disabled ? "，不可选择" : ""}`}
            aria-selected={cell.isSelected}
            className={clsx(
              "orf-fantasy-date-day",
              !cell.inMonth && "orf-fantasy-date-day-outside",
              cell.isToday && "orf-fantasy-date-day-today",
              cell.isSelected && "orf-fantasy-date-day-selected",
            )}
            disabled={cell.disabled}
            onClick={() => onSelect(cell.value)}
            role="gridcell"
            type="button"
          >
            {cell.day}
          </button>
        ))}
      </div>
      <div className="orf-fantasy-date-footer">
        <button
          className="orf-fantasy-date-today"
          disabled={todayDisabled}
          onClick={() => {
            onDisplayMonthChange(monthForValue(todayValue));
            onSelect(todayValue);
          }}
          type="button"
        >
          今天
        </button>
      </div>
    </div>,
    document.body,
  );
}

function addMonths(value: Date, amount: number) {
  return new Date(value.getFullYear(), value.getMonth() + amount, 1);
}

function monthForValue(value: string) {
  const parsed = parseDateOnly(value);
  return new Date(parsed.getFullYear(), parsed.getMonth(), 1);
}

function parseDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return new Date();

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}
