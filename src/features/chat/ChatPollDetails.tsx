import { clsx } from "clsx";
import { ListFilter, UserRound, UsersRound, X } from "lucide-react";
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconButton } from "../../components/ui";
import type { ChatPollOption, ChatPollParticipant } from "../../types/orf";

type ChatPollDetailsProps = {
  currentUserId?: string;
  onClose: () => void;
  options: readonly ChatPollOption[];
  participants: readonly ChatPollParticipant[];
};

type ChatPollDetailsView = "option" | "participant";

export function ChatPollDetails({ currentUserId, onClose, options, participants }: ChatPollDetailsProps) {
  const [view, setView] = useState<ChatPollDetailsView>("option");
  const dialogRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const optionTabRef = useRef<HTMLButtonElement | null>(null);
  const participantTabRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(
    typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const titleId = useId();
  const optionTabId = useId();
  const participantTabId = useId();
  const panelId = useId();
  const optionLabels = new Map(options.map((option) => [option.id, option.label]));

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => dialogRef.current?.focus({ preventScroll: true }));
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus({ preventScroll: true });
    };
  }, []);

  const keepFocusInsideDialog = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((element) => element.offsetParent !== null);
    if (focusable.length === 0) {
      event.preventDefault();
      dialogRef.current.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const navigateTabs = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextView = event.key === "ArrowLeft" || event.key === "Home" ? "option" : "participant";
    setView(nextView);
    (nextView === "option" ? optionTabRef : participantTabRef).current?.focus();
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="orf-chat-poll-details-backdrop"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="orf-chat-poll-details"
        aria-labelledby={titleId}
        aria-modal="true"
        onKeyDown={keepFocusInsideDialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="orf-chat-poll-details-header">
          <span>
            <small>非匿名投票</small>
            <strong id={titleId}>投票明细</strong>
          </span>
          <span className="orf-chat-poll-details-summary">{participants.length} 人参与</span>
          <IconButton type="button" icon={X} label="关闭投票明细" onClick={onClose} />
        </header>

        <div
          className="orf-chat-poll-details-tabs"
          role="tablist"
          aria-label="投票明细查看方式"
          onKeyDown={navigateTabs}
        >
          <button
            type="button"
            id={optionTabId}
            role="tab"
            aria-controls={panelId}
            aria-selected={view === "option"}
            className={clsx(view === "option" && "is-active")}
            ref={optionTabRef}
            tabIndex={view === "option" ? 0 : -1}
            onClick={() => setView("option")}
          >
            <ListFilter className="h-3.5 w-3.5" /> 按选项
          </button>
          <button
            type="button"
            id={participantTabId}
            role="tab"
            aria-controls={panelId}
            aria-selected={view === "participant"}
            className={clsx(view === "participant" && "is-active")}
            ref={participantTabRef}
            tabIndex={view === "participant" ? 0 : -1}
            onClick={() => setView("participant")}
          >
            <UsersRound className="h-3.5 w-3.5" /> 按参与人
          </button>
        </div>

        {view === "option" ? (
          <div className="orf-chat-poll-details-list" id={panelId} role="tabpanel" aria-labelledby={optionTabId}>
            {options.map((option) => {
              const voters = participants.filter((participant) => participant.optionIds.includes(option.id));
              return (
                <article className="orf-chat-poll-detail-group" key={option.id}>
                  <header><strong>{option.label}</strong><span>{voters.length} 票</span></header>
                  {voters.length > 0 ? (
                    <div className="orf-chat-poll-voter-list">
                      {voters.map((participant) => <ParticipantIdentity currentUserId={currentUserId} key={participant.userId} participant={participant} />)}
                    </div>
                  ) : <span className="orf-chat-poll-detail-empty">暂无投票</span>}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="orf-chat-poll-participant-list" id={panelId} role="tabpanel" aria-labelledby={participantTabId}>
            {participants.length > 0 ? participants.map((participant) => (
                <article className="orf-chat-poll-participant-row" key={participant.userId}>
                  <ParticipantIdentity currentUserId={currentUserId} participant={participant} />
                  <div className="orf-chat-poll-participant-choices">
                    {participant.optionIds.map((optionId) => {
                      const label = optionLabels.get(optionId);
                      return label ? <span key={optionId}>{label}</span> : null;
                    })}
                  </div>
                </article>
              )) : (
                <div className="orf-chat-poll-details-empty-state">
                  <UsersRound aria-hidden="true" />
                  <strong>没有参与记录</strong>
                  <span>这次投票还没有人提交选择。</span>
                </div>
              )}
          </div>
        )}
      </section>
    </div>,
    document.body,
  );
}

function ParticipantIdentity({ currentUserId, participant }: { currentUserId?: string; participant: ChatPollParticipant }) {
  const current = participant.userId === currentUserId;
  return (
    <span className={clsx("orf-chat-poll-participant", current && "is-current-user")}>
      <span aria-hidden="true">
        {current ? <UserRound className="h-3.5 w-3.5" /> : participant.avatarUrl ? <img alt="" src={participant.avatarUrl} /> : participant.name.slice(0, 1)}
      </span>
      <strong>{current ? `${participant.name}（你）` : participant.name}</strong>
    </span>
  );
}
