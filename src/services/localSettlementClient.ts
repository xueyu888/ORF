import type { ContributionAllocation } from "../types/orf";
import { localSettlementProxyBasePath } from "../domain/orfLocalSettlement";

type LocalSettlementPublicKey = {
  algorithm: "RSA-OAEP-256";
  keyId: string;
  publicKeyJwk: JsonWebKey;
};

type EncryptedReviewEnvelope = {
  ciphertext: string;
  encryptedKey: string;
  iv: string;
  keyId: string;
};

export type LocalSettlementSummary = {
  contributionResolution: { ratios: ContributionAllocation[]; reason: string } | null;
  missingReviewers: string[];
  objectiveId: string;
  ratios: ContributionAllocation[];
  reviewers: string[];
  status: "ready" | "missing" | "conflict";
};

const localSettlementRequestTimeoutMs = 3000;

export class LocalSettlementUnavailableError extends Error {
  readonly baseUrl: string;

  constructor(baseUrl: string, cause?: unknown) {
    super(`Local settlement service is not reachable at ${baseUrl}`, { cause });
    this.name = "LocalSettlementUnavailableError";
    this.baseUrl = baseUrl;
  }
}

export class LocalSettlementResponseError extends Error {
  readonly baseUrl: string;
  readonly status: number;

  constructor(baseUrl: string, status: number, message: string) {
    super(message || `Local settlement service returned ${status}`);
    this.name = "LocalSettlementResponseError";
    this.baseUrl = baseUrl;
    this.status = status;
  }
}

export function localSettlementBaseUrl() {
  return localSettlementProxyBasePath;
}

export async function assertLocalSettlementAvailable() {
  await requestLocalSettlement("/health");
}

export async function submitLocalEncryptedContributionReview(input: {
  allocations: ContributionAllocation[];
  challengers: string[];
  objectiveId: string;
  objectiveTitle?: string;
  reviewer: string;
}) {
  await assertLocalSettlementAvailable();
  const key = await fetchLocalSettlementPublicKey();
  const envelope = await encryptForLocalSettlement(key, {
    allocations: input.allocations,
    challengers: input.challengers,
    objectiveId: input.objectiveId,
    objectiveTitle: input.objectiveTitle,
    reviewer: input.reviewer,
    submittedAt: new Date().toISOString(),
    version: 1,
  });
  const response = await requestLocalSettlement(`/objectives/${encodeURIComponent(input.objectiveId)}/reviews`, {
    body: JSON.stringify(envelope),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  return response.json() as Promise<{ ok: true; payloadHash: string; receivedAt: string }>;
}

export async function fetchLocalSettlementSummary(input: { objectiveId: string }) {
  const response = await requestLocalSettlement(`/objectives/${encodeURIComponent(input.objectiveId)}/summary`, {
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  return response.json() as Promise<LocalSettlementSummary>;
}

async function fetchLocalSettlementPublicKey() {
  const response = await requestLocalSettlement("/public-key");
  return response.json() as Promise<LocalSettlementPublicKey>;
}

async function requestLocalSettlement(path: string, init?: RequestInit) {
  const baseUrl = localSettlementBaseUrl();
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), localSettlementRequestTimeoutMs);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, { ...init, signal: controller.signal });
  } catch (error) {
    throw new LocalSettlementUnavailableError(baseUrl, error);
  } finally {
    globalThis.clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new LocalSettlementResponseError(baseUrl, response.status, await readLocalSettlementErrorMessage(response));
  }
  return response;
}

async function readLocalSettlementErrorMessage(response: Response) {
  const text = await response.text();
  if (!text) return response.statusText;
  try {
    const payload = JSON.parse(text) as { error?: unknown };
    return typeof payload.error === "string" ? payload.error : text;
  } catch {
    return text;
  }
}

async function encryptForLocalSettlement(key: LocalSettlementPublicKey, payload: Record<string, unknown>): Promise<EncryptedReviewEnvelope> {
  const aesKey = await crypto.subtle.generateKey({ length: 256, name: "AES-GCM" }, true, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encodedPayload = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt({ iv, name: "AES-GCM" }, aesKey, encodedPayload);
  const rawAesKey = await crypto.subtle.exportKey("raw", aesKey);
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    key.publicKeyJwk,
    { hash: "SHA-256", name: "RSA-OAEP" },
    false,
    ["encrypt"],
  );
  const encryptedKey = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, rawAesKey);

  return {
    ciphertext: arrayBufferToBase64(ciphertext),
    encryptedKey: arrayBufferToBase64(encryptedKey),
    iv: arrayBufferToBase64(iv),
    keyId: key.keyId,
  };
}

function arrayBufferToBase64(value: ArrayBuffer | Uint8Array) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
