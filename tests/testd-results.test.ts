import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import Fastify from "fastify";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CLIENT_CHAT_MESSAGE_ID_PATTERN } from "../src/domain/chatMessageSend";
import { ChatMarkdown } from "../src/features/chat/chatMarkdown";
import { shouldCompactChatMessage } from "../src/features/chat/chatMessagePresentation";
import type { ChatMessage } from "../src/types/orf";
import { authenticateResult, directResultMessageId, formatResult, readResultConfig, resultMessageId, resultSchema, type TestdResult } from "../server/integrations/testd-results/model";
import { orfRecipientEmail } from "../server/integrations/testd-results/author-recipient-map";
import { readGitlabCommitAuthorEmail } from "../server/integrations/testd-results/gitlab-author";
import { deliverTestdResult } from "../server/integrations/testd-results/delivery";
import { registerTestdResultRoute } from "../server/integrations/testd-results/route";

const config = { secret: "s".repeat(32), instanceId: "test-23", teamId: "team-ai-app", channelId: "test-channel",
  gitlabUrl: "https://gitlab.example.test/", gitlabProjectId: 7, gitlabReadToken: "read-only", reportOrigin: "https://reports.example.test" };
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
  const env = { TESTD_RESULTS_ENABLED: "true", TESTD_RESULTS_SECRET: config.secret, TESTD_RESULTS_INSTANCE_ID: config.instanceId,
    TESTD_RESULTS_TEAM_ID: config.teamId, TESTD_RESULTS_CHANNEL_ID: config.channelId, GITLAB_URL: config.gitlabUrl,
    TESTD_RESULTS_GITLAB_PROJECT_ID: String(config.gitlabProjectId), TESTD_RESULTS_GITLAB_READ_TOKEN: config.gitlabReadToken };
  assert.equal(readResultConfig(env)?.gitlabProjectId, 7);
  assert.throws(() => readResultConfig({ ...env, TESTD_RESULTS_GITLAB_PROJECT_ID: "other" }), /项目 ID/);
  assert.throws(() => readResultConfig({ ...env, TESTD_RESULTS_GITLAB_READ_TOKEN: "" }), /READ_TOKEN/);
  const request = signed(event, "1700000000");
  assert.equal(authenticateResult(request.payload, event.eventId, "1700000000", request.headers["x-testd-signature"], config.secret), false);
  assert.match(resultMessageId(config, event.eventId), CLIENT_CHAT_MESSAGE_ID_PATTERN);
  assert.equal(resultMessageId(config, event.eventId), resultMessageId({ ...config }, event.eventId));
  assert.notEqual(resultMessageId(config, event.eventId), resultMessageId({ ...config, channelId: "another" }, event.eventId));
  assert.match(directResultMessageId(config, event.eventId), CLIENT_CHAT_MESSAGE_ID_PATTERN);
  assert.notEqual(directResultMessageId(config, event.eventId), resultMessageId(config, event.eventId));
  const message = formatResult(event, config);
  assert.match(message, /断言未通过/);
  assert.match(message, /测试版本：`a{40}`/);
  assert.doesNotMatch(message, /目标提交|实际提交|结束阶段/);
  assert.doesNotMatch(formatResult({ ...event, reportUrl: "https://evil.test/?token=secret" }, config), /evil|secret/);
  assert.match(formatResult({ ...event, reportUrl: "https://reports.example.test/?view=reports" }, config), /报告/);
});

test("Git 作者映射只接受明确登记的邮箱", () => {
  assert.equal(orfRecipientEmail("872294056@qq.com"), "543@sd.com");
  assert.equal(orfRecipientEmail("731705278@qq.com"), "zrx@sdr.com");
  assert.equal(orfRecipientEmail(" ZHURX@SDRISING.COM "), "zrx@sdr.com");
  assert.equal(orfRecipientEmail("xueuy@qq.com"), "xueyu@qq.com");
  assert.equal(orfRecipientEmail("474746922@qq.com"), "xueyu@qq.com");
  assert.throws(() => orfRecipientEmail("codex-merge-check@local"), /未配置/);
});

