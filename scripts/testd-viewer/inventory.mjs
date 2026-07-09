import fsp from "node:fs/promises";
import path from "node:path";
import { isFailedCaseStatus, isNodeError, toPosixPath } from "./utils.mjs";

export async function buildInventory({ cwd = process.cwd(), configPath = path.join(cwd, "testd", "testd.config.ts") } = {}) {
  const testdRoot = path.join(cwd, "testd");
  const [specPaths, config] = await Promise.all([
    listSpecPaths(testdRoot),
    readTestdConfig(configPath, cwd),
  ]);
  const configBySpec = new Map(config.cases.filter((item) => item.spec).map((item) => [item.spec, item]));
  const configById = new Map(config.cases.map((item) => [item.id, item]));

  const cases = await Promise.all(
    specPaths.map(async (specPath) => {
      const spec = createSpecRecord(specPath, cwd);
      const caseMetadata = await readCaseMetadata(spec.casePath, cwd);
      const configEntry = configBySpec.get(spec.specPath) ?? configById.get(caseMetadata.id);
      const enabled = configEntry?.enabled === false ? false : true;
      return {
        id: caseMetadata.id || configEntry?.id || spec.derivedId,
        title: configEntry?.title || caseMetadata.title || spec.derivedTitle,
        suite: spec.suite,
        module: spec.module,
        flow: spec.flow,
        caseDir: spec.caseDir,
        specPath: spec.specPath,
        casePath: spec.casePath ? toPosixPath(path.relative(cwd, spec.casePath)) : "",
        doc: configEntry?.doc ?? "",
        tags: caseMetadata.tags,
        configured: Boolean(configEntry),
        enabled,
        runState: enabled ? "runnable" : "disabled",
        changePolicy: configEntry?.changePolicy ?? "",
        fixtureLifecycle: configEntry?.fixtureLifecycle ?? "",
        traceability: configEntry?.traceability ?? "",
        configSource: configEntry ? "testd.config.ts" : "implicit",
      };
    }),
  );

  const existingSpecSet = new Set(cases.map((item) => item.specPath));
  const configuredMissingSpecs = config.cases
    .filter((item) => item.spec && !existingSpecSet.has(item.spec))
    .map((item) => ({
      id: item.id,
      title: item.title,
      specPath: item.spec,
      enabled: item.enabled,
    }));

  cases.sort(compareInventoryCases);

  return {
    summary: buildInventorySummary(cases, config, configuredMissingSpecs),
    cases,
    modules: buildModuleSummaries(cases),
    configuredMissingSpecs,
    config: {
      path: toPosixPath(path.relative(cwd, configPath)),
      caseCount: config.cases.length,
      readError: config.readError,
    },
  };
}

export function attachLatestResults(inventory, latestReport) {
  const resultById = new Map((latestReport?.report?.cases ?? []).map((testCase) => [testCase.id, testCase]));
  const cases = inventory.cases.map((testCase) => {
    const result = resultById.get(testCase.id);
    const latestResult = result
      ? {
          status: result.status,
          durationMs: result.durationMs ?? 0,
          failedStage: result.failedStage ?? "",
          error: result.error ?? null,
          stages: result.stages ?? [],
          screenshots: result.screenshots ?? [],
        }
      : null;
    const runState = !testCase.enabled ? "disabled" : latestResult ? latestResult.status : "not-run";
    return {
      ...testCase,
      runState,
      latestResult,
    };
  });

  return {
    ...inventory,
    summary: {
      ...inventory.summary,
      runnable: cases.filter((testCase) => testCase.enabled).length,
      disabled: cases.filter((testCase) => !testCase.enabled).length,
      latestPassed: cases.filter((testCase) => testCase.latestResult?.status === "passed").length,
      latestFailed: cases.filter((testCase) => isFailedCaseStatus(testCase.latestResult?.status)).length,
      latestSkipped: cases.filter((testCase) => testCase.latestResult?.status === "skipped").length,
      notRun: cases.filter((testCase) => testCase.runState === "not-run").length,
    },
    cases,
    modules: buildModuleSummaries(cases),
  };
}

export function buildOverview(inventory, reports, latestReport) {
  const failedCases = inventory.cases.filter((testCase) => isFailedCaseStatus(testCase.runState));
  const slowCases = inventory.cases
    .filter((testCase) => testCase.latestResult?.durationMs)
    .sort((left, right) => right.latestResult.durationMs - left.latestResult.durationMs)
    .slice(0, 8);
  const notRunCases = inventory.cases.filter((testCase) => testCase.runState === "not-run");

  return {
    generatedAt: new Date().toISOString(),
    latestReport: latestReport?.metadata ?? null,
    inventory: inventory.summary,
    modules: inventory.modules,
    failedCases,
    slowCases,
    notRunCases,
    recentReports: reports.slice(0, 8),
  };
}

