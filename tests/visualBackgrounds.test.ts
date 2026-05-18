import assert from "node:assert/strict";
import test from "node:test";
import { isSupportedVisualBackgroundImage } from "../server/settings/visualBackgrounds";

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
