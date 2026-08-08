import type {
  FeedbackImpact,
  FeedbackPriority,
  FeedbackRelationType,
  FeedbackResolution,
  FeedbackStage,
} from "../contracts";

export const feedbackStageLabel: Record<FeedbackStage, string> = {
  closed: "已关闭",
  in_progress: "处理中",
  open: "打开",
  pending_verification: "待验证",
};

export const feedbackResolutionLabel: Record<FeedbackResolution, string> = {
  cannot_resolve: "无法解决",
  duplicate: "重复反馈",
  not_needed: "无需解决",
  resolved: "已解决",
  unspecified: "历史关闭",
};

export const feedbackImpactLabel: Record<FeedbackImpact, string> = {
  critical: "严重",
  high: "高",
  low: "低",
  medium: "中",
};

export const feedbackPriorityLabel: Record<FeedbackPriority, string> = {
  p0: "P0",
  p1: "P1",
  p2: "P2",
  p3: "P3",
};

export const feedbackRelationTypeLabel: Record<FeedbackRelationType, string> = {
  blocks: "阻塞",
  duplicates: "重复",
  related: "相关",
};

export function feedbackLifecycleLabel(input: {
  resolution: FeedbackResolution | null;
  stage: FeedbackStage;
}) {
  if (input.stage === "closed" && input.resolution) return feedbackResolutionLabel[input.resolution];
  if (input.stage === "pending_verification" && input.resolution) {
    return `待验证：${feedbackResolutionLabel[input.resolution]}`;
  }
  return feedbackStageLabel[input.stage];
}
