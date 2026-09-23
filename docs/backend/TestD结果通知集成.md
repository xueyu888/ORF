# TestD 结果通知集成

TestD 专用测试机向 ORF 的 `/webhooks/testd/results` 投递测试计划结果。ORF 验证签名、实例和事件结构，只对 `testd.plan-result/v3` 的 GitLab MR 门禁结果创建“我的系统通知”。手动、定时以及历史 v1/v2 待投递事件仍接收并确认，但不产生通知。旧的“TestD 测试通知”公开频道和 TestD 普通私聊均不再用于新结果。

## 收件人与状态

- `gate.state=success`：通知 `tangyl@sdrising.com`、`zrx@sdr.com`。
- `gate.state=failed`：通知上述两人，并通知这次 `mergeRequest.sourceSha` 的 Git 提交作者。如果作者本身是上述两人之一，同一事件只给该人一条通知。
- ORF 用受限 GitLab `read_api` 凭据查询配置项目中的完整源 SHA，按 `server/integrations/testd-results/author-recipient-map.ts` 将 Git 作者邮箱映射到 ORF 邮箱。每个邮箱必须恰好对应指定团队的一名活动用户；不使用 MR 创建者、推送者或状态发布者替代提交作者。

收件人名单和 GitLab 查询由 TestD 集成负责；通知事件、收件记录及“我的系统通知”聊天投影由 ORF 消息系统负责。固定收件人和作者使用同一份结果正文，但分别以稳定的 TestD 事件 key 建立通知事件，因此作者查询失败时已投递给固定收件人的通知不会丢失，TestD 重试也不会重复。未知作者邮箱、收件人不唯一、GitLab 不可用或通知事件持久化失败返回 HTTP 503；已持久化的通知投影由消息系统 outbox 重试。接收端返回的 `messageId` 是 TestD 现有投递回执字段，MR 结果填入固定收件人的通知事件 ID，非 MR 结果填入原事件 ID；TestD 仅检查它是字符串，不依赖聊天消息 ID。

## 事件与内容

v3 结果包含 `eventId`、`instanceId`、`taskId`、`source`、`targetSha`、`actualSha`、`status`、`stage`、`summary`、`finishedAt`。MR 来源为 `gitlab_merge_request`，必须携带 `mergeRequest`（项目 ID、MR 编号、分支、源提交 SHA、链接）和独立的 `gate`（`success`/`failed`、原因）；源提交必须等于目标提交。非 MR 结果不得携带 MR 或门禁。门禁只由 TestD 决定，ORF 不按执行状态重算。`completed` 仅表示报告已生成，执行失败与门禁放行可以同时存在，通知正文应分别如实展示。

通知正文列出分支、各类测试数量、回归状态、门禁结论、报告/MR 链接、完成时间、完整实际测试 SHA 和任务 ID。时间使用 `Asia/Shanghai` 并标注 UTC+8。仅展示与配置的报告 origin 匹配的报告链接；动态文字按 Markdown 字面文本转义。不转发原始日志、凭据或未经校验的链接。现有 Web、Windows 和 Android 客户端通过“我的系统通知”显示，无需客户端发版。

## 认证与部署

认证头为 `X-TestD-Event-Id`、`X-TestD-Timestamp`、`X-TestD-Signature`。HMAC-SHA256 输入为事件 ID、换行、Unix 秒时间戳、换行、原始 JSON；时间窗口五分钟，请求上限 64 KiB，secret 至少 32 字符。重试保持事件 ID 与正文不变，重新生成时间和签名。本部署按既有可信内网边界使用 HTTP 直连，签名保障来源与完整性，不提供传输加密。

启用配置为 `TESTD_RESULTS_ENABLED=true`、`TESTD_RESULTS_SECRET`、`TESTD_RESULTS_INSTANCE_ID`、`TESTD_RESULTS_TEAM_ID`、`GITLAB_URL`、`TESTD_RESULTS_GITLAB_PROJECT_ID=81`、`TESTD_RESULTS_GITLAB_READ_TOKEN`；可选 `TESTD_RESULTS_REPORT_ORIGIN`。目标团队为 AI 应用团队（`team-ai-app`）。GitLab token 只保存在 ORF 运行环境，不写入仓库、通知或日志；缺少已启用集成的必需配置时拒绝启动。本变更不需要数据库迁移，也不修改 TestD 事件生产者。

验证覆盖签名、协议范围、固定与作者收件人、收件人重合、门禁成功/失败、GitLab 查询失败、稳定事件 key 和重投。生产验收需回读真实 MR 结果在各收件人“我的系统通知”中的事件与投影；仅 HTTP 200 或健康检查不算完成业务验收。移除旧公开频道前先确认新投递链就绪，按批准范围删除旧频道及历史数据。
