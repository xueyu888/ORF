import { clsx } from "clsx";
import type { MouseEvent } from "react";
import { useEffect, useRef, useState } from "react";
import type { ChallengeTarget } from "../model/types";

export function InlineTitleEditor({
  ariaLabel,
  className,
  onDraftChange,
  onCancel,
  onSubmit,
  submitOnBlur = true,
  value,
}: {
  ariaLabel: string;
  className: string;
  onDraftChange?: (value: string) => void;
  onCancel: () => void;
  onSubmit: (value: string) => boolean | void;
  submitOnBlur?: boolean;
  value: string;
}) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const finishedRef = useRef(false);

  useEffect(() => {
    setDraft(value);
    finishedRef.current = false;
  }, [value]);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const commit = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const accepted = onSubmit(draft);
    if (accepted === false) {
      finishedRef.current = false;
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  return (
    <form
      className={clsx("orf-inline-title-editor min-w-0 flex-1", className)}
      data-no-row-edit="true"
      onSubmit={(event) => {
        event.preventDefault();
        commit();
      }}
    >
      <input
        ref={inputRef}
        aria-label={ariaLabel}
        className="orf-inline-title-input"
        onBlur={submitOnBlur ? commit : undefined}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          onDraftChange?.(next);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            finishedRef.current = true;
            onCancel();
          }
        }}
        value={draft}
      />
    </form>
  );
}

export function isSameTarget(left: ChallengeTarget | null, right: ChallengeTarget) {
  if (!left || left.type !== right.type || left.id !== right.id) return false;
  return left.type !== "subAction" || right.type !== "subAction" || left.actionId === right.actionId;
}

export function handleRowDoubleClick(event: MouseEvent<HTMLElement>, target: ChallengeTarget, onEdit: (target: ChallengeTarget) => void) {
  const element = event.target;
  if (!(element instanceof HTMLElement)) return;
  if (element.closest("button,a,input,textarea,select,[role='button'],[data-no-row-edit='true']")) return;
  event.stopPropagation();
  onEdit(target);
}
