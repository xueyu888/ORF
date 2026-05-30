typescript
import { type Locator, type Page, expect } from '@playwright/test';
import { createLogger, type Logger, format, transports } from 'winston';
import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// Logging setup
// ---------------------------------------------------------------------------

const logger: Logger = createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.json(),
  ),
  transports: [new transports.Console()],
});

// ---------------------------------------------------------------------------
// Types & Interfaces
// ---------------------------------------------------------------------------

export interface ChallengeApplicationDialog {
  /** Unique identifier for this dialog instance */
  readonly id: string;

  /** Returns true if the dialog is currently visible on the page */
  isOpen(): Promise<boolean>;

  /** Returns the reason input locator (must be open) */
  getReasonInput(): Promise<Locator>;

  /** Returns the submit button locator (must be open) */
  getSubmitButton(): Promise<Locator>;

  /** Returns current submit button state */
  getSubmitButtonStatus(): Promise<'enabled' | 'disabled'>;

  /** Fills the reason text field */
  fillReason(reason: string): Promise<void>;

  /** Clicks submit and waits for dialog to close */
  submit(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Internal locator holder (not exported)
// ---------------------------------------------------------------------------

interface DialogLocators {
  dialog: Locator;
  reasonInput: Locator;
  submitButton: Locator;
}

// ---------------------------------------------------------------------------
// Custom Errors
// ---------------------------------------------------------------------------

export class ChallengeApplicationError extends Error {
  public readonly code: string;
  public readonly context: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    context: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ChallengeApplicationError';
    this.code = code;
    this.context = context;
  }
}

export class DialogNotOpenError extends ChallengeApplicationError {
  constructor(dialogId: string) {
    super(
      `Challenge application dialog (id: ${dialogId}) is not open.`,
      'DIALOG_NOT_OPEN',
      { dialogId },
    );
    this.name = 'DialogNotOpenError';
  }
}

export class ElementNotFoundError extends ChallengeApplicationError {
  constructor(selector: string, details?: Record<string, unknown>) {
    super(`Element not found: ${selector}`, 'ELEMENT_NOT_FOUND', {
      selector,
      ...details,
    });
    this.name = 'ElementNotFoundError';
  }
}

export class ApplicationFailedError extends ChallengeApplicationError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'APPLICATION_FAILED', details);
    this.name = 'ApplicationFailedError';
  }
}

// ---------------------------------------------------------------------------
// Internal helper – resolve dialog locators with validation
// ---------------------------------------------------------------------------

async function resolveDialogLocators(page: Page): Promise<DialogLocators> {
  // Use more flexible pattern to match dialog title variants
  const dialog = page.getByRole('dialog', {
    name: /\s*申请挑战\s*|\s*申请\s*|\s*Apply for Challenge\s*/i,
  });

  // Wait for dialog to be fully visible before querying children
  await expect(dialog).toBeVisible({ timeout: 10000 });

  const reasonInput = dialog.getByLabel(/申请理由|理由|Reason.*申请/i);
  const submitButton = dialog.getByRole('button', {
    name: /\s*申请挑战\s*|\s*确认申请\s*|\s*Submit Application\s*|\s*Apply\s*/i,
  });

  const inputCount = await reasonInput.count();
  if (inputCount === 0) {
    throw new ElementNotFoundError('Reason input inside dialog', {
      labelPattern: '/申请理由|理由/',
    });
  }
  const buttonCount = await submitButton.count();
  if (buttonCount === 0) {
    throw new ElementNotFoundError('Submit button inside dialog', {
      buttonNamePattern: '/申请挑战|Submit Application/',
    });
  }

  return { dialog, reasonInput, submitButton };
}

// ---------------------------------------------------------------------------
// Default implementation of ChallengeApplicationDialog
// ---------------------------------------------------------------------------

class ChallengeApplicationDialogImpl implements ChallengeApplicationDialog {
  public readonly id: string;
  private readonly page: Page;
  private locators: DialogLocators | null = null;

  constructor(page: Page) {
    this.id = uuidv4();
    this.page = page;
  }

  async isOpen(): Promise<boolean> {
    try {
      this.locators = await resolveDialogLocators(this.page);
      return true;
    } catch {
      this.locators = null;
      return false;
    }
  }

  /**
   * Ensures the dialog is open and locators are cached.
   * If not open, throws DialogNotOpenError.
   */
  private async ensureOpen(): Promise<void> {
    if (this.locators === null && !(await this.isOpen())) {
      throw new DialogNotOpenError(this.id);
    }
  }

  async getReasonInput(): Promise<Locator> {
    await this.ensureOpen();
    return this.locators!.reasonInput;
  }

  async getSubmitButton(): Promise<Locator> {
    await this.ensureOpen();
    return this.locators!.submitButton;
  }

  async getSubmitButtonStatus(): Promise<'enabled' | 'disabled'> {
    const button = await this.getSubmitButton();
    const isDisabled = await button.isDisabled();
    return isDisabled ? 'disabled' : 'enabled';
  }

