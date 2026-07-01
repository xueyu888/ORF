import { clsx } from "clsx";
import { Check, ChevronDown, Search } from "lucide-react";
import type { CSSProperties, ReactNode, RefObject } from "react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type FantasySelectOption<Value extends string> = {
  value: Value;
  label: string;
  description?: string;
  disabled?: boolean;
  alwaysVisible?: boolean;
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
  onSearchQueryChange,
  options,
  placeholder = "请选择",
  searchable = false,
  searchPlaceholder = "搜索选项",
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
  onSearchQueryChange?: (query: string) => void;
  options: Array<FantasySelectOption<Value>>;
  placeholder?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  stopPropagation?: boolean;
  title?: string;
  value: Value;
  variant?: "filter" | "chip";
}) {
  const [open, setOpen] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState<PopoverPosition | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const menuId = useId();
  const selected = options.find((option) => option.value === value);
  const selectedLabel = selected?.label ?? placeholder;
  const visibleOptions = searchable ? filterFantasySelectOptions(options, searchQuery) : options;

  const updateSearchQuery = useCallback((query: string) => {
    setSearchQuery(query);
    onSearchQueryChange?.(query);
  }, [onSearchQueryChange]);

  const updatePopoverPosition = () => {
    const trigger = rootRef.current;
    if (!trigger || typeof window === "undefined") return;

    const viewportPadding = 12;
    const popoverGap = 7;
    const triggerRect = trigger.getBoundingClientRect();
    const fallbackWidth = searchable ? Math.max(triggerRect.width, 188) : variant === "filter" ? Math.max(triggerRect.width, 144) : 108;
    const popoverWidth = popoverRef.current?.offsetWidth ?? fallbackWidth;
    const searchHeight = searchable ? 46 : 0;
    const fallbackHeight = Math.min(360, Math.max(132, options.length * 32 + 12 + searchHeight));
    const popoverHeight = popoverRef.current?.offsetHeight ?? fallbackHeight;
    const belowTop = triggerRect.bottom + popoverGap;
    const belowSpace = window.innerHeight - belowTop - viewportPadding;
    const aboveSpace = triggerRect.top - popoverGap - viewportPadding;
    const placement = belowSpace < Math.min(popoverHeight, 180) && aboveSpace > belowSpace ? "top" : "bottom";
    const maxHeight = Math.max(searchable ? 156 : 112, Math.min(searchable ? 360 : 320, placement === "top" ? aboveSpace : belowSpace));
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
  }, [open, options.length, searchable, variant]);

  useEffect(() => {
    if (!open && searchQuery) {
      updateSearchQuery("");
    }
  }, [open, searchQuery, updateSearchQuery]);

  useEffect(() => {
    if (!open || !searchable) return;
    window.requestAnimationFrame(() => searchInputRef.current?.focus());
  }, [open, searchable]);

  useLayoutEffect(() => {
    if (open) {
      updatePopoverPosition();
    } else {
      setPopoverPosition(null);
    }
  }, [open, searchable, searchQuery, selectedLabel, variant, visibleOptions.length]);

  const selectOption = useCallback((option: FantasySelectOption<Value>) => {
    if (option.disabled || disabled) return;
    updateSearchQuery("");
    setOpen(false);
    if (option.value !== value) {
      onChange(option.value);
    }
  }, [disabled, onChange, updateSearchQuery, value]);

  const setPopoverElement = useCallback(
    (node: HTMLDivElement | null) => {
      popoverRef.current = node;
    },
    [],
  );

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
        onSearchQueryChange={updateSearchQuery}
        open={open}
        options={options}
        popoverRef={setPopoverElement}
        position={popoverPosition}
        searchable={searchable}
        searchInputRef={searchInputRef}
        searchPlaceholder={searchPlaceholder}
        searchQuery={searchQuery}
        value={value}
        visibleOptions={visibleOptions}
        variant={variant}
      />
    </div>
  );
}

export function filterFantasySelectOptions<Value extends string>(options: Array<FantasySelectOption<Value>>, query: string) {
  const normalizedQuery = normalizeFantasySelectSearchText(query);
  if (!normalizedQuery) return options;
  return options.filter((option) => option.alwaysVisible || fantasySelectOptionMatchesSearch(option, normalizedQuery));
}

export function hasFantasySelectOptionSearchMatch<Value extends string>(options: Array<FantasySelectOption<Value>>, query: string) {
  const normalizedQuery = normalizeFantasySelectSearchText(query);
  return !normalizedQuery || options.some((option) => fantasySelectOptionMatchesSearch(option, normalizedQuery));
}

function fantasySelectOptionMatchesSearch<Value extends string>(option: FantasySelectOption<Value>, normalizedQuery: string) {
  return [option.label, option.description, option.value].some((value) => normalizeFantasySelectSearchText(value ?? "").includes(normalizedQuery));
}

function normalizeFantasySelectSearchText(value: string) {
  return value.trim().toLocaleLowerCase();
}

function FantasySelectPopover<Value extends string>({
  ariaLabel,
  menuId,
  onSelect,
  onSearchQueryChange,
  open,
  options,
  popoverRef,
  position,
  searchable,
  searchInputRef,
  searchPlaceholder,
  searchQuery,
  value,
  visibleOptions,
  variant,
}: {
  ariaLabel: string;
  menuId: string;
  onSelect: (option: FantasySelectOption<Value>) => void;
  onSearchQueryChange: (query: string) => void;
  open: boolean;
  options: Array<FantasySelectOption<Value>>;
  popoverRef: (node: HTMLDivElement | null) => void;
  position: PopoverPosition | null;
  searchable: boolean;
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchPlaceholder: string;
  searchQuery: string;
  value: Value;
  visibleOptions: Array<FantasySelectOption<Value>>;
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
      className={clsx(
        "orf-fantasy-select-popover",
        `orf-fantasy-select-popover-${variant}`,
        searchable && "orf-fantasy-select-popover-searchable",
        position?.placement === "top" && "orf-fantasy-select-popover-top",
      )}
      style={style}
    >
      {searchable && (
        <label className="orf-fantasy-select-search">
          <Search className="h-4 w-4" aria-hidden="true" />
          <input
            ref={searchInputRef}
            aria-label={`搜索${ariaLabel}`}
            autoComplete="off"
            placeholder={searchPlaceholder}
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onSearchQueryChange("");
              }
            }}
          />
        </label>
      )}
      <div className="orf-fantasy-select-options" role="listbox" aria-label={ariaLabel}>
        {visibleOptions.map((option) => {
          const selectedOption = option.value === value;
          return (
            <button
              key={option.value}
              aria-selected={selectedOption}
              className={clsx("orf-fantasy-select-option", selectedOption && "orf-fantasy-select-option-selected")}
              data-fantasy-select-option-value={option.value}
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
        {searchable && !hasFantasySelectOptionSearchMatch(options, searchQuery) && <div className="orf-fantasy-select-empty">没有匹配项</div>}
      </div>
    </div>,
    document.body,
  );
}
