const fs = require("node:fs");
const path = require("node:path");
const { containRgba, readRgbaPng } = require("./rgba-png.cjs");

const packagedBrandMarkPath = path.join(__dirname, "assets", "icon.png");
const sourceBrandMarkPath = path.resolve(__dirname, "..", "..", "src", "assets", "brand", "orf-mark.png");
const attentionSurface = {
  top: { r: 255, g: 84, b: 126, a: 255 },
  middle: { r: 239, g: 45, b: 85, a: 255 },
  bottom: { r: 158, g: 20, b: 62, a: 255 },
};
const unreadBadge = {
  outer: { r: 255, g: 255, b: 255, a: 245 },
  top: { r: 242, g: 57, b: 66, a: 255 },
  bottom: { r: 198, g: 30, b: 43, a: 255 },
};

let cachedBrandMark;

function createTrayIconRgba(width, height = width, options = {}) {
  const state = options.state === "attention" || options.state === "unread" ? options.state : "normal";
  const pulse = options.pulse === true;
  const canvas = pulse && state === "attention"
    ? createAttentionFrame(width, height)
    : containRgba(loadBrandMark(), width, height, 0.92);

  if (state === "unread") {
    const size = Math.min(width, height);
    drawUnreadDot(canvas, width, height, {
      centerX: width / 2 + size * 0.29,
      centerY: height / 2 - size * 0.29,
      radius: size * 0.115,
    });
  }
  return canvas;
}

function createAttentionFrame(width, height) {
  const canvas = Buffer.alloc(width * height * 4);
  const size = Math.min(width, height) * 0.96;
  const rect = {
    height: size,
    radius: size * 0.22,
    width: size,
    x: (width - size) / 2,
    y: (height - size) / 2,
  };
  drawRoundedRectGradient(canvas, width, height, rect, [
    { offset: 0, color: attentionSurface.top },
    { offset: 0.55, color: attentionSurface.middle },
    { offset: 1, color: attentionSurface.bottom },
  ]);

  const mark = containRgba(loadBrandMark(), width, height, 0.72);
  for (let index = 0; index < mark.length; index += 4) {
    if (mark[index + 3] <= 0) continue;
    mark[index] = 255;
    mark[index + 1] = 239;
    mark[index + 2] = 246;
  }
  compositeRgba(canvas, mark);
  return canvas;
}

function loadBrandMark() {
  if (cachedBrandMark) return cachedBrandMark;
  const sourcePath = fs.existsSync(packagedBrandMarkPath) ? packagedBrandMarkPath : sourceBrandMarkPath;
  if (!fs.existsSync(sourcePath)) throw new Error(`Missing ORF brand mark: ${sourcePath}`);
  cachedBrandMark = readRgbaPng(fs.readFileSync(sourcePath));
  return cachedBrandMark;
}

function drawUnreadDot(canvas, width, height, options) {
  drawCircle(canvas, width, height, options.centerX, options.centerY, options.radius, unreadBadge.outer);
  drawCircleGradient(canvas, width, height, options.centerX, options.centerY, options.radius * 0.78, [
    { offset: 0, color: unreadBadge.top },
    { offset: 1, color: unreadBadge.bottom },
  ]);
}

function compositeRgba(destination, source) {
  for (let index = 0; index < destination.length; index += 4) {
    const alpha = source[index + 3] / 255;
    if (alpha <= 0) continue;
    const inverseAlpha = 1 - alpha;
    destination[index] = Math.round(source[index] * alpha + destination[index] * inverseAlpha);
    destination[index + 1] = Math.round(source[index + 1] * alpha + destination[index + 1] * inverseAlpha);
    destination[index + 2] = Math.round(source[index + 2] * alpha + destination[index + 2] * inverseAlpha);
    destination[index + 3] = Math.round(source[index + 3] + destination[index + 3] * inverseAlpha);
  }
}

