import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { frontendVisibilityByPath, frontendVisibilityTable } from "../src/config/frontendVisibility";

test("frontend visibility path mappings reference configured keys", () => {
  for (const [routePath, key] of Object.entries(frontendVisibilityByPath)) {
    assert.ok(frontendVisibilityTable[key], `${routePath} references missing frontend visibility key ${key}`);
  }
});

test("frontend visibility rules are only accessed through the shared helpers", () => {
  const files = sourceFiles(path.resolve("src")).filter(
    (file) => !file.endsWith(path.join("src", "config", "frontendVisibility.ts")) && !file.endsWith(path.join("src", "state", "OrfProvider.tsx")),
  );

  const forbiddenPatterns: Array<[RegExp, string]> = [
    [/\badminOnlyPaths\b/, "must not define local admin-only path lists"],
    [/\bRequireAdmin\b/, "must not define local admin-only route wrappers"],
    [/\bisAdmin\s*&&/, "must not use isAdmin for frontend visibility"],
    [/!\s*isAdmin\b/, "must not use isAdmin for frontend visibility"],
    [/\bisAdmin\s*\?/, "must not use isAdmin for frontend visibility"],
  ];

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const [pattern, message] of forbiddenPatterns) {
      assert.equal(pattern.test(source), false, `${file} ${message}; use src/config/frontendVisibility.ts`);
    }
  }
});

function sourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const fullPath = path.join(directory, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...sourceFiles(fullPath));
      continue;
    }

    if (/\.(ts|tsx)$/.test(entry)) {
      files.push(fullPath);
    }
  }

  return files;
}
