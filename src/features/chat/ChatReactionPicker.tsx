import { Search } from "lucide-react";
import { type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type RefObject, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChatReactionEmoji } from "./ChatReactionEmoji";
import { chatFloatingLayerRoot } from "./chatFloatingLayer";
import { searchChatReactionOptions } from "./chatReactions";

type ChatReactionPickerProps = {
  anchorRef: RefObject<HTMLElement | null>;
  emptyLabel?: string;
  label?: string;
  onClose: () => void;
  onSelect: (emojiName: string) => void;
  searchPlaceholder?: string;
};

type PopoverPosition = {
  left: number;
  top: number;
};

export function ChatReactionPicker({
  anchorRef,
  emptyLabel = "没有匹配反应",
  label = "添加反应",
  onClose,
  onSelect,
  searchPlaceholder = "搜索反应",
}: ChatReactionPickerProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const options = useMemo(() => searchChatReactionOptions(query), [query]);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const viewportPadding = 8;
    const gap = 6;
    const anchorRect = anchor.getBoundingClientRect();
    const panelRect = panelRef.current?.getBoundingClientRect();
    const panelWidth = panelRect?.width ?? Math.min(280, window.innerWidth - viewportPadding * 2);
    const panelHeight = panelRect?.height ?? 270;
    const rawTopbarHeight = window.getComputedStyle(document.documentElement).getPropertyValue("--orf-topbar-height");
    const topbarHeight = Number.parseFloat(rawTopbarHeight);
    const safeTop = Number.isFinite(topbarHeight) ? topbarHeight + viewportPadding : viewportPadding;
    const aboveTop = anchorRect.top - panelHeight - gap;
    const belowTop = anchorRect.bottom + gap;
    const hasEnoughAbove = aboveTop >= safeTop;
    const hasEnoughBelow = belowTop + panelHeight <= window.innerHeight - viewportPadding;
    const preferredTop = hasEnoughAbove || !hasEnoughBelow ? aboveTop : belowTop;
    const top = Math.max(safeTop, Math.min(preferredTop, window.innerHeight - panelHeight - viewportPadding));
    const left = Math.max(viewportPadding, Math.min(anchorRect.left, window.innerWidth - panelWidth - viewportPadding));
    setPosition({ left, top });
  }, [anchorRef]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    setSelectedIndex((index) => Math.min(index, Math.max(0, options.length - 1)));
  }, [options.length]);

  const moveSelection = (delta: number) => {
    if (options.length === 0) return;
    setSelectedIndex((index) => (index + delta + options.length) % options.length);
  };

  const handlePickerKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      event.stopPropagation();
      moveSelection(1);
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      event.stopPropagation();
      moveSelection(-1);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      moveSelection(6);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      moveSelection(-6);
      return;
    }
    if (event.key === "Enter" && options.length > 0) {
      event.preventDefault();
      event.stopPropagation();
      onSelect(options[selectedIndex]?.emojiName ?? options[0].emojiName);
    }
  };

  useLayoutEffect(() => {
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [updatePosition]);

  useLayoutEffect(() => {
    updatePosition();
  }, [options.length, query, updatePosition]);

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!panelRef.current?.contains(target) && !anchorRef.current?.contains(target)) {
        onClose();
      }
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [anchorRef, onClose]);

  const style: CSSProperties = {
    left: position?.left ?? 0,
    top: position?.top ?? 0,
    visibility: position ? "visible" : "hidden",
  };

  const portalRoot = chatFloatingLayerRoot();
  if (!portalRoot) return null;

  return createPortal(
    <div className="orf-chat-emoji-popover" ref={panelRef} role="dialog" aria-label={label} style={style} onKeyDown={handlePickerKeyDown}>
      <label className="orf-chat-emoji-search">
        <Search className="h-3.5 w-3.5" />
        <input
          ref={inputRef}
          value={query}
          placeholder={searchPlaceholder}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="orf-chat-emoji-grid">
        {options.length > 0 ? (
          options.map((option, index) => (
            <button
              type="button"
              className={selectedIndex === index ? "orf-chat-emoji-option orf-chat-emoji-option-active" : "orf-chat-emoji-option"}
              key={option.emojiName}
              title={option.label}
              aria-label={option.label}
              aria-selected={selectedIndex === index}
              onMouseEnter={() => setSelectedIndex(index)}
              onClick={() => onSelect(option.emojiName)}
            >
              <ChatReactionEmoji decorative emojiName={option.emojiName} size="picker" />
            </button>
          ))
        ) : (
          <div className="orf-chat-emoji-empty">{emptyLabel}</div>
        )}
      </div>
    </div>,
    portalRoot,
  );
}
