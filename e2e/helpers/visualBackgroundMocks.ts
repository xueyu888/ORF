import type { Page, Route } from "@playwright/test";
import type { VisualBackgroundScene } from "../../src/state/apiClient";

const testBackgroundPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

export function visualBackgroundFixture(scene: VisualBackgroundScene) {
  return {
    scene,
    config: {
      mode: "fixed",
      fixedBackgroundId: `${scene}/default/test-bg.png`,
      switchTrigger: "on_open",
      switchOrder: "random",
      switchIntervalMinutes: 10,
    },
    list: [
      {
        id: `${scene}/default/test-bg.png`,
        scene,
        fileName: "test-bg.png",
        url: `/settings/backgrounds/${scene}/default/test-bg.png`,
        fileKey: `${scene}/default/test-bg.png`,
        mimeType: "image/png",
        fileSize: testBackgroundPng.length,
        isDefault: true,
      },
    ],
  };
}

export async function fulfillVisualBackgroundImage(route: Route) {
  await route.fulfill({
    contentType: "image/png",
    body: testBackgroundPng,
  });
}

export async function routeVisualBackgroundMocks(page: Page) {
  await page.route("**/api/settings/visual/backgrounds?**", async (route) => {
    const url = new URL(route.request().url());
    const scene = (url.searchParams.get("scene") ?? "login_background") as VisualBackgroundScene;

    await route.fulfill({
      json: {
        code: 0,
        message: "ok",
        data: visualBackgroundFixture(scene),
      },
    });
  });

  await page.route("**/settings/backgrounds/**", fulfillVisualBackgroundImage);
}
