import { designTokens } from "../config/designTokens";

const avatarPalette = designTokens.palette.avatar;
const fixedAvatarColors: Record<string, string> = {
  "Kai Wang": avatarPalette[0],
  "Mia Zhang": avatarPalette[1],
  "Alex Chen": avatarPalette[2],
  "Ethan Liu": avatarPalette[3],
  "Nora Patel": avatarPalette[4],
};

export function avatarColorForName(name: string) {
  const normalizedName = name.trim();

  if (!normalizedName) {
    return avatarPalette[0];
  }

  if (fixedAvatarColors[normalizedName]) {
    return fixedAvatarColors[normalizedName];
  }

  let hash = 0;

  for (const char of normalizedName) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return avatarPalette[hash % avatarPalette.length];
}

export function avatarStyleForName(name: string) {
  return {
    backgroundColor: avatarColorForName(name),
    color: designTokens.color.avatarText,
  };
}
