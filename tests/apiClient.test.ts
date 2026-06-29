import assert from "node:assert/strict";
import test from "node:test";
import { ApiError, apiJson } from "../src/state/apiClient";

test("apiJson hides HTML gateway error pages behind a readable service message", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (async () =>
    new Response("<html><head><title>502 Bad Gateway</title></head><body>nginx</body></html>", {
      headers: { "content-type": "text/html" },
      status: 502,
    })) as typeof fetch;

  await assert.rejects(
    apiJson("/api/work-logs/objectives"),
    (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 502);
      assert.equal(error.message, "服务暂时不可用，请稍后重试");
      return true;
    },
  );
});
