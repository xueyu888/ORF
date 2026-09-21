import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const sha = z.string().regex(/^[0-9a-f]{40}$/).nullable();
const count = z.number().int().min(0).max(1_000_000);
export const resultSchema = z.object({
  schema: z.literal("testd.plan-result/v1"),
  eventId: z.string().min(1).max(180), instanceId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  taskId: z.string().uuid(), source: z.enum(["manual", "gitlab"]),
  targetSha: sha, actualSha: sha, status: z.enum(["completed", "failed", "interrupted"]),
  stage: z.enum(["queued", "syncing", "restarting", "running"]),
  summary: z.object({ passed: count, assertionFailed: count, failed: count, skipped: count, blocked: count,
    infrastructureErrors: count, interrupted: z.boolean() }).strict().nullable(),
  finishedAt: z.iso.datetime(), reportUrl: z.url().max(2048).optional(),
}).strict().refine(e => e.eventId === `${e.instanceId}:${e.taskId}`, "事件标识与任务不一致");
export type TestdResult = z.infer<typeof resultSchema>;
export type ResultConfig = { secret: string; instanceId: string; teamId: string; channelId: string; reportOrigin?: string };

export function readResultConfig(env: NodeJS.ProcessEnv): ResultConfig | null {
  if (env.TESTD_RESULTS_ENABLED !== "true") return null;
  const required = (key: string) => { const value = env[key]?.trim(); if (!value) throw new Error(`缺少 ${key}`); return value; };
  const secret = required("TESTD_RESULTS_SECRET");
  if (secret.length < 32) throw new Error("TESTD_RESULTS_SECRET 至少 32 字符");
  const instanceId = required("TESTD_RESULTS_INSTANCE_ID");
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(instanceId)) throw new Error("无效 TestD 实例 ID");
  const config: ResultConfig = { secret, instanceId, teamId: required("TESTD_RESULTS_TEAM_ID"), channelId: required("TESTD_RESULTS_CHANNEL_ID") };
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

export function resultMessageId(config: ResultConfig, eventId: string): string {
  const bytes = createHash("sha256").update(JSON.stringify(["testd-result-v1", config.instanceId, eventId, config.teamId, config.channelId])).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 15) | 64; bytes[8] = (bytes[8]! & 63) | 128;
  const h = bytes.toString("hex");
  return `chat-message-client-${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function formatResult(event: TestdResult, config: ResultConfig): string {
  const s = event.summary;
  const conclusion = event.status === "interrupted" ? "运行中断" : event.status === "failed" ? "执行失败" :
    !s ? "缺少测试结果" : s.failed || s.infrastructureErrors ? "运行错误" : s.assertionFailed ? "断言未通过" :
      s.blocked || s.skipped || !s.passed ? "未全部完成" : "全部通过";
  const lines = [`TestD 测试计划 · ${conclusion}`, `触发：${event.source === "gitlab" ? "main 推送" : "手动按计划运行"}`,
    `本次测试代码版本：${event.actualSha ?? "尚未加载"}`, `完成时间：${event.finishedAt}`, `任务：${event.taskId}`];
  if (s) lines.push(`通过 ${s.passed} · 断言失败 ${s.assertionFailed} · 运行错误 ${s.failed} · 跳过 ${s.skipped} · 阻塞 ${s.blocked} · 基础设施错误 ${s.infrastructureErrors}`);
  if (event.reportUrl && config.reportOrigin) {
    const url = new URL(event.reportUrl);
    if (url.origin === config.reportOrigin && !url.username && !url.password && ["http:", "https:"].includes(url.protocol)) lines.push(`报告：${url.href}`);
  }
  return lines.join("\n");
}
