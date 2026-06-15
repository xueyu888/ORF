import { env } from "../env";
export { localSettlementProxyBasePath } from "../../src/domain/orfLocalSettlement";

export type LocalSettlementServiceResponse = {
  body: unknown;
  contentType: string | null;
  status: number;
};

export class LocalSettlementServiceUnavailableError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super("Local settlement service is unavailable");
    this.name = "LocalSettlementServiceUnavailableError";
    this.cause = cause;
  }
}

export function localSettlementTargetUrl(baseUrl: string, pathname: string) {
  if (!pathname.startsWith("/")) {
    throw new Error("Local settlement proxy path must start with /");
  }

  return new URL(pathname, baseUrl.replace(/\/+$/, "") + "/").toString();
}

export async function fetchLocalSettlementService(input: {
  body?: unknown;
  method: "GET" | "POST";
  path: string;
}): Promise<LocalSettlementServiceResponse> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), env.ORF_LOCAL_SETTLEMENT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(localSettlementTargetUrl(env.ORF_LOCAL_SETTLEMENT_SERVICE_URL, input.path), {
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      headers: input.body === undefined ? undefined : { "content-type": "application/json" },
      method: input.method,
      signal: controller.signal,
    });
  } catch (error) {
    throw new LocalSettlementServiceUnavailableError(error);
  } finally {
    globalThis.clearTimeout(timeout);
  }

  const contentType = response.headers.get("content-type");
  const text = await response.text();
  return {
    body: parseLocalSettlementResponseBody(text, contentType),
    contentType,
    status: response.status,
  };
}

function parseLocalSettlementResponseBody(text: string, contentType: string | null) {
  if (!text) return "";
  if (!contentType?.includes("application/json")) return text;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
