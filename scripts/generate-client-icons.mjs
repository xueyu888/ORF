import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createAppIconRgba } = require("../clients/desktop/icon-renderer.cjs");
const { containRgba, encodeRgbaPng } = require("../clients/desktop/rgba-png.cjs");

const repoRoot = process.cwd();
const brandMarkPath = path.resolve(repoRoot, "src/assets/brand/orf-mark.png");
const desktopIconPath = path.resolve(repoRoot, "src/assets/brand/orf-app-icon.png");
const androidResRoot = path.resolve(repoRoot, "android/app/src/main/res");

const androidIconDensities = [
  { density: "mdpi", launcherSize: 48, foregroundSize: 108 },
  { density: "hdpi", launcherSize: 72, foregroundSize: 162 },
  { density: "xhdpi", launcherSize: 96, foregroundSize: 216 },
  { density: "xxhdpi", launcherSize: 144, foregroundSize: 324 },
  { density: "xxxhdpi", launcherSize: 192, foregroundSize: 432 },
];

function writePng(targetPath, width, height, rgba) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, encodeRgbaPng(width, height, rgba));
}

function writeLauncherBackground() {
  const targetPath = path.resolve(androidResRoot, "values/ic_launcher_background.xml");
  const xml = `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#00000000</color>\n</resources>\n`;
  fs.writeFileSync(targetPath, xml);
}

if (!fs.existsSync(brandMarkPath)) throw new Error(`Missing ORF brand mark: ${brandMarkPath}`);

writePng(desktopIconPath, 1024, 1024, createAppIconRgba(1024, 1024));
writeLauncherBackground();

for (const density of androidIconDensities) {
  const mipmapDir = path.resolve(androidResRoot, `mipmap-${density.density}`);
  writePng(
    path.resolve(mipmapDir, "ic_launcher.png"),
    density.launcherSize,
    density.launcherSize,
    createAppIconRgba(density.launcherSize, density.launcherSize),
  );
  writePng(
    path.resolve(mipmapDir, "ic_launcher_round.png"),
    density.launcherSize,
    density.launcherSize,
    createAppIconRgba(density.launcherSize, density.launcherSize),
  );
  writePng(
    path.resolve(mipmapDir, "ic_launcher_foreground.png"),
    density.foregroundSize,
    density.foregroundSize,
    containRgba(
      {
        data: createAppIconRgba(density.foregroundSize, density.foregroundSize),
        height: density.foregroundSize,
        width: density.foregroundSize,
      },
      density.foregroundSize,
      density.foregroundSize,
      0.8,
    ),
  );
}

console.log("Generated ORF client icons.");
