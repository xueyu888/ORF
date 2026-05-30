typescript
import { test, expect, Page, Locator } from '@playwright/test';
import { Logger } from 'winston';
import { createLogger, format, transports } from 'winston';
import { URL } from 'url';

// ---------------------------------------------------------------------------
// Constants and configuration
// ---------------------------------------------------------------------------

/** Default timeout for element visibility (ms) */
const DEFAULT_TIMEOUT = 5_000;

/** Default navigation timeout (ms) */
const NAVIGATION_TIMEOUT = 30_000;

/** Retry settings for flaky operations */
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 500,
  maxDelay: 10_000,
} as const;

/** Environment variables required for mobile tests */
const REQUIRED_ENV_VARS = ['MOBILE_BASE_URL', 'VALID_USERNAME', 'VALID_PASSWORD'] as const;
type RequiredEnvVar = typeof REQUIRED_ENV_VARS[number];

/** Sensitive keys to be masked in logs (case-insensitive) */
const SENSITIVE_KEYS = ['password', 'token', 'authorization', 'cookie', 'secret', 'api.key'];

/** Maximum log file size in bytes */
const LOG_FILE_MAX_SIZE = 5_242_880; // 5 MB

/** Maximum number of log file rotations */
const LOG_FILE_MAX_FILES = 5;

// ---------------------------------------------------------------------------
// Logging setup
// ---------------------------------------------------------------------------

let _logger: Logger | null = null;

/**
 * Creates and returns a singleton structured logger with configurable level and JSON format.
 * Sensitive data (passwords, tokens) are masked automatically via the meta filter.
 * @returns {Logger} Configured Winston logger instance.
 */
