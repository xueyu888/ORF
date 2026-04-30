import sidebarEnergyBackground from "../assets/orf-icons/sidebar-energy-bg.png";

export const orfAssetLibrary = {
  sidebar: {
    energyBackground: {
      src: sidebarEnergyBackground,
      name: "sidebar-energy-bg",
      description: "Blue cyan energy background for the primary app sidebar.",
    },
  },
} as const;

export function toCssImageUrl(src: string) {
  return `url("${src}")`;
}
