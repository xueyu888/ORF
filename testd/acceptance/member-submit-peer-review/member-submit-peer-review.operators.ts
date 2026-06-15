import { createServer } from "node:http";
import { expect } from "@playwright/test";
import type { OperatorRegistry, StateCaseRuntime, StepParams } from "../../_framework/types";
import { requiredCapturedResponse } from "../../_operators/common.operators";
import { readResponseBody } from "../../_operators/common.helpers";
import { requiredString } from "../../_operators/params";
import type {
  MemberSubmitPeerReviewCaseData,
  PeerReviewLoot,
  PeerReviewTarget,
  SubmittedPeerReview,
  TestContext,
} from "./_support/member-submit-peer-review.context";
import {
  addPeerReviewTargetChallenger,
  createPeerReviewLoot,
  deletePeerReview,
  deletePeerReviewLoot,
  lootPagePath,
  peerReviewAbsent,
  peerReviewTargetFromObjective,
  preparePeerReviewTargetForReview,
  targetChallengerPresent,
  targetLootPresent,
  targetAccepted,
  testLootAbsent,
} from "./_support/member-submit-peer-review.helpers";

export const memberSubmitPeerReviewOperators = {
  "db.peer_review_target": {
    from_objective: async ({ params }) => peerReviewTargetFromObjective(requiredString(params, "objectiveId")),

    add_challenger: async ({ params }) => {
      await addPeerReviewTargetChallenger(
        requiredPeerReviewTarget(params, "target"),
        requiredString(params, "memberName"),
        requiredString(params, "memberUserId"),
      );
    },

    accepted_for_review: async ({ params }) => {
      await preparePeerReviewTargetForReview(requiredPeerReviewTarget(params, "target"));
    },

    accepted: async ({ params }) => {
      await expect.poll(() => targetAccepted(requiredPeerReviewTarget(params, "target"))).toBe(true);
    },

    challenger_present: async ({ params }) => {
      await expect
        .poll(() =>
          targetChallengerPresent(
            requiredPeerReviewTarget(params, "target"),
            requiredString(params, "memberName"),
            requiredString(params, "memberUserId"),
          ),
        )
        .toBe(true);
    },
  },

  "db.peer_review_loot": {
    absent: async ({ params }) => {
      await expect.poll(() => testLootAbsent(requiredString(params, "body"))).toBe(true);
    },

    create: async ({ params }) => {
      return createPeerReviewLoot(requiredPeerReviewTarget(params, "target"), requiredString(params, "body"), requiredString(params, "memberName"));
    },

    present: async ({ params }) => {
      await expect
        .poll(() => targetLootPresent(requiredPeerReviewTarget(params, "target"), requiredPeerReviewLoot(params, "loot")))
        .toBe(true);
    },

    delete: async ({ params }) => {
      await deletePeerReviewLoot(requiredString(params, "body"), optionalPeerReviewLoot(params, "loot"));
    },
  },

  "db.peer_review": {
    absent: async ({ params }) => {
      await expect.poll(() => peerReviewAbsent(optionalPeerReviewTarget(params, "target"), requiredString(params, "reviewer"))).toBe(true);
    },

    delete: async ({ params }) => {
      await deletePeerReview(optionalPeerReviewTarget(params, "target"), requiredString(params, "reviewer"), optionalSubmittedPeerReview(params, "review"));
    },
  },

  "page.peer_review": {
    goto: async ({ ctx, params }) => {
      await ctx.page.goto(lootPagePath(requiredPeerReviewTarget(params, "target")));
    },
  },

  "page.peer_review_form": {
    visible: async ({ ctx }) => {
      await expect(ctx.page.getByRole("heading", { name: "提交匿名互评" })).toBeVisible();
      await expect(ctx.page.getByRole("button", { name: "提交匿名互评" })).toBeVisible();
    },

    submit: async ({ ctx, runtime, params }) => {
      const target = requiredPeerReviewTarget(params, "target");
      await installLocalSettlementMock(runtime);
      runtime.values[requiredString(params, "saveAs")] = ctx.page
        .waitForResponse((response) => {
          return (
            response.request().method().toUpperCase() === "POST" &&
            isLocalSettlementProxyReviewEndpoint(response.url(), target.objective.id)
          );
        })
        .then(async (response) => ({
          ok: response.ok(),
          status: response.status(),
          url: response.url(),
          method: response.request().method(),
          body: await readResponseBody(response),
        }));
      await ctx.page.getByRole("button", { name: "提交匿名互评" }).click();
    },
  },

  "api.peer_review_submit_response": {
    record_review: async ({ runtime, params }) => {
      const response = await requiredCapturedResponse(params, "response");
      expect(response.ok).toBe(true);
      const review = requiredSubmittedPeerReview({ review: runtime.values.localPeerReviewSubmission }, "review");
      expect(response.body).toMatchObject(review.response);
      return review;
    },

    sent_to_local_service: async ({ params }) => {
      const review = requiredSubmittedPeerReview(params, "review");
      expect(review.method).toBe("POST");
      expect(isLocalSettlementEndpoint(review.url, "/reviews")).toBe(true);
    },

    accepted: async ({ params }) => {
      const review = requiredSubmittedPeerReview(params, "review");
      expect(review.response.ok).toBe(true);
      expect(review.response.payloadHash).toBeTruthy();
    },

    encrypted_field: async ({ params }) => {
      const review = requiredSubmittedPeerReview(params, "review");
      const field = requiredEncryptedEnvelopeField(params, "field");
      expect(review.body[field]).toBeTruthy();
    },

    no_plaintext: async ({ params }) => {
      const review = requiredSubmittedPeerReview(params, "review");
      expect(JSON.stringify(review.body)).not.toContain(requiredString(params, "text"));
    },
  },
} satisfies OperatorRegistry<TestContext, MemberSubmitPeerReviewCaseData>;

