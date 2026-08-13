const fs = require("node:fs");
const path = require("node:path");
const { containRgba, readRgbaPng } = require("./rgba-png.cjs");

const packagedBrandMarkPath = path.join(__dirname, "assets", "brand-mark.png");
const sourceBrandMarkPath = path.resolve(__dirname, "..", "..", "src", "assets", "brand", "orf-mark.png");
const attentionSurface = {
  top: { r: 255, g: 84, b: 126, a: 255 },
  middle: { r: 239, g: 45, b: 85, a: 255 },
  bottom: { r: 158, g: 20, b: 62, a: 255 },
};
const unreadBadge = {
  outer: { r: 255, g: 255, b: 255, a: 255 },
  top: { r: 30, g: 32, b: 37, a: 255 },
  bottom: { r: 10, g: 11, b: 14, a: 255 },
  text: { r: 255, g: 255, b: 255, a: 255 },
};
const badgeDigitSegments = {
  "0": ["top", "upperLeft", "upperRight", "lowerLeft", "lowerRight", "bottom"],
  "1": ["upperRight", "lowerRight"],
  "2": ["top", "upperRight", "middle", "lowerLeft", "bottom"],
  "3": ["top", "upperRight", "middle", "lowerRight", "bottom"],
  "4": ["upperLeft", "upperRight", "middle", "lowerRight"],
  "5": ["top", "upperLeft", "middle", "lowerRight", "bottom"],
  "6": ["top", "upperLeft", "middle", "lowerLeft", "lowerRight", "bottom"],
  "7": ["top", "upperRight", "lowerRight"],
  "8": ["top", "upperLeft", "upperRight", "middle", "lowerLeft", "lowerRight", "bottom"],
  "9": ["top", "upperLeft", "upperRight", "middle", "lowerRight", "bottom"],
};

let cachedBrandMark;

function createAppIconRgba(width, height = width, options = {}) {
  const scale = clamp01(Number.isFinite(options.scale) ? options.scale : 0.98);
  return containRgba(loadBrandMark(), width, height, scale);
}

function createDesktopShellIconRgba(width, height = width, options = {}) {
  const state = options.state === "attention" || options.state === "unread" ? options.state : "normal";
  const pulse = options.pulse === true;
  const context = options.context === "tray" ? "tray" : "taskbar";
  const canvas = pulse && state === "attention"
    ? createAttentionFrame(width, height)
    : createAppIconRgba(width, height);

  if (state !== "normal" && !pulse) {
    const size = Math.min(width, height);
    drawUnreadBadge(canvas, width, height, {
      centerX: width / 2 + size * (context === "tray" ? 0.29 : 0.255),
      centerY: height / 2 - size * (context === "tray" ? 0.29 : 0.255),
      count: normalizeUnreadCount(options.unreadCount),
      radius: size * (context === "tray" ? 0.24 : 0.255),
    });
  }
  return canvas;
}

function createUnreadBadgeRgba(width, height = width, unreadCount = 0) {
  const canvas = Buffer.alloc(width * height * 4);
  drawUnreadBadge(canvas, width, height, {
    centerX: width / 2,
    centerY: height / 2,
    count: normalizeUnreadCount(unreadCount),
    radius: Math.min(width, height) * 0.48,
  });
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

function drawUnreadBadge(canvas, width, height, options) {
  drawCircle(canvas, width, height, options.centerX, options.centerY, options.radius, unreadBadge.outer);
  const innerRadius = options.radius * 0.82;
  drawCircleGradient(canvas, width, height, options.centerX, options.centerY, innerRadius, [
    { offset: 0, color: unreadBadge.top },
    { offset: 1, color: unreadBadge.bottom },
  ]);
  if (options.count > 0) {
    drawBadgeText(canvas, width, height, options.centerX, options.centerY, innerRadius, String(Math.min(99, options.count)));
  }
}

function drawBadgeText(canvas, width, height, centerX, centerY, radius, text) {
  const digits = [...text].filter((character) => badgeDigitSegments[character]);
  if (digits.length === 0) return;
  const digitWidth = radius * (digits.length === 1 ? 0.72 : 0.56);
  const digitHeight = radius * (digits.length === 1 ? 1.28 : 1.14);
  const gap = digits.length === 1 ? 0 : radius * 0.1;
  const textWidth = digits.length * digitWidth + Math.max(0, digits.length - 1) * gap;
  const stroke = radius * (digits.length === 1 ? 0.24 : 0.17);
  let cursorX = centerX - textWidth / 2;
  for (const digit of digits) {
    drawBadgeDigit(canvas, width, height, {
      digit,
      height: digitHeight,
      stroke,
      width: digitWidth,
      x: cursorX - (digits.length === 1 && digit === "1" ? digitWidth * 0.19 : 0),
      y: centerY - digitHeight / 2,
    });
    cursorX += digitWidth + gap;
  }
}

function drawBadgeDigit(canvas, width, height, glyph) {
  const left = glyph.x + glyph.stroke / 2;
  const right = glyph.x + glyph.width - glyph.stroke / 2;
  const top = glyph.y + glyph.stroke / 2;
  const middle = glyph.y + glyph.height / 2;
  const bottom = glyph.y + glyph.height - glyph.stroke / 2;
  const segments = {
    top: [left, top, right, top],
    upperLeft: [left, top, left, middle],
    upperRight: [right, top, right, middle],
    middle: [left, middle, right, middle],
    lowerLeft: [left, middle, left, bottom],
    lowerRight: [right, middle, right, bottom],
    bottom: [left, bottom, right, bottom],
  };
  for (const segmentName of badgeDigitSegments[glyph.digit]) {
    drawCapsule(canvas, width, height, segments[segmentName], glyph.stroke, unreadBadge.text);
  }
}

function drawCapsule(canvas, width, height, segment, stroke, color) {
  const [startX, startY, endX, endY] = segment;
  const radius = stroke / 2;
  const minX = Math.floor(Math.min(startX, endX) - radius - 1);
  const maxX = Math.ceil(Math.max(startX, endX) + radius + 1);
  const minY = Math.floor(Math.min(startY, endY) - radius - 1);
  const maxY = Math.ceil(Math.max(startY, endY) + radius + 1);
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const segmentLengthSquared = deltaX * deltaX + deltaY * deltaY;
  for (let y = minY; y < maxY; y += 1) {
    for (let x = minX; x < maxX; x += 1) {
      const projection = segmentLengthSquared <= 0
        ? 0
        : clamp01(((x + 0.5 - startX) * deltaX + (y + 0.5 - startY) * deltaY) / segmentLengthSquared);
      const nearestX = startX + deltaX * projection;
      const nearestY = startY + deltaY * projection;
      const distance = Math.hypot(x + 0.5 - nearestX, y + 0.5 - nearestY);
      const coverage = clamp01(radius + 0.5 - distance);
      if (coverage > 0) blendPixel(canvas, width, height, x, y, { ...color, a: Math.round(color.a * coverage) });
    }
  }
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

function normalizeUnreadCount(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
}

module.exports = { createAppIconRgba, createDesktopShellIconRgba, createUnreadBadgeRgba };
