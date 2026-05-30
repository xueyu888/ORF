import type { Page } from "@playwright/test";
import type { CapturedResponse } from "../../../_operators/common.context";
import { readResponseBody } from "../../../_operators/common.helpers";

export function captureUserUpdateResponse(page: Page, userId: string): Promise<CapturedResponse> {
  return page
    .waitForResponse((response) => {
      return response.request().method().toUpperCase() === "PATCH" && response.url().endsWith(`/api/users/${userId}`);
    })
    .then(async (response) => ({
      ok: response.ok(),
      status: response.status(),
      url: response.url(),
      method: response.request().method(),
      body: await readResponseBody(response),
    }));
}

export function captureUserDisableResponse(page: Page, userId: string): Promise<CapturedResponse> {
  return page
    .waitForResponse((response) => {
      return response.request().method().toUpperCase() === "PATCH" && response.url().endsWith(`/api/users/${userId}/disable`);
    })
    .then(async (response) => ({
      ok: response.ok(),
      status: response.status(),
      url: response.url(),
      method: response.request().method(),
      body: await readResponseBody(response),
    }));
}

export function captureUserDeleteResponse(page: Page, userId: string): Promise<CapturedResponse> {
  return page
    .waitForResponse((response) => {
      return response.request().method().toUpperCase() === "DELETE" && response.url().endsWith(`/api/users/${userId}`);
    })
    .then(async (response) => ({
      ok: response.ok(),
      status: response.status(),
      url: response.url(),
      method: response.request().method(),
      body: await readResponseBody(response),
    }));
}
