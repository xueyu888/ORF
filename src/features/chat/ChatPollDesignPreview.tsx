import { clsx } from "clsx";
import {
  BarChart3,
  CheckCircle2,
  CircleDot,
  Eye,
  ListChecks,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, IconButton } from "../../components/ui";
import { ChatPollPreviewCard } from "./ChatPollPreviewCard";
import {
  chatPollDraftValidationMessage,
  chatPollMaximumOptionCount,
  chatPollMinimumOptionCount,
  createInitialChatPollDraft,
  toChatPollPreviewOptions,
  type ChatPollDraft,
  type ChatPollSelectionMode,
} from "./chatPollPreviewModel";

type ChatPollDesignPreviewProps = {
  onClose: () => void;
};

export function ChatPollDesignPreview({ onClose }: ChatPollDesignPreviewProps) {
  const [draft, setDraft] = useState<ChatPollDraft>(createInitialChatPollDraft);
  const [screen, setScreen] = useState<"compose" | "message">("compose");
  const [validationMessage, setValidationMessage] = useState("");
  const [closed, setClosed] = useState(false);
  const nextOptionIdRef = useRef(draft.options.length + 1);
  const questionRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    questionRef.current?.focus();
  }, []);

  const updateMode = (mode: ChatPollSelectionMode) => {
    setDraft((current) => ({ ...current, mode }));
  };

  const updateOption = (optionId: string, label: string) => {
    setDraft((current) => ({
      ...current,
      options: current.options.map((option) => option.id === optionId ? { ...option, label } : option),
    }));
  };

  const removeOption = (optionId: string) => {
    setDraft((current) => {
      if (current.options.length <= chatPollMinimumOptionCount) return current;
      return { ...current, options: current.options.filter((option) => option.id !== optionId) };
    });
  };

  const addOption = () => {
    setDraft((current) => {
      if (current.options.length >= chatPollMaximumOptionCount) return current;
      const optionNumber = nextOptionIdRef.current;
      nextOptionIdRef.current += 1;
      return {
        ...current,
        options: [...current.options, { id: `poll-option-${optionNumber}`, label: "" }],
      };
    });
  };

  const showMessagePreview = () => {
    const message = chatPollDraftValidationMessage(draft);
    if (message) {
      setValidationMessage(message);
      return;
    }
    setValidationMessage("");
    setClosed(false);
    setScreen("message");
  };

  const resetDraft = () => {
    const nextDraft = createInitialChatPollDraft();
    setDraft(nextDraft);
    nextOptionIdRef.current = nextDraft.options.length + 1;
    setValidationMessage("");
    setClosed(false);
    setScreen("compose");
    window.setTimeout(() => questionRef.current?.focus(), 0);
  };

  return (
    <>
      <button
        type="button"
        className="orf-chat-poll-preview-backdrop"
        aria-label="关闭投票界面预览"
        onClick={onClose}
        tabIndex={-1}
      />
      <section
        className="orf-chat-poll-design-preview"
        role="dialog"
        aria-labelledby="orf-chat-poll-preview-title"
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <header className="orf-chat-poll-preview-header">
          <div className="orf-chat-poll-preview-title">
            <span className="orf-chat-poll-preview-icon" aria-hidden="true"><BarChart3 /></span>
            <span>
              <strong id="orf-chat-poll-preview-title">创建投票</strong>
              <small>{screen === "compose" ? "编辑问题与选项" : "查看消息中的实际效果"}</small>
            </span>
            <em>界面预览</em>
          </div>
          <IconButton type="button" icon={X} label="关闭投票界面预览" onClick={onClose} />
        </header>

        {screen === "compose" ? (
          <div className="orf-chat-poll-compose-body">
            <label className="orf-chat-poll-question-field">
              <span>投票问题</span>
              <input
                ref={questionRef}
                type="text"
                maxLength={120}
                value={draft.question}
                placeholder="想让大家决定什么？"
                onChange={(event) => setDraft((current) => ({ ...current, question: event.target.value }))}
              />
              <small>{draft.question.length}/120</small>
            </label>

            <fieldset className="orf-chat-poll-mode-field">
              <legend>选择方式</legend>
              <div className="orf-chat-poll-mode-switch">
                <button
                  type="button"
                  className={clsx(draft.mode === "single" && "is-active")}
                  aria-pressed={draft.mode === "single"}
                  onClick={() => updateMode("single")}
                >
                  <CircleDot className="h-4 w-4" />
                  <span><strong>单选</strong><small>每人选择一项</small></span>
                </button>
                <button
                  type="button"
                  className={clsx(draft.mode === "multiple" && "is-active")}
                  aria-pressed={draft.mode === "multiple"}
                  onClick={() => updateMode("multiple")}
                >
                  <ListChecks className="h-4 w-4" />
                  <span><strong>多选</strong><small>每人可选择多项</small></span>
                </button>
              </div>
            </fieldset>

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
                      onChange={(event) => updateOption(option.id, event.target.value)}
                    />
                    <IconButton
                      type="button"
                      icon={X}
                      label={`删除选项 ${index + 1}`}
                      disabled={draft.options.length <= chatPollMinimumOptionCount}
                      onClick={() => removeOption(option.id)}
                    />
                  </label>
                ))}
              </div>
              <button
                type="button"
                className="orf-chat-poll-add-option"
                disabled={draft.options.length >= chatPollMaximumOptionCount}
                onClick={addOption}
              >
                <Plus className="h-4 w-4" />
                添加选项
                <small>{draft.options.length}/{chatPollMaximumOptionCount}</small>
              </button>
            </fieldset>

            {validationMessage && <div className="orf-chat-poll-validation" role="alert">{validationMessage}</div>}
          </div>
        ) : (
          <div className="orf-chat-poll-message-stage">
            <div className="orf-chat-poll-message-preview-label">
              <Eye className="h-4 w-4" />
              消息中的效果
              {closed && <span><CheckCircle2 className="h-3.5 w-3.5" /> 已模拟结束</span>}
            </div>
            <article className="orf-chat-poll-message-preview">
              <span className="orf-chat-poll-preview-avatar" aria-hidden="true">你</span>
              <div className="orf-chat-poll-preview-message-body">
                <div className="orf-chat-poll-preview-message-meta"><strong>你</strong><span>刚刚</span></div>
                <ChatPollPreviewCard
                  key={`${draft.mode}-${draft.question}`}
                  mode={draft.mode}
                  onClosedChange={setClosed}
                  options={toChatPollPreviewOptions(draft.options)}
                  question={draft.question.trim()}
                />
              </div>
            </article>
          </div>
        )}

        <footer className="orf-chat-poll-preview-footer">
          <span>仅用于确认交互与视觉，不会发送或保存数据</span>
          <div>
            {screen === "compose" ? (
              <>
                <Button type="button" size="sm" variant="ghost" onClick={resetDraft}>
                  <RotateCcw className="h-4 w-4" /> 重置
                </Button>
                <Button type="button" size="sm" onClick={showMessagePreview}>
                  <Eye className="h-4 w-4" /> 预览消息效果
                </Button>
              </>
            ) : (
              <Button type="button" size="sm" variant="secondary" onClick={() => setScreen("compose")}>
                返回编辑
              </Button>
            )}
          </div>
        </footer>
      </section>
    </>
  );
}
