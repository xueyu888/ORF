import type { ContributionAllocation } from "../types/orf";

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

const defaultLocalSettlementUrl = "http://127.0.0.1:8799";

export function localSettlementBaseUrl() {
  return (import.meta.env.VITE_ORF_LOCAL_SETTLEMENT_URL as string | undefined)?.trim() || defaultLocalSettlementUrl;
}

export async function submitLocalEncryptedContributionReview(input: {
  allocations: ContributionAllocation[];
  challengers: string[];
  objectiveId: string;
  objectiveTitle?: string;
  reviewer: string;
}) {
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
  const response = await fetch(`${localSettlementBaseUrl()}/reviews`, {
    body: JSON.stringify(envelope),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json() as Promise<{ ok: true; payloadHash: string; receivedAt: string }>;
}

export async function fetchLocalSettlementSummary(input: { challengers: string[]; objectiveId: string }) {
  const response = await fetch(`${localSettlementBaseUrl()}/objectives/${encodeURIComponent(input.objectiveId)}/summary`, {
    body: JSON.stringify({ challengers: input.challengers }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json() as Promise<LocalSettlementSummary>;
}

async function fetchLocalSettlementPublicKey() {
  const response = await fetch(`${localSettlementBaseUrl()}/public-key`);
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json() as Promise<LocalSettlementPublicKey>;
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
