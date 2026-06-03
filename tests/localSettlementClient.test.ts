import assert from "node:assert/strict";
import test from "node:test";
import {
  assertLocalSettlementAvailable,
  LocalSettlementResponseError,
  LocalSettlementUnavailableError,
  localSettlementBaseUrl,
} from "../src/services/localSettlementClient";
import { localSettlementMutationFailureMessage } from "../src/state/orfProviderMutationMessages";

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("local settlement base URL defaults to the same-machine service", () => {
  assert.equal(localSettlementBaseUrl(), "http://127.0.0.1:8799");
});

test("local settlement health check maps network failures to an unavailable service error", async () => {
  installFetchMock(async (input) => {
    assert.equal(String(input), "http://127.0.0.1:8799/health");
    throw new TypeError("connection refused");
  });

  await assert.rejects(
    assertLocalSettlementAvailable(),
    (error) => {
      assert.ok(error instanceof LocalSettlementUnavailableError);
      assert.equal(error.baseUrl, "http://127.0.0.1:8799");
      return true;
    },
  );
});

test("local settlement health check keeps service response errors distinct", async () => {
  installFetchMock(async () => new Response("service booting", { status: 503 }));

  await assert.rejects(
    assertLocalSettlementAvailable(),
    (error) => {
      assert.ok(error instanceof LocalSettlementResponseError);
      assert.equal(error.baseUrl, "http://127.0.0.1:8799");
      assert.equal(error.status, 503);
      assert.equal(error.message, "service booting");
      return true;
    },
  );
});

test("local settlement response errors prefer structured error messages", async () => {
  installFetchMock(async () => Response.json({ error: "unknown settlement key" }, { status: 400 }));

  await assert.rejects(
    assertLocalSettlementAvailable(),
    (error) => {
      assert.ok(error instanceof LocalSettlementResponseError);
      assert.equal(error.message, "unknown settlement key");
      return true;
    },
  );
});

test("local settlement failure message points users to the unreachable service", () => {
  const message = localSettlementMutationFailureMessage(
    new LocalSettlementUnavailableError("http://127.0.0.1:8799"),
    "匿名互评提交失败",
  );

  assert.equal(message, "本地匿名互评结算服务不可用，请先启动服务，并确认当前浏览器可以访问 http://127.0.0.1:8799");
});

function installFetchMock(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  globalThis.fetch = handler as typeof fetch;
}