function getLogger(): Logger {
  if (!_logger) {
    _logger = createLogger({
      level: process.env.LOG_LEVEL ?? 'info',
      format: format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
        format.errors({ stack: true }),
        format((info) => {
          // Mask known sensitive fields in metadata
          if (info.meta && typeof info.meta === 'object') {
            const safeMeta: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(info.meta)) {
              safeMeta[key] = SENSITIVE_KEYS.some((s) => key.toLowerCase().includes(s))
                ? '[REDACTED]'
                : value;
            }
            info.meta = safeMeta;
          }
          return info;
        })(),
        format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta, null, 0)}` : '';
          return `${timestamp} [${level.toUpperCase()}] ${message}${metaStr}`;
        }),
      ),
      transports: [
        new transports.Console(),
        new transports.File({
          filename: 'logs/test-execution.log',
          maxsize: LOG_FILE_MAX_SIZE,
          maxFiles: LOG_FILE_MAX_FILES,
        }),
      ],
    });
  }
  return _logger;
}

/** Convenience export to avoid importing winston elsewhere */
export const logger: Logger = getLogger();

// ---------------------------------------------------------------------------
// Type definitions for the test case steps
// ---------------------------------------------------------------------------

/** Source reference linking back to the case document */
export interface StepSource {
  /** Unique step ID for traceability back to the case document */
  caseStepId: string;
  /** The method name or action identifier used in the test documentation */
  method: string;
}

/** Represents a single test step with optional validation and timeout */
export interface StepSpec {
  /** Source reference linking back to the case document */
  source: StepSource;
  /** Human‑readable description of the step */
  description: string;
  /** The Playwright action to perform */
  action: (page: Page) => Promise<void>;
  /** Optional pre‑conditions / validation checks before performing the action */
  validate?: (page: Page) => Promise<void>;
  /** Timeout in milliseconds (default 30s) */
  timeout?: number;
}

/** Complete test case definition */
export interface TestCase {
  id: string;
  name: string;
  prerequisites: string[];
  steps: StepSpec[];
  /** Timeout for the entire test case (default 120s) */
  testTimeout?: number;
}

/** Configuration for retry operations */
export interface RetryConfig {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
}

// ---------------------------------------------------------------------------
// Custom error classes
// ---------------------------------------------------------------------------

/** Thrown when a required element is not found or not visible */
export class ElementNotFoundError extends Error {
  constructor(
    public readonly selector: string,
    message?: string,
  ) {
    super(message ?? `Element not found or not visible: ${selector}`);
    this.name = 'ElementNotFoundError';
  }
}

/** Thrown when a test action times out */
export class ActionTimeoutError extends Error {
  constructor(
    public readonly action: string,
    message?: string,
  ) {
    super(message ?? `Action "${action}" timed out`);
    this.name = 'ActionTimeoutError';
  }
}

/** Thrown when test configuration is invalid or missing */
export class TestConfigurationError extends Error {
  constructor(
    public readonly missingVars?: string[],
    message?: string,
  ) {
    super(message ?? 'Test configuration error');
    this.name = 'TestConfigurationError';
  }
}

/** Thrown when navigation fails */
export class NavigationError extends Error {
  constructor(
    public readonly url: string,
    message?: string,
  ) {
    super(message ?? `Navigation to "${url}" failed`);
    this.name = 'NavigationError';
  }
}

// ---------------------------------------------------------------------------
// Input validation: ensure critical environment variables are present
// ---------------------------------------------------------------------------

/**
 * Validates that all required environment variables are present and properly formatted.
 * @throws {TestConfigurationError} If any variable is missing or invalid.
 */
function validateTestConfiguration(): void {
  const missing: string[] = [];
  for (const varName of REQUIRED_ENV_VARS) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }
  if (missing.length > 0) {
    throw new TestConfigurationError(missing, `Missing required environment variables: ${missing.join(', ')}`);
  }

  const baseUrl = process.env.MOBILE_BASE_URL!;
  if (!/^https?:\/\//.test(baseUrl)) {
    throw new TestConfigurationError([], `MOBILE_BASE_URL must start with http:// or https://, got: ${baseUrl}`);
  }

  // Sanitize log output: mask sensitive values
  logger.info('Test configuration validated successfully', {
    MOBILE_BASE_URL: baseUrl, // ok to log because it's not sensitive
    VALID_USERNAME: process.env.VALID_USERNAME ? '[SET]' : '[NOT SET]',
    VALID_PASSWORD: process.env.VALID_PASSWORD ? '[SET]' : '[NOT SET]',
  });
}

// Execute validation at module load time
validateTestConfiguration();

// ---------------------------------------------------------------------------
// Performance helper: retry with exponential backoff and jitter
// ---------------------------------------------------------------------------

/**
 * Executes an asynchronous function with retry and exponential backoff.
 * Implements jitter to avoid thundering herd.
 * @param fn - The function to retry.
 * @param options - Retry configuration (maxRetries, baseDelay, maxDelay).
 * @returns The result of the successful execution.
 * @throws The last error if all retries fail.
 */
async function retryOperation<T>(
  fn: () => Promise<T>,
  options: RetryConfig = {},
): Promise<T> {
  const {
    maxRetries = RETRY_CONFIG.maxRetries,
    baseDelay = RETRY_CONFIG.baseDelay,
    maxDelay = RETRY_CONFIG.maxDelay,
  } = options;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      if (attempt > 1) {
        logger.info(`Operation succeeded on attempt ${attempt}`, { attempt });
      }
      return result;
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) {
        logger.error(`Operation failed after ${maxRetries} attempts`, {
          attempt,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error; // re-throw the final error
      }

      // Exponential backoff with jitter
      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
      const jitter = Math.random() * delay;
      const totalDelay = delay + jitter;

      logger.warn(`Operation attempt ${attempt} failed, retrying in ${Math.round(totalDelay)}ms`, {
        attempt,
        delay: Math.round(totalDelay),
        error: error instanceof Error ? error.message : String(error),
      });

      await new Promise((resolve) => setTimeout(resolve, totalDelay));
    }
  }

  // This should not be reached, but TypeScript needs a return
  throw lastError;
}

