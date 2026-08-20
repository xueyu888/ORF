import { clsx } from "clsx";
import { ListFilter, UserRound, UsersRound, X } from "lucide-react";
import { useState } from "react";
import { IconButton } from "../../components/ui";
import type { ChatPollPreviewOption, ChatPollPreviewParticipant } from "./chatPollPreviewModel";

type ChatPollDetailsPreviewProps = {
  onClose: () => void;
  options: readonly ChatPollPreviewOption[];
  participants: readonly ChatPollPreviewParticipant[];
};

type ChatPollDetailsView = "option" | "participant";

export function ChatPollDetailsPreview({ onClose, options, participants }: ChatPollDetailsPreviewProps) {
  const [view, setView] = useState<ChatPollDetailsView>("option");
  const optionLabels = new Map(options.map((option) => [option.id, option.label]));

  return (
    <section className="orf-chat-poll-details" aria-labelledby="orf-chat-poll-details-title">
      <header className="orf-chat-poll-details-header">
        <span>
          <strong id="orf-chat-poll-details-title">投票明细</strong>
          <small>共 {participants.length} 人参与</small>
        </span>
        <IconButton type="button" icon={X} label="关闭投票明细" onClick={onClose} />
      </header>

      <div className="orf-chat-poll-details-tabs" role="tablist" aria-label="投票明细查看方式">
        <button
          type="button"
          role="tab"
          aria-selected={view === "option"}
          className={clsx(view === "option" && "is-active")}
          onClick={() => setView("option")}
        >
          <ListFilter className="h-3.5 w-3.5" /> 按选项
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "participant"}
          className={clsx(view === "participant" && "is-active")}
          onClick={() => setView("participant")}
        >
          <UsersRound className="h-3.5 w-3.5" /> 按参与人
        </button>
      </div>

      {view === "option" ? (
        <div className="orf-chat-poll-details-list" role="tabpanel">
          {options.map((option) => {
            const voters = participants.filter((participant) => participant.optionIds.includes(option.id));
            return (
              <article className="orf-chat-poll-detail-group" key={option.id}>
                <header><strong>{option.label}</strong><span>{voters.length} 票</span></header>
                {voters.length > 0 ? (
                  <div className="orf-chat-poll-voter-list">
                    {voters.map((participant) => <ParticipantIdentity key={participant.id} participant={participant} />)}
                  </div>
                ) : (
                  <span className="orf-chat-poll-detail-empty">暂无投票</span>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="orf-chat-poll-participant-list" role="tabpanel">
          {participants.map((participant) => (
            <article className="orf-chat-poll-participant-row" key={participant.id}>
              <ParticipantIdentity participant={participant} />
              <span>{participant.optionIds.map((optionId) => optionLabels.get(optionId)).filter(Boolean).join("、")}</span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ParticipantIdentity({ participant }: { participant: ChatPollPreviewParticipant }) {
  return (
    <span className={clsx("orf-chat-poll-participant", participant.isCurrentUser && "is-current-user")}>
      <span aria-hidden="true">{participant.isCurrentUser ? <UserRound className="h-3.5 w-3.5" /> : participant.avatarLabel}</span>
      <strong>{participant.name}</strong>
    </span>
  );
}
