import { clsx } from "clsx";
import { BarChart3, CircleDot, ListChecks, Plus, ShieldCheck, UsersRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, IconButton } from "../../components/ui";
import { CHAT_POLL_INPUT_CONTRACT } from "../../domain/chatPollContract";
import {
  addChatPollDraftOption,
  chatPollDraftValidationMessage,
  createInitialChatPollDraft,
  removeChatPollDraftOption,
  toChatPollCreateInput,
  updateChatPollDraftOption,
  type ChatPollCreateInput,
  type ChatPollDraft,
} from "./chatPollModel";

type ChatPollComposerProps = {
  onClose: () => void;
  onCreate: (input: ChatPollCreateInput) => Promise<void>;
};

export function ChatPollComposer({ onClose, onCreate }: ChatPollComposerProps) {
  const [draft, setDraft] = useState<ChatPollDraft>(createInitialChatPollDraft);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const questionRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    questionRef.current?.focus();
  }, []);

  const submit = async () => {
    const validationMessage = chatPollDraftValidationMessage(draft);
    const input = toChatPollCreateInput(draft);
    if (validationMessage || !input) {
      setError(validationMessage ?? "投票内容无效");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await onCreate(input);
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "创建投票失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="orf-chat-poll-composer-backdrop"
        aria-label="关闭创建投票"
        onClick={submitting ? undefined : onClose}
        tabIndex={-1}
      />
      <section
        className="orf-chat-poll-composer-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="orf-chat-poll-composer-title"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !submitting) onClose();
        }}
      >
        <header className="orf-chat-poll-composer-header">
          <div className="orf-chat-poll-composer-title">
            <span className="orf-chat-poll-composer-icon" aria-hidden="true"><BarChart3 /></span>
            <span>
              <strong id="orf-chat-poll-composer-title">创建投票</strong>
              <small>提交前隐藏结果，投票后即可查看实时结果</small>
            </span>
          </div>
          <IconButton type="button" icon={X} label="关闭创建投票" disabled={submitting} onClick={onClose} />
        </header>

        <div className="orf-chat-poll-compose-body">
          <label className="orf-chat-poll-question-field">
            <span>投票问题</span>
            <input
              ref={questionRef}
              type="text"
              maxLength={CHAT_POLL_INPUT_CONTRACT.maximumQuestionLength}
              value={draft.question}
              placeholder="想让大家决定什么？"
              onChange={(event) => setDraft((current) => ({ ...current, question: event.target.value }))}
            />
            <small>{draft.question.length}/{CHAT_POLL_INPUT_CONTRACT.maximumQuestionLength}</small>
          </label>

          <div className="orf-chat-poll-settings-column">
            <fieldset className="orf-chat-poll-mode-field">
              <legend>选择方式</legend>
              <div className="orf-chat-poll-choice-switch">
                <button
                  type="button"
                  className={clsx(draft.selectionMode === "single" && "is-active")}
                  aria-pressed={draft.selectionMode === "single"}
                  onClick={() => setDraft((current) => ({ ...current, selectionMode: "single" }))}
                >
                  <CircleDot className="h-4 w-4" />
                  <span><strong>单选</strong><small>每人选择一项</small></span>
                </button>
                <button
                  type="button"
                  className={clsx(draft.selectionMode === "multiple" && "is-active")}
                  aria-pressed={draft.selectionMode === "multiple"}
                  onClick={() => setDraft((current) => ({ ...current, selectionMode: "multiple" }))}
                >
                  <ListChecks className="h-4 w-4" />
                  <span><strong>多选</strong><small>每人可选择多项</small></span>
                </button>
              </div>
            </fieldset>

            <fieldset className="orf-chat-poll-visibility-field">
              <legend>结果可见性</legend>
              <div className="orf-chat-poll-choice-switch">
                <button
                  type="button"
                  className={clsx(draft.visibility === "named" && "is-active")}
                  aria-pressed={draft.visibility === "named"}
                  onClick={() => setDraft((current) => ({ ...current, visibility: "named" }))}
                >
                  <UsersRound className="h-4 w-4" />
                  <span><strong>非匿名</strong><small>投票后可查看人员明细</small></span>
                </button>
                <button
                  type="button"
                  className={clsx(draft.visibility === "anonymous" && "is-active")}
                  aria-pressed={draft.visibility === "anonymous"}
                  onClick={() => setDraft((current) => ({ ...current, visibility: "anonymous" }))}
                >
                  <ShieldCheck className="h-4 w-4" />
                  <span><strong>匿名</strong><small>结束后也不显示人员</small></span>
                </button>
              </div>
            </fieldset>
          </div>

          <fieldset className="orf-chat-poll-options-field">
            <legend>选项</legend>
            <div className="orf-chat-poll-draft-options">
              {draft.options.map((option, index) => (
                <label className="orf-chat-poll-draft-option" key={option.id}>
                  <span>{index + 1}</span>
                  <input
                    type="text"
                    maxLength={80}
                    value={option.label}
                    placeholder={`选项 ${index + 1}`}
                    aria-label={`选项 ${index + 1}`}
                    onChange={(event) => setDraft((current) => updateChatPollDraftOption(current, option.id, event.target.value))}
                  />
                  <IconButton
                    type="button"
                    icon={X}
                    label={`删除选项 ${index + 1}`}
                    disabled={draft.options.length <= CHAT_POLL_INPUT_CONTRACT.minimumOptionCount}
                    onClick={() => setDraft((current) => removeChatPollDraftOption(current, option.id))}
                  />
                </label>
              ))}
            </div>
            <button
              type="button"
              className="orf-chat-poll-add-option"
              disabled={draft.options.length >= CHAT_POLL_INPUT_CONTRACT.maximumOptionCount}
              onClick={() => setDraft(addChatPollDraftOption)}
            >
              <Plus className="h-4 w-4" />
              添加选项
              <small>{draft.options.length}/{CHAT_POLL_INPUT_CONTRACT.maximumOptionCount}</small>
            </button>
          </fieldset>

          {error && <div className="orf-chat-poll-validation" role="alert">{error}</div>}
        </div>

        <footer className="orf-chat-poll-composer-footer">
          <span>创建后，频道成员可在投票结束前提交或修改自己的选择。</span>
          <div>
            <Button type="button" size="sm" variant="secondary" disabled={submitting} onClick={onClose}>取消</Button>
            <Button type="button" size="sm" disabled={submitting} onClick={() => void submit()}>
              {submitting ? "创建中" : "创建投票"}
            </Button>
          </div>
        </footer>
      </section>
    </>
  );
}