function drawRoundedRectGradient(canvas, width, height, rect, stops) {
  for (let y = Math.floor(rect.y); y < Math.ceil(rect.y + rect.height); y += 1) {
    for (let x = Math.floor(rect.x); x < Math.ceil(rect.x + rect.width); x += 1) {
      const coverage = roundedRectCoverage(x + 0.5, y + 0.5, rect);
      if (coverage <= 0) continue;
      const position = clamp01((((x + 0.5) - rect.x) / rect.width + ((y + 0.5) - rect.y) / rect.height) / 2);
      const color = sampleStops(stops, position);
      blendPixel(canvas, width, height, x, y, { ...color, a: Math.round(color.a * coverage) });
    }
  }
}

function drawCircle(canvas, width, height, centerX, centerY, radius, color) {
  for (let y = Math.floor(centerY - radius - 1); y < Math.ceil(centerY + radius + 1); y += 1) {
    for (let x = Math.floor(centerX - radius - 1); x < Math.ceil(centerX + radius + 1); x += 1) {
      const distance = Math.hypot(x + 0.5 - centerX, y + 0.5 - centerY);
      const coverage = clamp01(radius + 0.5 - distance);
      if (coverage > 0) blendPixel(canvas, width, height, x, y, { ...color, a: Math.round(color.a * coverage) });
    }
  }
}

function drawCircleGradient(canvas, width, height, centerX, centerY, radius, stops) {
  for (let y = Math.floor(centerY - radius - 1); y < Math.ceil(centerY + radius + 1); y += 1) {
    for (let x = Math.floor(centerX - radius - 1); x < Math.ceil(centerX + radius + 1); x += 1) {
      const distance = Math.hypot(x + 0.5 - centerX, y + 0.5 - centerY);
      const coverage = clamp01(radius + 0.5 - distance);
      if (coverage <= 0) continue;
      const color = sampleStops(stops, clamp01(distance / radius));
      blendPixel(canvas, width, height, x, y, { ...color, a: Math.round(color.a * coverage) });
    }
  }
}

function roundedRectCoverage(pointX, pointY, rect) {
  if (pointX < rect.x - 0.5 || pointY < rect.y - 0.5 || pointX > rect.x + rect.width + 0.5 || pointY > rect.y + rect.height + 0.5) return 0;
  const nearestX = Math.max(rect.x + rect.radius, Math.min(pointX, rect.x + rect.width - rect.radius));
  const nearestY = Math.max(rect.y + rect.radius, Math.min(pointY, rect.y + rect.height - rect.radius));
  const distance = Math.hypot(pointX - nearestX, pointY - nearestY);
  if (distance <= rect.radius - 0.5) return 1;
  return clamp01(rect.radius + 0.5 - distance);
}

function blendPixel(canvas, width, height, x, y, color) {
  if (x < 0 || y < 0 || x >= width || y >= height || color.a <= 0) return;
  const offset = (y * width + x) * 4;
  const alpha = color.a / 255;
  const inverseAlpha = 1 - alpha;
  canvas[offset] = Math.round(color.r * alpha + canvas[offset] * inverseAlpha);
  canvas[offset + 1] = Math.round(color.g * alpha + canvas[offset + 1] * inverseAlpha);
  canvas[offset + 2] = Math.round(color.b * alpha + canvas[offset + 2] * inverseAlpha);
  canvas[offset + 3] = Math.round(color.a + canvas[offset + 3] * inverseAlpha);
}

function sampleStops(stops, position) {
  if (position <= stops[0].offset) return stops[0].color;
  for (let index = 1; index < stops.length; index += 1) {
    const current = stops[index];
    const previous = stops[index - 1];
    if (position <= current.offset) {
      const progress = (position - previous.offset) / Math.max(0.0001, current.offset - previous.offset);
      return {
        r: Math.round(previous.color.r + (current.color.r - previous.color.r) * progress),
        g: Math.round(previous.color.g + (current.color.g - previous.color.g) * progress),
        b: Math.round(previous.color.b + (current.color.b - previous.color.b) * progress),
        a: Math.round(previous.color.a + (current.color.a - previous.color.a) * progress),
      };
    }
  }
  return stops[stops.length - 1].color;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

module.exports = { createTrayIconRgba };
