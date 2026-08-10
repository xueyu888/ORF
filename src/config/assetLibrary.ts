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
} as const;
