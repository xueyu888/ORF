import { Search } from "lucide-react";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { searchChatReactionOptions } from "./chatReactions";

type ChatReactionPickerProps = {
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onSelect: (emojiName: string) => void;
};

export function ChatReactionPicker({ anchorRef, onClose, onSelect }: ChatReactionPickerProps) {
  const [query, setQuery] = useState("");
  const panelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const options = useMemo(() => searchChatReactionOptions(query), [query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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

  return (
    <div className="orf-chat-emoji-popover" ref={panelRef} role="dialog" aria-label="添加反应">
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
    </div>
  );
}
