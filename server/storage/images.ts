import { env } from "../env";

export type ImageMetadata = {
  extension: "gif" | "jpg" | "png" | "webp";
  height?: number;
  mimeType: "image/gif" | "image/jpeg" | "image/png" | "image/webp";
  width?: number;
};

export type ImageValidationResult =
  | { status: "ok"; metadata: ImageMetadata }
  | { status: "tooLarge" }
  | { status: "unsupported" };

const acceptedMimeTypes = new Set(["image/gif", "image/jpeg", "image/png", "image/webp"]);

function normalizeMimeType(value: string) {
  return value.split(";")[0]?.trim().toLowerCase() ?? "";
}

function pngMetadata(buffer: Buffer): ImageMetadata | null {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return null;
  }
  return {
    extension: "png",
    height: buffer.readUInt32BE(20),
    mimeType: "image/png",
    width: buffer.readUInt32BE(16),
  };
}

function gifMetadata(buffer: Buffer): ImageMetadata | null {
  const signature = buffer.subarray(0, 6).toString("ascii");
  if (buffer.length < 10 || (signature !== "GIF87a" && signature !== "GIF89a")) {
    return null;
  }
  return {
    extension: "gif",
    height: buffer.readUInt16LE(8),
    mimeType: "image/gif",
    width: buffer.readUInt16LE(6),
  };
}

function jpegMetadata(buffer: Buffer): ImageMetadata | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
    return null;
  }
  return { extension: "jpg", mimeType: "image/jpeg" };
}

function webpMetadata(buffer: Buffer): ImageMetadata | null {
  if (
    buffer.length < 12 ||
    buffer.subarray(0, 4).toString("ascii") !== "RIFF" ||
    buffer.subarray(8, 12).toString("ascii") !== "WEBP"
  ) {
    return null;
  }
  return { extension: "webp", mimeType: "image/webp" };
}

export function validateImageUpload(input: { buffer: Buffer; contentType: string }): ImageValidationResult {
  if (input.buffer.byteLength > env.OBJECT_STORAGE_UPLOAD_MAX_BYTES) {
    return { status: "tooLarge" };
  }

  const declaredType = normalizeMimeType(input.contentType);
  if (!acceptedMimeTypes.has(declaredType)) {
    return { status: "unsupported" };
  }

  const detected = pngMetadata(input.buffer) ?? jpegMetadata(input.buffer) ?? gifMetadata(input.buffer) ?? webpMetadata(input.buffer);
  if (!detected || detected.mimeType !== declaredType) {
    return { status: "unsupported" };
  }

  return { status: "ok", metadata: detected };
}
