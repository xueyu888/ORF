import type {
  FeedbackCommandResolution,
  FeedbackFollowUpTransition,
  FeedbackTransitionInput,
} from "../../contracts";
import type { FeedbackWebIssue, FeedbackWebUser } from "../types";

export type FeedbackFollowUpLifecycleChoice = "unchanged" | FeedbackTransitionInput["type"];

export type FeedbackFollowUpDraft = {
  readonly adminReason: string;
  readonly assignee: string;
  readonly duplicateTargetFeedbackId: string;
  readonly lifecycle: FeedbackFollowUpLifecycleChoice;
  readonly resolution: FeedbackCommandResolution;
};

export function emptyFeedbackFollowUpDraft(): FeedbackFollowUpDraft {
  return {
    adminReason: "",
    assignee: "unchanged",
    duplicateTargetFeedbackId: "",
    lifecycle: "unchanged",
    resolution: "resolved",
  };
}

export function feedbackFollowUpDraftHasCommand(input: {
  readonly draft: FeedbackFollowUpDraft;
  readonly hasAssigneeChange: boolean;
}) {
  return input.hasAssigneeChange || input.draft.lifecycle !== "unchanged";
}

export type FeedbackFollowUpLifecycleOption = {
  readonly label: string;
  readonly value: FeedbackFollowUpLifecycleChoice;
};

export function feedbackFollowUpLifecycleOptions(feedback: FeedbackWebIssue): FeedbackFollowUpLifecycleOption[] {
  const options: FeedbackFollowUpLifecycleOption[] = [{ label: "保持状态", value: "unchanged" }];
  const capabilities = feedback.capabilities;
  if (capabilities.canStart) options.push({ label: "开始处理", value: "start" });
  if (capabilities.canSubmitVerification) options.push({ label: "提交验证", value: "submit_verification" });
  if (capabilities.canAcceptVerification) options.push({ label: "确认关闭", value: "accept_verification" });
  if (capabilities.canRejectVerification) options.push({ label: "退回处理中", value: "reject_verification" });
  if (capabilities.canWithdraw) options.push({ label: "撤回反馈", value: "withdraw" });
  if (capabilities.canReopen) options.push({ label: "重新打开", value: "reopen" });
  return options;
}

export function feedbackFollowUpTransition(input: {
  readonly body: string;
  readonly currentUser: FeedbackWebUser | null;
  readonly draft: FeedbackFollowUpDraft;
  readonly feedback: FeedbackWebIssue;
}): { readonly transition?: FeedbackFollowUpTransition; readonly error?: string } {
  if (input.draft.lifecycle === "unchanged") return {};

  const body = input.body.trim();
  const administrativeTakeoverRequired = input.currentUser?.role === "admin" && input.currentUser.id !== input.feedback.createdBy;
  const administrativeTakeover = administrativeTakeoverRequired
    ? { reason: input.draft.adminReason.trim() }
    : undefined;
  if (
    administrativeTakeoverRequired &&
    !administrativeTakeover?.reason &&
    ["accept_verification", "reject_verification", "withdraw", "reopen"].includes(input.draft.lifecycle)
  ) {
    return { error: "请填写管理员代操作原因" };
  }
  if (["submit_verification", "reject_verification", "withdraw", "reopen"].includes(input.draft.lifecycle) && !body) {
    return { error: "这次状态变更需要填写跟进说明" };
  }
  if (input.draft.lifecycle === "submit_verification" && input.draft.resolution === "duplicate" && !input.draft.duplicateTargetFeedbackId) {
    return { error: "请先添加并选择重复反馈关系" };
  }

  if (input.draft.lifecycle === "start") return { transition: { type: "start" } };
  if (input.draft.lifecycle === "submit_verification") {
    return {
      transition: {
        type: "submit_verification",
        resolution: input.draft.resolution,
        note: body,
        ...(input.draft.resolution === "duplicate" ? { duplicateTargetFeedbackId: input.draft.duplicateTargetFeedbackId } : {}),
      },
    };
  }
  if (input.draft.lifecycle === "accept_verification") {
    return { transition: { type: "accept_verification", administrativeTakeover } };
  }
  return { transition: { type: input.draft.lifecycle, note: body, administrativeTakeover } };
}
