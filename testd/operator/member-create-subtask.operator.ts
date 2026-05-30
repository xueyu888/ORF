import { type Page, type Locator } from '@playwright/test';

/**
 * Waits for and returns the subtask editor textbox (label: "编辑子行动项标题")
 * that appears after triggering the "新增子行动项" action on a task.
 *
 * @param page - Playwright Page instance
 * @param taskLocator - Locator pointing to the parent task row/container
 * @param options - Optional timeout (default 5000ms)
 * @returns The subtask title editor Locator (visible & stable)
 * @throws If the editor does not appear within the timeout
 */
export async function memberCreateSubtask(
  page: Page,
  taskLocator: Locator,
  options?: { timeout?: number }
): Promise<Locator> {
  const timeout = options?.timeout ?? 5_000;

  // 1. Trigger subtask creation by clicking the "新增子行动项" button inside the task
  const addSubtaskButton = taskLocator.getByRole('button', {
    name: '新增子行动项',
    exact: true,
  });
  await addSubtaskButton.click();

  // 2. Wait for the subtask editor textbox to appear and be stable
  const subtaskEditor = page.getByLabel('编辑子行动项标题');

  // Use waitFor with state 'visible' and custom timeout
  await subtaskEditor.waitFor({ state: 'visible', timeout });

  // Ensure the editor is also stable (not animating or being modified by React)
  await page.waitForLoadState('networkidle', { timeout: timeout * 0.3 });

  // Optionally verify the editor is focused or ready
  await expect(subtaskEditor).toBeVisible();

  return subtaskEditor;
}