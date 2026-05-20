# ORF 我的挑战页面 - 后端

## 范围

本文档定义悬赏大厅、我的挑战、战利品验收、积分榜和注册审核所需的后端契约。流程规则见 [ORF 悬赏目标流程设计.md](../rules/ORF%20悬赏目标流程设计.md)。

当前产品明确不支持多团队。运行时只有一个默认作用域；数据库保留 `team_id` 作为底层存储 scope，业务 API 和 repository 不暴露团队切换或团队聚合。

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/tasks-page` | 管理员返回当前默认作用域内目标、指标、任务、评论、战利品、积分流水和权限；普通成员只返回 `my-challenges` 数据 |
| `GET` | `/api/bounties` | 返回悬赏大厅数据 |
| `GET` | `/api/my-challenges` | 返回当前用户已参与的挑战目标 |
| `POST` | `/api/objectives` | 创建候选目标，默认 `flowStatus=candidate` |
| `PATCH` | `/api/objectives/:objectiveId` | 指挥官更新目标标题 |
| `PATCH` | `/api/objectives/:objectiveId/publish` | 指挥官发布目标，进入 `open` |
| `POST` | `/api/objectives/:objectiveId/recruitments` | 指挥官征召成员，进入 `recruiting` |
| `POST` | `/api/objectives/:objectiveId/challenge-applications` | 成员申请挑战，进入 `applying` |
| `PATCH` | `/api/objectives/:objectiveId/challenge-applications/:applicationId/approve` | 指挥官通过申请，写入挑战者并进入 `reestimating` |
| `PATCH` | `/api/objectives/:objectiveId/challenge-applications/:applicationId/reject` | 指挥官拒绝申请 |
| `PATCH` | `/api/objectives/:objectiveId/challenge` | 被征召成员接受，写入挑战者并进入 `reestimating` |
| `PATCH` | `/api/objectives/:objectiveId/freeze` | 指挥官完成重估并冻结，进入 `frozen` |
| `POST` | `/api/objectives/:objectiveId/loot` | 挑战者提交结构化战利品，进入 `submitted` |
| `POST` | `/api/objectives/:objectiveId/contribution-reviews` | 目标挑战者提交匿名互评贡献比例 |
| `POST` | `/api/objectives/:objectiveId/review` | 指挥官验收指标并结算，进入 `settled` |
| `POST` | `/api/results` | 创建指标；`managerDefined` 需要指挥官或 `result.create` 权限，`memberProposed` 仅允许正式挑战者在未过期 `reestimating` 阶段创建 |
| `PATCH` | `/api/results/:resultId` | 更新指标；指挥官可编辑未冻结目标下指标，挑战者仅能在未过期 `reestimating` 编辑自己目标下指标 |
| `POST` | `/api/feedback` | 创建反馈，记录 `createdBy` 和文本处理人 `owner`；仅管理员或目标挑战者可对目标下指标创建 |
| `PATCH` | `/api/feedback/:feedbackId/status` | 更新反馈状态；仅管理员、反馈创建人或指定处理人可执行 |
| `POST` | `/api/tasks` | 创建任务 |
| `PATCH` | `/api/tasks/:taskId` | 更新任务 |
| `POST` | `/api/tasks/:taskId/checklist` | 创建子任务 |
| `PATCH` | `/api/tasks/:taskId/checklist/:itemId` | 更新子任务勾选状态 |
| `GET` | `/api/users` | 管理员读取成员和注册状态 |
| `PATCH` | `/api/registration-requests/:userId/approve` | 通过注册申请 |
| `PATCH` | `/api/registration-requests/:userId/reject` | 拒绝注册申请 |
| `PATCH` | `/api/users/:userId/disable` | 停用用户 |

不存在的 `:objectiveId` 必须返回 404；目标存在但当前状态不允许对应流程动作时返回 409。
读取目标数据时，`challengers` 会去重，`assignedChallengers` 会去重并剔除已接受挑战者，旧数据或种子数据不能把已接受成员继续暴露为待响应征召。

所有由用户输入的业务文本在 API 边界统一 `trim`。目标标题、指标标题、指标名称、任务标题、评论正文等必填字段去除空白后不能为空；任务说明、子任务标签等选填字段如果只包含空白，按未填写处理并落到后端默认值，不能把空白字符串写入数据库。行动项执行人必须是当前默认作用域内的 `active` 成员；前端不提供自由文本输入，空执行人由后端回落为当前用户。日期型字段必须是合法 `YYYY-MM-DD`，例如 `2999-02-31` 必须返回 400。

## 术语

- `Objective` 在业务文案中叫“悬赏目标”，是挑战、战利品和结算的绑定对象。
- `Result` 在业务文案中统一叫“指标”，只定义悬赏目标的验收口径和计分基础。
- 只有悬赏目标可以有挑战者、申请、征召和状态流转；指标不表达挑战关系，也不直接分配个人积分。

## 返回集合

`GET /api/tasks-page` 和 `GET /api/my-challenges` 返回同一种集合结构。区别是：`/api/tasks-page` 对管理员返回当前默认作用域内全量任务页数据，对普通成员返回等价于 `/api/my-challenges?scope=mine` 的数据；`/api/my-challenges?scope=all` 只允许管理员使用。

| 集合 | 用途 |
| --- | --- |
| `objectives` | 页面根节点，也是挑战对象 |
| `results` | 目标下的指标 |
| `tasks` | 指标下的任务和子任务 |
| `evidence` | 证据 |
| `feedback` | 系统或管理反馈，不驱动悬赏状态机 |
| `comments` | 目标、指标、任务、子任务评论 |
| `objectiveLoot` | 结构化战利品提交记录 |
| `objectiveContributionReviews` | 目标挑战者匿名互评记录 |
| `pointLedger` | 验收结算后的成员积分流水 |
| `permissionRules` | 前端操作权限 |

`GET /api/bounties` 只返回 `flowStatus in (open, applying, recruiting)` 且当前用户尚未成为挑战者的目标。

申请挑战只接受 `open/applying/recruiting`；申请通过或拒绝只接受 `applying/recruiting/reestimating`。目标进入 `frozen/submitted/settled/closed` 后，即使旧数据仍有 pending 申请，审核接口也必须返回 409。

## 状态字段

`Objective.flowStatus` 是目标流程的唯一业务状态：

```ts
type ObjectiveFlowStatus =
  | "candidate"
  | "open"
  | "applying"
  | "recruiting"
  | "reestimating"
  | "frozen"
  | "submitted"
  | "settled"
  | "closed";
