const UNREAD_BADGE_LIMIT = 99;

const palette = {
  markSky: { r: 84, g: 166, b: 255, a: 255 },
  markBlue: { r: 47, g: 122, b: 255, a: 255 },
  markMint: { r: 33, g: 229, b: 194, a: 255 },
  markHighlight: { r: 233, g: 251, b: 255, a: 238 },
  googleBlue: { r: 66, g: 133, b: 244, a: 255 },
  googleGreen: { r: 52, g: 168, b: 83, a: 255 },
  googleRed: { r: 234, g: 67, b: 53, a: 255 },
  googleYellow: { r: 251, g: 188, b: 4, a: 255 },
  gold: { r: 255, g: 201, b: 91, a: 242 },
  shadow: { r: 4, g: 12, b: 24, a: 92 },
  badgeOuter: { r: 255, g: 255, b: 255, a: 245 },
  badgeRed: { r: 242, g: 57, b: 66, a: 255 },
  badgeRedDeep: { r: 198, g: 30, b: 43, a: 255 },
  white: { r: 255, g: 255, b: 255, a: 255 },
};

const badgeGlyphs = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
  "+": ["000", "010", "111", "010", "000"],
  "?": ["111", "001", "011", "000", "010"],
};

function createAppIconRgba(width, height = width, options = {}) {
  const canvas = createCanvas(width, height);
  const size = Math.min(width, height);
  const x = (width - size) / 2;
  const y = (height - size) / 2;
  drawAppMark(canvas, {
    centerX: x + size * 0.5,
    centerY: y + size * 0.5,
    size,
  });

  if (Number.isFinite(options.unreadCount) && options.unreadCount > 0) {
    drawUnreadBadge(canvas, options.unreadCount, {
      centerX: x + size * 0.765,
      centerY: y + size * 0.235,
      radius: size * 0.195,
    });
  }

  return canvas.buffer;
}

function createAppIconForegroundRgba(width, height = width) {
  const canvas = createCanvas(width, height);
  const size = Math.min(width, height);
  drawAppMark(canvas, {
    centerX: width / 2,
    centerY: height / 2,
    size,
  });
  return canvas.buffer;
}

function createUnreadBadgeRgba(width, height = width, unreadCount = 0) {
  const canvas = createCanvas(width, height);
  const size = Math.min(width, height);
  drawUnreadBadge(canvas, unreadCount, {
    centerX: width / 2,
    centerY: height / 2,
    radius: size * 0.42,
  });
  return canvas.buffer;
}

function drawAppMark(canvas, options) {
  const size = options.size;
  const cx = options.centerX;
  const cy = options.centerY;
  const clipRoundedRect = options.clipRoundedRect;
  const stroke = size * 0.205;
  const diagonal = size * 0.285;
  const shadowOffset = size * 0.028;

  drawRoundedLineGradient(canvas, cx - diagonal + shadowOffset, cy + diagonal + shadowOffset, cx + diagonal + shadowOffset, cy - diagonal + shadowOffset, stroke * 1.05, [
    { offset: 0, color: { ...palette.shadow, a: 142 } },
    { offset: 1, color: { ...palette.shadow, a: 96 } },
  ], { clipRoundedRect });
  drawRoundedLineGradient(canvas, cx - diagonal + shadowOffset, cy - diagonal + shadowOffset, cx + diagonal + shadowOffset, cy + diagonal + shadowOffset, stroke * 1.05, [
    { offset: 0, color: { ...palette.shadow, a: 128 } },
    { offset: 1, color: { ...palette.shadow, a: 86 } },
  ], { clipRoundedRect });

  drawRoundedLineGradient(canvas, cx - diagonal, cy + diagonal, cx + diagonal, cy - diagonal, stroke, [
    { offset: 0, color: palette.googleGreen },
    { offset: 0.36, color: palette.markMint },
    { offset: 0.72, color: palette.googleBlue },
    { offset: 1, color: palette.markBlue },
  ], { clipRoundedRect });
  drawRoundedLineGradient(canvas, cx - diagonal * 0.96, cy - diagonal * 0.96, cx + diagonal * 0.96, cy + diagonal * 0.96, stroke, [
    { offset: 0, color: palette.googleRed },
    { offset: 0.34, color: palette.googleYellow },
    { offset: 0.72, color: palette.markSky },
    { offset: 1, color: palette.googleBlue },
  ], { clipRoundedRect });

  drawRoundedLineGradient(canvas, cx - diagonal * 0.48, cy + diagonal * 0.78, cx + diagonal * 0.78, cy - diagonal * 0.48, stroke * 0.27, [
    { offset: 0, color: { ...palette.white, a: 218 } },
    { offset: 0.5, color: { ...palette.markHighlight, a: 232 } },
    { offset: 1, color: { ...palette.gold, a: 246 } },
  ], { clipRoundedRect });
  drawCircleGradient(canvas, cx + size * 0.215, cy - size * 0.215, size * 0.055, [
    { offset: 0, color: { ...palette.white, a: 230 } },
    { offset: 1, color: { ...palette.gold, a: 0 } },
  ], { clipRoundedRect });
}

