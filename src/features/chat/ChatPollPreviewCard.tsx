import { clsx } from "clsx";
import { Check, CheckCheck, Circle, LockKeyhole, Users } from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";
import { Button } from "../../components/ui";
import {
  chatPollSelectionModeLabel,
  toggleChatPollSelection,
  type ChatPollPreviewOption,
  type ChatPollSelectionMode,
} from "./chatPollPreviewModel";

type PollResultStyle = CSSProperties & {
  "--orf-chat-poll-result-width": string;
};

type ChatPollPreviewCardProps = {
  mode: ChatPollSelectionMode;
  onClosedChange: (closed: boolean) => void;
  options: readonly ChatPollPreviewOption[];
  question: string;
};

const previewParticipantCount = 18;

export function ChatPollPreviewCard({
  mode,
  onClosedChange,
  options,
  question,
}: ChatPollPreviewCardProps) {
  const [closed, setClosed] = useState(false);
  const [committedSelection, setCommittedSelection] = useState<Set<string>>(new Set());
  const [pendingSelection, setPendingSelection] = useState<Set<string>>(new Set());
  const hasVoted = committedSelection.size > 0;
  const showResults = hasVoted || closed;
  const participantCount = previewParticipantCount + (hasVoted ? 1 : 0);
  const voteRows = useMemo(() => options.map((option) => {
    const voteCount = option.baseVoteCount + (committedSelection.has(option.id) ? 1 : 0);
    return {
      ...option,
      percentage: participantCount > 0 ? Math.round((voteCount / participantCount) * 100) : 0,
      voteCount,
    };
  }), [committedSelection, options, participantCount]);
  const selection = mode === "single" ? committedSelection : pendingSelection;
  const multipleSelectionChanged = mode === "multiple" && !sameSelection(pendingSelection, committedSelection);

  const selectOption = (optionId: string) => {
    if (closed) return;
    if (mode === "single") {
      const nextSelection = toggleChatPollSelection(mode, committedSelection, optionId);
      setCommittedSelection(nextSelection);
      setPendingSelection(nextSelection);
      return;
    }
    setPendingSelection((current) => toggleChatPollSelection(mode, current, optionId));
  };

  const toggleClosed = () => {
    const nextClosed = !closed;
    setClosed(nextClosed);
    onClosedChange(nextClosed);
  };

  return (
    <section className={clsx("orf-chat-poll-card", closed && "is-closed")} aria-label={`投票：${question}`}>
      <header className="orf-chat-poll-card-header">
        <div>
          <span className="orf-chat-poll-card-kicker">
            {closed ? <LockKeyhole className="h-3.5 w-3.5" /> : <CheckCheck className="h-3.5 w-3.5" />}
            {closed ? "投票已结束" : "进行中的投票"}
          </span>
          <h3>{question}</h3>
        </div>
        <span className="orf-chat-poll-mode-badge">{chatPollSelectionModeLabel(mode)}</span>
      </header>

      <div className="orf-chat-poll-options" role={mode === "single" ? "radiogroup" : "group"} aria-label="投票选项">
        {voteRows.map((option) => {
          const selected = selection.has(option.id);
          const committed = committedSelection.has(option.id);
          const resultStyle: PollResultStyle = {
            "--orf-chat-poll-result-width": showResults ? `${option.percentage}%` : "0%",
          };
          return (
            <button
              type="button"
              className={clsx("orf-chat-poll-option", selected && "is-selected", committed && "is-committed")}
              disabled={closed}
              key={option.id}
              onClick={() => selectOption(option.id)}
              role={mode === "single" ? "radio" : "checkbox"}
              aria-checked={selected}
              style={resultStyle}
            >
              <span className="orf-chat-poll-option-result" aria-hidden="true" />
              <span className="orf-chat-poll-option-indicator" aria-hidden="true">
                {selected ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
              </span>
              <span className="orf-chat-poll-option-label">{option.label}</span>
              {showResults && (
                <span className="orf-chat-poll-option-result-label">
                  <strong>{option.percentage}%</strong>
                  <small>{option.voteCount} 票</small>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {mode === "multiple" && !closed && (
        <div className="orf-chat-poll-multiple-submit">
          <span>{pendingSelection.size > 0 ? `已选择 ${pendingSelection.size} 项` : "可选择多个选项"}</span>
          <Button
            type="button"
            size="sm"
            disabled={pendingSelection.size === 0 || !multipleSelectionChanged}
            onClick={() => setCommittedSelection(new Set(pendingSelection))}
          >
            提交选择
          </Button>
        </div>
      )}

      <footer className="orf-chat-poll-card-footer">
        <span><Users className="h-3.5 w-3.5" /> {participantCount} 人参与</span>
        <span>{hasVoted ? "已投票，可修改" : closed ? "结果已公开" : mode === "single" ? "选择后立即生效" : "提交后生效"}</span>
        <button type="button" onClick={toggleClosed}>{closed ? "恢复进行中" : "模拟结束"}</button>
      </footer>
    </section>
  );
}

function sameSelection(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  if (left.size !== right.size) return false;
  for (const item of left) {
    if (!right.has(item)) return false;
  }
  return true;
}
