import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import Fastify from "fastify";
import { CLIENT_CHAT_MESSAGE_ID_PATTERN } from "../src/domain/chatMessageSend";
import { authenticateResult, formatResult, readResultConfig, resultMessageId, resultSchema, type TestdResult } from "../server/integrations/testd-results/model";
import { registerTestdResultRoute } from "../server/integrations/testd-results/route";

const config = { secret: "s".repeat(32), instanceId: "test-23", teamId: "team-ai-app", channelId: "test-channel", reportOrigin: "https://reports.example.test" };
const taskId = "12222222-2222-4222-8222-222222222222";
const event: TestdResult = { schema: "testd.plan-result/v1", instanceId: config.instanceId, eventId: `${config.instanceId}:${taskId}`, taskId,
  source: "gitlab", targetSha: "a".repeat(40), actualSha: "a".repeat(40), status: "completed", stage: "running", finishedAt: "2026-09-16T01:00:00.000Z",
  summary: { passed: 1, assertionFailed: 1, failed: 0, skipped: 0, blocked: 0, infrastructureErrors: 0, interrupted: false } };
function signed(body: unknown, timestamp = String(Math.floor(Date.now() / 1000))) {
  const raw = JSON.stringify(body);
  return { method: "POST" as const, url: "/webhooks/testd/results", payload: raw, headers: { "content-type": "application/json",
    "x-testd-event-id": event.eventId, "x-testd-timestamp": timestamp, "x-testd-signature": createHmac("sha256", config.secret).update(`${event.eventId}\n${timestamp}\n${raw}`).digest("hex") } };
}

test("签名过期、字段范围、链接白名单和稳定消息 ID", () => {
  assert.equal(readResultConfig({}), null);
  assert.throws(() => readResultConfig({ TESTD_RESULTS_ENABLED: "true" }));
  const request = signed(event, "1700000000");
  assert.equal(authenticateResult(request.payload, event.eventId, "1700000000", request.headers["x-testd-signature"], config.secret), false);
  assert.match(resultMessageId(config, event.eventId), CLIENT_CHAT_MESSAGE_ID_PATTERN);
  assert.equal(resultMessageId(config, event.eventId), resultMessageId({ ...config }, event.eventId));
  assert.notEqual(resultMessageId(config, event.eventId), resultMessageId({ ...config, channelId: "another" }, event.eventId));
  const message = formatResult(event, config);
  assert.match(message, /断言未通过/);
  assert.match(message, /本次测试代码版本：a{40}/);
  assert.doesNotMatch(message, /目标提交|实际提交|结束阶段/);
  assert.doesNotMatch(formatResult({ ...event, reportUrl: "https://evil.test/?token=secret" }, config), /evil|secret/);
  assert.match(formatResult({ ...event, reportUrl: "https://reports.example.test/?view=reports" }, config), /报告/);
});

test("接收端仅认证后投递，异常可重试，同一事件给聊天相同消息 ID", async t => {
  const app = Fastify(); t.after(() => app.close());
  const messages = new Map<string, string>(); let fail = false;
  registerTestdResultRoute(app, config, async input => {
    if (fail) throw new Error("isolated failure");
    messages.set(input.messageId, input.body); return input.messageId;
  });
  assert.equal((await app.inject({ ...signed(event), headers: { "content-type": "application/json" } })).statusCode, 403);
  assert.equal((await app.inject(signed({ ...event, instanceId: "foreign" }))).statusCode, 400);
  assert.equal((await app.inject(signed({ ...event, secret: "forbidden-extra" }))).statusCode, 400);
  assert.equal((await app.inject(signed({ ...event, summary: { ...event.summary, failed: -1 } }))).statusCode, 400);
  fail = true; assert.equal((await app.inject(signed(event))).statusCode, 503);
  fail = false;
  const first = await app.inject(signed(event)), second = await app.inject(signed(event));
  assert.equal(first.statusCode, 200); assert.deepEqual(first.json(), second.json()); assert.equal(messages.size, 1);
  assert.equal((await app.inject(signed({ ...event, extra: "x".repeat(70000) }))).statusCode, 413);
});

test("v2 三种触发来源准确显示，v1 保持历史范围，定时事件幂等投递", async t => {
  const app = Fastify(); t.after(() => app.close());
  const messages = new Map<string, string>();
  registerTestdResultRoute(app, config, async input => { messages.set(input.messageId, input.body); return input.messageId; });
  const labels = { manual: "手动按计划运行", gitlab: "main 推送", scheduled: "定时执行" } as const;
  for (const source of ["manual", "gitlab", "scheduled"] as const) {
    const current: TestdResult = { ...event, schema: "testd.plan-result/v2", source, targetSha: source === "gitlab" ? event.targetSha : null };
    assert.equal(resultSchema.safeParse(current).success, true);
    assert.match(formatResult(current, config), new RegExp(`触发：${labels[source]}`));
    assert.equal((await app.inject(signed(current))).statusCode, 200);
    assert.equal((await app.inject(signed(current))).statusCode, 200);
    assert.equal(messages.size, 1, "重投同一事件复用稳定消息 ID");
  }
  assert.match([...messages.values()][0]!, /触发：定时执行/);
  for (const invalid of [
    { ...event, source: "scheduled" },
    { ...event, schema: "testd.plan-result/v3" },
    { ...event, schema: "testd.plan-result/v2", source: "unknown" },
    { ...event, schema: "testd.plan-result/v2", source: "scheduled", extra: true },
  ]) assert.equal((await app.inject(signed(invalid))).statusCode, 400);
  assert.equal((await app.inject(signed(event))).statusCode, 200, "历史 v1 待投递记录仍可发送");
  assert.equal(messages.size, 1, "v1/v2 使用相同事件身份，不产生第二条消息");
});
