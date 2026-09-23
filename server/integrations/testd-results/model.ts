import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const sha = z.string().regex(/^[0-9a-f]{40}$/).nullable();
const count = z.number().int().min(0).max(1_000_000);
const summarySchema = z.object({ passed: count, assertionFailed: count, failed: count, skipped: count, blocked: count,
  infrastructureErrors: count, interrupted: z.boolean() }).strict();
const safeUrl = z.url().max(2048).refine(value => { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; });
const mergeRequestSchema = z.object({ projectId: z.number().int().positive(), iid: z.number().int().positive(),
  sourceBranch: z.string().min(1).max(1024), targetBranch: z.literal("main"), sourceSha: z.string().regex(/^[0-9a-f]{40}$/), url: safeUrl }).strict();
const resultFields = z.object({
  eventId: z.string().min(1).max(180), instanceId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  taskId: z.string().uuid(),
  targetSha: sha, actualSha: sha, status: z.enum(["completed", "failed", "interrupted"]),
  stage: z.enum(["queued", "syncing", "restarting", "running"]),
  summary: summarySchema.nullable(),
  finishedAt: z.iso.datetime(), reportUrl: z.url().max(2048).optional(),
}).strict();
export const resultSchema = z.discriminatedUnion("schema", [
  resultFields.extend({ schema: z.literal("testd.plan-result/v1"), source: z.enum(["manual", "gitlab"]) }),
  resultFields.extend({ schema: z.literal("testd.plan-result/v2"), source: z.enum(["manual", "gitlab", "scheduled"]) }),
  resultFields.extend({ schema: z.literal("testd.plan-result/v3"), source: z.enum(["manual", "scheduled", "gitlab_merge_request"]),
    summary: summarySchema.extend({ regressionErrors: count, comparisonUnavailable: z.boolean() }).strict().nullable(),
    mergeRequest: mergeRequestSchema.optional(), gate: z.object({ state: z.enum(["success", "failed"]), reason: z.string().min(1).max(255) }).strict().optional() }),
]).refine(e => e.eventId === `${e.instanceId}:${e.taskId}`, "事件标识与任务不一致")
  .refine(e => e.schema !== "testd.plan-result/v3" || (e.source === "gitlab_merge_request"
    ? Boolean(e.mergeRequest && e.gate && e.mergeRequest.sourceSha === e.targetSha)
    : !e.mergeRequest && !e.gate), "MR 来源、提交和门禁不一致");
export type TestdResult = z.infer<typeof resultSchema>;
const sourceLabels: Record<TestdResult["source"], string> = { manual: "手动按计划运行", gitlab: "main 推送", scheduled: "定时执行", gitlab_merge_request: "GitLab MR 自动运行" };
export type ResultConfig = { secret: string; instanceId: string; teamId: string;
  gitlabUrl: string; gitlabProjectId: number; gitlabReadToken: string; reportOrigin?: string };

export function readResultConfig(env: NodeJS.ProcessEnv): ResultConfig | null {
  if (env.TESTD_RESULTS_ENABLED !== "true") return null;
  const required = (key: string) => { const value = env[key]?.trim(); if (!value) throw new Error(`缺少 ${key}`); return value; };
  const secret = required("TESTD_RESULTS_SECRET");
  if (secret.length < 32) throw new Error("TESTD_RESULTS_SECRET 至少 32 字符");
  const instanceId = required("TESTD_RESULTS_INSTANCE_ID");
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(instanceId)) throw new Error("无效 TestD 实例 ID");
  const gitlabUrl = new URL(required("GITLAB_URL"));
  if (!["http:", "https:"].includes(gitlabUrl.protocol) || gitlabUrl.username || gitlabUrl.password) throw new Error("无效 GitLab 地址");
  const gitlabProjectId = Number(required("TESTD_RESULTS_GITLAB_PROJECT_ID"));
  if (!Number.isSafeInteger(gitlabProjectId) || gitlabProjectId <= 0) throw new Error("无效 TestD GitLab 项目 ID");
  const config: ResultConfig = { secret, instanceId, teamId: required("TESTD_RESULTS_TEAM_ID"),
    gitlabUrl: gitlabUrl.href, gitlabProjectId, gitlabReadToken: required("TESTD_RESULTS_GITLAB_READ_TOKEN") };
  if (env.TESTD_RESULTS_REPORT_ORIGIN) {
    const url = new URL(env.TESTD_RESULTS_REPORT_ORIGIN);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("无效报告来源");
    config.reportOrigin = url.origin;
  }
  return config;
}