async function listSpecPaths(rootDir) {
  let entries;
  try {
    entries = await fsp.readdir(rootDir, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const output = [];
  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      output.push(...await listSpecPaths(entryPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".spec.ts")) {
      output.push(entryPath);
    }
  }
  return output;
}

async function readTestdConfig(configPath, cwd) {
  let text = "";
  try {
    text = await fsp.readFile(configPath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return { cases: [], readError: "testd.config.ts 不存在" };
    }
    throw error;
  }

  try {
    return {
      cases: parseTestdCases(text).map((item) => ({
        ...item,
        spec: item.spec ? toPosixPath(path.normalize(item.spec)) : "",
        doc: item.doc ? toPosixPath(path.normalize(item.doc)) : "",
      })),
      readError: "",
    };
  } catch (error) {
    return {
      cases: [],
      readError: error instanceof Error ? error.message : String(error),
      path: toPosixPath(path.relative(cwd, configPath)),
    };
  }
}

function parseTestdCases(text) {
  const start = text.indexOf("export const testdCases");
  if (start === -1) {
    return [];
  }
  const arrayStart = text.indexOf("[", start);
  if (arrayStart === -1) {
    return [];
  }
  const arrayEnd = findMatchingBracket(text, arrayStart, "[", "]");
  const arrayText = text.slice(arrayStart + 1, arrayEnd);
  return splitTopLevelObjects(arrayText).map(parseConfigObject).filter((item) => item.id);
}

function parseConfigObject(block) {
  return {
    id: stringField(block, "id"),
    title: stringField(block, "title"),
    doc: stringField(block, "doc"),
    changePolicy: stringField(block, "changePolicy"),
    enabled: booleanField(block, "enabled", true),
    fixtureLifecycle: stringField(block, "fixtureLifecycle"),
    traceability: stringField(block, "traceability"),
    spec: stringField(block, "spec"),
  };
}

function splitTopLevelObjects(text) {
  const blocks = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "{") {
      continue;
    }
    const end = findMatchingBracket(text, index, "{", "}");
    blocks.push(text.slice(index, end + 1));
    index = end;
  }
  return blocks;
}

function findMatchingBracket(text, start, open, close) {
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === open) {
      depth += 1;
    } else if (char === close) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  throw new Error("无法解析 testdCases 配置数组");
}

function stringField(text, field) {
  const match = new RegExp(`${field}:\\s*"([^"]*)"`).exec(text);
  return match?.[1] ?? "";
}

function booleanField(text, field, fallback) {
  const match = new RegExp(`${field}:\\s*(true|false)`).exec(text);
  return match ? match[1] === "true" : fallback;
}

function createSpecRecord(specPath, cwd) {
  const relativeSpec = toPosixPath(path.relative(cwd, specPath));
  const testdRelative = toPosixPath(path.relative(path.join(cwd, "testd"), specPath));
  const parts = testdRelative.split("/");
  const suite = parts[0] || "默认";
  const module = parts[1] || "未分组";
  const flow = parts[2] || "未分组流程";
  const caseDir = parts[3] || path.basename(specPath, ".spec.ts");
  const caseRoot = path.resolve(path.dirname(specPath), "..");
  const casePath = path.join(caseRoot, `${path.basename(caseRoot)}.case.ts`);

  return {
    specPath: relativeSpec,
    suite,
    module,
    flow,
    caseDir,
    casePath,
    derivedId: caseDir,
    derivedTitle: caseDir.split("-").join(" "),
  };
}

async function readCaseMetadata(casePath) {
  let text = "";
  try {
    text = await fsp.readFile(casePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return { id: "", title: "", tags: [] };
    }
    throw error;
  }

  return {
    id: stringField(text, "id"),
    title: stringField(text, "title"),
    tags: parseTags(text),
  };
}

function parseTags(text) {
  const match = /tags:\s*\[([^\]]*)\]/s.exec(text);
  if (!match) {
    return [];
  }
  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

function buildInventorySummary(cases, config, configuredMissingSpecs) {
  return {
    totalSpecs: cases.length,
    runnable: cases.filter((testCase) => testCase.enabled).length,
    disabled: cases.filter((testCase) => !testCase.enabled).length,
    configured: cases.filter((testCase) => testCase.configured).length,
    unconfigured: cases.filter((testCase) => !testCase.configured).length,
    configEntries: config.cases.length,
    configuredMissingSpecs: configuredMissingSpecs.length,
    suites: countBy(cases, (testCase) => testCase.suite),
  };
}

function buildModuleSummaries(cases) {
  const modules = new Map();
  for (const testCase of cases) {
    const key = `${testCase.suite}/${testCase.module}/${testCase.flow}`;
    const current = modules.get(key) ?? {
      key,
      suite: testCase.suite,
      module: testCase.module,
      flow: testCase.flow,
      total: 0,
      runnable: 0,
      disabled: 0,
      configured: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      notRun: 0,
      durationMs: 0,
    };
    current.total += 1;
    current.runnable += testCase.enabled ? 1 : 0;
    current.disabled += testCase.enabled ? 0 : 1;
    current.configured += testCase.configured ? 1 : 0;
    current.passed += testCase.runState === "passed" ? 1 : 0;
    current.failed += isFailedCaseStatus(testCase.runState) ? 1 : 0;
    current.skipped += testCase.runState === "skipped" ? 1 : 0;
    current.notRun += testCase.runState === "not-run" ? 1 : 0;
    current.durationMs += testCase.latestResult?.durationMs ?? 0;
    modules.set(key, current);
  }
  return [...modules.values()].sort(compareModuleSummaries);
}

function countBy(items, keyFn) {
  return Object.fromEntries(
    [...items.reduce((map, item) => {
      const key = keyFn(item);
      map.set(key, (map.get(key) ?? 0) + 1);
      return map;
    }, new Map())].sort(([left], [right]) => left.localeCompare(right, "zh-CN")),
  );
}

function compareInventoryCases(left, right) {
  return left.suite.localeCompare(right.suite, "zh-CN")
    || left.module.localeCompare(right.module, "zh-CN")
    || left.flow.localeCompare(right.flow, "zh-CN")
    || left.title.localeCompare(right.title, "zh-CN");
}

function compareModuleSummaries(left, right) {
  return left.suite.localeCompare(right.suite, "zh-CN")
    || left.module.localeCompare(right.module, "zh-CN")
    || left.flow.localeCompare(right.flow, "zh-CN");
}
