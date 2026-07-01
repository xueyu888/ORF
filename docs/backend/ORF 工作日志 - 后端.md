# ORF 工作日志 - 后端

## 范围

工作日志记录“某个用户在某一天每次提交了什么”。普通非 FAE 成员的日志默认必须绑定到目标，并填写目标进度估计和正文；默认目标候选只显示自己参与且尚未完成的目标，目标搜索可以查到当前团队全部目标。已验收、已结算、已关闭或自己不是挑战者的目标不进入默认候选，但可以通过目标搜索显式选中；前端需要提示这类选择不会改变目标状态，并在自己不是挑战者时提示确认目标选择。指挥官/管理员可以记录可填写目标日志、独立分类日志或临时未归类日志。当前临时允许 FAE 成员邓滨虎、何永杰保存未归类日志，但不开放日志分类能力。它是独立事实源，不属于评论、任务进度、战利品、验收或积分。

## 事实源

`work_log_entries` 是日志记录事实源：

| 字段 | 含义 |
| --- | --- |
| `author_user_id` | 日志归属用户，使用 `users.id` |
| `work_date` | 日志所属自然日，`YYYY-MM-DD` |
| `objective_id` | 当前仍存在时的目标链接；未指定目标或目标删除后置空 |
| `objective_id_snapshot` | 填写时目标 ID 快照；未指定目标时为空 |
| `objective_title_snapshot` | 填写时目标标题快照；未指定目标时为空 |
| `category_id` | 当前仍存在时的日志分类链接；未指定分类后置空 |
| `category_id_snapshot` | 填写时分类 ID 快照；未指定分类时为空 |
| `category_name_snapshot` | 填写时分类名称快照；未指定分类时为空 |
| `body_markdown` | Markdown 日志正文 |
| `remaining_estimate_percent` | 兼容存储字段，保存这条日志里作者对目标剩余比例的主观估计，`0..100`；页面展示为目标进度估计 `100 - remaining_estimate_percent`；未填写或未指定目标时为空 |
| `duration_minutes` | 可选记录时间，单位分钟，`1..1440`；未填写时为空 |
| `sort_order` | 当天日志展示顺序 |

`work_log_categories` 是独立分类事实源。分类只用于工作日志归类，按团队内规范化名称唯一，由管理员创建；它不是目标，不参与目标进度、验收、积分或结算。

同一用户同一天可以提交多条工作日志，也可以多次记录同一个目标或分类。目标/分类改名、删除或进入已验收/已结算/已关闭后，历史日志继续显示快照；编辑已有日志时，如果目标/分类没有变化，只修改正文、目标进度估计、记录时间并保留原快照。默认目标候选只包含当前用户参与且尚未完成的目标；`mode=search` 按关键词查询当前团队全部目标，包括已验收、已结算、已关闭以及当前用户不是挑战者的目标。

`remaining_estimate_percent` 和 `duration_minutes` 都只属于日志事实。前者是页面“目标进度估计”的兼容存储值，不反向写入 `Objective.progress`；普通非 FAE 成员选择目标时必须填写，页面可以默认沿用该用户上一次给同一目标记录的估计，数值允许上调、下调或保持不变；后者不参与强制工时核算；二者都不改变目标进度、验收、积分或结算。

`work_log_reminder_states` 是工作日志欠账提醒状态事实源。它不记录日志是否完成，只记录某个用户当前欠账窗口、缺失日期、提醒状态和下一次可提醒时间：