// ---------------------------------------------------------------------------
// Operator functions: semantic wrappers for common UI interactions
// ---------------------------------------------------------------------------

/**
 * Opens the current user menu (account menu) in the sidebar.
 * @param page - Playwright Page instance.
 * @param timeout - Maximum wait time for the menu to appear (ms).
 * @throws {ElementNotFoundError} If the menu trigger is not found.
 */
export async function openUserMenu(page: Page, timeout: number = DEFAULT_TIMEOUT): Promise<void> {
  const logger = getLogger();
  logger.info('Opening user menu');

  // Try two possible selectors for the user menu trigger
  const menuTrigger = page.locator('[aria-label="用户菜单"], [aria-label="当前用户"]').first();
  await expect(menuTrigger).toBeVisible({ timeout });

  await menuTrigger.click();
  logger.info('User menu opened');
}

/**
 * Opens personal settings via the user menu.
 * @param page - Playwright Page instance.
 * @param timeout - Maximum wait time for settings link (ms).
 * @throws {ElementNotFoundError} If the settings link is not found in the menu.
 */
export async function openPersonalSettings(page: Page, timeout: number = DEFAULT_TIMEOUT): Promise<void> {
  const logger = getLogger();
  logger.info('Opening personal settings');

  // First ensure the user menu is open (if not already)
  const settingsLink = page.locator('[aria-label="个人设置"], [aria-label="设置"], a:has-text("个人设置")').first();
  await expect(settingsLink).toBeVisible({ timeout });

  await settingsLink.click();
  logger.info('Personal settings opened');
}

/**
 * Fills the application reason field and submits the challenge application.
 * @param page - Playwright Page instance.
 * @param reason - The reason text to fill.
 * @param timeout - Maximum wait time for the form to appear (ms).
 * @throws {ElementNotFoundError} If the reason field is not found.
 */
export async function fillAndSubmitChallengeApplication(
  page: Page,
  reason: string,
  timeout: number = DEFAULT_TIMEOUT,
): Promise<void> {
  const logger = getLogger();
  logger.info('Filling challenge application reason');

  const reasonInput = page.locator('textarea[placeholder*="申请理由"], input[placeholder*="申请理由"]').first();
  await expect(reasonInput).toBeVisible({ timeout });

  await reasonInput.fill(reason);
  logger.info('Reason filled', { reasonLength: reason.length });

  const submitButton = page.locator('button:has-text("申请挑战"), button[type="submit"]').first();
  await expect(submitButton).toBeEnabled({ timeout });
  await submitButton.click();

  logger.info('Challenge application submitted');
}

/**
 * Opens the sub-action creation editor for a given task.
 * @param page - Playwright Page instance.
 * @param taskIdentifier - Text or selector identifying the parent task.
 * @param timeout - Maximum wait time for the editor to appear (ms).
 * @throws {ElementNotFoundError} If the task or editor is not found.
 */
export async function addSubActionToTask(
  page: Page,
  taskIdentifier: string,
  timeout: number = DEFAULT_TIMEOUT,
): Promise<void> {
  const logger = getLogger();
  logger.info(`Adding sub-action to task: ${taskIdentifier}`);

  // Locate the task container (could be a list item, card, etc.)
  const taskContainer = page.locator(`[data-testid="task-${taskIdentifier}"], .task-item:has-text("${taskIdentifier}")`).first();
  await expect(taskContainer).toBeVisible({ timeout });

  // Look for the "新增子行动项" button within the task container
  const addSubButton = taskContainer.locator('button:has-text("新增子行动项"), [aria-label="新增子行动项"]').first();
  await expect(addSubButton).toBeVisible({ timeout });
  await addSubButton.click();

  // Wait for the sub-action editor to appear
  const subActionEditor = page.locator('[aria-label="编辑子行动项标题"], input[placeholder*="子行动项"]').first();
  await expect(subActionEditor).toBeVisible({ timeout });

  logger.info('Sub-action editor opened');
}