test("GitLab 查询仅接受已配置项目和完整源 SHA 的作者邮箱", async () => {
  const sha = "a".repeat(40);
  const calls: string[] = [];
  const request = async (input: URL | RequestInfo, init?: RequestInit) => {
    calls.push(String(input));
    assert.equal(init?.method, "GET");
    assert.equal((init?.headers as Record<string, string>)["PRIVATE-TOKEN"], config.gitlabReadToken);
    return Response.json({ id: sha, author_email: "WUYZ@SDRISING.COM" });
  };
  assert.equal(await readGitlabCommitAuthorEmail(config, 7, sha, request as typeof fetch), "wuyz@sdrising.com");
  assert.equal(calls[0], `https://gitlab.example.test/api/v4/projects/7/repository/commits/${sha}`);
  await assert.rejects(readGitlabCommitAuthorEmail(config, 8, sha, request as typeof fetch), /不属于/);
  assert.equal(calls.length, 1, "项目不一致时不得向 GitLab 查询");
  await assert.rejects(readGitlabCommitAuthorEmail(config, 7, sha, async () => Response.json({ id: "b".repeat(40), author_email: "wuyz@sdrising.com" })), /SHA/);
  await assert.rejects(readGitlabCommitAuthorEmail(config, 7, sha, async () => new Response("denied", { status: 403 })), /HTTP 403/);
});

function mrResult(): Extract<TestdResult, { schema: "testd.plan-result/v3" }> {
  return { ...event, schema: "testd.plan-result/v3", source: "gitlab_merge_request",
    summary: { passed: 2, assertionFailed: 0, failed: 0, skipped: 0, blocked: 0, infrastructureErrors: 0,
      interrupted: false, regressionErrors: 0, comparisonUnavailable: false },
    mergeRequest: { projectId: 7, iid: 35, sourceBranch: "feature/52-testd优化", targetBranch: "main",
      sourceSha: "a".repeat(40), url: "https://gitlab.example.test/develop/aio/-/merge_requests/35" },
    gate: { state: "success", reason: "未发现回归错误" }, reportUrl: "https://reports.example.test/?runId=PLAN-(35)",
  };
}

test("MR 门禁失败才给源提交作者发一次私聊，重试复用公开与私聊消息", async () => {
  const publicMessages = new Map<string, string>();
  const directMessages = new Map<string, string>();
  const lookedUp: string[] = [];
  let failDirect = false;
  const ports = {
    async sendPublic(input: { messageId: string; body: string }) { publicMessages.set(input.messageId, input.body); return input.messageId; },
    async readCommitAuthor(projectId: number, sha: string) {
      lookedUp.push(`${projectId}:${sha}`);
      return "872294056@qq.com";
    },
    async sendDirect(input: { messageId: string; body: string; recipientEmail: string }) {
      if (failDirect) throw new Error("私聊投递失败");
      assert.equal(input.recipientEmail, "543@sd.com");
      directMessages.set(input.messageId, input.body);
    },
  };
  const passed = mrResult();
  const input = { event: passed, body: "TestD 门禁结果", messageId: resultMessageId(config, passed.eventId) };
  await deliverTestdResult(input, config, ports);
  await deliverTestdResult({ ...input, event: { ...passed, status: "failed", summary: null } }, config, ports);
  assert.equal(publicMessages.size, 1);
  assert.equal(directMessages.size, 0);
  assert.equal(lookedUp.length, 0);

  const failed = { ...passed, gate: { state: "failed" as const, reason: "发现回归错误" } };
  failDirect = true;
  await assert.rejects(deliverTestdResult({ ...input, event: failed }, config, ports), /私聊投递失败/);
  assert.equal(publicMessages.size, 1, "私聊失败后公开消息保留且不重复");
  failDirect = false;
  await deliverTestdResult({ ...input, event: failed }, config, ports);
  await deliverTestdResult({ ...input, event: failed }, config, ports);
  assert.deepEqual(lookedUp, Array(3).fill(`7:${passed.mergeRequest!.sourceSha}`));
  assert.deepEqual([...directMessages.keys()], [directResultMessageId(config, failed.eventId)]);
  assert.equal(publicMessages.size, 1);
});

