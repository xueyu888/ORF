import assert from "node:assert/strict";
import { readdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  isSupportedVisualBackgroundImage,
  listVisualBackgrounds,
  parseBackgroundId,
  saveUploadedVisualBackground,
  saveVisualBackgroundConfig,
} from "../server/settings/visualBackgrounds";

const uploadRacePrefix = "orf-race-upload";
const userLoginBackgroundDir = path.join(process.cwd(), "public", "settings", "backgrounds", "login_background", "user");
const userSettingsPath = path.join(process.cwd(), "public", "settings", "user", "settings.json");
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function cleanupRaceUploads() {
  const entries = await readdir(userLoginBackgroundDir).catch(() => []);
  await Promise.all(
    entries
      .filter((entry) => entry.startsWith(uploadRacePrefix))
      .map((entry) => unlink(path.join(userLoginBackgroundDir, entry)).catch(() => undefined)),
  );
}

async function withUserSettingsBackup(run: () => Promise<void>) {
  const originalSettings = await readFile(userSettingsPath, "utf8").catch(() => null);

  try {
    await run();
  } finally {
    if (originalSettings === null) {
      await rm(userSettingsPath, { force: true });
    } else {
      await writeFile(userSettingsPath, originalSettings, "utf8");
    }
  }
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

test("concurrent visual background config writes preserve independent scene updates", async () => {
  await withUserSettingsBackup(async () => {
    await Promise.all([
      saveVisualBackgroundConfig("login_background", {
        mode: "fixed",
        fixedBackgroundId: "login_background/default/orf-login-sky-adventure.png",
        switchTrigger: "on_open",
        switchOrder: "sequential",
        switchIntervalMinutes: 3,
      }),
      saveVisualBackgroundConfig("sidebar_background", {
        mode: "fixed",
        fixedBackgroundId: "sidebar_background/default/sidebar-character-guide-bg.png",
        switchTrigger: "interval",
        switchOrder: "random",
        switchIntervalMinutes: 17,
      }),
    ]);

    const [loginBackgrounds, sidebarBackgrounds] = await Promise.all([
      listVisualBackgrounds("login_background"),
      listVisualBackgrounds("sidebar_background"),
    ]);

    assert.equal(loginBackgrounds.config.fixedBackgroundId, "login_background/default/orf-login-sky-adventure.png");
    assert.equal(loginBackgrounds.config.switchOrder, "sequential");
    assert.equal(loginBackgrounds.config.switchIntervalMinutes, 3);
    assert.equal(sidebarBackgrounds.config.fixedBackgroundId, "sidebar_background/default/sidebar-character-guide-bg.png");
    assert.equal(sidebarBackgrounds.config.switchTrigger, "interval");
    assert.equal(sidebarBackgrounds.config.switchIntervalMinutes, 17);
  });
});
