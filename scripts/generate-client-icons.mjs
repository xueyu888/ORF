import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import zlib from "node:zlib";

const require = createRequire(import.meta.url);
const {
  createAppIconForegroundRgba,
  createAppIconRgba,
} = require("../clients/desktop/icon-renderer.cjs");

const repoRoot = process.cwd();
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
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

function encodeRgbaPng(width, height, rgba) {
  const rowLength = width * 4;
  const raw = Buffer.alloc((rowLength + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (rowLength + 1);
    raw[rowOffset] = 0;
    rgba.copy(raw, rowOffset + 1, y * rowLength, (y + 1) * rowLength);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(6, 9);
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);

  return Buffer.concat([
    pngSignature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return chunk;
}

function crc32(input) {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc = (crc >>> 8) ^ crc32Table[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const crc32Table = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

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
    createAppIconForegroundRgba(density.foregroundSize, density.foregroundSize),
  );
}

console.log("Generated ORF client icons.");
