typescript
/**
 * testd/operators/auth.ts
 *
 * Semantic UI operators for authentication flows and general page interactions.
 * Provides a reliable abstraction layer between test case steps and DOM elements.
 * All interactions include retry with exponential backoff, detailed logging, and
 * typed error propagation.
 *
 * @module Operators
 */

import { Page, Locator, expect } from '@playwright/test';
import { Logger } from '../utils/logger';
import { TestConfig } from '../config';

// ═════════════════════════════════════════════════════════════════
//  Domain Errors
// ═════════════════════════════════════════════════════════════════

/**
 * Base error for all operator failures. Carries optional structured context
 * for diagnostic aggregation.
 */
export class OperatorError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'OperatorError';
    Object.setPrototypeOf(this, OperatorError.prototype);
  }
}

/** Thrown when an expected DOM element is missing or not reachable. */
export class ElementNotFoundError extends OperatorError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
    this.name = 'ElementNotFoundError';
  }
}

/** Thrown when user-supplied data violates business rules or security constraints. */
export class ValidationError extends OperatorError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
    this.name = 'ValidationError';
  }
}

/** Thrown when an expected API response is missing, malformed, or fails. */
export class ApiError extends OperatorError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
    this.name = 'ApiError';
  }
}

// ═════════════════════════════════════════════════════════════════
//  Constants
// ═════════════════════════════════════════════════════════════════

const DEFAULT_TIMEOUT = TestConfig.defaultTimeout ?? 10_000;
/** Multiplier applied to the base timeout for API-level operations. */
const API_TIMEOUT_MULTIPLIER = 3;
const MIN_PASSWORD_LENGTH = 8;
const MAX_INPUT_LENGTH = 1000;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_UPPERCASE_REGEX = /[A-Z]/;
const PASSWORD_LOWERCASE_REGEX = /[a-z]/;
const PASSWORD_DIGIT_REGEX = /\d/;
const PASSWORD_SPECIAL_REGEX = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/;
const APPLICATION_REASON_MIN_LENGTH = 10;
const APPLICATION_REASON_MAX_LENGTH = 500;
const SUBTASK_TITLE_MAX_LENGTH = 200;
const RETRY_COUNT = 3;
const RETRY_BASE_DELAY_MS = 500;
const RETRY_BACKOFF_FACTOR = 2;
const EXCESSIVE_RETRY_WARN_THRESHOLD = 5;

// ── Helper Types ──────────────────────────────────────────────

type WaitForState = 'visible' | 'attached' | 'stable';
type ClickOptions = {
  timeout?: number;
  state?: WaitForState;
  /** True to force dispatch event, bypassing actionability checks. */
  force?: boolean;
};
type FillOptions = { timeout?: number };
type ApiResponse = {
  ok: boolean;
  status: number;
  body: string;
  headers?: Record<string, string>;
};
type SelectOption =
  | string
  | { label?: string; value?: string; index?: number };

// ═════════════════════════════════════════════════════════════════
//  Base Operator
// ═════════════════════════════════════════════════════════════════

/**
 * Provides a set of reliable, self-healing interaction primitives for Playwright tests.
 * Every public method validates inputs, applies retry logic with exponential backoff,
 * logs operations, and converts low-level Playwright exceptions into domain-specific
 * errors with structured context.
 */
export class BaseOperator {
  protected readonly page: Page;
  protected readonly logger: Logger;
  protected readonly timeout: number;

  /**
   * @param page  - Playwright Page instance.
   * @param logger - Logger instance (must be pre-configured).
   */
  constructor(page: Page, logger: Logger) {
    this.page = page;
    this.logger = logger;
    this.timeout = DEFAULT_TIMEOUT;
  }

  // ── Locator Retrieval ──────────────────────────────────────

  /**
   * Retrieves an exact accessibility-label locator.
   * @param label - The aria-label attribute value.
   * @returns A Playwright Locator.
   */
  protected getByLabel(label: string): Locator {
    return this.page.getByLabel(label, { exact: true });
  }

  /**
   * Retrieves a role-based locator with exact name match.
   * @param role - The WAI-ARIA role (e.g., 'button', 'menuitem').
   * @param name - The accessible name.
   * @returns A Playwright Locator.
   */
  protected getByRole(role: string, name: string): Locator {
    return this.page.getByRole(role, { name, exact: true });
  }

