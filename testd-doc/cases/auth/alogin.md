typescript
import { test, expect, Page, Locator } from '@playwright/test';
import winston from 'winston';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';

// ---------------------------------------------------------------------------
// Constants & configuration
// ---------------------------------------------------------------------------

/** Default timeout for Playwright operations (overridable via env). */
const DEFAULT_TIMEOUT = parseInt(process.env.PLAYWRIGHT_TIMEOUT ?? '10000', 10);

/** Logging level (overridable). */
const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';

/** Directory for log files (created if missing). */
const LOGS_DIR = 'logs';

/** Accessible name patterns – single source of truth for UI contracts. */
const UI_CONTRACTS = {
  USER_MENU_TRIGGER: /用户菜单/i,
  USER_MENU_ROLE: 'menu' as const,
  SETTINGS_MENU_ITEM: /个人设置|设置/i,
  LOGOUT_MENU_ITEM: /退出登录/i,
  CURRENT_USER_LABEL: /当前用户/i,
  APPLICATION_REASON_LABEL: /申请理由/i,
  SUBMIT_APPLICATION_BUTTON: /申请挑战/i,
  SUBTASK_TITLE_LABEL: /编辑子行动项标题/i,
} as const;

/** Default credentials for tests (loaded from env). */
const DEFAULT_CREDENTIALS = {
  username: process.env.TEST_USERNAME ?? '',
  password: process.env.TEST_PASSWORD ?? '',
} as const;

// ---------------------------------------------------------------------------
// Custom error classes for test infrastructure
// ---------------------------------------------------------------------------

/**
 * Error thrown when test environment setup fails (e.g., missing env vars).
 */
class TestSetupError extends Error {
  public readonly context?: Record<string, unknown>;

  constructor(message: string, context?: Record<string, unknown>) {
    super(message);
    this.name = 'TestSetupError';
    this.context = context;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error thrown when a test operation (e.g., clicking, waiting) fails.
 */
class TestOperationError extends Error {
  public readonly context?: Record<string, unknown>;

  constructor(message: string, context?: Record<string, unknown>) {
    super(message);
    this.name = 'TestOperationError';
    this.context = context;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error thrown when input validation fails.
 */
class TestValidationError extends Error {
  public readonly context?: Record<string, unknown>;

  constructor(message: string, context?: Record<string, unknown>) {
    super(message);
    this.name = 'TestValidationError';
    this.context = context;
    Error.captureStackTrace(this, this.constructor);
  }
}

// ---------------------------------------------------------------------------
// Logger configuration (singleton)
// ---------------------------------------------------------------------------

let loggerInstance: winston.Logger | null = null;

/**
 * Returns a pre-configured Winston logger instance.
 * Creates one if not already created (singleton pattern).
 * Ensures log directory exists.
 * Logs to console (colorized) and a file under LOGS_DIR.
 *
 * @returns {winston.Logger} Logger instance
 */
function getLogger(): winston.Logger {
  if (!loggerInstance) {
    // Ensure logs directory exists
    const logDir = path.resolve(LOGS_DIR);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    loggerInstance = winston.createLogger({
      level: LOG_LEVEL,
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: {
        service: 'account-login-flow-test',
        traceId: uuidv4().slice(0, 8),
      },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(
              ({ timestamp, level, message, traceId, ...meta }) => {
                const metaStr = Object.keys(meta).length
                  ? ` ${JSON.stringify(meta)}`
                  : '';
                return `${timestamp} [${level}] (${traceId}) ${message}${metaStr}`;
              }
            )
          ),
        }),
        new winston.transports.File({
          filename: `${LOGS_DIR}/test-account-login.log`,
          format: winston.format.combine(
            winston.format.uncolorize(),
            winston.format.json()
          ),
          maxsize: 5 * 1024 * 1024, // 5MB
          maxFiles: 3,
          zippedArchive: true,
        }),
      ],
    });
  }
  return loggerInstance;
}

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

/** Credentials used for test authentication. */
interface UserCredentials {
  username: string;
  password: string;
}

