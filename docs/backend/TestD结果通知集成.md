# TestD 结果通知集成

TestD 计划运行结果由专用测试机通过 `/webhooks/testd/results` 投递为 ORF 普通公开频道消息。调试工作区不投递；GitLab 工程动态仍沿原集成。团队、频道和允许的实例由服务端配置决定，不能由消息体选择。

MR 结果的 `gate.state` 为 `failed` 时，同一结果另由 TestD 机器人向该次 `mergeRequest.sourceSha` 的 Git 提交作者发送一条 ORF 私聊。ORF 使用受限的 GitLab 只读凭据，按事件中的项目 ID 和源 SHA 查询提交作者邮箱；只接受配置的 `develop/aio` 项目 ID 与返回的完整 SHA 一致的提交。作者邮箱到 ORF 邮箱的唯一映射由 `server/integrations/testd-results/author-recipient-map.ts` 维护，接收端再确认目标邮箱在指定团队中唯一且为活动用户。无映射、身份不一致、GitLab 不可用或私聊失败均返回投递失败，由 TestD 使用原事件 ID 重试；不猜测收件人，也不改投其他人。门禁 `success`、手动和定时结果不查询作者、不发私聊。公开频道结果投递保持原状。

新协议 `testd.plan-result/v3` 包含 eventId、instanceId、taskId、source、targetSha、actualSha、status、stage、summary、finishedAt。source 为 manual/scheduled/gitlab_merge_request，对应“手动运行 / 定时计划运行 / GitLab MR 自动运行”。MR 替换 main 推送；MR 结果必须携带 mergeRequest（projectId、iid、sourceBranch、targetBranch=main、sourceSha、url）和 gate（state、reason），sourceSha 必须等于 targetSha。非 MR 结果不得携带 MR 或门禁。summary 增加 regressionErrors 和 comparisonUnavailable，门禁只由 TestD 决定，ORF 不重算回归；仅为失败门禁私聊查询 GitLab 提交作者。当前仅回归错误阻断，无法判断或执行错误的放行必须与真实测试结论分别展示，不能显示为测试通过。一次性时间窗每轮独立通知；结束仅停止定时补轮。completed 只表示报告已生成。报告链接为可选配置，禁止转发未经校验的链接、日志或凭据。

接收端同时接受历史 v1（manual/gitlab）和 v2（manual/gitlab/scheduled），只用于原有不可变投递记录；不得将旧 main 通知重解释为 MR。部署先升级 ORF 再启用新版 TestD。历史待投递记录保持原协议、事件 ID 和正文重试；三版沿用同一事件派生消息 ID。旧版接收仅可在所有生产者升级且对应待投递记录清零后移除。本次仅后端发布，不涉及客户端发版或数据库迁移。

认证头为 X-TestD-Event-Id、X-TestD-Timestamp、X-TestD-Signature。HMAC-SHA256 的输入为事件 ID、换行、Unix 秒时间戳、换行、原始 JSON。时间窗口五分钟，请求上限 64 KiB；重试不改变事件 ID，重新生成时间和签名。配置 secret 至少 32 字符。本次部署按已确认的可信内网边界使用 HTTP 直连，不新增证书、隧道或网关；签名验证来源和完整性，不提供传输加密，不适用于未经保护的不可信网络。

接收模块负责认证、结构校验和结果格式化；聊天模块负责频道权限、消息事务、实时事件和推送。以实例和事件 ID 派生稳定 messageId，复用 sendChatMessage 的幂等插入及消息投递 outbox；接收响应丢失后重复提交不会产生第二条聊天消息。不建立另一套系统通知事实。

私聊使用独立于公开频道的稳定消息 ID，并复用聊天模块的两人会话与发送接口。公开频道发送成功、私聊失败时整次 HTTP 接收仍报失败；重试会复用已存在的公开消息及私聊消息，不产生第二条。Git 作者邮箱按提交元数据识别，不能把 MR 创建者、推送者或 GitLab 状态发布者当作提交作者。

通知正文复用现有 Markdown 渲染：每条以分隔线开始，首行加粗显示结果与可选 MR 编号，随后依次展示分支、测试统计、回归与独立合并门禁、具名报告/MR 链接。统计保留所有类别及零值，执行失败和门禁放行必须同时如实显示。来源、完成时间、完整实际测试 SHA 和任务 ID 放在末尾引用块；时间固定为 `Asia/Shanghai` 并标注 `UTC+8`，源提交仅在与实际测试 SHA 不同时另列。动态文字按 Markdown 字面文本转义，链接保留既有来源校验并编码 Markdown 定界符。上述格式只影响新生成的 TestD 结果通知正文，不改历史消息，不改频道样式或聊天组件；同一发送者五分钟内连续消息的紧凑显示规则保持原样。现有 Web、Windows 和 Android 客户端可直接显示，无需客户端发版。

部署配置：`TESTD_RESULTS_ENABLED=true`、`TESTD_RESULTS_SECRET`、`TESTD_RESULTS_INSTANCE_ID`、`TESTD_RESULTS_TEAM_ID`、`TESTD_RESULTS_CHANNEL_ID`。测试结果固定由 TestD 机器人发出。目标团队已确定为 AI 应用团队（team-ai-app），频道为 TestD 测试通知，频道 type 必须为 public 且非系统频道。频道和机器人由显式配置脚本准备；仅启用接收接口不会自动创建频道。此集成不需要额外数据库迁移，复用聊天 messageId 唯一键。

私聊还要求 `GITLAB_URL`、`TESTD_RESULTS_GITLAB_PROJECT_ID=81` 和 `TESTD_RESULTS_GITLAB_READ_TOKEN`。该 token 仅授予 `develop/aio` 提交查询所需的 GitLab `read_api` 权限，保存在 ORF 生产环境配置，不写入仓库、消息或日志。先配置凭据并验证只读提交查询，再激活新版后端；凭据缺失时启用的 TestD 接收模块拒绝启动。

独立契约测试覆盖签名、过期、实例范围、字段限制、稳定消息 ID、作者邮箱映射、门禁触发、发送错误和重投。上线验收应核对频道消息及其实际提交 SHA；出现真实门禁失败后，还须回读私聊收件人和消息，仅 HTTP 200 不算完成业务验收。Web/移动端沿现有聊天显示规则可读。

显式准备命令：设置目标 `TESTD_RESULTS_TEAM_ID` 后执行 `npx tsx scripts/provision-testd-results.ts --apply`。此命令写入机器人和频道，不属于普通构建或服务器启动流程；输出 channelId 后再配置接收端。同名频道类型冲突时停止，不转换旧频道。若需展示报告链接，额外设置 `TESTD_RESULTS_REPORT_ORIGIN` 为信任的报告服务 origin，其他来源链接不展示。summary 分别统计节点 passed/assertionFailed/failed/skipped/blocked 和 infrastructureErrors，不能把基础设施错误数量算成失败用例数。
