import { ArrowRight, Check, Loader2, Send } from "lucide-react";
import type { ReactNode } from "react";
import type { ChallengeApplicationStatus } from "../../../types/orf";
import { BountyButton } from "../BountyHallSkin";

export function BountyRowActions({
  canApply,
  currentApplicationStatus,
  isCurrentChallenger,
  isRecruitment,
  openable,
  processing,
  onAccept,
  onApply,
  onOpenChallengeWork,
  onOpenObjective,
}: {
  canApply: boolean;
  currentApplicationStatus: ChallengeApplicationStatus | null;
  isCurrentChallenger: boolean;
  isRecruitment: boolean;
  openable: boolean;
  processing: boolean;
  onAccept: () => void;
  onApply: () => void;
  onOpenChallengeWork: () => void;
  onOpenObjective: () => void;
}) {
  if (isRecruitment) {
    return (
      <BountyButton onClick={onAccept} disabled={processing || !canApply}>
        {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        接受挑战
      </BountyButton>
    );
  }

  if (isCurrentChallenger || currentApplicationStatus === "approved") {
    return (
      <BountyButton variant="blue" onClick={onOpenChallengeWork} disabled={processing}>
        <ArrowRight className="h-4 w-4" />
        进入目标
      </BountyButton>
    );
  }

  if (currentApplicationStatus === "pending") {
    return <BountyActionNote>申请中</BountyActionNote>;
  }

  if (canApply) {
    return (
      <BountyButton variant="primary" onClick={onApply} disabled={processing}>
        {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        申请挑战
      </BountyButton>
    );
  }

  if (openable) {
    return (
      <BountyButton variant="secondary" onClick={onOpenObjective} disabled={processing}>
        <ArrowRight className="h-4 w-4" />
        查看目标
      </BountyButton>
    );
  }

  return <BountyActionNote>暂无操作</BountyActionNote>;
}

function BountyActionNote({ children }: { children: ReactNode }) {
  return <span className="bounty-action-note">{children}</span>;
}