/** All significant locators related to the user menu. */
interface UserMenuSelectors {
  trigger: Locator;
  dropdown: Locator;
  userDisplayName: Locator;
  settingsItem: Locator;
  logoutItem: Locator;
}

/** Runtime context for a test execution. */
interface TestContext {
  page: Page;
  credentials: UserCredentials;
}

/** Options for waiting operations. */
interface WaitOptions {
  /** Maximum time in ms to wait (defaults to DEFAULT_TIMEOUT). */
  timeout?: number;
}

/** Options for filling application reason. */
interface FillApplicationReasonOptions {
  /** The reason text to enter. */
  reason: string;
  /** Whether to submit after filling. */
  submitAfterFill?: boolean;
}

// ---------------------------------------------------------------------------
// Input validation & health check
// ---------------------------------------------------------------------------

/**
 * Validates that user credentials are present and non-empty.
 * Throws TestValidationError early if environment misconfiguration is detected.
 *
 * @param credentials - The user credentials to validate
 * @throws {TestValidationError} If any credential is invalid
 */
function validateCredentials(credentials: UserCredentials): void {
  const logger = getLogger();
  if (
    !credentials.username ||
    typeof credentials.username !== 'string' ||
    credentials.username.trim() === ''
  ) {
    logger.error('Invalid username credential', {
      username: credentials.username,
    });
    throw new TestValidationError('Username must be a non-empty string', {
      provided: credentials.username,
    });
  }
  if (
    !credentials.password ||
    typeof credentials.password !== 'string' ||
    credentials.password.trim() === ''
  ) {
    logger.error('Invalid password credential');
    throw new TestValidationError('Password must be a non-empty string');
  }
  logger.debug('Credentials validated', {
    usernameLength: credentials.username.length,
    passwordLength: credentials.password.length,
  });
}

/**
 * Checks that all required environment variables are set.
 * Should be called once at suite startup.
 *
 * @throws {TestSetupError} If any required variable is missing
 */
function validateEnvironment(): void {
  const required: ReadonlyArray<string> = ['TEST_USERNAME', 'TEST_PASSWORD'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    const msg = `Missing required environment variables: ${missing.join(', ')}`;
    getLogger().error(msg, { missing });
    throw new TestSetupError(msg, { missing });
  }
  getLogger().info('Environment validated', { required });
}

// ---------------------------------------------------------------------------
// Semantic operators (contractual UI interaction layer)
// ---------------------------------------------------------------------------

/**
 * Returns all key locators for the user menu, based on the current product design.
 * Contract: trigger is a button with accessible name matching UI_CONTRACTS.USER_MENU_TRIGGER;
 * dropdown has role="menu". Subitems are located within the dropdown.
 *
 * @param page - The Playwright Page instance
 * @returns {UserMenuSelectors} Object containing locators for trigger, dropdown, user display name, settings item, logout item
 */
function getPage(page: Page): Page {
  return page;
}

/**
 * Retrieves all significant locators for the user menu.
 * All locators are derived from the page using stable accessible roles and labels,
 * minimizing selector fragility.
 *
 * @param page - The Playwright Page instance
 * @returns {UserMenuSelectors} All user menu locators
 */
function getUserMenuSelectors(page: Page): UserMenuSelectors {
  const p = getPage(page);
  const logger = getLogger();

  // Trigger button for the user menu
  const trigger = p.getByRole('button', { name: UI_CONTRACTS.USER_MENU_TRIGGER });
  // Dropdown with role 'menu'
  const dropdown = p.getByRole(UI_CONTRACTS.USER_MENU_ROLE);

  // User display name (first option used as identifier)
  const userDisplayName = dropdown.locator('li').filter({ hasNotText: '' }).first();

  // Menu items for settings and logout
  const settingsItem = dropdown.getByRole('menuitem', { name: UI_CONTRACTS.SETTINGS_MENU_ITEM });
  const logoutItem = dropdown.getByRole('menuitem', { name: UI_CONTRACTS.LOGOUT_MENU_ITEM });

  logger.debug('User menu selectors constructed', {
    triggerSelector: trigger.toString(),
    dropdownSelector: dropdown.toString(),
  });

  return { trigger, dropdown, userDisplayName, settingsItem, logoutItem };
}

