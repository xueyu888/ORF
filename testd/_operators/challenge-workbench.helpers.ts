import { expect, type Locator, type Page } from "@playwright/test";

export function objectivePanelByTitle(page: Page, title: string) {
  return page
    .locator("section.orf-objective-panel")
    .filter({
      has: page.locator(".orf-objective-title").filter({ hasText: exactText(title) }),
    })
    .first();
}

export function objectiveHeaderRowByTitle(page: Page, title: string) {
  return objectivePanelByTitle(page, title)
    .locator(".orf-objective-header")
    .filter({ has: page.locator(".orf-objective-title").filter({ hasText: exactText(title) }) })
    .first();
}

export function objectiveChildMenuButton(page: Page, title: string) {
  return objectiveHeaderRowByTitle(page, title).getByRole("button", { name: "新增子级", exact: true }).first();
}

export function objectiveChildMenuItem(page: Page, title: string, itemName: string) {
  return objectivePanelByTitle(page, title).getByRole("button", { name: itemName, exact: true }).first();
}

export async function openObjectiveChildMenu(page: Page, title: string, expectedItemName: string) {
  const header = objectiveHeaderRowByTitle(page, title);
  await expect(header).toBeVisible();
  await header.scrollIntoViewIfNeeded();

  const button = objectiveChildMenuButton(page, title);
  await expect(button).toBeEnabled();

  const item = objectiveChildMenuItem(page, title, expectedItemName);
  if (!(await item.isVisible().catch(() => false))) {
    await clickChallengeRowActionButton(button);
  }
  await expect(item).toBeVisible();
}

export async function clickObjectiveChildMenuItem(page: Page, title: string, itemName: string) {
  await openObjectiveChildMenu(page, title, itemName);
  await objectiveChildMenuItem(page, title, itemName).click();
}

export async function clickChallengeRowActionButton(button: Locator) {
  await expect(button).toBeEnabled();
  // The left-floating action bar can place the button center outside the
  // clickable hit target that Playwright chooses, so trigger the component's
  // own button click handler after resolving the correct row-scoped button.
  await button.evaluate((element) => (element as HTMLButtonElement).click());
}

function exactText(value: string) {
  return new RegExp(`^${escapeRegExp(value)}$`);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
