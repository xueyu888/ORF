import { Check, ChevronDown, CircleDot, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FeedbackCommandResolution } from "../../contracts";
import { feedbackResolutionLabel } from "../../contracts/labels";
import type { FeedbackAssigneeOption } from "../model/assigneeOptions";
import type { FeedbackFollowUpLifecycleChoice, FeedbackFollowUpLifecycleOption } from "../model/followUp";

const resolutionOptions: FeedbackCommandResolution[] = ["resolved", "not_needed", "cannot_resolve", "duplicate"];

export function FeedbackFollowUpControls({
  adminReason,
  administrativeTakeoverRequired,
  assigneeOptions,
  assigneeValue,
  canChangeAssignee,
  duplicateTargetFeedbackId,
  duplicateTargets,
  lifecycleChoice,
  lifecycleOptions,
  onAdminReasonChange,
  onAssigneeChange,
  onDuplicateTargetChange,
  onLifecycleChange,
  onResolutionChange,
  resolution,
}: {
  readonly adminReason: string;
  readonly administrativeTakeoverRequired: boolean;
  readonly assigneeOptions: readonly FeedbackAssigneeOption[];
  readonly assigneeValue: string;
  readonly canChangeAssignee: boolean;
  readonly duplicateTargetFeedbackId: string;
  readonly duplicateTargets: readonly { readonly id: string; readonly title: string }[];
  readonly lifecycleChoice: FeedbackFollowUpLifecycleChoice;
  readonly lifecycleOptions: readonly FeedbackFollowUpLifecycleOption[];
  readonly onAdminReasonChange: (value: string) => void;
  readonly onAssigneeChange: (value: string) => void;
  readonly onDuplicateTargetChange: (value: string) => void;
  readonly onLifecycleChange: (value: FeedbackFollowUpLifecycleChoice) => void;
  readonly onResolutionChange: (value: FeedbackCommandResolution) => void;
  readonly resolution: FeedbackCommandResolution;
}) {
  const [openMenu, setOpenMenu] = useState<"assignee" | "lifecycle" | null>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const lifecycleLabel = lifecycleOptions.find((option) => option.value === lifecycleChoice)?.label ?? "状态";
  const assigneeLabel = assigneeValue === "unchanged"
    ? "处理人"
    : assigneeValue === "unassigned"
      ? "未指派"
      : assigneeOptions.find((option) => option.id === assigneeValue)?.name ?? "处理人";
  const showAdminReason = administrativeTakeoverRequired &&
    ["accept_verification", "reject_verification", "withdraw", "reopen"].includes(lifecycleChoice);
  const showLifecycleDetails = lifecycleChoice === "submit_verification" || showAdminReason;

  useEffect(() => {
    if (!openMenu) return;
    const closeMenu = (event: PointerEvent) => {
      if (!controlsRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openMenu]);

  return (
    <div ref={controlsRef} className="feedback-follow-up-controls" aria-label="本次跟进设置">
      <div className="feedback-follow-up-menu">
        <button
          aria-expanded={openMenu === "lifecycle"}
          aria-haspopup="menu"
          className="feedback-follow-up-trigger"
          data-active={lifecycleChoice !== "unchanged"}
          title="设置本次跟进状态"
          type="button"
          onClick={() => setOpenMenu((current) => current === "lifecycle" ? null : "lifecycle")}
        >
          <CircleDot aria-hidden="true" />
          <span>{lifecycleChoice === "unchanged" ? "状态" : lifecycleLabel}</span>
          <ChevronDown aria-hidden="true" />
        </button>
        {openMenu === "lifecycle" && (
          <div className="feedback-follow-up-popover" role="menu" aria-label="选择反馈状态">
            <div className="feedback-follow-up-option-list">
              {lifecycleOptions.map((option) => (
                <button
                  aria-checked={option.value === lifecycleChoice}
                  className="feedback-follow-up-option"
                  data-selected={option.value === lifecycleChoice}
                  key={option.value}
                  role="menuitemradio"
                  type="button"
                  onClick={() => {
                    onLifecycleChange(option.value);
                    const needsDetails = option.value === "submit_verification" || (
                      administrativeTakeoverRequired &&
                      ["accept_verification", "reject_verification", "withdraw", "reopen"].includes(option.value)
                    );
                    if (!needsDetails) setOpenMenu(null);
                  }}
                >
                  <Check aria-hidden="true" />
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
            {showLifecycleDetails && (
              <div className="feedback-follow-up-details">
                {lifecycleChoice === "submit_verification" && (
                  <label>
                    <span>处理结论</span>
                    <select value={resolution} onChange={(event) => onResolutionChange(event.target.value as FeedbackCommandResolution)}>
                      {resolutionOptions.map((item) => <option key={item} value={item}>{feedbackResolutionLabel[item]}</option>)}
                    </select>
                  </label>
                )}
                {lifecycleChoice === "submit_verification" && resolution === "duplicate" && (
                  <label>
                    <span>重复反馈</span>
                    <select value={duplicateTargetFeedbackId} onChange={(event) => onDuplicateTargetChange(event.target.value)}>
                      <option value="">选择已关联反馈</option>
                      {duplicateTargets.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                    </select>
                  </label>
                )}
                {showAdminReason && (
                  <label>
                    <span>代操作原因</span>
                    <input value={adminReason} onChange={(event) => onAdminReasonChange(event.target.value)} placeholder="填写原因" />
                  </label>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {canChangeAssignee && (
        <div className="feedback-follow-up-menu">
          <button
            aria-expanded={openMenu === "assignee"}
            aria-haspopup="menu"
            className="feedback-follow-up-trigger"
            data-active={assigneeValue !== "unchanged"}
            title="设置本次跟进处理人"
            type="button"
            onClick={() => setOpenMenu((current) => current === "assignee" ? null : "assignee")}
          >
            <UserRound aria-hidden="true" />
            <span>{assigneeLabel}</span>
            <ChevronDown aria-hidden="true" />
          </button>
          {openMenu === "assignee" && (
            <div className="feedback-follow-up-popover feedback-follow-up-assignee-popover" role="menu" aria-label="选择处理人">
              {[
                { id: "unchanged", name: "保持不变" },
                { id: "unassigned", name: "未指派" },
                ...assigneeOptions,
              ].map((option) => (
                <button
                  aria-checked={option.id === assigneeValue}
                  className="feedback-follow-up-option"
                  data-selected={option.id === assigneeValue}
                  key={option.id}
                  role="menuitemradio"
                  type="button"
                  onClick={() => {
                    onAssigneeChange(option.id);
                    setOpenMenu(null);
                  }}
                >
                  <Check aria-hidden="true" />
                  <span>{option.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