  async fillReason(reason: string): Promise<void> {
    if (typeof reason !== 'string' || reason.trim().length === 0) {
      throw new ChallengeApplicationError(
        'Reason must be a non-empty string.',
        'INVALID_REASON_TYPE',
        { dialogId: this.id, type: typeof reason },
      );
    }
    const reasonInput = await this.getReasonInput();
    await reasonInput.fill(reason);
    logger.debug(`Filled reason in dialog ${this.id}`, { reason });
  }

  async submit(): Promise<void> {
    const button = await this.getSubmitButton();
    const isDisabled = await button.isDisabled();
    if (isDisabled) {
      throw new ApplicationFailedError(
        'Submit button is disabled; reason may be empty or invalid.',
        { dialogId: this.id },
      );
    }
    // Retry click if needed (e.g., due to animation)
    await button.click({ timeout: 5000 });
    logger.info(`Submitted challenge application dialog ${this.id}`);
    // Wait for dialog to close
    await expect(this.locators!.dialog).not.toBeVisible({ timeout: 10000 });
  }
}

// ---------------------------------------------------------------------------
// Exported operators (high-level business steps)
// ---------------------------------------------------------------------------

/**
 * Opens the challenge application dialog for a given challenge.
 *
 * @param page - Current Playwright page instance.
 * @param targetChallengeId - The identifier (or title) of the challenge to apply for.
 * @param options - Optional timeout and retry configuration.
 *   - `timeout`: Maximum time to wait for dialog to appear (default 10000ms).
 * @returns A `ChallengeApplicationDialog` instance once the dialog is visible.
 * @throws {ChallengeApplicationError} If the dialog cannot be opened within timeout.
 */
export async function openChallengeApplicationDialog(
  page: Page,
  targetChallengeId: string,
  options?: { timeout?: number },
): Promise<ChallengeApplicationDialog> {
  const operationId = uuidv4().slice(0, 8);
  const timeout = options?.timeout ?? 10000;

  // Input validation
  if (!targetChallengeId || typeof targetChallengeId !== 'string') {
    throw new ChallengeApplicationError(
      'targetChallengeId must be a non-empty string.',
      'INVALID_ARGUMENT',
      { targetChallengeId, operationId },
    );
  }

  // Escape special regex characters in targetChallengeId for safe use in selector
  const safeId = targetChallengeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const challengeLocator = page.locator(
    `[data-challenge-id="${safeId}"]`,
  ).or(
    page.getByRole('link', { name: new RegExp(safeId, 'i') }),
  );

  // Attempt to click the challenge with retry logic
  let attempt = 0;
  const maxRetries = 3;
  while (attempt < maxRetries) {
    try {
      await challengeLocator.first().click({ timeout: 5000 });
      logger.info(`Clicked challenge "${targetChallengeId}"`, { operationId, attempt });
      break;
    } catch (err) {
      attempt++;
      logger.warn(`Click attempt ${attempt}/${maxRetries} failed for challenge "${targetChallengeId}"`, {
        error: (err as Error).message,
        operationId,
      });
      if (attempt >= maxRetries) {
        throw new ChallengeApplicationError(
          `Failed to click challenge "${targetChallengeId}" after ${maxRetries} attempts.`,
          'CLICK_FAILED',
          { targetChallengeId, operationId },
        );
      }
      // Wait a bit before retrying
      await page.waitForTimeout(1000);
    }
  }

  // Wait for the "申请挑战" button and click it
  const applyButton = page.getByRole('button', {
    name: /\s*申请挑战\s*|\s*Apply for Challenge\s*/i,
  });
  await applyButton.waitFor({ state: 'visible', timeout });
  await applyButton.click();
  logger.info(`Clicked "Apply for Challenge" button for "${targetChallengeId}"`, { operationId });

  // Wait for dialog to appear and return instance
  const dialog = new ChallengeApplicationDialogImpl(page);
  if (!(await dialog.isOpen())) {
    throw new ChallengeApplicationError(
      `Challenge application dialog did not appear after clicking apply for challenge "${targetChallengeId}".`,
      'DIALOG_NOT_OPEN_AFTER_CLICK',
      { targetChallengeId, operationId },
    );
  }
  return dialog;
}

/**
 * Fills the challenge application reason and submits the form.
 *
 * @param dialog - An open ChallengeApplicationDialog instance.
 * @param reason - The reason text to fill.
 * @param options - Optional: `skipValidation` to bypass empty check (default false).
 * @throws {ApplicationFailedError} If reason is empty and skipValidation is false.
 */
export async function applyForChallengeWithReason(
  dialog: ChallengeApplicationDialog,
  reason: string,
  options?: { skipValidation?: boolean },
): Promise<void> {
  const shouldValidate = options?.skipValidation !== true;
  if (shouldValidate && (!reason || typeof reason !== 'string' || reason.trim().length === 0)) {
    throw new ApplicationFailedError(
      'Reason must be provided and non-empty when skipValidation is false.',
      { dialogId: dialog.id },
    );
  }
  await dialog.fillReason(reason);
  await dialog.submit();
  logger.info(`Applied for challenge with reason: "${reason}"`, { dialogId: dialog.id });
}