/**
 * Opens the user menu by clicking the trigger button.
 * Waits for the menu to be visible.
 *
 * @param page - The Playwright Page instance
 * @param options - Optional timeout settings
 * @returns {Promise<UserMenuSelectors>} The locators for the open menu
 * @throws {TestOperationError} If the trigger is not found or click fails
 */
async function openUserMenu(page: Page, options?: WaitOptions): Promise<UserMenuSelectors> {
  const logger = getLogger();
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
  const selectors = getUserMenuSelectors(page);

  try {
    logger.info('Opening user menu');
    await selectors.trigger.waitFor({ state: 'visible', timeout });
    await selectors.trigger.click({ timeout });
    await selectors.dropdown.waitFor({ state: 'visible', timeout });
    logger.info('User menu opened successfully');
    return selectors;
  } catch (error) {
    const message = `Failed to open user menu: ${(error as Error).message}`;
    logger.error(message, { error });
    throw new TestOperationError(message, { error });
  }
}

/**
 * Navigates to personal settings via the user menu.
 * Assumes the menu is already open or opens it if necessary.
 *
 * @param page - The Playwright Page instance
 * @param options - Optional timeout settings
 * @returns {Promise<void>}
 * @throws {TestOperationError} If settings item is not found or click fails
 */
async function goToSettings(page: Page, options?: WaitOptions): Promise<void> {
  const logger = getLogger();
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;

  try {
    logger.info('Navigating to personal settings');
    // Ensure menu is open
    const selectors = await openUserMenu(page, { timeout });
    await selectors.settingsItem.waitFor({ state: 'visible', timeout });
    await selectors.settingsItem.click({ timeout });
    logger.info('Clicked on settings menu item');
  } catch (error) {
    const message = `Failed to navigate to settings: ${(error as Error).message}`;
    logger.error(message, { error });
    throw new TestOperationError(message, { error });
  }
}

/**
 * Fills in the application reason field and optionally submits.
 *
 * @param page - The Playwright Page instance
 * @param options - Options including reason text and whether to submit
 * @returns {Promise<void>}
 * @throws {TestValidationError} If reason is empty
 * @throws {TestOperationError} If interaction fails
 */
async function fillApplicationReason(
  page: Page,
  options: FillApplicationReasonOptions
): Promise<void> {
  const logger = getLogger();
  const timeout = DEFAULT_TIMEOUT;

  const { reason, submitAfterFill = true } = options;

  if (!reason || reason.trim() === '') {
    logger.error('Application reason cannot be empty');
    throw new TestValidationError('Application reason must be a non-empty string');
  }

  try {
    logger.info('Filling application reason', { reason: reason.substring(0, 50) });

    const reasonField = page.getByLabel(UI_CONTRACTS.APPLICATION_REASON_LABEL);
    await reasonField.waitFor({ state: 'visible', timeout });
    await reasonField.fill(reason, { timeout });

    if (submitAfterFill) {
      const submitButton = page.getByRole('button', { name: UI_CONTRACTS.SUBMIT_APPLICATION_BUTTON });
      await submitButton.waitFor({ state: 'visible', timeout });
      // Ensure button is enabled after filling reason
      await expect(submitButton).toBeEnabled({ timeout });
      await submitButton.click({ timeout });
      logger.info('Application reason submitted');
    }
  } catch (error) {
    const message = `Failed to fill application reason: ${(error as Error).message}`;
    logger.error(message, { error, reason: reason.substring(0, 50) });
    throw new TestOperationError(message, { error });
  }
}

/**
 * Creates a subtask for a given task by a member.
 * Waits for the subtask editor to appear.
 *
 * @param page - The Playwright Page instance
 * @param taskLocator - Locator for the parent task element
 * @param options - Optional timeout settings
 * @returns {Promise<void>}
 * @throws {TestOperationError} If creation fails
 */
