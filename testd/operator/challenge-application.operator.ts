/**
 * `challenge-application.operator.ts`
 *
 * Semantic operator to fill the reason field and submit a challenge application.
 * Used when the challenge application dialog is already open (e.g., after clicking
 * "申请挑战" on an objective). Handles the current UI requirement that the
 * application reason must be non-empty before the submit button is enabled.
 *
 * Dependencies:
 *   - Playwright Page
 *
 * Usage:
 *   import { fillReasonAndSubmitChallengeApplication } from '../operator/challenge-application.operator';
 *   ...
 *   await fillReasonAndSubmitChallengeApplication(page, 'I have completed the prerequisite tasks.');
 *
 * @module operator/challenge-application
 */

import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Default timeout for element visibility and action waits.
 */
const DEFAULT_TIMEOUT = 10_000;

/**
 * Fills the reasons for application textarea and clicks the submit/confirm button
 * inside the challenge application dialog.
 *
 * @param page   - Playwright Page object, the dialog must be open.
 * @param reason - The reason text to fill into the application form.
 * @param options - Optional settings (timeout, custom locator selectors).
 * @throws {Error} If the reason textarea or submit button is not found within timeout.
 */
export async function fillReasonAndSubmitChallengeApplication(
  page: Page,
  reason: string,
  options?: {
    timeout?: number;
    reasonLabel?: string;
    submitRole?: string;
    submitName?: string;
  },
): Promise<void> {
  const {
    timeout = DEFAULT_TIMEOUT,
    reasonLabel = '申请理由',
    submitRole = 'button',
    submitName = '申请挑战',
  } = options ?? {};

  // 1. Locate the textarea for application reason.
  //    The accessible label should be '申请理由' per current UI.
  //    Fallback to a role=textbox if label not found.
  const reasonLocator: Locator = page.getByLabel(reasonLabel, { exact: true }).first();

  // Wait for the reason input to be visible and enabled.
  await expect(reasonLocator).toBeVisible({ timeout });
  await expect(reasonLocator).toBeEnabled({ timeout });

  // 2. Fill the reason.
  await reasonLocator.fill(reason);

  // 3. Locate the submit button.
  const submitLocator: Locator = page.getByRole(submitRole, {
    name: submitName,
    exact: true,
  }).first();

  await expect(submitLocator).toBeVisible({ timeout });
  await expect(submitLocator).toBeEnabled({ timeout });

  // 4. Click to submit the application.
  await submitLocator.click();
}