import { errorMessage } from "../db/errors";

export function isAuthServiceUnavailableError(error: unknown) {
  const message = errorMessage(error);
  return /\b5\d\d\b/.test(message) || /AbortError|TimeoutError|timeout|ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENOTFOUND|ETIMEDOUT|fetch failed/i.test(message);
}

export function authServiceUnavailablePayload() {
  return { error: "认证服务暂时不可用，请稍后重试。" };
}