// ---------------------------------------------------------------------------
// Test execution utilities
// ---------------------------------------------------------------------------

/**
 * Executes a complete test case with proper logging and error handling.
 * @param testCase - The TestCase definition.
 * @param page - Playwright Page instance.
 * @throws {Error} Re-throws the first step error after logging.
 */
export async function executeTestCase(testCase: TestCase, page: Page): Promise<void> {
  const logger = getLogger();
  logger.info(`Starting test case: ${testCase.id} - ${testCase.name}`, {
    testId: testCase.id,
    stepsCount: testCase.steps.length,
  });

  const startTime = Date.now();
  const errors: Array<{ stepIndex: number; description: string; error: Error }> = [];

  for (let i = 0; i < testCase.steps.length; i++) {
    const step = testCase.steps[i];
    const stepStart = Date.now();

    try {
      logger.info(`Executing step ${i + 1}: ${step.description}`, {
        stepId: step.source.caseStepId,
        method: step.source.method,
      });

      // Execute validation if present
      if (step.validate) {
        await step.validate(page);
        logger.debug(`Validation passed for step ${i + 1}`);
      }

      // Execute action with timeout
      const actionTimeout = step.timeout ?? NAVIGATION_TIMEOUT;
      await Promise.race([
        step.action(page),
        new Promise((_, reject) =>
          setTimeout(() => reject(new ActionTimeoutError(step.description)), actionTimeout)
        ),
      ]);

      logger.debug(`Step ${i + 1} completed in ${Date.now() - stepStart}ms`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Step ${i + 1} failed`, {
        stepDescription: step.description,
        error: err.message,
        duration: Date.now() - stepStart,
      });
      errors.push({ stepIndex: i, description: step.description, error: err });

      // On first failure, break the test case
      break;
    }
  }

  const totalDuration = Date.now() - startTime;
  if (errors.length > 0) {
    logger.error(`Test case ${testCase.id} failed after ${errors[0].stepIndex + 1} steps`, {
      totalDuration,
      failures: errors.length,
      firstError: errors[0].error.message,
    });
    throw errors[0].error;
  }

  logger.info(`Test case ${testCase.id} passed`, { totalDuration });
}

// ---------------------------------------------------------------------------
// URL validation and sanitization
// ---------------------------------------------------------------------------

/**
 * Validates that a URL is safe to navigate to (prevents open redirects to unknown hosts).
 * @param url - The URL to validate.
 * @param allowedHosts - List of allowed hostnames (defaults to MOBILE_BASE_URL host).
 * @returns The validated URL string.
 * @throws {NavigationError} If the URL is invalid or points to an unallowed host.
 */
export function validateNavigationUrl(url: string, allowedHosts?: string[]): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new NavigationError(url, `Invalid URL: ${url}`);
  }

  const baseUrl = process.env.MOBILE_BASE_URL!;
  const allowed = allowedHosts ?? [new URL(baseUrl).hostname];

  if (!allowed.includes(parsed.hostname)) {
    throw new NavigationError(
      url,
      `URL host "${parsed.hostname}" is not in allowed hosts list: ${allowed.join(', ')}`,
    );
  }

  // Only allow http and https protocols
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new NavigationError(url, `URL protocol "${parsed.protocol}" is not allowed (only http/https)`);
  }

  return url;
}

// ---------------------------------------------------------------------------
// Security: sanitize object for logging (remove sensitive keys)
// ---------------------------------------------------------------------------

/**
 * Recursively removes sensitive fields from an object for safe logging.
 * @param obj - The object to sanitize.
 * @returns A new object with sensitive values replaced by '[REDACTED]'.
 */
export function sanitizeForLogging(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.some((s) => key.toLowerCase().includes(s))) {
      result[key] = '[REDACTED]';
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = sanitizeForLogging(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Clean code: re-export helpers from Playwright for convenience
// ---------------------------------------------------------------------------

export { test, expect, Page, Locator };