function drawUnreadBadge(canvas, unreadCount, options) {
  const radius = options.radius;
  drawCircle(canvas, options.centerX, options.centerY, radius, palette.badgeOuter);
  drawCircleGradient(canvas, options.centerX, options.centerY, radius * 0.86, [
    { offset: 0, color: palette.badgeRed },
    { offset: 1, color: palette.badgeRedDeep },
  ]);

  const label = unreadBadgeLabel(unreadCount);
  const textScale = badgeTextScale(label, radius);
  drawCenteredPixelText(canvas, label, options.centerX, options.centerY + radius * 0.02, textScale, palette.white);
}

function createCanvas(width, height) {
  return {
    buffer: Buffer.alloc(width * height * 4),
    height,
    width,
  };
}

function drawRoundedRect(canvas, x, y, width, height, radius, color) {
  const rect = { x, y, width, height, radius };
  const startX = Math.floor(x);
  const endX = Math.ceil(x + width);
  const startY = Math.floor(y);
  const endY = Math.ceil(y + height);
  for (let pixelY = startY; pixelY < endY; pixelY += 1) {
    for (let pixelX = startX; pixelX < endX; pixelX += 1) {
      const coverage = roundedRectCoverage(pixelX + 0.5, pixelY + 0.5, rect);
      if (coverage > 0) blendPixel(canvas, pixelX, pixelY, { ...color, a: Math.round(color.a * coverage) });
    }
  }
}

function drawCircle(canvas, centerX, centerY, radius, color) {
  const startX = Math.floor(centerX - radius - 1);
  const endX = Math.ceil(centerX + radius + 1);
  const startY = Math.floor(centerY - radius - 1);
  const endY = Math.ceil(centerY + radius + 1);
  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const distance = Math.hypot(x + 0.5 - centerX, y + 0.5 - centerY);
      const coverage = clamp01(radius + 0.5 - distance);
      if (coverage > 0) blendPixel(canvas, x, y, { ...color, a: Math.round(color.a * coverage) });
    }
  }
}

function drawCircleGradient(canvas, centerX, centerY, radius, stops, options = {}) {
  const startX = Math.floor(centerX - radius - 1);
  const endX = Math.ceil(centerX + radius + 1);
  const startY = Math.floor(centerY - radius - 1);
  const endY = Math.ceil(centerY + radius + 1);
  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const pointX = x + 0.5;
      const pointY = y + 0.5;
      const distance = Math.hypot(pointX - centerX, pointY - centerY);
      let coverage = clamp01(radius + 0.5 - distance);
      if (coverage <= 0) continue;
      if (options.clipRoundedRect) coverage *= roundedRectCoverage(pointX, pointY, options.clipRoundedRect);
      if (coverage <= 0) continue;
      const color = sampleStops(stops, clamp01(distance / radius));
      blendPixel(canvas, x, y, { ...color, a: Math.round(color.a * coverage) });
    }
  }
}

function drawRoundedLineGradient(canvas, startX, startY, endX, endY, thickness, stops, options = {}) {
  const halfThickness = thickness / 2;
  const minX = Math.floor(Math.min(startX, endX) - halfThickness - 1);
  const maxX = Math.ceil(Math.max(startX, endX) + halfThickness + 1);
  const minY = Math.floor(Math.min(startY, endY) - halfThickness - 1);
  const maxY = Math.ceil(Math.max(startY, endY) + halfThickness + 1);
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  if (lengthSquared <= 0) return;

  for (let y = minY; y < maxY; y += 1) {
    for (let x = minX; x < maxX; x += 1) {
      const pointX = x + 0.5;
      const pointY = y + 0.5;
      const progress = clamp01(((pointX - startX) * deltaX + (pointY - startY) * deltaY) / lengthSquared);
      const nearestX = startX + progress * deltaX;
      const nearestY = startY + progress * deltaY;
      const distance = Math.hypot(pointX - nearestX, pointY - nearestY);
      let coverage = clamp01(halfThickness + 0.5 - distance);
      if (coverage <= 0) continue;
      if (options.clipRoundedRect) coverage *= roundedRectCoverage(pointX, pointY, options.clipRoundedRect);
      if (coverage <= 0) continue;
      const color = sampleStops(stops, progress);
      blendPixel(canvas, x, y, { ...color, a: Math.round(color.a * coverage) });
    }
  }
}

