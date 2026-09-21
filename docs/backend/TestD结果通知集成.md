# TestD 结果通知集成

TestD 计划运行结果由专用测试机通过 `/webhooks/testd/results` 投递为 ORF 普通公开频道消息。调试工作区不投递；GitLab 工程动态仍沿原集成。团队、频道和允许的实例由服务端配置决定，不能由消息体选择。

新协议 `testd.plan-result/v2` 包含 eventId、instanceId、taskId、source、targetSha、actualSha、status、stage、summary、finishedAt。source 为 manual/gitlab/scheduled，通知分别显示“手动按计划运行 / main 推送 / 定时执行”。一次性时间窗内每轮定时任务都发送独立结果；时间窗结束只停止定时补轮，不阻止 main 推送。调度由 TestD 拥有，ORF 只验证结果并格式化消息。实际测试结论在 summary 中，completed 只表示报告已生成。报告链接为可选配置，禁止转发未经校验的链接、日志或凭据。

接收端同时接受历史 `testd.plan-result/v1`，v1 严格限定 manual/gitlab，不接受 scheduled。部署必须先升级 ORF 再启用新版 TestD。历史待投递记录保持原协议、事件 ID 和正文重试；两版沿用同一事件派生消息 ID，避免重复消息。v1 接收仅可在所有生产者升级且历史 v1 待投递记录清零后移除。

认证头为 X-TestD-Event-Id、X-TestD-Timestamp、X-TestD-Signature。HMAC-SHA256 的输入为事件 ID、换行、Unix 秒时间戳、换行、原始 JSON。时间窗口五分钟，请求上限 64 KiB；重试不改变事件 ID，重新生成时间和签名。配置 secret 至少 32 字符。本次部署按已确认的可信内网边界使用 HTTP 直连，不新增证书、隧道或网关；签名验证来源和完整性，不提供传输加密，不适用于未经保护的不可信网络。

接收模块负责认证、结构校验和结果格式化；聊天模块负责频道权限、消息事务、实时事件和推送。以实例和事件 ID 派生稳定 messageId，复用 sendChatMessage 的幂等插入及消息投递 outbox；接收响应丢失后重复提交不会产生第二条聊天消息。不建立另一套系统通知事实。

部署配置：`TESTD_RESULTS_ENABLED=true`、`TESTD_RESULTS_SECRET`、`TESTD_RESULTS_INSTANCE_ID`、`TESTD_RESULTS_TEAM_ID`、`TESTD_RESULTS_CHANNEL_ID`。测试结果固定由 TestD 机器人发出。目标团队已确定为 AI 应用团队（team-ai-app），频道为 TestD 测试通知，频道 type 必须为 public 且非系统频道。频道和机器人由显式配置脚本准备；仅启用接收接口不会自动创建频道。此集成不需要额外数据库迁移，复用聊天 messageId 唯一键。

独立契约测试覆盖签名、过期、实例范围、字段限制、稳定消息 ID、发送错误和重投。上线验收应核对频道消息及其实际提交 SHA，并验证 Web/移动端沿现有聊天显示规则可读；HTTP 200 本身不算完成业务验收。

显式准备命令：设置目标 `TESTD_RESULTS_TEAM_ID` 后执行 `npx tsx scripts/provision-testd-results.ts --apply`。此命令写入机器人和频道，不属于普通构建或服务器启动流程；输出 channelId 后再配置接收端。同名频道类型冲突时停止，不转换旧频道。若需展示报告链接，额外设置 `TESTD_RESULTS_REPORT_ORIGIN` 为信任的报告服务 origin，其他来源链接不展示。summary 分别统计节点 passed/assertionFailed/failed/skipped/blocked 和 infrastructureErrors，不能把基础设施错误数量算成失败用例数。
