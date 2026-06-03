import "dotenv/config";
import { createHash, createPrivateKey, generateKeyPairSync, privateDecrypt, webcrypto } from "node:crypto";
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { summarizeContributionReviews, validateContributionAllocationInput } from "../src/features/challenge/model/contributionReview";
import type { ContributionAllocation, ObjectiveContributionReview } from "../src/types/orf";

type LocalKeyFile = {
  algorithm: "RSA-OAEP-256";
  createdAt: string;
  keyId: string;
  privateKeyJwk: JsonWebKey;
  publicKeyJwk: JsonWebKey;
};

type EncryptedReviewEnvelope = {
  ciphertext: string;
  encryptedKey: string;
  iv: string;
  keyId: string;
};

type LocalContributionReviewPayload = {
  allocations: ContributionAllocation[];
  challengers: string[];
  objectiveId: string;
  objectiveTitle?: string;
  reviewer: string;
  submittedAt: string;
  version: 1;
};

type StoredContributionReview = LocalContributionReviewPayload & {
  id: string;
  payloadHash: string;
  receivedAt: string;
};

const storageDir = process.env.ORF_LOCAL_SETTLEMENT_HOME ?? path.join(os.homedir(), ".orf", "local-settlement");
const keyPath = path.join(storageDir, "settlement-key.json");
const reviewStorePath = path.join(storageDir, "reviews.json");
const host = process.env.ORF_LOCAL_SETTLEMENT_HOST ?? "127.0.0.1";
const port = positiveInteger(process.env.ORF_LOCAL_SETTLEMENT_PORT, 8799);
const corsOrigin = process.env.ORF_LOCAL_SETTLEMENT_CORS_ORIGIN ?? "*";

await ensureStorage();
const keyFile = await readOrCreateKeyFile();

const server = http.createServer((request, response) => {
  void handleRequest(request, response).catch((error) => {
    console.error("[local-settlement] request failed", error);
    const statusCode = typeof (error as { statusCode?: unknown })?.statusCode === "number" ? (error as { statusCode: number }).statusCode : 500;
    sendJson(response, statusCode, { error: error instanceof Error ? error.message : "local settlement service failed" });
  });
});

server.listen(port, host, () => {
  console.log(`[local-settlement] listening on http://${host}:${port}`);
  console.log(`[local-settlement] key file: ${keyPath}`);
  console.log(`[local-settlement] review store: ${reviewStorePath}`);
});

async function handleRequest(request: IncomingMessage, response: ServerResponse) {
  setCorsHeaders(response);
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${host}:${port}`}`);
  if (request.method === "GET" && url.pathname === "/health") {
    return sendJson(response, 200, { ok: true, keyId: keyFile.keyId });
  }

  if (request.method === "GET" && url.pathname === "/public-key") {
    return sendJson(response, 200, {
      algorithm: keyFile.algorithm,
      keyId: keyFile.keyId,
      publicKeyJwk: keyFile.publicKeyJwk,
    });
  }

  if (request.method === "POST" && url.pathname === "/reviews") {
    const envelope = await readJsonBody<EncryptedReviewEnvelope>(request);
    const payload = await decryptReviewEnvelope(envelope);
    const review = validateLocalReviewPayload(payload);
    const stored = await appendReview(review);
    return sendJson(response, 200, {
      ok: true,
      objectiveId: stored.objectiveId,
      payloadHash: stored.payloadHash,
      receivedAt: stored.receivedAt,
      reviewer: stored.reviewer,
    });
  }

  const summaryMatch = url.pathname.match(/^\/objectives\/([^/]+)\/summary$/);
  if (request.method === "POST" && summaryMatch) {
    const objectiveId = decodeURIComponent(summaryMatch[1] ?? "");
    const body = await readJsonBody<{ challengers?: unknown }>(request);
    const challengers = stringArray(body.challengers);
    const reviews = (await readStoredReviews())
      .filter((review) => review.objectiveId === objectiveId)
      .map(toObjectiveContributionReview);
    const summary = summarizeContributionReviews(challengers, reviews);
    return sendJson(response, 200, {
      objectiveId,
      ...summary,
      contributionResolution: summary.status === "ready"
        ? { ratios: summary.ratios, reason: "本地匿名互评结算" }
        : null,
    });
  }

  return sendJson(response, 404, { error: "not found" });
}

async function ensureStorage() {
  await mkdir(storageDir, { recursive: true });
  await chmod(storageDir, 0o700).catch(() => undefined);
}

