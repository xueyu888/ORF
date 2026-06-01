import { Check, Loader2, Send } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { BountyBadge, BountyButton, BountyCardSurface, BountyDialog } from "../BountyHallSkin";
import { bountyPointsLabel, highestDifficultyLabel, resultCountLabel } from "../model/bountyHallItems";
import type { ChallengeConfirmTarget } from "../model/bountyHallTypes";

export function ChallengeConfirmModal({
  item,
  processing,
  onCancel,
  onConfirm,
}: {
  item: ChallengeConfirmTarget;
  processing: boolean;
  onCancel: () => void;
  onConfirm: (reason?: string) => void;
}) {
  useEscape(onCancel);
  const [reason, setReason] = useState("");
  const actionLabel = item.action === "accept" ? "接受挑战" : "申请挑战";
  const reasonRequired = !item.blocked && item.action === "apply";
  const reasonReady = !reasonRequired || reason.trim().length > 0;
  const title = item.blocked
    ? item.action === "accept"
      ? "指挥官不应该接受挑战"
      : "指挥官不应该申请挑战"
    : item.action === "accept"
      ? "接受后会进入你的挑战页"
      : "提交后等待指挥官确认";
  const description =
    item.blocked
      ? "指挥官可以完整查看悬赏大厅和操作区，但不能成为挑战者。这个动作不会提交，也不会改变申请、征召或挑战者关系。"
      : item.action === "accept"
      ? "接受挑战后会成为当前挑战者；目标进入重估，重估完成后由指挥官冻结。"
      : "写清你要承接这个目标的理由。提交后，所有人都能在悬赏大厅看到这条申请，指挥官确认后你的头像会挂到目标上。";

  return (
    <BountyDialog
      onClose={onCancel}
      title={title}
      subtitle={actionLabel}
      variant="confirm"
      footer={
        item.blocked ? (
          <BountyButton onClick={onCancel}>我知道了</BountyButton>
        ) : (
          <>
            <BountyButton variant="secondary" onClick={onCancel} disabled={processing}>
              取消
            </BountyButton>
            <BountyButton onClick={() => onConfirm(reason)} disabled={processing || !reasonReady}>
              {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : item.action === "accept" ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
              {actionLabel}
            </BountyButton>
          </>
        )
      }
    >
      <BountyCardSurface>
        <div className="p-4">
          <h3 className="line-clamp-2">{item.item.objective.title}</h3>
          <p className="mt-2 truncate text-sm">{resultCountLabel(item.item)}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Chip>{highestDifficultyLabel(item.item)}</Chip>
            <Chip tone="gold">{bountyPointsLabel(item.item)}</Chip>
          </div>
        </div>
      </BountyCardSurface>
      <p className="text-sm leading-6">{description}</p>
      {reasonRequired && (
        <label className="bounty-application-reason-field">
          <span>申请理由</span>
          <textarea
            autoFocus
            maxLength={240}
            onChange={(event) => setReason(event.target.value)}
            placeholder="写明你为什么适合承接、准备如何推进、需要哪些协作..."
            value={reason}
          />
        </label>
      )}
    </BountyDialog>
  );
}

function Chip({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "gold" | "warning" | "success" }) {
  return <BountyBadge tone={tone}>{children}</BountyBadge>;
}

function useEscape(onEscape: () => void) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onEscape();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onEscape]);
}