```

`Objective.stage` 只保留页面阶段兼容：`reestimating` 对应 `orfReestimate`，`frozen/submitted/settled` 对应 `goalFrozen`。旧的 stage 更新接口不能写入与当前 `flowStatus` 冲突的阶段；业务流转必须走发布、申请、征召、冻结、提交和验收接口。

## 战利品与结算

`POST /api/objectives/:objectiveId/loot` 请求体：

```json
{
  "body": "完成说明",
  "resultClaims": [
    { "resultId": "res-1", "claim": "completed", "evidenceText": "证据说明" }
  ],
  "selfTestReportBody": "自测摘要，文件接入前先保存文本",
  "selfTestReportUrl": null
}
```

`POST /api/objectives/:objectiveId/review` 请求体：

```json
{
  "lootId": "loot-1",
  "resultReviews": [
    { "resultId": "res-1", "acceptedResult": "completed" }
  ],
  "contributionResolution": null,
  "reason": "验收说明"
}
```

目标结果由 `resultReviews` 汇总：全部指标完成则 `Objective.acceptedResult=completed`。匿名互评无缺评和分歧时，后端直接使用互评汇总比例；有缺评、分歧或申诉时，指挥官通过 `contributionResolution` 提供处理后的比例和说明。

结算后后端写入：

- `Result.acceptedResult`
- `Objective.acceptedResult`
- `Objective.completionMultiplier`
- `Objective.objectiveBasePoints`
- `Objective.objectiveSettlementPoints`
- `pointLedger`

前端排行榜只读取 `pointLedger`，不自行计算个人贡献比例。

## 权限约束

- 指挥官按管理员权限处理。
- 目标内容只能由指挥官修改。
- 指挥官可以编辑未冻结目标下指标。
- 挑战者只能在未过期 `reestimating` 状态提出或编辑自己参与目标下的指标；超过 `confirmationDueAt` 或目标冻结后均不可调整。
- 反馈状态只能由管理员、反馈创建人或 `owner` 指定处理人更新；普通成员不能关闭或改写他人反馈状态。
- 反馈创建遵循目标可见边界；普通成员只能给自己参与目标下的指标创建反馈，不能通过猜测指标 ID 写入别人的目标。
- 反馈 `owner` 必须是当前默认作用域内 `active` 成员；停用、待审核、拒绝或不存在的姓名不能成为反馈处理人。
- 指标更新提案如果携带 `feedbackId`，该反馈必须属于同一默认作用域且绑定到当前指标；不能通过一个合法指标请求改写其他作用域或其他指标的反馈状态。
- 任务创建如果携带 `feedbackOriginId`，该反馈必须属于同一默认作用域且绑定到任务所在指标；不能把其他作用域或其他指标的反馈挂成任务来源。
- 任务 ID 必须使用带单调计数和 UUID 后缀的 `ORF-*` 形式；同一毫秒内的并发创建不能因为时间戳或伪随机数相同而撞主键。
- 当前不开放退回重估；重估截止后停止调整，不续期。
- 任务、子任务和评论允许在挑战协作中维护，但不自动推导验收或结算。
- 评论线程标题必须由后端根据真实目标、指标、任务或子任务解析；客户端提交的 `targetTitle` 只能作为兼容字段，不能覆盖真实标题。
- 评论回复的 `replyToMessageId` 必须属于同一评论线程，`replyToAuthor` 由后端用真实消息作者回填，不能信任客户端提交值。
- 删除评论消息时必须同步清理仍保留消息中的 `replyToMessageId` / `replyToAuthor`，不能留下指向已删除消息的断链回复。
- 并发给同一目标下的目标、指标、任务或子任务新增评论时，必须锁住目标后再查找或创建 open thread，避免同一目标生成多个打开中的根评论线程。
- `申请挑战` 只表达意愿；指挥官通过后才写入 `Objective.challengers`。
- 多名成员同时申请同一目标时，后端必须用行级锁保护 `challengeApplications` 的读改写，不能让后一次写入覆盖前一次申请。
- 审批申请、征召和接受征召都会同时读改写 `Objective.challengers` / `Objective.assignedChallengers` / `Objective.challengeApplications`，必须在同一行级锁事务内完成。
- 并发新增或移动指标、任务、子任务时，后端必须锁住对应父级目标、指标或任务后再计算 `sortOrder`，避免重复排序号导致页面顺序不稳定。
- `征召挑战` 的成员必须是当前默认作用域内 `active` 用户；停用、待审核、拒绝或不存在的姓名不能写入 `Objective.assignedChallengers`。
- `接受挑战` 只用于征召；当前不开放成员拒绝征召，有异议时线下找指挥官处理。
- `提交战利品` 仅允许目标挑战者在 `frozen` 状态执行。
- `验收结算` 仅允许指挥官在 `submitted` 状态执行。
- 多挑战者目标结算优先使用匿名互评汇总；缺评、分歧或申诉需要指挥官处理。
- 注册用户默认为 `pending`，只有 `active` 用户可访问业务 API。
