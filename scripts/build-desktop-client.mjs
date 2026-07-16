import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

import "./sync-client-versions.mjs";

const repoRoot = process.cwd();
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "orf-desktop-client-"));
const outputDir = path.resolve(repoRoot, "release/desktop");
const electronBuilderCli = path.resolve(repoRoot, "node_modules", "electron-builder", "cli.js");

const appPackage = JSON.parse(fs.readFileSync(path.resolve(repoRoot, "clients/desktop/package.json"), "utf8"));
const iconRendererSource = path.resolve(repoRoot, "clients/desktop/icon-renderer.cjs");
const installerIncludeSource = path.resolve(repoRoot, "clients/desktop/installer.nsh");
const mainSource = path.resolve(repoRoot, "clients/desktop/main.cjs");
const notificationRendererSource = path.resolve(repoRoot, "clients/desktop/notification-renderer.cjs");
const preloadSource = path.resolve(repoRoot, "clients/desktop/preload.cjs");
const updateInstallerSource = path.resolve(repoRoot, "clients/desktop/update-installer.cjs");
const desktopAppIconSource = path.resolve(repoRoot, "src/assets/brand/orf-app-icon.png");
const iconRendererTarget = path.resolve(tempRoot, "icon-renderer.cjs");
const mainTarget = path.resolve(tempRoot, "main.cjs");
const notificationRendererTarget = path.resolve(tempRoot, "notification-renderer.cjs");
const preloadTarget = path.resolve(tempRoot, "preload.cjs");
const updateInstallerTarget = path.resolve(tempRoot, "update-installer.cjs");
const packageTarget = path.resolve(tempRoot, "package.json");
const configTarget = path.resolve(tempRoot, "electron-builder.json");
const appAssetsTargetDir = path.resolve(tempRoot, "assets");
const buildResourcesTargetDir = path.resolve(tempRoot, "buildResources");
const appIconTarget = path.resolve(appAssetsTargetDir, "icon.png");
const buildIconTarget = path.resolve(buildResourcesTargetDir, "icon.png");
const installerIncludeTarget = path.resolve(buildResourcesTargetDir, "installer.nsh");
const desktopIconSizePx = 256;
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const builderConfig = {
  appId: "org.duckdns.orfxueyu.orf",
  productName: "ORF",
  copyright: "Copyright © 2026 ORF",
  electronVersion: rootElectronVersion(),
  directories: {
    buildResources: "buildResources",
    output: outputDir,
  },
  files: [
    "assets/icon.png",
    "icon-renderer.cjs",
    "main.cjs",
    "notification-renderer.cjs",
    "package.json",
    "preload.cjs",
    "update-installer.cjs",
  ],
  asar: true,
  npmRebuild: false,
  nodeGypRebuild: false,
  win: {
    icon: "buildResources/icon.png",
    target: [
      {
        target: "nsis",
        arch: ["x64"],
      },
    ],
    artifactName: "ORF-${version}-win11-${arch}-setup.${ext}",
    forceCodeSigning: false,
  },
  linux: {
    icon: "buildResources/icon.png",
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    include: "buildResources/installer.nsh",
    shortcutName: "ORF",
  },
};

function rootElectronVersion() {
  const rootPackage = JSON.parse(fs.readFileSync(path.resolve(repoRoot, "package.json"), "utf8"));
  const configuredVersion = rootPackage.devDependencies?.electron;
  if (!configuredVersion) throw new Error("Missing electron devDependency in package.json");
  return configuredVersion.replace(/^[^\d]*/, "");
}

function prepareDesktopIcons() {
  if (!fs.existsSync(desktopAppIconSource)) {
    throw new Error(`Missing desktop app icon: ${desktopAppIconSource}. Run npm run client:icons:generate.`);
  }
  fs.mkdirSync(appAssetsTargetDir, { recursive: true });
  fs.mkdirSync(buildResourcesTargetDir, { recursive: true });
  const desktopIcon = createDesktopIconPng(desktopAppIconSource, desktopIconSizePx);
  fs.writeFileSync(appIconTarget, desktopIcon);
  fs.writeFileSync(buildIconTarget, desktopIcon);
}

function createDesktopIconPng(sourcePath, size) {
  const sourcePng = readRgbaPng(fs.readFileSync(sourcePath));
  if (sourcePng.width >= size && sourcePng.height >= size && sourcePng.width === sourcePng.height) {
    return encodeRgbaPng(sourcePng.width, sourcePng.height, sourcePng.data);
  }
  return encodeRgbaPng(size, size, resizeRgba(sourcePng, size, size));
}

