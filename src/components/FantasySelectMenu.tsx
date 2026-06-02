import { clsx } from "clsx";
import { Check, ChevronDown } from "lucide-react";
import type { CSSProperties, ReactNode, RefObject } from "react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type FantasySelectOption<Value extends string> = {
  value: Value;
  label: string;
  description?: string;
  disabled?: boolean;
};

type PopoverPosition = {
  left: number;
  maxHeight: number;
  minWidth: number;
  placement: "bottom" | "top";
  top: number;
};

export function FantasySelectMenu<Value extends string>({
  ariaLabel,
  className,
  disabled = false,
  leadingIcon,
  onChange,
  options,
  placeholder = "请选择",
  stopPropagation = false,
  title,
  value,
  variant = "filter",
}: {
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  leadingIcon?: ReactNode;
  onChange: (value: Value) => void;
  options: Array<FantasySelectOption<Value>>;
  placeholder?: string;
  stopPropagation?: boolean;
  title?: string;
  value: Value;
  variant?: "filter" | "chip";
}) {
  const [open, setOpen] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState<PopoverPosition | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  const selected = options.find((option) => option.value === value);
  const selectedLabel = selected?.label ?? placeholder;

  const updatePopoverPosition = () => {
    const trigger = rootRef.current;
    if (!trigger || typeof window === "undefined") return;

    const viewportPadding = 12;
    const popoverGap = 7;
    const triggerRect = trigger.getBoundingClientRect();
    const fallbackWidth = variant === "filter" ? Math.max(triggerRect.width, 144) : 108;
    const popoverWidth = popoverRef.current?.offsetWidth ?? fallbackWidth;
    const fallbackHeight = Math.min(320, Math.max(132, options.length * 32 + 12));
    const popoverHeight = popoverRef.current?.offsetHeight ?? fallbackHeight;
    const belowTop = triggerRect.bottom + popoverGap;
    const belowSpace = window.innerHeight - belowTop - viewportPadding;
    const aboveSpace = triggerRect.top - popoverGap - viewportPadding;
    const placement = belowSpace < Math.min(popoverHeight, 180) && aboveSpace > belowSpace ? "top" : "bottom";
    const maxHeight = Math.max(112, Math.min(320, placement === "top" ? aboveSpace : belowSpace));
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
      if (event.key === "Escape") {
        setOpen(false);
      }
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
  }, [open, options.length, variant]);

  useLayoutEffect(() => {
    if (open) {
      updatePopoverPosition();
    } else {
      setPopoverPosition(null);
    }
  }, [open, options.length, selectedLabel, variant]);

  const selectOption = (option: FantasySelectOption<Value>) => {
    if (option.disabled || disabled) return;
    setOpen(false);
    if (option.value !== value) {
      onChange(option.value);
    }
  };

  return (
    <div
      ref={rootRef}
      className={clsx("orf-fantasy-select-menu", `orf-fantasy-select-menu-${variant}`, open && "orf-fantasy-select-menu-open", disabled && "orf-fantasy-select-menu-disabled", className)}
      data-no-row-edit={stopPropagation ? "true" : undefined}
      onClick={stopPropagation ? (event) => event.stopPropagation() : undefined}
      onDoubleClick={stopPropagation ? (event) => event.stopPropagation() : undefined}
    >
      <button
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className={clsx("orf-fantasy-select-trigger", variant === "filter" && "orf-floating-control")}
        disabled={disabled}
        onClick={() => {
          if (!open) {
            updatePopoverPosition();
          }
          setOpen((current) => !current);
        }}
        title={title}
        type="button"
      >
        {leadingIcon && <span className="orf-fantasy-select-icon" aria-hidden="true">{leadingIcon}</span>}
        <span className="orf-fantasy-select-value">{selectedLabel}</span>
        <ChevronDown className="orf-fantasy-select-chevron" aria-hidden="true" />
      </button>
      <FantasySelectPopover
        ariaLabel={ariaLabel}
        menuId={menuId}
        onSelect={selectOption}
        open={open}
        options={options}
        popoverRef={popoverRef}
        position={popoverPosition}
        value={value}
        variant={variant}
      />
    </div>
  );
}

function FantasySelectPopover<Value extends string>({
  ariaLabel,
  menuId,
  onSelect,
  open,
  options,
  popoverRef,
  position,
  value,
  variant,
}: {
  ariaLabel: string;
  menuId: string;
  onSelect: (option: FantasySelectOption<Value>) => void;
  open: boolean;
  options: Array<FantasySelectOption<Value>>;
  popoverRef: RefObject<HTMLDivElement | null>;
  position: PopoverPosition | null;
  value: Value;
  variant: "filter" | "chip";
}) {
  if (!open || typeof document === "undefined") return null;

  const style: CSSProperties = {
    left: position?.left ?? -9999,
    maxHeight: position?.maxHeight,
    minWidth: position?.minWidth,
    top: position?.top ?? -9999,
  };

  return createPortal(
    <div
      ref={popoverRef}
      id={menuId}
      className={clsx("orf-fantasy-select-popover", `orf-fantasy-select-popover-${variant}`, position?.placement === "top" && "orf-fantasy-select-popover-top")}
      role="listbox"
      aria-label={ariaLabel}
      style={style}
    >
      {options.map((option) => {
        const selectedOption = option.value === value;
        return (
          <button
            key={option.value}
            aria-selected={selectedOption}
            className={clsx("orf-fantasy-select-option", selectedOption && "orf-fantasy-select-option-selected")}
            disabled={option.disabled}
            onClick={() => onSelect(option)}
            role="option"
            type="button"
          >
            <span className="orf-fantasy-select-option-rune" aria-hidden="true" />
            <span className="orf-fantasy-select-option-copy">
              <span className="orf-fantasy-select-option-label">{option.label}</span>
              {option.description && <span className="orf-fantasy-select-option-description">{option.description}</span>}
            </span>
            {selectedOption && <Check className="orf-fantasy-select-option-check" aria-hidden="true" />}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
