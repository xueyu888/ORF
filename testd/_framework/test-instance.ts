import type { TestInfo } from "@playwright/test";

export function createTestInstanceSlug(testInfo: TestInfo) {
  return `p${process.pid}w${testInfo.workerIndex}r${testInfo.repeatEachIndex}t${testInfo.retry}`;
}