function readRgbaPng(input) {
  if (!input.subarray(0, pngSignature.length).equals(pngSignature)) {
    throw new Error("Desktop icon source is not a PNG file.");
  }

  const idatParts = [];
  let width = 0;
  let height = 0;
  let offset = pngSignature.length;
  while (offset < input.length) {
    const chunkLength = input.readUInt32BE(offset);
    offset += 4;
    const chunkType = input.toString("ascii", offset, offset + 4);
    offset += 4;
    const chunkData = input.subarray(offset, offset + chunkLength);
    offset += chunkLength + 4;

    if (chunkType === "IHDR") {
      width = chunkData.readUInt32BE(0);
      height = chunkData.readUInt32BE(4);
      const bitDepth = chunkData.readUInt8(8);
      const colorType = chunkData.readUInt8(9);
      const interlace = chunkData.readUInt8(12);
      if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
        throw new Error("Desktop icon source must be an 8-bit non-interlaced RGBA PNG.");
      }
    } else if (chunkType === "IDAT") {
      idatParts.push(chunkData);
    } else if (chunkType === "IEND") {
      break;
    }
  }

  if (width <= 0 || height <= 0 || idatParts.length === 0) {
    throw new Error("Desktop icon source PNG is missing image data.");
  }

  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const inflated = zlib.inflateSync(Buffer.concat(idatParts));
  const output = Buffer.alloc(width * height * bytesPerPixel);
  let sourceOffset = 0;
  let previousRow = Buffer.alloc(stride);

  for (let y = 0; y < height; y += 1) {
    const filterType = inflated[sourceOffset];
    sourceOffset += 1;
    const filteredRow = inflated.subarray(sourceOffset, sourceOffset + stride);
    sourceOffset += stride;
    const row = Buffer.alloc(stride);
    unfilterPngRow(filterType, filteredRow, row, previousRow, bytesPerPixel);
    row.copy(output, y * stride);
    previousRow = row;
  }

  return { data: output, height, width };
}

function unfilterPngRow(filterType, filteredRow, outputRow, previousRow, bytesPerPixel) {
  for (let index = 0; index < filteredRow.length; index += 1) {
    const left = index >= bytesPerPixel ? outputRow[index - bytesPerPixel] : 0;
    const up = previousRow[index] ?? 0;
    const upperLeft = index >= bytesPerPixel ? previousRow[index - bytesPerPixel] ?? 0 : 0;
    const current = filteredRow[index];
    if (filterType === 0) outputRow[index] = current;
    else if (filterType === 1) outputRow[index] = (current + left) & 0xff;
    else if (filterType === 2) outputRow[index] = (current + up) & 0xff;
    else if (filterType === 3) outputRow[index] = (current + Math.floor((left + up) / 2)) & 0xff;
    else if (filterType === 4) outputRow[index] = (current + paethPredictor(left, up, upperLeft)) & 0xff;
    else throw new Error(`Unsupported PNG filter type: ${filterType}`);
  }
}

function paethPredictor(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  if (upDistance <= upperLeftDistance) return up;
  return upperLeft;
}

function resizeRgba(source, targetWidth, targetHeight) {
  const output = Buffer.alloc(targetWidth * targetHeight * 4);
  const xScale = source.width / targetWidth;
  const yScale = source.height / targetHeight;

  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = Math.min(source.height - 1, Math.max(0, (y + 0.5) * yScale - 0.5));
    const y0 = Math.floor(sourceY);
    const y1 = Math.min(source.height - 1, y0 + 1);
    const yWeight = sourceY - y0;
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = Math.min(source.width - 1, Math.max(0, (x + 0.5) * xScale - 0.5));
      const x0 = Math.floor(sourceX);
      const x1 = Math.min(source.width - 1, x0 + 1);
      const xWeight = sourceX - x0;
      const targetIndex = (y * targetWidth + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        const top = sampleRgba(source, x0, y0, channel) * (1 - xWeight) + sampleRgba(source, x1, y0, channel) * xWeight;
        const bottom = sampleRgba(source, x0, y1, channel) * (1 - xWeight) + sampleRgba(source, x1, y1, channel) * xWeight;
        output[targetIndex + channel] = Math.round(top * (1 - yWeight) + bottom * yWeight);
      }
    }
  }

  return output;
}

function sampleRgba(source, x, y, channel) {
  return source.data[(y * source.width + x) * 4 + channel];
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

try {
  prepareDesktopIcons();
  fs.copyFileSync(installerIncludeSource, installerIncludeTarget);
  fs.copyFileSync(iconRendererSource, iconRendererTarget);
  fs.copyFileSync(mainSource, mainTarget);
  fs.copyFileSync(notificationRendererSource, notificationRendererTarget);
  fs.copyFileSync(preloadSource, preloadTarget);
  fs.copyFileSync(updateInstallerSource, updateInstallerTarget);
  fs.writeFileSync(packageTarget, `${JSON.stringify(appPackage, null, 2)}\n`);
  fs.writeFileSync(configTarget, `${JSON.stringify(builderConfig, null, 2)}\n`);

  const result = spawnSync(process.execPath, [
    electronBuilderCli,
    "--projectDir",
    tempRoot,
    "--config",
    configTarget,
    ...process.argv.slice(2),
  ], {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