function drawCenteredPixelText(canvas, text, centerX, centerY, scale, color) {
  const glyphs = String(text).split("").map((char) => badgeGlyphs[char] ?? badgeGlyphs["?"]);
  const glyphWidth = 3;
  const glyphHeight = 5;
  const gap = scale;
  const totalWidth = glyphs.length * glyphWidth * scale + Math.max(0, glyphs.length - 1) * gap;
  let cursorX = centerX - totalWidth / 2;
  const top = centerY - (glyphHeight * scale) / 2;
  for (const glyph of glyphs) {
    for (let row = 0; row < glyphHeight; row += 1) {
      for (let column = 0; column < glyphWidth; column += 1) {
        if (glyph[row]?.[column] === "1") {
          drawRoundedRect(canvas, cursorX + column * scale, top + row * scale, scale, scale, Math.max(0.7, scale * 0.18), color);
        }
      }
    }
    cursorX += glyphWidth * scale + gap;
  }
}

function roundedRectCoverage(pointX, pointY, rect) {
  if (pointX < rect.x - 0.5 || pointY < rect.y - 0.5 || pointX > rect.x + rect.width + 0.5 || pointY > rect.y + rect.height + 0.5) {
    return 0;
  }
  const nearestX = Math.max(rect.x + rect.radius, Math.min(pointX, rect.x + rect.width - rect.radius));
  const nearestY = Math.max(rect.y + rect.radius, Math.min(pointY, rect.y + rect.height - rect.radius));
  const distance = Math.hypot(pointX - nearestX, pointY - nearestY);
  if (distance <= rect.radius - 0.5) return 1;
  return clamp01(rect.radius + 0.5 - distance);
}

function blendPixel(canvas, x, y, color) {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height || color.a <= 0) return;
  const offset = (y * canvas.width + x) * 4;
  const alpha = color.a / 255;
  const inverseAlpha = 1 - alpha;
  canvas.buffer[offset] = Math.round(color.r * alpha + canvas.buffer[offset] * inverseAlpha);
  canvas.buffer[offset + 1] = Math.round(color.g * alpha + canvas.buffer[offset + 1] * inverseAlpha);
  canvas.buffer[offset + 2] = Math.round(color.b * alpha + canvas.buffer[offset + 2] * inverseAlpha);
  canvas.buffer[offset + 3] = Math.round(color.a + canvas.buffer[offset + 3] * inverseAlpha);
}

function sampleStops(stops, position) {
  if (stops.length <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  if (position <= stops[0].offset) return stops[0].color;
  for (let index = 1; index < stops.length; index += 1) {
    const current = stops[index];
    const previous = stops[index - 1];
    if (position <= current.offset) {
      const progress = (position - previous.offset) / Math.max(0.0001, current.offset - previous.offset);
      return mixColor(previous.color, current.color, clamp01(progress));
    }
  }
  return stops[stops.length - 1].color;
}

function mixColor(start, end, progress) {
  return {
    r: Math.round(start.r + (end.r - start.r) * progress),
    g: Math.round(start.g + (end.g - start.g) * progress),
    b: Math.round(start.b + (end.b - start.b) * progress),
    a: Math.round(start.a + (end.a - start.a) * progress),
  };
}

function badgeTextScale(label, radius) {
  if (radius >= 34) {
    if (label.length <= 1) return radius * 0.27;
    if (label.length <= 2) return radius * 0.2;
    return radius * 0.14;
  }
  if (label.length <= 1) return radius * 0.26;
  if (label.length <= 2) return radius * 0.18;
  return radius * 0.12;
}

function unreadBadgeLabel(unreadCount) {
  return unreadCount > UNREAD_BADGE_LIMIT ? `${UNREAD_BADGE_LIMIT}+` : String(Math.max(0, Math.floor(unreadCount)));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

module.exports = {
  createAppIconForegroundRgba,
  createAppIconRgba,
  createUnreadBadgeRgba,
};
