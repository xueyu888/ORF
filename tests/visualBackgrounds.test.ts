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
import {
  deletePersonalBackground,
  listPersonalBackgrounds,
  readUserPreferences,
  saveUploadedPersonalBackground,
  saveUserPreferences,
} from "../server/settings/personalSettings";

const uploadRacePrefix = "orf-race-upload";
const systemLoginBackgroundDir = path.join(process.cwd(), "public", "settings", "backgrounds", "login_background", "system");
const systemSettingsPath = path.join(process.cwd(), "public", "settings", "system", "settings.json");
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const personalSettingsUserId = "visual-personal-settings-test";
const otherPersonalSettingsUserId = "visual-personal-settings-other";

async function cleanupRaceUploads() {
  const entries = await readdir(systemLoginBackgroundDir).catch(() => []);
  await Promise.all(
    entries
      .filter((entry) => entry.startsWith(uploadRacePrefix))
      .map((entry) => unlink(path.join(systemLoginBackgroundDir, entry)).catch(() => undefined)),
  );
}

async function withUserSettingsBackup(run: () => Promise<void>) {
  const originalSettings = await readFile(systemSettingsPath, "utf8").catch(() => null);

  try {
    await run();
  } finally {
    if (originalSettings === null) {
      await rm(systemSettingsPath, { force: true });
    } else {
      await writeFile(systemSettingsPath, originalSettings, "utf8");
    }
  }
}

function personalSettingsDir(userId: string) {
  return path.join(process.cwd(), "public", "settings", "users", Buffer.from(userId, "utf8").toString("base64url"));
}

async function withPersonalSettingsCleanup(run: () => Promise<void>) {
  await Promise.all([
    rm(personalSettingsDir(personalSettingsUserId), { recursive: true, force: true }),
    rm(personalSettingsDir(otherPersonalSettingsUserId), { recursive: true, force: true }),
  ]);

  try {
    await run();
  } finally {
    await Promise.all([
      rm(personalSettingsDir(personalSettingsUserId), { recursive: true, force: true }),
      rm(personalSettingsDir(otherPersonalSettingsUserId), { recursive: true, force: true }),
    ]);
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
    assert.ok(ids.every((id) => id.startsWith(`login_background/system/${uploadRacePrefix}`)));
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
      saveVisualBackgroundConfig("app_background", {
        mode: "fixed",
        fixedBackgroundId: "sidebar_background/default/sidebar-character-guide-bg.png",
        switchTrigger: "interval",
        switchOrder: "random",
        switchIntervalMinutes: 17,
      }),
    ]);

    const [loginBackgrounds, sidebarBackgrounds] = await Promise.all([
      listVisualBackgrounds("login_background"),
      listVisualBackgrounds("app_background"),
    ]);

    assert.equal(loginBackgrounds.config.fixedBackgroundId, "login_background/default/orf-login-sky-adventure.png");
    assert.equal(loginBackgrounds.config.switchOrder, "sequential");
    assert.equal(loginBackgrounds.config.switchIntervalMinutes, 3);
    assert.equal(sidebarBackgrounds.config.fixedBackgroundId, "sidebar_background/default/sidebar-character-guide-bg.png");
    assert.equal(sidebarBackgrounds.config.switchTrigger, "interval");
    assert.equal(sidebarBackgrounds.config.switchIntervalMinutes, 17);
  });
});

test("personal background preferences are scoped to the current user", async () => {
  await withPersonalSettingsCleanup(async () => {
    const uploaded = await saveUploadedPersonalBackground({
      userId: personalSettingsUserId,
      fileName: "my background.png",
      mimeType: "image/png",
      buffer: Buffer.concat([pngSignature, Buffer.from([1])]),
    });

    assert.match(uploaded.id, /^app_background\/personal\//);
    await saveUserPreferences(personalSettingsUserId, {
      appBackground: {
        mode: "fixed",
        fixedBackgroundId: uploaded.id,
        switchTrigger: "on_open",
        switchOrder: "random",
        switchIntervalMinutes: 10,
      },
    });

    await assert.rejects(
      () =>
        saveUserPreferences(otherPersonalSettingsUserId, {
          appBackground: {
            mode: "fixed",
            fixedBackgroundId: uploaded.id,
            switchTrigger: "on_open",
            switchOrder: "random",
            switchIntervalMinutes: 10,
          },
        }),
      /background not found/,
    );

    const personalBackgrounds = await listPersonalBackgrounds(personalSettingsUserId);
    assert.equal(personalBackgrounds.config.fixedBackgroundId, uploaded.id);
    assert.equal(personalBackgrounds.list.some((image) => image.id === uploaded.id && image.isDefault), true);

    await deletePersonalBackground(personalSettingsUserId, uploaded.id);
    const preferencesAfterDelete = await readUserPreferences(personalSettingsUserId);
    assert.equal(preferencesAfterDelete.appBackground, null);
  });
});
