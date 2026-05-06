import sidebarEnergyBackground from "../assets/orf-icons/sidebar-energy-bg.png";
import sidebarCharacterGuideBackground from "../assets/orf-icons/sidebar-character-guide-bg.png";

export const orfAssetLibrary = {
  sidebar: {
    energyBackground: {
      src: sidebarEnergyBackground,
      name: "sidebar-energy-bg",
      description: "Blue cyan energy background for the primary app sidebar.",
      position: "center",
      filter: "saturate(1.48) brightness(1.08) contrast(1.12)",
      overlay:
        "linear-gradient(90deg, rgba(2, 8, 20, 0.58) 0%, rgba(2, 8, 20, 0.32) 46%, rgba(2, 8, 20, 0.08) 100%), linear-gradient(180deg, rgba(2, 8, 20, 0.04) 0%, rgba(2, 8, 20, 0.16) 55%, rgba(2, 8, 20, 0.3) 100%), radial-gradient(circle at 76% 16%, rgba(103, 232, 249, 0.16) 0 8%, transparent 28%), radial-gradient(circle at 88% 78%, rgba(250, 204, 21, 0.1) 0 4%, transparent 24%)",
    },
    characterGuideBackground: {
      src: sidebarCharacterGuideBackground,
      name: "sidebar-character-guide-bg",
      description: "Character guide illustration for the primary app sidebar.",
      position: "center top",
      filter: "saturate(1.14) brightness(1) contrast(1.02)",
      overlay:
        "linear-gradient(90deg, rgba(2, 8, 20, 0.36) 0%, rgba(2, 8, 20, 0.18) 54%, rgba(2, 8, 20, 0.04) 100%), linear-gradient(180deg, rgba(2, 8, 20, 0.2) 0%, rgba(2, 8, 20, 0.06) 42%, rgba(2, 8, 20, 0.3) 100%)",
    },
  },
  references: {
    fantasyUiPanelFrames: {
      sourcePath: "src/features/fantasy-ui/assets/reference-boards/fantasy-ui-panel-frames.png",
      name: "fantasy-ui-panel-frames",
      description: "Panel, card, popup, divider, chip, and corner ornament reference board.",
      usage: "Reference for card frames, objective panels, popovers, dividers, and decorative corners.",
    },
    fantasyUiControls: {
      sourcePath: "src/features/fantasy-ui/assets/reference-boards/fantasy-ui-controls.png",
      name: "fantasy-ui-controls",
      description: "Button, tab, toggle, checkbox, radio, search, dropdown, pagination, and badge reference board.",
      usage: "Reference for action buttons, toolbar filters, status badges, and task tabs.",
    },
    fantasyUiNavigation: {
      sourcePath: "src/features/fantasy-ui/assets/reference-boards/fantasy-ui-navigation.png",
      name: "fantasy-ui-navigation",
      description: "Sidebar, top navigation, user panel, filter panel, collapsible list, and list row reference board.",
      usage: "Reference for the app sidebar, topbar, filter controls, and workflow rows.",
    },
    fantasyUiTaskWidgets: {
      sourcePath: "src/features/fantasy-ui/assets/reference-boards/fantasy-ui-task-widgets.png",
      name: "fantasy-ui-task-widgets",
      description: "Task card, kanban header, date tile, progress bar, stat card, timeline, and toast reference board.",
      usage: "Reference for task-page metrics, progress displays, rows, timeline-like hierarchy, and notifications.",
    },
  },
} as const;

export function toCssImageUrl(src: string) {
  return `url("${src}")`;
}