test("未登记的 Git 作者不能被猜测成其他 ORF 收件人", async () => {
  const failed = { ...mrResult(), gate: { state: "failed" as const, reason: "回归错误" } };
  let sentDirect = false;
  await assert.rejects(deliverTestdResult({ event: failed, body: "失败", messageId: "public" }, config, {
    sendPublic: async () => "public",
    readCommitAuthor: async () => "unknown@example.test",
    sendDirect: async () => { sentDirect = true; },
  }), /未配置/);
  assert.equal(sentDirect, false);
});

function renderedResult(current: TestdResult): string {
  // Ignore plain text/emoji span wrappers while retaining semantic Markdown elements.
  return renderToStaticMarkup(createElement(ChatMarkdown, { body: formatResult(current, config), usersById: new Map() }))
    .replace(/<\/?span\b[^>]*>/g, "");
}

test("现有聊天渲染器直接展示通知分隔、结果层次和具名链接，并保留完整追踪信息", () => {
  const current = mrResult();
  const body = formatResult(current, config);
  const html = renderedResult(current);
  assert.match(html, /<hr /);
  assert.match(html, /<strong>✅ TestD · 全部通过 ｜ MR !35<\/strong>/);
  assert.match(html, /feature\/52-testd优化 → main/);
  assert.match(html, /<strong>测试结果<\/strong>/);
  assert.match(html, /通过 2 · 断言失败 0 · 运行错误 0/);
  assert.match(html, /跳过 0 · 阻塞 0 · 基础设施错误 0/);
  assert.match(html, /<strong>合并门禁：放行<\/strong>/);
  assert.match(html, /href="https:\/\/reports.example.test\/\?runId=PLAN-%2835%29"[^>]*>查看测试报告<\/a>/);
  assert.match(html, />打开 MR<\/a>/);
  assert.match(html, /<blockquote /);
  assert.match(html, /2026-09-16 09:00:00（UTC\+8）/);
  assert.match(html, /任务：<code>12222222-2222-4222-8222-222222222222<\/code>/);
  assert.equal(body.split("a".repeat(40)).length - 1, 1);
  assert.doesNotMatch(body, /源提交/);
  assert.match(renderedResult({ ...current, actualSha: "b".repeat(40) }), /源提交：<code>a{40}<\/code>/);
  assert.match(renderedResult({ ...current, actualSha: null }), /测试版本：尚未加载/);
});

test("通知格式不掩盖失败、回归阻断、中断、缺少报告或无法比较", () => {
  const current = mrResult();
  const failed = renderedResult({ ...current, status: "failed", summary: null, reportUrl: undefined,
    gate: { state: "success", reason: "无法完成回归判断，请查看执行结果" } });
  assert.match(failed, /❌ TestD · 执行失败/);
  assert.match(failed, /合并门禁：放行/);
  assert.match(failed, /无法完成回归判断/);
  assert.doesNotMatch(failed, /全部通过|查看测试报告|通过 0|回归比较完成/);
  const regression = renderedResult({ ...current, summary: { ...current.summary!, regressionErrors: 1 }, gate: { state: "failed", reason: "发现回归错误" } });
  assert.match(regression, /❌ TestD · 回归错误/);
  assert.match(regression, /合并门禁：阻断/);
  assert.match(renderedResult({ ...current, status: "interrupted" }), /⚠️ TestD · 运行中断/);
  assert.match(renderedResult({ ...current, summary: { ...current.summary!, comparisonUnavailable: true } }), /存在无法比较的会话/);
  assert.match(renderedResult({ ...current, finishedAt: "2026-09-16T20:00:00.000Z" }), /2026-09-17 04:00:00（UTC\+8）/);
  for (const source of ["manual", "scheduled"] as const) {
    const html = renderedResult({ ...current, source, mergeRequest: undefined, gate: undefined });
    assert.match(html, source === "manual" ? /手动运行不参与回归比较/ : /定时计划运行/);
    assert.doesNotMatch(html, /MR !|打开 MR|合并门禁/);
  }
});