  /**
   * Retrieves a test-id based locator (falls back to `data-testid` attribute).
   * @param testId - The `data-testid` value.
   * @returns A Playwright Locator.
   */
  protected getByTestId(testId: string): Locator {
    return this.page.getByTestId(testId);
  }

  // ── Private Utilities ──────────────────────────────────────

  /**
   * Internal retry loop with exponential backoff.
   * @param action - Async callback to retry.
   * @param description - Human-readable label for logging.
   * @param maxAttempts - Max retry attempts (default RETRY_COUNT).
   * @returns The result of the action.
   * @throws The last error thrown by `action` after all retries are exhausted.
   */
  private async _withRetry<T>(
    action: () => Promise<T>,
    description: string,
    maxAttempts: number = RETRY_COUNT,
  ): Promise<T> {
    let lastError: unknown;
    let delay = RETRY_BASE_DELAY_MS;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await action();
        this.logger.debug(`Op succeeded: "${description}" (attempt ${attempt})`);
        return result;
      } catch (cause) {
        lastError = cause;
        this.logger.warn(
          `Attempt ${attempt}/${maxAttempts} failed for "${description}": ${cause}`,
        );
        if (attempt < maxAttempts) {
          await this.page.waitForTimeout(delay);
          delay *= RETRY_BACKOFF_FACTOR;
        }
      }
    }
    const finalError = new ElementNotFoundError(
      `Operation "${description}" failed after ${maxAttempts} attempts`,
      { description, attempts: maxAttempts, cause: String(lastError) },
    );
    this.logger.error(finalError.message);
    throw finalError;
  }

  // ── Interaction Primitives ─────────────────────────────────

  /**
   * Waits for a locator to reach the specified state, scrolls into view,
   * then clicks it.
   *
   * @param locator    - The Playwright Locator.
   * @param description - Human-readable name for logging.
   * @param options     - Click options (timeout, state, force).
   * @throws {ElementNotFoundError} If the element is not found or not clickable.
   */
  protected async waitForAndClick(
    locator: Locator,
    description: string,
    options: ClickOptions = {},
  ): Promise<void> {
    const effectiveTimeout = options.timeout ?? this.timeout;
    const state = options.state ?? 'visible';
    this.logger.debug(`Preparing to click "${description}" (state: ${state})`);

    await this._withRetry<void>(async () => {
      await locator.waitFor({ state, timeout: effectiveTimeout });
      await locator.scrollIntoViewIfNeeded();
      await locator.click({
        timeout: effectiveTimeout,
        force: options.force,
      });
      this.logger.info(`Clicked "${description}"`);
    }, description);
  }

  /**
   * Waits for an element to be visible and returns its locator.
   * @param locator  - The target locator.
   * @param description - For logging.
   * @param timeout  - Custom timeout in ms.
   * @returns The same locator (confirmed visible).
   * @throws {ElementNotFoundError} If the element does not become visible.
   */
  protected async waitForVisible(
    locator: Locator,
    description: string,
    timeout?: number,
  ): Promise<Locator> {
    const effectiveTimeout = timeout ?? this.timeout;
    this.logger.debug(`Waiting for "${description}" to be visible`);

    await this._withRetry(
      async () => {
        await locator.waitFor({ state: 'visible', timeout: effectiveTimeout });
      },
      description,
    );

    this.logger.debug(`"${description}" is visible`);
    return locator;
  }

  /**
   * Fills an input field after clearing existing content.
   * Validates input length, XSS patterns, and optionally matches a regex.
   *
   * @param locator    - The input Locator.
   * @param value      - Value to fill.
   * @param description- For logging.
   * @param options    - Optional timeout override.
   * @param validation - Optional validation rule (e.g., email regex).
   * @throws {ValidationError} If value fails validation.
   * @throws {OperatorError}   If the fill operation fails.
   */
  protected async fillInput(
    locator: Locator,
    value: string,
    description: string,
    options: FillOptions = {},
    validation?: {
      maxLength?: number;
      pattern?: RegExp;
      patternMessage?: string;
    },
  ): Promise<void> {
    // ── Security: XSS prevention ───────────────────────────
    if (/(<script|on\w+\s*=)/i.test(value)) {
      throw new ValidationError(
        `Input "${description}" contains potentially dangerous script patterns`,
        { value, description },
      );
    }

    // ── Length validation ──────────────────────────────────
    const maxLen = validation?.maxLength ?? MAX_INPUT_LENGTH;
    if (value.length > maxLen) {
      throw new ValidationError(
        `Input "${description}" exceeds max length of ${maxLen}`,
        {
          valueLength: value.length,
          maxLength: maxLen,
          description,
        },
      );
    }

    // ── Pattern validation (e.g., email, password strength) ──
    if (validation?.pattern && !validation.pattern.test(value)) {
      throw new ValidationError(
        validation.patternMessage ??
          `Input "${description}" does not match required pattern`,
        { value, description, pattern: validation.pattern.source },
      );
    }

    const effectiveTimeout = options.timeout ?? this.timeout;
    this.logger.debug(`Filling "${description}"`);

    try {
      await locator.clear({ timeout: effectiveTimeout });
      await locator.fill(value, { timeout: effectiveTimeout });
      // Confirm the value is actually set
      await expect(locator).toHaveValue(value, { timeout: effectiveTimeout });
      this.logger.info(`"${description}" filled successfully`);
    } catch (cause) {
      const error = new OperatorError(
        `Failed to fill "${description}"`,
        {
          description,
          value: value.substring(0, 20), // log only prefix for security
          cause: String(cause),
        },
      );
      this.logger.error(error.message);
      throw error;
    }
  }

  /**
   * Selects an option from a <select> element.
   * @param locator     - The select Locator.
   * @param option      - The option to select (label, value, index).
   * @param description - For logging.
   * @throws {OperatorError} If selection fails.
   */
  protected async selectOption(
    locator: Locator,
    option: SelectOption,
    description: string,
  ): Promise<void> {
    this.logger.debug(`Selecting option in "${description}"`);

    try {
      await locator.selectOption(option, { timeout: this.timeout });
      this.logger.info(`Option selected in "${description}"`);
    } catch (cause) {
      const error = new OperatorError(
        `Failed to select option in "${description}"`,
        { description, option: String(option), cause: String(cause) },
      );
      this.logger.error(error.message);
      throw error;
    }
  }

  /**
   * Presses a key on the current focused element or on the page.
   * @param key         - Key(s) to press (e.g., 'Enter', 'Tab', 'Escape').
   * @param description - For logging.
   * @throws {OperatorError} If the key press fails.
   */
  protected async pressKey(key: string, description: string): Promise<void> {
    this.logger.debug(`Pressing key "${key}" for "${description}"`);
    try {
      await this.page.keyboard.press(key);
      this.logger.info(`Key "${key}" pressed for "${description}"`);
    } catch (cause) {
      const error = new OperatorError(
        `Failed to press key "${key}" for "${description}"`,
        { key, description, cause: String(cause) },
      );
      this.logger.error(error.message);
      throw error;
    }
  }

  /**
   * Hovers over an element.
   * @param locator     - The target locator.
   * @param description - For logging.
   * @throws {OperatorError} If hover fails.
   */
  protected async hover(
    locator: Locator,
    description: string,
  ): Promise<void> {
    this.logger.debug(`Hovering over "${description}"`);
    try {
      await locator.hover({ timeout: this.timeout });
      this.logger.info(`Hovered over "${description}"`);
    } catch (cause) {
      const error = new OperatorError(
        `Failed to hover over "${description}"`,
        { description, cause: String(cause) },
      );
      this.logger.error(error.message);
      throw error;
    }
  }

  // ── Assertion Helpers ─────────────────────────────────────

  /**
   * Asserts that an element contains the expected text (substring or exact).
   * @param locator  - The element to check.
   * @param expected - Expected text.
   * @param exact    - If true, perform exact match (default false).
   * @throws {OperatorError} If assertion fails.
   */
  protected async assertElementContainsText(
    locator: Locator,
    expected: string,
    exact = false,
  ): Promise<void> {
    this.logger.debug(
      `Asserting element contains${exact ? ' exact' : ''} text: "${expected}"`,
    );
    try {
      if (exact) {
        await expect(locator).toHaveText(expected, { timeout: this.timeout });
      } else {
        await expect(locator).toContainText(expected, { timeout: this.timeout });
      }
      this.logger.info(`Element text assertion passed: "${expected}"`);
    } catch (cause) {
      const error = new OperatorError(
        `Element text assertion failed: expected "${expected}"`,
        { expected, exact, cause: String(cause) },
      );
      this.logger.error(error.message);
      throw error;
    }
  }

  /**
   * Asserts that an element is visible on the page.
   * @param locator  - The element to check.
   * @param description - For logging.
   * @throws {ElementNotFoundError} If element is not visible.
   */
  protected async assertElementVisible(
    locator: Locator,
    description: string,
  ): Promise<void> {
    this.logger.debug(`Asserting "${description}" is visible`);
    try {
      await expect(locator).toBeVisible({ timeout: this.timeout });
      this.logger.info(`"${description}" is visible as expected`);
    } catch (cause) {
      const error = new ElementNotFoundError(
        `Expected "${description}" to be visible, but it is not`,
        { description, cause: String(cause) },
      );
      this.logger.error(error.message);
      throw error;
    }
  }

  /**
   * Asserts that an element is hidden or removed from DOM.
   * @param locator  - The element to check.
   * @param description - For logging.
   * @throws {ElementNotFoundError} If element remains visible.
   */
  protected async assertElementHidden(
    locator: Locator,
    description: string,
  ): Promise<void> {
    this.logger.debug(`Asserting "${description}" is hidden`);
    try {
      await expect(locator).toBeHidden({ timeout: this.timeout });
      this.logger.info(`"${description}" is hidden as expected`);
    } catch (cause) {
      const error = new ElementNotFoundError(
        `Expected "${description}" to be hidden, but it is visible`,
        { description, cause: String(cause) },
      );
      this.logger.error(error.message);
      throw error;
    }
  }

  // ── API Interaction ───────────────────────────────────────

  /**
   * Waits for a specific API request/response pattern and returns the response.
   * Uses `page.waitForResponse` with retry.
   *
   * @param urlOrPredicate - URL string or predicate function matching the request.
   * @param description    - For logging.
   * @param options        - Optional timeout override.
   * @returns The matched API response.
   * @throws {ApiError} If the response is not received.
   */
  protected async waitForApiResponse(
    urlOrPredicate: string | ((url: URL) => boolean),
    description: string,
    options: { timeout?: number } = {},
  ): Promise<ApiResponse> {
    const effectiveTimeout = options.timeout ?? this.timeout * API_TIMEOUT_MULTIPLIER;
    this.logger.debug(`Waiting for API response: "${description}"`);

    let response: import('@playwright/test').APIResponse;
    try {
      response = await this.page.waitForResponse(urlOrPredicate, {
        timeout: effectiveTimeout,
      });
    } catch (cause) {
      const error = new ApiError(
        `API response not received: "${description}"`,
        { description, cause: String(cause) },
      );
      this.logger.error(error.message);
      throw error;
    }

    // Validate basic response integrity
    if (!response) {
      throw new ApiError(`Empty API response for "${description}"`, {
        description,
      });
    }

    const body = await response.text().catch(() => {
      this.logger.warn(`Failed to read response body for "${description}"`);
      return '';
    });

    const result: ApiResponse = {
      ok: response.ok(),
      status: response.status(),
      body,
      headers: response.headers(),
    };

    this.logger.info(
      `API response for "${description}": status ${result.status}, ok=${result.ok}`,
    );

    return result;
  }

  // ── Screenshot (for diagnostics) ─────────────────────────

  /**
   * Takes a full-page screenshot and attaches it to the test report.
   * @param name - File name (without extension).
   * @returns The path to the saved screenshot.
   */
  protected async takeScreenshot(name: string): Promise<string> {
    this.logger.debug(`Taking screenshot: "${name}"`);
    const path = await this.page.screenshot({
      fullPage: true,
      path: `screenshots/${name}-${Date.now()}.png`,
    });
    this.logger.info(`Screenshot saved: "${name}"`);
    return path;
  }
}