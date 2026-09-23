import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import Fastify from "fastify";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatMarkdown } from "../src/features/chat/chatMarkdown";
import { formatNotificationChatBody } from "../server/notifications/notificationEventModel";
import { authenticateResult, formatResult, readResultConfig, resultSchema, type TestdResult } from "../server/integrations/testd-results/model";
import { orfRecipientEmail } from "../server/integrations/testd-results/author-recipient-map";
import { readGitlabCommitAuthorEmail } from "../server/integrations/testd-results/gitlab-author";
import { deliverTestdResult, testdObserverEmails, type TestdDeliveryPorts } from "../server/integrations/testd-results/delivery";
import { registerTestdResultRoute } from "../server/integrations/testd-results/route";

const config = { secret: "s".repeat(32), instanceId: "test-23", teamId: "team-ai-app",
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

test("签名过期、字段范围和报告链接白名单", () => {
  assert.equal(readResultConfig({}), null);
  assert.throws(() => readResultConfig({ TESTD_RESULTS_ENABLED: "true" }));
  const env = { TESTD_RESULTS_ENABLED: "true", TESTD_RESULTS_SECRET: config.secret, TESTD_RESULTS_INSTANCE_ID: config.instanceId,
    TESTD_RESULTS_TEAM_ID: config.teamId, GITLAB_URL: config.gitlabUrl,
    TESTD_RESULTS_GITLAB_PROJECT_ID: String(config.gitlabProjectId), TESTD_RESULTS_GITLAB_READ_TOKEN: config.gitlabReadToken };
  assert.equal(readResultConfig(env)?.gitlabProjectId, 7);
  assert.throws(() => readResultConfig({ ...env, TESTD_RESULTS_GITLAB_PROJECT_ID: "other" }), /项目 ID/);
  assert.throws(() => readResultConfig({ ...env, TESTD_RESULTS_GITLAB_READ_TOKEN: "" }), /READ_TOKEN/);
  const request = signed(event, "1700000000");
  assert.equal(authenticateResult(request.payload, event.eventId, "1700000000", request.headers["x-testd-signature"], config.secret), false);
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

test("MR 门禁通过只通知固定两人，失败另通知源提交作者；重试不重复", async () => {
  const users = new Map([ ["tangyl@sdrising.com", "tangyl"], ["zrx@sdr.com", "zrx"], ["543@sd.com", "author"] ]);
  const notifications = new Map<string, string[]>();
  let lookupCount = 0;
  let failAuthorLookup = false;
  const ports: TestdDeliveryPorts = {
    async readCommitAuthor(projectId, sha) {
      assert.equal(projectId, 7);
      assert.equal(sha, "a".repeat(40));
      lookupCount += 1;
      if (failAuthorLookup) throw new Error("GitLab 暂不可用");
      return "872294056@qq.com";
    },
    async resolveRecipients(emails) {
      return emails.map(email => {
        const id = users.get(email);
        if (!id) throw new Error(`未知用户：${email}`);
        return id;
      });
    },
    async publishNotification(input) {
      if (!notifications.has(input.sourceEventKey)) notifications.set(input.sourceEventKey, input.recipientUserIds);
      return input.sourceEventKey;
    },
  };
  assert.deepEqual(testdObserverEmails, ["tangyl@sdrising.com", "zrx@sdr.com"]);
  const passed = mrResult();
  const successId = await deliverTestdResult({ event: passed, body: "门禁放行" }, ports);
  assert.deepEqual(notifications.get(successId), ["tangyl", "zrx"]);
  assert.equal(lookupCount, 0);

  const failed = { ...passed, taskId: "32222222-2222-4222-8222-222222222222",
    eventId: `${config.instanceId}:32222222-2222-4222-8222-222222222222`,
    gate: { state: "failed" as const, reason: "发现回归错误" } };
  failAuthorLookup = true;
  await assert.rejects(deliverTestdResult({ event: failed, body: "门禁阻断" }, ports), /GitLab 暂不可用/);
  assert.deepEqual(notifications.get(`testd:mr:v1:${failed.eventId}:observers`), ["tangyl", "zrx"]);
  failAuthorLookup = false;
  await deliverTestdResult({ event: failed, body: "门禁阻断" }, ports);
  await deliverTestdResult({ event: failed, body: "门禁阻断" }, ports);
  assert.deepEqual(notifications.get(`testd:mr:v1:${failed.eventId}:author`), ["author"]);
  assert.equal(notifications.size, 3, "一次成功和一次失败共三条通知事件");
  assert.equal(lookupCount, 3);
});

test("提交作者本身是固定收件人时只生成一条通知事件", async () => {
  const notifications: string[] = [];
  await deliverTestdResult({ event: { ...mrResult(), gate: { state: "failed", reason: "回归错误" } }, body: "失败" }, {
    readCommitAuthor: async () => "731705278@qq.com",
    resolveRecipients: async emails => emails.map(email => email),
    publishNotification: async input => { notifications.push(input.sourceEventKey); return input.sourceEventKey; },
  });
  assert.equal(notifications.length, 1);
  assert.match(notifications[0]!, /:observers$/);
});

test("未登记的 Git 作者报错，固定收件人的通知保持可重试去重", async () => {
  const notifications: string[] = [];
  await assert.rejects(deliverTestdResult({ event: { ...mrResult(), gate: { state: "failed", reason: "回归错误" } }, body: "失败" }, {
    readCommitAuthor: async () => "unknown@example.test",
    resolveRecipients: async emails => emails.map(email => email),
    publishNotification: async input => { notifications.push(input.sourceEventKey); return input.sourceEventKey; },
  }), /未配置/);
  assert.equal(notifications.length, 1);
  assert.match(notifications[0]!, /:observers$/);
});

test("手动、定时和历史协议只确认投递，不调用通知依赖", async () => {
  const ports: TestdDeliveryPorts = {
    readCommitAuthor: async () => { throw new Error("不可调用 GitLab"); },
    resolveRecipients: async () => { throw new Error("不可查询收件人"); },
    publishNotification: async () => { throw new Error("不可发布通知"); },
  };
  assert.equal(await deliverTestdResult({ event, body: "历史" }, ports), event.eventId);
  const scheduled = { ...mrResult(), source: "scheduled" as const, mergeRequest: undefined, gate: undefined };
  assert.equal(await deliverTestdResult({ event: scheduled, body: "定时" }, ports), scheduled.eventId);
});

function renderedResult(current: TestdResult): string {
  // Ignore plain text/emoji span wrappers while retaining semantic Markdown elements.
  return renderToStaticMarkup(createElement(ChatMarkdown, { body: formatResult(current, config), usersById: new Map() }))
    .replace(/<\/?span\b[^>]*>/g, "");
}

test("系统通知投影展示结果层次和具名链接，并保留完整追踪信息", () => {
  const current = mrResult();
  const body = formatResult(current, config);
  const projection = formatNotificationChatBody({ body, kind: "testd.mr.gate-result", targetHref: current.mergeRequest!.url,
    targetType: "testdResult", title: "TestD MR !35 门禁通过" });
  assert.match(projection, /^\*\*TestD MR !35 门禁通过\*\*/);
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

test("分支和门禁文字不注入 Markdown", () => {
  const current = mrResult();
  const html = renderedResult({ ...current,
    mergeRequest: { ...current.mergeRequest!, sourceBranch: "feature/**bold**_[link](value)_`code`" },
    gate: { state: "success", reason: "策略 **不是通过** [说明](value)" },
  });
  assert.match(html, /feature\/\*\*bold\*\*_\[link\]\(value\)_`code`/);
  assert.doesNotMatch(html, /<strong>bold|<strong>不是通过|<code>code|<em>/);
});

test("接收端仅认证后投递，异常可重试，并保留 TestD 回执字段", async t => {
  const app = Fastify(); t.after(() => app.close());
  const delivered: string[] = []; let fail = false;
  registerTestdResultRoute(app, config, async input => {
    if (fail) throw new Error("isolated failure");
    delivered.push(input.body); return input.event.eventId;
  });
  assert.equal((await app.inject({ ...signed(event), headers: { "content-type": "application/json" } })).statusCode, 403);
  assert.equal((await app.inject(signed({ ...event, instanceId: "foreign" }))).statusCode, 400);
  assert.equal((await app.inject(signed({ ...event, secret: "forbidden-extra" }))).statusCode, 400);
  assert.equal((await app.inject(signed({ ...event, summary: { ...event.summary, failed: -1 } }))).statusCode, 400);
  fail = true; assert.equal((await app.inject(signed(event))).statusCode, 503);
  fail = false;
  const first = await app.inject(signed(event)), second = await app.inject(signed(event));
  assert.equal(first.statusCode, 200); assert.deepEqual(first.json(), second.json());
  assert.deepEqual(first.json(), { eventId: event.eventId, messageId: event.eventId });
  assert.equal(delivered.length, 2);
  assert.equal((await app.inject(signed({ ...event, extra: "x".repeat(70000) }))).statusCode, 413);
});

test("v2 三种触发来源及 v1 历史事件仍可确认，非 MR 不生成通知", async t => {
  const app = Fastify(); t.after(() => app.close());
  const bodies: string[] = [];
  registerTestdResultRoute(app, config, async input => {
    bodies.push(input.body);
    return deliverTestdResult(input, {
      readCommitAuthor: async () => { throw new Error("旧事件不查询提交作者"); },
      resolveRecipients: async () => { throw new Error("旧事件不查询收件人"); },
      publishNotification: async () => { throw new Error("旧事件不发布通知"); },
    });
  });
  const labels = { manual: "手动按计划运行", gitlab: "main 推送", scheduled: "定时执行" } as const;
  for (const source of ["manual", "gitlab", "scheduled"] as const) {
    const current: TestdResult = { ...event, schema: "testd.plan-result/v2", source, targetSha: source === "gitlab" ? event.targetSha : null };
    assert.equal(resultSchema.safeParse(current).success, true);
    assert.match(formatResult(current, config), new RegExp(`触发：${labels[source]}`));
    assert.equal((await app.inject(signed(current))).statusCode, 200);
    assert.equal((await app.inject(signed(current))).statusCode, 200);
    assert.equal((await app.inject(signed(current))).json().messageId, current.eventId);
  }
  assert.match(bodies.at(-1)!, /触发：定时执行/);
  for (const invalid of [
    { ...event, source: "scheduled" },
    { ...event, schema: "testd.plan-result/v3" },
    { ...event, schema: "testd.plan-result/v2", source: "unknown" },
    { ...event, schema: "testd.plan-result/v2", source: "scheduled", extra: true },
  ]) assert.equal((await app.inject(signed(invalid))).statusCode, 400);
  assert.equal((await app.inject(signed(event))).statusCode, 200, "历史 v1 待投递记录仍可发送");
});

test("v3 区分 MR 回归门禁和执行结果，严格校验来源与提交", async t => {
  const app = Fastify(); t.after(() => app.close());
  const messages: string[] = [];
  const events: TestdResult[] = [];
  registerTestdResultRoute(app, config, async input => { messages.push(input.body); events.push(input.event); return input.event.eventId; });
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