test("分支和门禁文字不注入 Markdown，连续通知继续复用五分钟紧凑规则", () => {
  const current = mrResult();
  const html = renderedResult({ ...current,
    mergeRequest: { ...current.mergeRequest!, sourceBranch: "feature/**bold**_[link](value)_`code`" },
    gate: { state: "success", reason: "策略 **不是通过** [说明](value)" },
  });
  assert.match(html, /feature\/\*\*bold\*\*_\[link\]\(value\)_`code`/);
  assert.doesNotMatch(html, /<strong>bold|<strong>不是通过|<code>code|<em>/);
  const previous = { source: "user", authorUserId: "testd-bot", createdAt: "2026-09-22T11:02:00.000Z", body: formatResult(current, config) } as ChatMessage;
  const next = { ...previous, createdAt: "2026-09-22T11:06:00.000Z", body: formatResult({ ...current, status: "failed", summary: null }, config) };
  assert.equal(shouldCompactChatMessage(previous, next), true);
  assert.equal(shouldCompactChatMessage(previous, { ...next, createdAt: "2026-09-22T11:08:00.000Z" }), false);
  assert.equal(shouldCompactChatMessage({ ...previous, body: "普通消息一" }, { ...next, body: "普通消息二" }), true);
  assert.equal((renderedResult(current) + renderedResult({ ...current, status: "failed", summary: null })).match(/<hr /g)?.length, 2);
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

test("v3 区分 MR 回归门禁和执行结果，严格校验来源与提交", async t => {
  const app = Fastify(); t.after(() => app.close());
  const messages: string[] = [];
  const events: TestdResult[] = [];
  registerTestdResultRoute(app, config, async input => { messages.push(input.body); events.push(input.event); return input.messageId; });
  const mr = { projectId: 7, iid: 123, sourceBranch: "feature/testd", targetBranch: "main", sourceSha: event.targetSha, url: "https://gitlab.example.test/develop/aio/-/merge_requests/123" };
  const current = { ...event, schema: "testd.plan-result/v3", source: "gitlab_merge_request", mergeRequest: mr,
    summary: { ...event.summary, regressionErrors: 1, comparisonUnavailable: false }, gate: { state: "failed", reason: "发现回归错误，阻断合并" } };
  assert.equal((await app.inject(signed(current))).statusCode, 200);
  assert.equal(events[0]?.schema, "testd.plan-result/v3");
  if (events[0]?.schema === "testd.plan-result/v3") assert.equal(events[0].gate?.state, "failed");
  assert.match(messages[0]!, /回归错误/); assert.match(messages[0]!, /MR !123/); assert.match(messages[0]!, /合并门禁：阻断/);
  const executionError = { ...current, status: "failed", summary: null, gate: { state: "success", reason: "无法判断回归，按当前策略放行" } };
  assert.equal((await app.inject(signed(executionError))).statusCode, 200);
  assert.match(messages[1]!, /执行失败/); assert.match(messages[1]!, /合并门禁：放行/); assert.doesNotMatch(messages[1]!, /全部通过/);
  for (const invalid of [{ ...current, mergeRequest: undefined }, { ...current, gate: undefined }, { ...current, source: "scheduled" },
    { ...current, mergeRequest: { ...mr, sourceSha: "b".repeat(40) } }, { ...current, mergeRequest: { ...mr, url: "javascript:alert(1)" } }]) {
    assert.equal((await app.inject(signed(invalid))).statusCode, 400);
  }
});