async function createSubtaskByMember(
  page: Page,
  taskLocator: Locator,
  options?: WaitOptions
): Promise<void> {
  const logger = getLogger();
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;

  try {
    logger.info('Creating subtask by member');

    // Hover over the task to reveal actions
    await taskLocator.hover({ timeout });
    // Click the "Add subtask" button (adjust selector as needed)
    const addSubtaskButton = taskLocator.getByRole('button', { name: /新增子行动项/i });
    await addSubtaskButton.waitFor({ state: 'visible', timeout });
    await addSubtaskButton.click({ timeout });

    // Wait for the subtask title editor to appear
    const editor = page.getByLabel(UI_CONTRACTS.SUBTASK_TITLE_LABEL);
    await editor.waitFor({ state: 'visible', timeout });
    logger.info('Subtask editor appeared');
  } catch (error) {
    const message = `Failed to create subtask: ${(error as Error).message}`;
    logger.error(message, { error, taskLocator: taskLocator.toString() });
    throw new TestOperationError(message, { error });
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe('Account and settings flow', () => {
  let page: Page;
  let testCredentials: UserCredentials;

  test.beforeAll(() => {
    // Validate environment once at suite level
    try {
      validateEnvironment();
    } catch (error) {
      // Log failure and fail fast
      getLogger().error('Environment validation failed, aborting suite', { error });
      throw error;
    }
  });

  test.beforeEach(async ({ browser }) => {
    const logger = getLogger();
    try {
      // Create a new browser context and page for each test
      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
      });
      page = await context.newPage();
      logger.info('Browser context created for test', { testName: test.info().title });

      // Load credentials from environment (already validated)
      testCredentials = {
        username: process.env.TEST_USERNAME!,
        password: process.env.TEST_PASSWORD!,
      };
      validateCredentials(testCredentials);
    } catch (error) {
      logger.error('Failed to initialize test', { error });
      throw error;
    }
  });

  test.afterEach(async () => {
    const logger = getLogger();
    if (page) {
      try {
        await page.close();
        logger.info('Page closed');
      } catch (error) {
        logger.warn('Failed to close page', { error });
      }
    }
  });

  test('User can open account menu and see display name', async () => {
    const logger = getLogger();
    try {
      // Assume user is already logged in (login flow tested separately)
      const selectors = await openUserMenu(page);
      await expect(selectors.userDisplayName).toBeVisible();
      const displayName = await selectors.userDisplayName.textContent();
      logger.info('Display name visible', { displayName: displayName?.trim() });
    } catch (error) {
      logger.error('Account menu test failed', { error });
      throw error;
    }
  });

  test('User can navigate to settings via menu', async () => {
    const logger = getLogger();
    try {
      // Assume user is logged in
      await goToSettings(page);
      // Verify we are on the settings page (e.g., URL or heading)
      await expect(page).toHaveURL(/settings/, { timeout: DEFAULT_TIMEOUT });
      logger.info('Settings page reached');
    } catch (error) {
      logger.error('Settings navigation test failed', { error });
      throw error;
    }
  });

  test('User can fill application reason and submit', async () => {
    const logger = getLogger();
    try {
      // Assume application dialog is open
      await fillApplicationReason(page, {
        reason: 'I want to take on this challenge because...',
        submitAfterFill: true,
      });
      // Optionally verify success indicator
      await expect(page.locator('.success-message')).toBeVisible({ timeout: DEFAULT_TIMEOUT });
      logger.info('Application submitted successfully');
    } catch (error) {
      logger.error('Application reason test failed', { error });
      throw error;
    }
  });

  test('Member can create subtask', async () => {
    const logger = getLogger();
    try {
      // Assume a task is visible on the page
      const task = page.locator('li[data-task-id]').first();
      await task.waitFor({ state: 'visible', timeout: DEFAULT_TIMEOUT });
      await createSubtaskByMember(page, task);
      // Verify subtask editor is visible
      await expect(page.getByLabel(UI_CONTRACTS.SUBTASK_TITLE_LABEL)).toBeVisible();
      logger.info('Subtask editor visible after creation');
    } catch (error) {
      logger.error('Subtask creation test failed', { error });
      throw error;
    }
  });
});