| 字段 | 含义 |
| --- | --- |
| `team_id` / `user_id` | 提醒状态归属，按团队和用户唯一 |
| `status` | `active` 表示当前还有缺失日志；`resolved` 表示当前窗口已补齐或用户不再符合提醒条件 |
| `window_start_date` / `window_end_date` | 本次欠账计算窗口 |
| `required_dates` | 当前窗口内应填写日志的日期；当前基础设施暂按自然日计算，正式启用前必须改接团队日期覆盖和工作日志应填成员模型 |
| `missing_dates` | 从 `work_log_entries` 派生出的缺失日期 |
| `last_reminded_at` / `next_remind_at` | 最近一次弹窗提醒时间和下一次允许弹窗时间 |
| `snooze_count` | 用户暂缓次数 |
| `notification_event_id` | 单条系统通知入口回链；不作为欠账关闭事实源 |
| `resolved_at` | 当前欠账状态解决时间 |

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/work-logs/objectives?mode=default\|search&q=关键词` | 当前用户可填写日志的目标，并带上当前用户对每个目标最近一次填写的进度估计兼容剩余值；`default` 只返回自己参与且尚未完成的目标，`search` 按关键词返回当前团队全部目标；管理员额外返回分类和智能分类开关 |
| `POST` | `/api/work-logs/classification-suggestion` | 管理员根据正文获取一次智能分类建议 |
| `GET` | `/api/work-logs/reminder-state` | 当前用户工作日志欠账提醒状态；`ORF_WORK_LOG_REMINDER_ENABLED=false` 时返回不提醒状态 |
| `POST` | `/api/work-logs/reminder-state/snooze` | 当前用户将强提醒暂缓到 10 分钟后；提醒关闭时不产生提醒 |
| `GET` | `/api/work-logs/my-day?date=YYYY-MM-DD` | 当前用户某天已提交日志 |
| `POST` | `/api/work-logs/my-day/:date` | 当前用户给某天追加一条日志 |
| `PATCH` | `/api/work-logs/entries/:entryId` | 当前用户修改自己的一条历史日志 |
| `DELETE` | `/api/work-logs/entries/:entryId` | 当前用户删除自己的一条历史日志 |
| `GET` | `/api/work-logs/activity?from=&to=&userId=&objectiveId=&limit=` | 团队日志活动流 |
| `GET` | `/api/work-logs/report?from=&to=&scope=mine\|team` | 工作日志报表；最多查询 93 天 |

`POST /api/work-logs/my-day/:date` 和 `PATCH /api/work-logs/entries/:entryId` 请求体：

```json
{
  "objectiveId": "obj-1",
  "categoryId": null,
  "categoryName": null,
  "bodyMarkdown": "今天完成了接口联调。",
  "remainingEstimatePercent": 35,
  "durationMinutes": 90
}
```

`objectiveId`、`categoryId`、`categoryName` 只能三选一。普通非 FAE 成员默认必须提供 `objectiveId` 和 `remainingEstimatePercent`；管理员和当前临时 FAE 例外成员可以不提供目标。只有管理员可以提供现有分类 `categoryId` 或新分类 `categoryName`。`remainingEstimatePercent` 对管理员、当前临时 FAE 例外成员或未指定目标日志可为空；未指定目标时后端会归空；前端“目标进度估计”输入会在保存边界换算成这个兼容剩余字段。`durationMinutes` 可为空；填写时必须是 `1..1440` 的整数。

`POST /api/work-logs/classification-suggestion` 请求体：

```json
{
  "bodyMarkdown": "今天处理了审计 demo 和 ORF 工作日志分类。"
}
```

该接口只返回建议，不写入 `work_log_entries` 或 `work_log_categories`。用户必须在保存日志时显式选择目标、现有分类或新分类，后端才会持久化。

## 权限

- active 普通非 FAE 成员可以写自己的工作日志，且 `objectiveId` 必须属于当前默认作用域；目标可以是尚未完成、已验收、已结算或已关闭状态，也可以不是当前用户挑战的目标，但这类目标只通过搜索候选显式暴露；`remainingEstimatePercent` 必须随目标日志一起提交。
- active 指挥官/管理员可以写自己的工作日志；`objectiveId` 可以为空。若指定目标，目标必须属于当前默认作用域，并且满足同一套目标候选规则。
- 当前临时 FAE 例外成员邓滨虎、何永杰可以保存自己的未归类日志；若指定目标，仍必须属于自己可写的目标，但不强制填写目标进度估计。
- 只有 active 指挥官/管理员可以使用或创建独立日志分类，也只有他们可以请求智能分类建议。
- 除当前临时 FAE 例外外，普通成员不能保存未归类日志或分类日志；找不到对应目标时，应先和指挥官确认目标关系。
- 任何人都不能代别人填写工作日志。
- 已有日志可以由本人继续编辑，即使目标后来改名、删除或成员关系变化；保持原目标不变时不重新校验当前目标关系。
- 已有日志可以由本人删除。删除只移除 `work_log_entries` 中对应记录，不改变目标、进度、验收、积分或结算。
- active 团队成员都可以读取团队活动流。

## 报表

报表从 `work_log_entries` 派生，不是新的业务事实源：

- `scope=mine` 返回当前用户在日期范围内的个人记录矩阵。
- `scope=team` 返回当前团队 active `admin/member` 的日期矩阵。
- 单元格统计日志条数、覆盖归类数、最新目标进度估计的兼容剩余值、记录时间、归类摘要和该单元内日志明细快照。
- 汇总统计日志总数、有记录日期、覆盖归类数、记录时间和平均目标进度估计的兼容剩余值。

## LLM 分类推荐策略

智能分类是工作日志的辅助读服务，不是事实源。它只负责把一段日志正文临时推荐到“可填写目标、已有日志分类、新日志分类、未归类”之一，不能创建目标、不能创建分类、不能保存日志，也不能更新目标进度、验收、积分或结算。

### 触发边界

- 只有 active 指挥官/管理员可以请求 `/api/work-logs/classification-suggestion`；普通成员请求返回 `403`。
- `GET /api/work-logs/objectives` 只在当前用户是指挥官/管理员且已配置 LLM 时返回 `classificationSuggestionEnabled: true`。
- 推荐接口只接收 `bodyMarkdown`。目标候选和分类候选由后端按当前默认作用域重新读取，且只使用默认目标候选；调用方不能提交自定义候选集，推荐也不会自动命中搜索专用目标。
- 未配置模型、模型调用失败、返回无法解析或返回非法候选时，接口返回 `suggestion: null` 或降级为 `uncategorized`；任何失败都不阻断用户继续填写或保存日志。

### 模型配置

模型客户端只使用 OpenAI-compatible `/chat/completions` 协议。配置解析顺序：

1. 当前 ORF 进程环境变量：`ORF_LLM_*`。
2. 兼容旧自动分类变量：`AUTO_CLASSIFY_MODEL_*`。
3. 兼容 agent/chat 变量：`AGENT_LLM_*`、`CHAT_MODEL_*`。
4. 当前 ORF `.env` 和本机同级 aio 已知 `.env` 文件中的同名变量。

`baseUrl` 和 `model` 同时存在时才启用推荐；`apiKey` 可以为空以兼容局域网模型服务。请求超时使用 `ORF_LLM_TIMEOUT_MS`。

### 候选输入

发送给模型的内容只包含推荐所需的最小上下文：

- 日志正文：`bodyMarkdown.trim().slice(0, 3000)`。
- 当前用户可写目标：最多 80 个，只包含 `id`、`title`、`flowStatus`、`finalDueAt`。
- 当前团队日志分类：最多 80 个，只包含 `id`、`name`。

这些候选只是推荐上下文；保存日志时仍由仓库层重新校验目标、分类、成员关系和权限。

### 决策顺序

模型提示词要求按以下顺序推荐：

1. 如果正文明显对应某个候选目标，优先返回 `kind: "objective"` 和该目标 `objectiveId`。
2. 如果正文不对应任何目标，但适合某个已有日志分类，返回 `kind: "category"` 和该分类 `categoryId`。
3. 如果正文适合独立分类但没有现成分类，返回 `kind: "newCategory"` 和建议的 `categoryName`。
4. 如果无法判断，返回 `kind: "uncategorized"`。

返回格式必须是 JSON：

```json
{
  "kind": "objective|category|newCategory|uncategorized",
  "objectiveId": "目标 ID 或 null",
  "categoryId": "分类 ID 或 null",
  "categoryName": "新分类名称或 null",
  "confidence": 0.8,
  "reason": "简短原因"
}
```

### 归一化与信任边界

- 后端允许模型返回裸 JSON 或 fenced JSON，但只读取第一段对象。
- `confidence` 会归一化到 `0..1`；缺失或非法时使用 `0.5`。
- `reason` 最多保留 80 个字符。
- `categoryName` 会压缩空白并截断到 48 个字符。
- `objectiveId` 必须命中当前候选目标，否则不会被信任。
- `categoryId` 必须命中当前候选分类，否则不会被信任。
- 若模型给出 `categoryName` 且大小写不敏感地命中已有分类，后端转成现有分类建议。
- 若模型给出非法目标或非法分类且没有可用 `categoryName`，后端降级为未归类建议。

### 持久化规则

- 推荐结果不写入 `work_log_entries`。
- 推荐新分类不写入 `work_log_categories`。
- 用户点击“采用”只改变前端草稿；只有用户随后保存日志，仓库层才会按 `objectiveId`、`categoryId`、`categoryName` 三选一规则持久化。
- 新分类只在指挥官/管理员保存带 `categoryName` 的日志时创建，并按团队内规范化名称唯一。
- 普通成员始终不能通过 LLM 绕过目标绑定规则；当前临时 FAE 例外只允许手工保存未归类日志，不开放 LLM 分类建议。

## 提醒

工作日志欠账提醒基础设施已经落地，但 `ORF_WORK_LOG_REMINDER_ENABLED` 默认关闭。正式启用前必须补齐两个事实源：

- 团队日期覆盖：默认周一到周五应填，节假日可覆盖为不应填，调休工作日可覆盖为应填。
- 工作日志应填成员：注册用户或 `team_members` 成员不等于必须填写工作日志，提醒对象必须来自独立设置。

请假不是豁免日期；请假也应该通过 `work_log_entries` 记录成当天日志事实，便于以后回看。

启用后，后端启动 `workLogReminderScheduler`，默认每分钟 reconcile 欠账提醒状态：

- 当前团队 active 指挥官/管理员、当前临时 FAE 例外成员，或至少有一个可填写目标的 active 普通成员，才进入提醒计算；这是临时基础设施规则，正式启用前应替换为独立的工作日志应填成员设置。
- `work_log_entries` 是日志是否补齐的唯一事实源；`work_log_reminder_states.missing_dates` 只能由它派生。
- 当前基础设施 `required_dates` 使用最近 7 个自然日；当天只有到达 `Asia/Shanghai` 17:20 后才进入窗口。正式启用前应替换为“最近 7 个应填日期”。
- 强提醒只在 17:20 到 24:00 前弹出；`next_remind_at <= now` 时通过 SSE 发送 `worklog.reminder.required`。
- 用户点击“10 分钟后提醒”或关闭弹窗，只更新 `work_log_reminder_states.next_remind_at`，不创建新的通知事件。
- 用户补齐缺失日期后，后端将状态更新为 `resolved`，通过 SSE 发送 `worklog.reminder.resolved`，前端弹窗自动关闭。

系统通知中心只保留 `worklog.reminder` 作为单条入口。它记录“系统曾提醒你存在工作日志欠账”，不承载当前是否还需要继续弹窗；当前弹窗闭环只看 `work_log_reminder_states`。提醒不创建日志、不改变目标、不影响进度、验收或积分。
