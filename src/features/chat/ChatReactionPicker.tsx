import { Search } from "lucide-react";
import { type CSSProperties, type RefObject, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { searchChatReactionOptions } from "./chatReactions";

type ChatReactionPickerProps = {
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onSelect: (emojiName: string) => void;
};

type PopoverPosition = {
  left: number;
  top: number;
};

export function ChatReactionPicker({ anchorRef, onClose, onSelect }: ChatReactionPickerProps) {
  const [query, setQuery] = useState("");
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
    const closeOnEscape = (event: KeyboardEvent) => {
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

  return createPortal(
    <div className="orf-chat-emoji-popover" ref={panelRef} role="dialog" aria-label="添加反应" style={style}>
      <label className="orf-chat-emoji-search">
        <Search className="h-3.5 w-3.5" />
        <input
          ref={inputRef}
          value={query}
          placeholder="搜索反应"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="orf-chat-emoji-grid">
        {options.length > 0 ? (
          options.map((option) => (
            <button
              type="button"
              className="orf-chat-emoji-option"
              key={option.emojiName}
              title={option.label}
              aria-label={option.label}
              onClick={() => onSelect(option.emojiName)}
            >
              {option.symbol}
            </button>
          ))
        ) : (
          <div className="orf-chat-emoji-empty">没有匹配反应</div>
        )}
      </div>
    </div>,
    document.body,
  );
}