export function authenticateResult(raw: string, eventId: unknown, timestamp: unknown, signature: unknown, secret: string, now = Date.now()): boolean {
  if (typeof eventId !== "string" || eventId.length > 180 || typeof timestamp !== "string" || !/^\d{10}$/.test(timestamp) ||
    Math.abs(now / 1000 - Number(timestamp)) > 300 || typeof signature !== "string" || !/^[0-9a-f]{64}$/.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(`${eventId}\n${timestamp}\n${raw}`).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

function resultText(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/[\\`*_[\]()!|~#>+\-.]/g, "\\$&");
}

function resultLink(label: string, value: string): string {
  const href = new URL(value).href.replace(/[()<>]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `[${label}](${href})`;
}

const resultTimeFormat = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

export function formatResult(event: TestdResult, config: ResultConfig): string {
  const s = event.summary;
  const regressionErrors = event.schema === "testd.plan-result/v3" ? event.summary?.regressionErrors : undefined;
  const conclusion = regressionErrors ? "回归错误" : event.status === "interrupted" ? "运行中断" : event.status === "failed" ? "执行失败" :
    !s ? "缺少测试结果" : s.failed || s.infrastructureErrors ? "运行错误" : s.assertionFailed ? "断言未通过" :
      s.blocked || s.skipped || !s.passed ? "未全部完成" : "全部通过";
  const sourceLabel = event.schema === "testd.plan-result/v3" && event.source !== "gitlab_merge_request"
    ? event.source === "manual" ? "手动运行" : "定时计划运行" : sourceLabels[event.source];
  const mr = event.schema === "testd.plan-result/v3" ? event.mergeRequest : undefined;
  const icon = conclusion === "全部通过" ? "✅" : conclusion === "运行中断" || conclusion === "未全部完成" ? "⚠️" : "❌";
  const sections = ["---", `**${icon} TestD · ${conclusion}${mr ? ` ｜ MR !${mr.iid}` : ""}**`];
  if (mr) sections.push(`${resultText(mr.sourceBranch)} → ${resultText(mr.targetBranch)}`);
  if (s) sections.push([
    "**测试结果**",
    `通过 ${s.passed} · 断言失败 ${s.assertionFailed} · 运行错误 ${s.failed}`,
    `跳过 ${s.skipped} · 阻塞 ${s.blocked} · 基础设施错误 ${s.infrastructureErrors}`,
  ].join("\n"));
  if (event.schema === "testd.plan-result/v3") {
    const regression: string[] = [];
    if (s) regression.push(event.source === "manual" ? "手动运行不参与回归比较" : `回归错误 ${regressionErrors} · ${event.summary?.comparisonUnavailable ? "存在无法比较的会话" : "回归比较完成"}`);
    if (event.gate) regression.push(`**合并门禁：${event.gate.state === "failed" ? "阻断" : "放行"}**`, resultText(event.gate.reason));
    if (regression.length) sections.push(regression.join("\n"));
  }
  const links: string[] = [];
  if (event.reportUrl && config.reportOrigin) {
    const url = new URL(event.reportUrl);
    if (url.origin === config.reportOrigin && !url.username && !url.password && ["http:", "https:"].includes(url.protocol)) links.push(resultLink("查看测试报告", url.href));
  }
  if (mr) links.push(resultLink("打开 MR", mr.url));
  if (links.length) sections.push(links.join(" · "));
  const metadata = [
    `触发：${sourceLabel} · ${resultTimeFormat.format(new Date(event.finishedAt))}（UTC+8）`,
    `测试版本：${event.actualSha ? `\`${event.actualSha}\`` : "尚未加载"}`,
    ...(mr && mr.sourceSha !== event.actualSha ? [`源提交：\`${mr.sourceSha}\``] : []),
    `任务：\`${event.taskId}\``,
  ];
  sections.push(metadata.map(line => `> ${line}`).join("\n"));
  return sections.join("\n\n");
}
