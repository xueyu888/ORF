const zlib = require("node:zlib");

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function readRgbaPng(input) {
  if (!input.subarray(0, pngSignature.length).equals(pngSignature)) {
    throw new Error("Image source is not a PNG file.");
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
        throw new Error("Image source must be an 8-bit non-interlaced RGBA PNG.");
      }
    } else if (chunkType === "IDAT") {
      idatParts.push(chunkData);
    } else if (chunkType === "IEND") {
      break;
    }
  }

  if (width <= 0 || height <= 0 || idatParts.length === 0) {
    throw new Error("Image source PNG is missing image data.");
  }

  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const inflated = zlib.inflateSync(Buffer.concat(idatParts));
  const data = Buffer.alloc(width * height * bytesPerPixel);
  let sourceOffset = 0;
  let previousRow = Buffer.alloc(stride);

  for (let y = 0; y < height; y += 1) {
    const filterType = inflated[sourceOffset];
    sourceOffset += 1;
    const filteredRow = inflated.subarray(sourceOffset, sourceOffset + stride);
    sourceOffset += stride;
    const row = Buffer.alloc(stride);
    unfilterPngRow(filterType, filteredRow, row, previousRow, bytesPerPixel);
    row.copy(data, y * stride);
    previousRow = row;
  }

  return { data, height, width };
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
      const weights = [
        (1 - xWeight) * (1 - yWeight),
        xWeight * (1 - yWeight),
        (1 - xWeight) * yWeight,
        xWeight * yWeight,
      ];
      const samples = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]];
      let alpha = 0;
      const premultiplied = [0, 0, 0];
      for (let index = 0; index < samples.length; index += 1) {
        const [sampleX, sampleY] = samples[index];
        const sourceIndex = (sampleY * source.width + sampleX) * 4;
        const sampleAlpha = source.data[sourceIndex + 3] / 255;
        const weightedAlpha = sampleAlpha * weights[index];
        alpha += weightedAlpha;
        for (let channel = 0; channel < 3; channel += 1) {
          premultiplied[channel] += source.data[sourceIndex + channel] * weightedAlpha;
        }
      }

      const targetIndex = (y * targetWidth + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        output[targetIndex + channel] = alpha > 0 ? Math.round(premultiplied[channel] / alpha) : 0;
      }
      output[targetIndex + 3] = Math.round(alpha * 255);
    }
  }

  return output;
}

function containRgba(source, targetWidth, targetHeight, scale = 1) {
  const containedWidth = Math.max(1, Math.round(targetWidth * scale));
  const containedHeight = Math.max(1, Math.round(targetHeight * scale));
  const resized = resizeRgba(source, containedWidth, containedHeight);
  const output = Buffer.alloc(targetWidth * targetHeight * 4);
  const offsetX = Math.floor((targetWidth - containedWidth) / 2);
  const offsetY = Math.floor((targetHeight - containedHeight) / 2);
  for (let y = 0; y < containedHeight; y += 1) {
    resized.copy(
      output,
      ((y + offsetY) * targetWidth + offsetX) * 4,
      y * containedWidth * 4,
      (y + 1) * containedWidth * 4,
    );
  }
  return output;
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
  for (const byte of input) crc = (crc >>> 8) ^ crc32Table[(crc ^ byte) & 0xff];
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

module.exports = { containRgba, encodeRgbaPng, readRgbaPng, resizeRgba };