function requiredPeerReviewTarget(params: StepParams, key: string): PeerReviewTarget {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as PeerReviewTarget).objective !== "object" ||
    (value as PeerReviewTarget).objective === null ||
    typeof (value as PeerReviewTarget).objective.id !== "string" ||
    typeof (value as PeerReviewTarget).objective.teamId !== "string" ||
    typeof (value as PeerReviewTarget).objective.title !== "string" ||
    typeof (value as PeerReviewTarget).objective.flowStatus !== "string"
  ) {
    throw new Error(`参数 ${key} 必须是成员提交匿名互评目标`);
  }

  return value as PeerReviewTarget;
}

function optionalPeerReviewTarget(params: StepParams, key: string): PeerReviewTarget | null {
  const value = params[key];
  if (value === undefined || value === null) {
    return null;
  }

  return requiredPeerReviewTarget(params, key);
}

function requiredPeerReviewLoot(params: StepParams, key: string): PeerReviewLoot {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as PeerReviewLoot).id !== "string" ||
    typeof (value as PeerReviewLoot).objectiveId !== "string" ||
    typeof (value as PeerReviewLoot).body !== "string"
  ) {
    throw new Error(`参数 ${key} 必须是匿名互评前置战利品`);
  }

  return value as PeerReviewLoot;
}

function optionalPeerReviewLoot(params: StepParams, key: string): PeerReviewLoot | null {
  const value = params[key];
  if (value === undefined || value === null) {
    return null;
  }

  return requiredPeerReviewLoot(params, key);
}

function requiredSubmittedPeerReview(params: StepParams, key: string): SubmittedPeerReview {
  const value = params[key];
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as SubmittedPeerReview).url !== "string" ||
    typeof (value as SubmittedPeerReview).method !== "string" ||
    !isEncryptedEnvelope((value as SubmittedPeerReview).body) ||
    !isLocalSettlementAcceptedResponse((value as SubmittedPeerReview).response)
  ) {
    throw new Error(`参数 ${key} 必须是提交后的匿名互评`);
  }

  return value as SubmittedPeerReview;
}

function optionalSubmittedPeerReview(params: StepParams, key: string): SubmittedPeerReview | null {
  const value = params[key];
  if (value === undefined || value === null) {
    return null;
  }

  return requiredSubmittedPeerReview(params, key);
}

function requiredEncryptedEnvelopeField(params: StepParams, key: string): keyof SubmittedPeerReview["body"] {
  const field = requiredString(params, key);
  if (field === "ciphertext" || field === "encryptedKey" || field === "iv" || field === "keyId") {
    return field;
  }
  throw new Error(`参数 ${key} 必须是匿名互评加密信封字段`);
}