async function readOrCreateKeyFile(): Promise<LocalKeyFile> {
  const existing = await readFile(keyPath, "utf8").catch(() => null);
  if (existing) {
    return JSON.parse(existing) as LocalKeyFile;
  }

  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 4096,
    publicExponent: 0x10001,
  });
  const publicKeyJwk = publicKey.export({ format: "jwk" }) as JsonWebKey;
  const privateKeyJwk = privateKey.export({ format: "jwk" }) as JsonWebKey;
  const keyId = createHash("sha256").update(JSON.stringify(publicKeyJwk)).digest("hex").slice(0, 16);
  const keyFile: LocalKeyFile = {
    algorithm: "RSA-OAEP-256",
    createdAt: new Date().toISOString(),
    keyId,
    privateKeyJwk,
    publicKeyJwk,
  };
  await writePrivateJson(keyPath, keyFile);
  return keyFile;
}

async function decryptReviewEnvelope(envelope: EncryptedReviewEnvelope) {
  if (!envelope || envelope.keyId !== keyFile.keyId) {
    throw httpError("unknown settlement key", 400);
  }

  const aesKeyBytes = privateDecrypt(
    {
      key: createPrivateKey({ key: keyFile.privateKeyJwk, format: "jwk" }),
      oaepHash: "sha256",
    },
    Buffer.from(envelope.encryptedKey, "base64"),
  );
  const aesKey = await webcrypto.subtle.importKey("raw", aesKeyBytes, "AES-GCM", false, ["decrypt"]);
  const decrypted = await webcrypto.subtle.decrypt(
    { name: "AES-GCM", iv: Buffer.from(envelope.iv, "base64") },
    aesKey,
    Buffer.from(envelope.ciphertext, "base64"),
  );
  return JSON.parse(new TextDecoder().decode(decrypted)) as LocalContributionReviewPayload;
}

function validateLocalReviewPayload(payload: LocalContributionReviewPayload): LocalContributionReviewPayload {
  if (!payload || payload.version !== 1 || !payload.objectiveId || !payload.reviewer || !Array.isArray(payload.allocations)) {
    throw httpError("invalid review payload", 400);
  }
  const challengers = stringArray(payload.challengers);
  if (!challengers.includes(payload.reviewer)) {
    throw httpError("reviewer must be an objective challenger", 400);
  }
  const result = validateContributionAllocationInput(payload.allocations, challengers);
  if (result.status === "invalid") {
    throw httpError(`invalid allocations: ${result.reason}`, 400);
  }

  return {
    allocations: result.allocations,
    challengers,
    objectiveId: payload.objectiveId,
    objectiveTitle: payload.objectiveTitle,
    reviewer: payload.reviewer,
    submittedAt: payload.submittedAt || new Date().toISOString(),
    version: 1,
  };
}

async function appendReview(payload: LocalContributionReviewPayload): Promise<StoredContributionReview> {
  const reviews = await readStoredReviews();
  const payloadHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const stored: StoredContributionReview = {
    ...payload,
    id: `local-review-${payloadHash.slice(0, 16)}`,
    payloadHash,
    receivedAt: new Date().toISOString(),
  };
  const next = reviews.some((review) => review.payloadHash === payloadHash) ? reviews : [...reviews, stored];
  await writePrivateJson(reviewStorePath, next);
  return stored;
}

async function readStoredReviews(): Promise<StoredContributionReview[]> {
  const value = await readFile(reviewStorePath, "utf8").catch(() => "[]");
  const parsed = JSON.parse(value) as StoredContributionReview[];
  return Array.isArray(parsed) ? parsed : [];
}

function toObjectiveContributionReview(review: StoredContributionReview): ObjectiveContributionReview {
  return {
    id: review.id,
    objectiveId: review.objectiveId,
    reviewer: review.reviewer,
    allocations: review.allocations,
    submittedAt: review.submittedAt,
  };
}

async function writePrivateJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await chmod(filePath, 0o600).catch(() => undefined);
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const body = Buffer.concat(chunks).toString("utf8");
  return (body ? JSON.parse(body) : {}) as T;
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  setCorsHeaders(response);
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function setCorsHeaders(response: ServerResponse) {
  response.setHeader("access-control-allow-origin", corsOrigin);
  response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type");
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item.trim())) {
    throw httpError("expected string array", 400);
  }
  return Array.from(new Set(value.map((item) => item.trim())));
}

function positiveInteger(raw: string | undefined, fallback: number) {
  const value = Number(raw ?? fallback);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function httpError(message: string, statusCode: number) {
  const error = new Error(message) as Error & { statusCode?: number };
  error.statusCode = statusCode;
  return error;
}
