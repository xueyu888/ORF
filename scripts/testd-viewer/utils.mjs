import path from "node:path";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function isNodeError(error) {
  return error instanceof Error && "code" in error;
}

export function numberOrZero(value) {
  return Number.isFinite(value) ? value : 0;
}

export function stringOrEmpty(value) {
  return typeof value === "string" ? value : "";
}

export function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

export function normalizePathname(pathname) {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export function isInside(baseDir, targetPath) {
  const relative = path.relative(baseDir, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function resolveInside(baseDir, ...parts) {
  const target = path.resolve(baseDir, ...parts);
  if (!isInside(baseDir, target)) {
    throw new HttpError(403, "路径非法");
  }
  return target;
}

export function sendJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(`${JSON.stringify(body)}\n`);
}

export function contentTypeFor(targetPath) {
  const ext = path.extname(targetPath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "application/octet-stream";
}

export function isFailedCaseStatus(status) {
  return ["failed", "timedOut", "timedout", "interrupted"].includes(status);
}
