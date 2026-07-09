import fsp from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { attachLatestResults, buildInventory, buildOverview } from "./inventory.mjs";
import { listReports, readLatestReport, readReport, serveReportAttachment } from "./reports.mjs";
import { HttpError, contentTypeFor, normalizePathname, positiveInteger, sendJson, toPosixPath } from "./utils.mjs";

const DEFAULT_PORT = 5179;
const PUBLIC_ROOT = fileURLToPath(new URL("./public", import.meta.url));

export function startTestdViewerServer({
  cwd = process.cwd(),
  host = process.env.TESTD_VIEWER_HOST ?? "127.0.0.1",
  port = positiveInteger(process.env.TESTD_VIEWER_PORT, DEFAULT_PORT),
  reportRoot = path.resolve(cwd, process.env.TESTD_REPORT_DIR ?? "test-reports"),
} = {}) {
  const server = http.createServer(async (request, response) => {
    try {
      await handleRequest(request, response, { cwd, host, port, reportRoot });
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      const message = error instanceof Error ? error.message : String(error);
      sendJson(response, status, { error: message });
    }
  });

  server.on("error", (error) => {
    if (error && error.code === "EADDRINUSE") {
      console.error(`TestD 控制台端口已被占用: ${host}:${port}`);
      console.error("可以使用 TESTD_VIEWER_PORT=其他端口 npm run testd:viewer 启动。");
      process.exit(1);
    }
    throw error;
  });

  server.listen(port, host, () => {
    console.log(`TestD 控制台已启动: http://${host}:${port}`);
    console.log(`报告目录: ${path.relative(cwd, reportRoot) || "."}`);
  });

  return server;
}

async function handleRequest(request, response, context) {
  const method = request.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") {
    sendJson(response, 405, { error: "Method Not Allowed" });
    return;
  }

  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${context.host}:${context.port}`}`);
  const pathname = normalizePathname(url.pathname);

  if (pathname === "/" || pathname === "/index.html") {
    await serveStaticFile(response, path.join(PUBLIC_ROOT, "index.html"));
    return;
  }

  if (pathname === "/app.js" || pathname === "/styles.css") {
    await serveStaticFile(response, path.join(PUBLIC_ROOT, pathname.slice(1)));
    return;
  }

  if (pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      reportRoot: toPosixPath(path.relative(context.cwd, context.reportRoot)),
      mode: "readonly",
    });
    return;
  }

  if (pathname === "/api/console") {
    sendJson(response, 200, await readConsoleData(context));
    return;
  }

  if (pathname === "/api/inventory") {
    const inventory = await buildInventory({ cwd: context.cwd });
    sendJson(response, 200, { inventory });
    return;
  }

  if (pathname === "/api/reports") {
    sendJson(response, 200, { reports: await listReports(context) });
    return;
  }

  if (pathname === "/api/reports/latest") {
    const latestReport = await readLatestReport(context);
    if (!latestReport) {
      sendJson(response, 404, { error: "还没有 TestD 报告" });
      return;
    }
    sendJson(response, 200, latestReport);
    return;
  }

  if (pathname.startsWith("/api/reports/")) {
    const reportId = decodeURIComponent(pathname.slice("/api/reports/".length));
    sendJson(response, 200, await readReport(reportId, context));
    return;
  }

  if (pathname.startsWith("/reports/")) {
    await serveReportAttachment(pathname, response, context);
    return;
  }

  await serveStaticFile(response, path.join(PUBLIC_ROOT, "index.html"));
}

async function readConsoleData(context) {
  const [inventory, reports] = await Promise.all([
    buildInventory({ cwd: context.cwd }),
    listReports(context),
  ]);
  const latestReport = reports.length ? await readReport(reports[0].id, context) : null;
  const inventoryWithResults = attachLatestResults(inventory, latestReport);

  return {
    overview: buildOverview(inventoryWithResults, reports, latestReport),
    inventory: inventoryWithResults,
    reports,
    latestReport,
  };
}

async function serveStaticFile(response, filePath) {
  const body = await fsp.readFile(filePath);
  response.writeHead(200, {
    "Content-Type": contentTypeFor(filePath),
    "Cache-Control": "no-store",
  });
  response.end(body);
}