async function installLocalSettlementMock(runtime: StateCaseRuntime) {
  const server = createServer((request, response) => {
    void handleLocalSettlementRequest(request, response, runtime, () => {
      server.close();
    }).catch((error: unknown) => {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    });
  });

  server.unref();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(8799, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

async function handleLocalSettlementRequest(
  request: Parameters<Parameters<typeof createServer>[0]>[0],
  response: Parameters<Parameters<typeof createServer>[0]>[1],
  runtime: StateCaseRuntime,
  close: () => void,
) {
  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, { ok: true, keyId: localSettlementPublicKey.keyId });
    return;
  }
  if (request.method === "GET" && request.url === "/public-key") {
    sendJson(response, localSettlementPublicKey);
    return;
  }
  if (request.method === "POST" && request.url === "/reviews") {
    const body = requiredEncryptedEnvelope(await readJsonRequest(request));
    const acceptedResponse = {
      ok: true as const,
      payloadHash: "testd-local-peer-review",
      receivedAt: new Date().toISOString(),
    };
    runtime.values.localPeerReviewSubmission = {
      body,
      method: request.method,
      response: acceptedResponse,
      url: "http://127.0.0.1:8799/reviews",
    } satisfies SubmittedPeerReview;
    sendJson(response, acceptedResponse, close);
    return;
  }

  sendJson(response, { error: "Not found" }, undefined, 404);
}

async function readJsonRequest(request: Parameters<Parameters<typeof createServer>[0]>[0]) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function sendJson(
  response: Parameters<Parameters<typeof createServer>[0]>[1],
  body: unknown,
  afterSend?: () => void,
  status = 200,
) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body), afterSend);
}

function isLocalSettlementProxyReviewEndpoint(value: string, objectiveId: string) {
  const url = new URL(value);
  return url.pathname === `/api/local-settlement/objectives/${encodeURIComponent(objectiveId)}/reviews`;
}

function isLocalSettlementEndpoint(value: string, pathname: string) {
  const url = new URL(value);
  return url.protocol === "http:" && url.port === "8799" && url.pathname === pathname;
}

function requiredEncryptedEnvelope(value: unknown): SubmittedPeerReview["body"] {
  if (!isEncryptedEnvelope(value)) {
    throw new Error("本地匿名互评请求必须是加密信封");
  }
  return value;
}

function isEncryptedEnvelope(value: unknown): value is SubmittedPeerReview["body"] {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as SubmittedPeerReview["body"]).ciphertext === "string" &&
    typeof (value as SubmittedPeerReview["body"]).encryptedKey === "string" &&
    typeof (value as SubmittedPeerReview["body"]).iv === "string" &&
    typeof (value as SubmittedPeerReview["body"]).keyId === "string"
  );
}

function isLocalSettlementAcceptedResponse(value: unknown): value is SubmittedPeerReview["response"] {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as SubmittedPeerReview["response"]).ok === true &&
    typeof (value as SubmittedPeerReview["response"]).payloadHash === "string" &&
    typeof (value as SubmittedPeerReview["response"]).receivedAt === "string"
  );
}

const localSettlementPublicKey = {
  algorithm: "RSA-OAEP-256",
  keyId: "testd-local-settlement",
  publicKeyJwk: {
    alg: "RSA-OAEP-256",
    e: "AQAB",
    ext: true,
    key_ops: ["encrypt"],
    kty: "RSA",
    n: "i45jM-b7LfXjm6EZpgZngqOTFzCgIrev-C6mdxC1RgjW44yxTCFPPVYojRRQ-bI73pxUzIzUAuKouXlPp7OHQDlIVk_2pHED5QEs6XVkcVBbXhnC3tVLcHJUgoPiHaKnblFIIbNe2uE-myibBIFRHuvSGOLfXsHBUhZVb12NTZKgAy1pJo22YyOZr_M67SbsY1r68GEt6SXGh2EbW8QERp0l1F7V_x8_qKcEQz6u4Aw-9K_s5CfHBy9TZ66893MV1um07sHdSblSahHQMbgbUbqCcIx6RNGNR_JY6viG2xHd_wFQd_SbGSZC50RACQwPpwf8sqmCJokXOYQI3oAf_w",
  },
};
