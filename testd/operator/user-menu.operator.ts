import { Page, Locator } from '@playwright/test';

/**
 * UserMenuOperator provides semantic actions for interacting with the user menu
 * (account / settings dropdown) in the application sidebar.
 *
 * This operator encapsulates the DOM interactions so that test cases can express
 * business steps (e.g., "open user menu", "go to settings") without being tied
 * to specific selectors or layout changes.
 *
 * When the UI structure changes, only this file should be updated — test cases
 * remain unchanged.
 */
export class UserMenuOperator {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Opens the user menu by clicking its trigger element.
   * If the menu is already visible, this is a no-op.
   *
   * @throws If the trigger cannot be found or clicked after default timeout.
   */
  async openMenu(): Promise<void> {
    const triggerLocator = this.userMenuTrigger();

    // Wait for the trigger to be visible and enabled
    await triggerLocator.waitFor({ state: 'visible', timeout: 10000 });

    // Click the trigger – the dropdown menu should appear
    await triggerLocator.click();

    // Wait briefly for the dropdown to be present in the DOM.
    // Use a short timeout because the menu opens almost instantly.
    await this.page.waitForSelector('[role="menu"]', {
      state: 'attached',
      timeout: 3000,
    });
  }

  /**
   * Opens the user menu (if not already open) and clicks the "个人设置" (Personal Settings) menu item.
   * Throws if the settings item is not found.
   */
  async navigateToSettings(): Promise<void> {
    await this.ensureMenuOpen();

    const settingsItem = this.page.getByRole('menuitem', {
      name: /^个人设置$/,
    });

    await settingsItem.waitFor({ state: 'visible', timeout: 5000 });
    await settingsItem.click();

    // Wait for navigation to complete – common pattern is a heading or URL change
    await this.page.waitForURL(/\/settings/, { timeout: 10000 });
  }

  /**
   * Opens the user menu (if not already open) and clicks the account information / profile link.
   * The accessible name of the menu item is expected to be "账号信息" or "个人主页".
   * Adjust the regex pattern if the product uses a different label.
   */
  async navigateToAccount(): Promise<void> {
    await this.ensureMenuOpen();

    // Try common account link labels. If product changes again, update here centrally.
    const accountItem = this.page.getByRole('menuitem', {
      name: /账号信息|个人主页|我的账号/,
    });

    await accountItem.waitFor({ state: 'visible', timeout: 5000 });
    await accountItem.click();

    // Validate that we navigated to an account-related page
    await this.page.waitForURL(/\/account|\/profile/, { timeout: 10000 });
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  /**
   * Returns a locator for the user menu trigger button.
   * The current UI uses a button with accessible label "用户菜单".
   * If the label changes, update this single method.
   */
  private userMenuTrigger(): Locator {
    return this.page.getByLabel('用户菜单');
  }

  /**
   * Ensures the user menu dropdown is open before proceeding.
   * If the menu is detected as already open (role="menu" present), skips triggering.
   */
  private async ensureMenuOpen(): Promise<void> {
    const menuAlreadyOpen = await this.page.locator('[role="menu"]').isVisible();
    if (!menuAlreadyOpen) {
      await this.openMenu();
    }
  }
}

/**
 * Factory function to create a UserMenuOperator bound to the given page.
 * Shorthand for constructor, useful in test fixtures.
 */
export function createUserMenuOperator(page: Page): UserMenuOperator {
  return new UserMenuOperator(page);
}