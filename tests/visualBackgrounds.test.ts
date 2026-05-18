import assert from "node:assert/strict";
import { readdir, unlink } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { isSupportedVisualBackgroundImage, parseBackgroundId, saveUploadedVisualBackground } from "../server/settings/visualBackgrounds";

const uploadRacePrefix = "orf-race-upload";
const userLoginBackgroundDir = path.join(process.cwd(), "public", "settings", "backgrounds", "login_background", "user");
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function cleanupRaceUploads() {
  const entries = await readdir(userLoginBackgroundDir).catch(() => []);
  await Promise.all(
    entries
      .filter((entry) => entry.startsWith(uploadRacePrefix))
      .map((entry) => unlink(path.join(userLoginBackgroundDir, entry)).catch(() => undefined)),
  );
}

test("visual background uploads require real image signatures", () => {
  assert.equal(isSupportedVisualBackgroundImage("image/png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), true);
  assert.equal(isSupportedVisualBackgroundImage("image/jpeg", Buffer.from([0xff, 0xd8, 0xff, 0xe0])), true);
  assert.equal(isSupportedVisualBackgroundImage("image/gif", Buffer.from("GIF89a", "ascii")), true);
  assert.equal(isSupportedVisualBackgroundImage("image/webp", Buffer.from("RIFFxxxxWEBP", "ascii")), true);
  assert.equal(isSupportedVisualBackgroundImage("image/avif", Buffer.from("\0\0\0 ftypavif\0\0\0\0", "binary")), true);
});

test("visual background uploads reject spoofed image MIME types", () => {
  assert.equal(isSupportedVisualBackgroundImage("image/png", Buffer.from("<script>alert(1)</script>", "utf8")), false);
  assert.equal(isSupportedVisualBackgroundImage("image/svg+xml", Buffer.from("<svg />", "utf8")), false);
  assert.equal(isSupportedVisualBackgroundImage("image/webp", Buffer.from("not a webp", "utf8")), false);
});

test("visual background ids reject malformed encodings without server errors", () => {
  assert.throws(() => parseBackgroundId("login_background/default/%E0%A4%A"), /background not found/);
});

test("concurrent visual background uploads reserve unique file ids", async () => {
  await cleanupRaceUploads();

  try {
    const uploads = Array.from({ length: 24 }, (_, index) =>
      saveUploadedVisualBackground({
        scene: "login_background",
        fileName: `${uploadRacePrefix}.png`,
        mimeType: "image/png",
        buffer: Buffer.concat([pngSignature, Buffer.from([index])]),
      }),
    );
    const images = await Promise.all(uploads);
    const ids = images.map((image) => image.id);

    assert.equal(new Set(ids).size, images.length);
    assert.ok(ids.every((id) => id.startsWith(`login_background/user/${uploadRacePrefix}`)));
  } finally {
    await cleanupRaceUploads();
  }
});
