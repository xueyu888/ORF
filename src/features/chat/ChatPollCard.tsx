import { clsx } from "clsx";
import { Check, CheckCheck, ChevronRight, Circle, Loader2, LockKeyhole, ShieldCheck, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Button } from "../../components/ui";
import type { ChatMessage } from "../../types/orf";
import { ChatPollDetails } from "./ChatPollDetails";
import {
  chatPollSelectionModeLabel,
  chatPollVisibilityLabel,
  sameChatPollSelection,
  toggleChatPollSelection,
} from "./chatPollModel";

type PollResultStyle = CSSProperties & { "--orf-chat-poll-result-width": string };

type ChatPollCardProps = {
  currentUserId?: string;
  message: ChatMessage;
  onClose: (message: ChatMessage) => Promise<void>;
  onVote: (message: ChatMessage, optionIds: string[]) => Promise<void>;
};

export function ChatPollCard({ currentUserId, message, onClose, onVote }: ChatPollCardProps) {
  const poll = message.poll;
  const [pendingSelection, setPendingSelection] = useState<Set<string>>(() => new Set(poll?.currentUserOptionIds ?? []));
  const synchronizedSelectionRef = useRef<Set<string>>(new Set(poll?.currentUserOptionIds ?? []));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [closeConfirmationOpen, setCloseConfirmationOpen] = useState(false);

  useEffect(() => {
    const nextSelection = new Set(poll?.currentUserOptionIds ?? []);
    if (sameChatPollSelection(synchronizedSelectionRef.current, nextSelection)) return;
    synchronizedSelectionRef.current = nextSelection;
    setPendingSelection(nextSelection);
  }, [poll?.currentUserOptionIds]);

  useEffect(() => {
    if (!poll?.resultsVisible) setDetailsOpen(false);
  }, [poll?.resultsVisible]);

  useEffect(() => {
    if (poll?.closedAt) setCloseConfirmationOpen(false);
  }, [poll?.closedAt]);

  const resultRows = useMemo(() => {
    if (!poll) return [];
    const participantCount = poll.participantCount ?? 0;
    return poll.options.map((option) => ({
      ...option,
      percentage: participantCount > 0 ? Math.round((option.voteCount / participantCount) * 100) : 0,
    }));
  }, [poll]);

  if (!poll) return null;
  const closed = Boolean(poll.closedAt);
  const committedSelection = new Set(poll.currentUserOptionIds);
  const hasVoted = committedSelection.size > 0;
  const selectionChanged = !sameChatPollSelection(pendingSelection, committedSelection);

  const submitSelection = async (optionIds: string[]) => {
    setSubmitting(true);
    setError("");
    try {
      await onVote(message, optionIds);
    } catch (submitError) {
      setPendingSelection(new Set(poll.currentUserOptionIds));
      setError(submitError instanceof Error ? submitError.message : "提交投票失败");
    } finally {
      setSubmitting(false);
    }
  };

  const selectOption = (optionId: string) => {
    if (closed || submitting) return;
    if (poll.selectionMode === "single") {
      const next = new Set([optionId]);
      setPendingSelection(next);
      void submitSelection([optionId]);
      return;
    }
    setPendingSelection((current) => toggleChatPollSelection("multiple", current, optionId));
  };

  const confirmClose = async () => {
    setSubmitting(true);
    setError("");
    try {
      await onClose(message);
    } catch (closeError) {
      setError(closeError instanceof Error ? closeError.message : "结束投票失败");
    } finally {
      setSubmitting(false);
      setCloseConfirmationOpen(false);
    }
  };

  return (
    <section className={clsx("orf-chat-poll-card", closed && "is-closed")} aria-label={`投票：${message.body}`}>
      <header className="orf-chat-poll-card-header">
        <div>
          <span className="orf-chat-poll-card-kicker">
            {closed ? <LockKeyhole className="h-3.5 w-3.5" /> : <CheckCheck className="h-3.5 w-3.5" />}
            {closed ? "投票已结束" : "进行中的投票"}
          </span>
          <h3>{message.body}</h3>
        </div>
        <span className="orf-chat-poll-card-badges">
          <span className="orf-chat-poll-mode-badge">{chatPollSelectionModeLabel(poll.selectionMode)}</span>
          <span className="orf-chat-poll-mode-badge">{chatPollVisibilityLabel(poll.visibility)}</span>
        </span>
      </header>

      <div className="orf-chat-poll-options" role={poll.selectionMode === "single" ? "radiogroup" : "group"} aria-label="投票选项">
        {resultRows.map((option) => {
          const selected = pendingSelection.has(option.id);
          const committed = committedSelection.has(option.id);
          const resultStyle: PollResultStyle = { "--orf-chat-poll-result-width": poll.resultsVisible ? `${option.percentage}%` : "0%" };
          return (
            <button
              type="button"
              className={clsx("orf-chat-poll-option", selected && "is-selected", committed && "is-committed")}
              disabled={closed || submitting}
              key={option.id}
              onClick={() => selectOption(option.id)}
              role={poll.selectionMode === "single" ? "radio" : "checkbox"}
              aria-checked={selected}
              style={resultStyle}
            >
              <span className="orf-chat-poll-option-result" aria-hidden="true" />
              <span className="orf-chat-poll-option-indicator" aria-hidden="true">
                {selected ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
              </span>
              <span className="orf-chat-poll-option-label">{option.label}</span>
              {poll.resultsVisible && (
                <span className="orf-chat-poll-option-result-label"><strong>{option.percentage}%</strong><small>{option.voteCount} 票</small></span>
              )}
            </button>
          );
        })}
      </div>

      {poll.selectionMode === "multiple" && !closed && (
        <div className="orf-chat-poll-multiple-submit">
          <span>{pendingSelection.size > 0 ? `已选择 ${pendingSelection.size} 项` : "至少选择一项"}</span>
          <Button type="button" size="sm" disabled={submitting || pendingSelection.size === 0 || !selectionChanged} onClick={() => void submitSelection(Array.from(pendingSelection))}>
            {submitting ? "提交中" : hasVoted ? "更新选择" : "提交选择"}
          </Button>
        </div>
      )}

      {error && <div className="orf-chat-poll-card-error" role="alert">{error}</div>}

      <footer className="orf-chat-poll-card-footer">
        <div className="orf-chat-poll-card-meta">
          {poll.resultsVisible ? (
            poll.visibility === "named" ? (
              <button type="button" className="orf-chat-poll-details-trigger" aria-expanded={detailsOpen} onClick={() => setDetailsOpen((open) => !open)}>
                <Users className="h-3.5 w-3.5" />{poll.participantCount ?? 0} 人参与<ChevronRight className="h-3 w-3" />
              </button>
            ) : <span><ShieldCheck className="h-3.5 w-3.5" />匿名投票 · {poll.participantCount ?? 0} 人参与</span>
          ) : <span><LockKeyhole className="h-3.5 w-3.5" />提交选择后即可查看实时结果</span>}
          <span className="orf-chat-poll-vote-state">
            {closed ? "最终结果已公开" : hasVoted ? "已投票，可查看结果并修改选择" : "尚未投票"}
          </span>
        </div>
        {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="正在提交" />}
        {poll.canClose && !closeConfirmationOpen && (
          <button type="button" className="orf-chat-poll-close-button" onClick={() => setCloseConfirmationOpen(true)}>结束投票</button>
        )}
      </footer>

      {poll.canClose && closeConfirmationOpen && (
        <div className="orf-chat-poll-close-confirmation" role="alert">
          <span><strong>结束后不能恢复</strong><small>最终结果将向所有频道成员公开。</small></span>
          <div>
            <Button type="button" size="sm" variant="secondary" disabled={submitting} onClick={() => setCloseConfirmationOpen(false)}>取消</Button>
            <Button type="button" size="sm" variant="danger" disabled={submitting} onClick={() => void confirmClose()}>确认结束</Button>
          </div>
        </div>
      )}

      {poll.resultsVisible && poll.visibility === "named" && detailsOpen && poll.participants && (
        <ChatPollDetails currentUserId={currentUserId} onClose={() => setDetailsOpen(false)} options={poll.options} participants={poll.participants} />
      )}
    </section>
  );
}
