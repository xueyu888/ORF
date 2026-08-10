import { isFeedbackPath } from "@orf/feedback-module/contracts";
import type { PageVisualBackgroundScene, VisualBackgroundScene } from "../domain/settings/visualBackgrounds";

export type VisualSkinSlotKind = "login" | "chrome" | "page";
export type VisualSkinPreviewShape = "login" | "topbar" | "sidebar" | "page";

export type VisualSkinSlotDescriptor = {
  scene: VisualBackgroundScene;
  label: string;
  group: string;
  kind: VisualSkinSlotKind;
  previewShape: VisualSkinPreviewShape;
};

export const visualSkinSlots = [
  { scene: "login_background", label: "登录页", group: "入口", kind: "login", previewShape: "login" },
  { scene: "topbar_background", label: "顶部栏", group: "外壳", kind: "chrome", previewShape: "topbar" },
  { scene: "sidebar_background", label: "侧边栏", group: "外壳", kind: "chrome", previewShape: "sidebar" },
  { scene: "page_bounties_background", label: "悬赏大厅", group: "页面", kind: "page", previewShape: "page" },
  { scene: "page_tasks_background", label: "我的挑战", group: "页面", kind: "page", previewShape: "page" },
  { scene: "page_work_logs_background", label: "工作日志", group: "页面", kind: "page", previewShape: "page" },
  { scene: "page_chat_background", label: "聊天", group: "页面", kind: "page", previewShape: "page" },
  { scene: "page_resources_background", label: "资源", group: "页面", kind: "page", previewShape: "page" },
  { scene: "page_settings_background", label: "个人设置", group: "页面", kind: "page", previewShape: "page" },
  { scene: "page_feedback_background", label: "反馈", group: "页面", kind: "page", previewShape: "page" },
  { scene: "page_reports_background", label: "统计", group: "页面", kind: "page", previewShape: "page" },
  { scene: "page_system_background", label: "系统管理", group: "页面", kind: "page", previewShape: "page" },
  { scene: "page_dashboard_background", label: "仪表盘", group: "页面", kind: "page", previewShape: "page" },
  { scene: "page_strategy_map_background", label: "战略地图", group: "页面", kind: "page", previewShape: "page" },
  { scene: "page_ai_evaluation_background", label: "AI 评估", group: "页面", kind: "page", previewShape: "page" },
  { scene: "page_loot_background", label: "目标战利品", group: "页面", kind: "page", previewShape: "page" },
] as const satisfies readonly VisualSkinSlotDescriptor[];

export const defaultVisualSkinScene = "sidebar_background" satisfies VisualBackgroundScene;
export const visualSkinPageSlots = visualSkinSlots.filter((slot) => slot.kind === "page");

export function visualSkinSlotByScene(scene: VisualBackgroundScene) {
  return visualSkinSlots.find((slot) => slot.scene === scene) ?? visualSkinSlots[0];
}

export function pageVisualBackgroundSceneForPath(pathname: string): PageVisualBackgroundScene | null {
  if (pathname.startsWith("/chat")) return "page_chat_background";
  if (pathname.startsWith("/tasks/objectives/") && pathname.endsWith("/loot")) return "page_loot_background";
  if (pathname.startsWith("/bounties")) return "page_bounties_background";
  if (pathname.startsWith("/tasks")) return "page_tasks_background";
  if (pathname.startsWith("/work-logs")) return "page_work_logs_background";
  if (pathname.startsWith("/resources")) return "page_resources_background";
  if (pathname === "/settings" || pathname.startsWith("/settings/")) return "page_settings_background";
  if (isFeedbackPath(pathname)) return "page_feedback_background";
  if (pathname.startsWith("/reports")) return "page_reports_background";
  if (pathname.startsWith("/system")) return "page_system_background";
  if (pathname.startsWith("/dashboard")) return "page_dashboard_background";
  if (pathname.startsWith("/strategy-map")) return "page_strategy_map_background";
  if (pathname.startsWith("/ai-evaluation")) return "page_ai_evaluation_background";
  return "page_bounties_background";
}
