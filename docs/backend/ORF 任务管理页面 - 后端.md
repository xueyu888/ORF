# ORF 我的挑战页面 - 后端

## 范围

本文档定义悬赏大厅、我的挑战、战利品验收、积分榜和注册审核所需的后端契约。流程规则见 [ORF 悬赏目标流程设计.md](../rules/ORF%20悬赏目标流程设计.md)。

当前产品明确不支持多团队。运行时只有一个默认作用域；数据库保留 `team_id` 作为底层存储 scope，业务 API 和 repository 不暴露团队切换或团队聚合。

## API

| 方法     | 路径                                                                         | 说明                                                                                                                                               |
| -------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/tasks-page`                                                            | 管理员返回当前默认作用域内项目、目标、指标、任务、评论、战利品、积分流水和权限；普通成员只返回 `my-challenges` 数据                                |
| `GET`    | `/api/bounties`                                                              | 所有已通过用户返回悬赏大厅发现数据；角色只影响申请 / 接受动作能否写入，管理员不能因为无挑战权限而拿到空列表                                        |
| `GET`    | `/api/events`                                                                | 已登录 active 用户的 SSE 实时事件流；`notification.created` 投递个人通知，`system.broadcast` 投递作用域横幅广播                                    |
| `GET`    | `/api/my-challenges`                                                         | 返回当前用户已参与的挑战目标                                                                                                                       |
| `POST`   | `/api/projects`                                                              | 指挥官创建轻量项目并返回 `{ project }`；项目只用于目标聚合展示，不是权限或生命周期边界                                                            |
| `POST`   | `/api/objectives`                                                            | 挑战页按 Enter 或标题输入框失焦快速创建候选目标，默认 `flowStatus=candidate`                                                                       |
| `PATCH`  | `/api/objectives/:objectiveId`                                               | 指挥官更新目标标题或截止日期                                                                                                                       |
| `PATCH`  | `/api/objectives/:objectiveId/project`                                       | 指挥官更新目标项目归属；`projectId` 可为空，表示移出项目                                                                                           |
| `PATCH`  | `/api/objectives/:objectiveId/publish`                                       | 指挥官发布目标，进入 `open`                                                                                                                        |
| `POST`   | `/api/objectives/:objectiveId/recruitments`                                  | 指挥官征召 active 普通成员，进入 `recruiting`                                                                                                      |
| `POST`   | `/api/objectives/:objectiveId/challenge-applications`                        | active 普通成员填写 `reason` 申请挑战；`open/applying` 进入 `applying`，`recruiting/reestimating` 保持原流转状态                                  |
| `PATCH`  | `/api/objectives/:objectiveId/challenge-applications/:applicationId/approve` | 指挥官通过申请，写入挑战者并进入 `reestimating`                                                                                                    |
| `PATCH`  | `/api/objectives/:objectiveId/challenge-applications/:applicationId/reject`  | 指挥官拒绝申请                                                                                                                                     |
| `PATCH`  | `/api/objectives/:objectiveId/challenge`                                     | 被征召成员接受，写入挑战者并进入 `reestimating`                                                                                                    |
| `PATCH`  | `/api/objectives/:objectiveId/freeze`                                        | 指挥官完成重估并冻结，进入 `frozen`                                                                                                                |
| `POST`   | `/api/objectives/:objectiveId/loot`                                          | 挑战者提交结构化战利品，进入 `submitted`                                                                                                           |
| `POST`   | `/api/objectives/:objectiveId/trial-reviews`                                 | 挑战者发起一次试验收，目标仍保持 `frozen`                                                                                                          |
| `PATCH`  | `/api/objectives/:objectiveId/trial-reviews/:trialReviewId`                  | 指挥官反馈试验收，目标仍保持 `frozen`                                                                                                              |
| `POST`   | `/api/objectives/:objectiveId/contribution-reviews`                          | 已关闭的旧匿名互评接口，返回 `410`，原始互评只提交到本地结算服务                                                                                   |
| `POST`   | `/api/objectives/:objectiveId/review`                                        | 指挥官验收指标并结算，进入 `settled`                                                                                                               |
| `POST`   | `/api/results`                                                               | 创建指标并返回 `{ result }`；`managerDefined` 需要指挥官或 `result.create` 权限，`memberProposed` 仅允许 `Objective.challengerUserIds` 中的正式挑战者在未过期 `reestimating` 阶段创建 |
| `PATCH`  | `/api/results/:resultId`                                                     | 更新指标标题、难度、信心和同目标排序；指挥官可编辑未冻结目标下指标，`Objective.challengerUserIds` 中的挑战者仅能在未过期 `reestimating` 编辑自己目标下指标 |
| `POST`   | `/api/feedback`                                                              | 创建团队级内部反馈 issue，记录 `createdBy` 和文本处理人 `owner`；新反馈不接收目标或指标绑定                                                        |
| `PATCH`  | `/api/feedback/:feedbackId/status`                                           | 更新反馈状态；仅管理员、反馈创建人或指定处理人可执行                                                                                               |
| `POST`   | `/api/tasks`                                                                 | 在目标下创建任务并返回 `{ task }`；候选、重估和冻结目标可维护任务                                                                                  |
| `PATCH`  | `/api/tasks/:taskId`                                                         | 更新任务标题                                                                                                                                       |
| `PATCH`  | `/api/tasks/:taskId/status`                                                  | 更新任务状态                                                                                                                                       |
| `PATCH`  | `/api/tasks/:taskId/completion`                                              | 更新任务勾选状态，并同步该任务下子任务完成状态                                                                                                     |
| `PATCH`  | `/api/tasks/:taskId/move`                                                    | 在同一目标下调整任务顺序                                                                                                                           |
| `DELETE` | `/api/tasks/:taskId`                                                         | 删除任务和子任务                                                                                                                                   |
| `POST`   | `/api/tasks/:taskId/checklist`                                               | 创建子任务并返回 `{ item }`                                                                                                                        |
| `PATCH`  | `/api/tasks/:taskId/checklist/:itemId`                                       | 更新子任务勾选状态，并同步父任务状态                                                                                                               |
| `PATCH`  | `/api/tasks/:taskId/checklist/:itemId/label`                                 | 更新子任务标题                                                                                                                                     |
| `PATCH`  | `/api/tasks/:taskId/checklist/:itemId/move`                                  | 在允许的目标任务范围内移动子任务                                                                                                                   |
| `DELETE` | `/api/tasks/:taskId/checklist/:itemId`                                       | 删除子任务                                                                                                                                         |
| `GET`    | `/api/users`                                                                 | 管理员读取成员和注册状态                                                                                                                           |
| `PATCH`  | `/api/registration-requests/:userId/approve`                                 | 通过注册申请                                                                                                                                       |
| `PATCH`  | `/api/registration-requests/:userId/reject`                                  | 拒绝注册申请                                                                                                                                       |
| `PATCH`  | `/api/users/:userId/disable`                                                 | 停用用户                                                                                                                                           |

不存在的 `:objectiveId` 必须返回 404；目标存在但当前状态不允许对应流程动作时返回 409。
读取目标数据时，`challengerUserIds` / `assignedChallengerUserIds` 是身份事实源，`challengers` / `assignedChallengers` 是显示名投影并会去重、剔除已接受挑战者，旧数据或种子数据不能把已接受成员继续暴露为待响应征召。写入挑战者集合时，后端必须校验目标参与者是当前作用域内的 active 普通成员，管理员只负责审核、冻结、验收和异常处理。悬赏大厅读取是发现能力，不是挑战动作；后端不能用用户角色把 `GET /api/bounties` 的列表清空，申请和接受接口必须独立校验角色与状态。指挥官/管理员可以看到完整大厅数据和前端操作区，但对应 mutation 必须拒绝写入。

所有由用户输入的业务文本在 API 边界统一 `trim`。目标标题、指标标题、指标名称、任务标题、评论正文等必填字段去除空白后不能为空；任务说明、子任务标签等选填字段如果只包含空白，按未填写处理并落到后端默认值，不能把空白字符串写入数据库。行动项执行人必须是当前默认作用域内的 `active` 成员；前端不提供自由文本输入，空执行人由后端回落为当前用户。日期型字段必须是合法 `YYYY-MM-DD`，例如 `2999-02-31` 必须返回 400。`Objective.finalDueAt` 是目标截止日期唯一事实源，只有指挥官可通过 `PATCH /api/objectives/:objectiveId` 修改；`candidate/open/applying/recruiting/reestimating` 可正常修改，`frozen` 只允许延后，`submitted/settled/closed` 返回 409。

项目归属 API 只改变目标聚合展示。`Project.name` 是项目名称事实源，`Objective.projectId` 是目标项目归属事实源且可为空；无项目目标是合法状态。创建目标时可以传入 `projectId`，也可以省略或传空；传入不存在或不属于当前默认作用域的项目必须返回 400。`PATCH /api/objectives/:objectiveId/project` 只允许指挥官调用，可以把目标放入项目、移动到其他项目或移出项目，不能改变目标生命周期、挑战者、指标、任务或积分。

`POST /api/objectives` 对应挑战页 temporary 目标标题输入框的 Enter 或失焦快速创建动作。创建请求发起后，前端先让本地 temporary 目标退出标题编辑态并留在原位；`POST` 成功返回的真实目标必须足以立即替换本地 temporary 目标，任务管理数据刷新只负责后续同步和撤掉覆盖层，不能成为创建成功 UI 的前置条件。创建成功后的真实目标继续保持同一套目标面板结构，但缺失指标和行动项时前端不渲染伪子行；前端从目标行 `+` 选择新增指标或新增行动项后，才通过 `POST /api/results` / `POST /api/tasks` 创建对应实体，返回的真实实体用于替换本次创建的 temporary 行。`POST /api/tasks/:taskId/checklist` 必须返回创建出来的 `TaskChecklistItem`，前端用真实子任务 id 替换 temporary 子任务，不能靠标题匹配。指标、任务和子任务创建成功后都使用一次性创建覆盖层桥接到 `/api/my-challenges` 刷新 materialize，不能在页面级刷新延迟时短暂回到旧列表。任务管理接口按 `createdAt desc, id desc` 返回目标源数据；挑战页在业务排序键相同时保留该源顺序，并且不能把目标标题作为列表排序键。由于 API 源顺序可能和本地 temporary 目标插入顺序不同，前端在提交目标时保留一次性的邻居锚点；`POST` 成功返回的真实目标可以作为页面级临时覆盖层连续替换 temporary 目标，任务管理数据刷新包含同一目标后撤掉覆盖层，但排序锚点继续保留到用户切换筛选或目标业务排序键变化。创建失败时，前端回到目标标题编辑态并保留用户输入。

任务和子任务完成状态接口只表达执行进度写入，不触发指标验收、目标提交、结算或积分。前端可以在挑战页展示层使用短生命周期完成状态覆盖层即时反馈点击；后端返回的任务管理数据仍是完成状态的持久化事实源，刷新数据包含同一任务或子任务完成状态后前端撤销覆盖层。

任务和子任务写入权限统一从父级 `Objective` 解析：新增、改名、改状态、勾选、移动和删除都会先把任务或子任务解析到 `Task.linkedObjectiveId`，再校验当前用户 id 是否在该目标的 `Objective.challengerUserIds`；指挥官按管理员权限通过。`Task.assignee` 只是执行提示，`Task.createdBy` / `updatedBy` 只记录创建和最近维护人，不能用来阻止同一目标下其他正式挑战者维护任务或子任务。

## 术语

- `Objective` 在业务文案中叫“悬赏目标”，是挑战、战利品和结算的绑定对象。
- `Result` 在业务文案中统一叫“指标”，只定义悬赏目标的验收口径和计分基础，不拥有独立截止日期。
- `Task` 在业务文案中叫“任务”或“行动项”，只归属于悬赏目标，不归属于指标。
- 只有悬赏目标可以有挑战者、申请、征召和状态流转；指标不表达挑战关系，也不直接分配个人积分。
- 当前不记录任务影响了哪些指标；如果后续需要分析影响关系，应新增独立关联模型，而不是恢复任务到指标的父子归属。

## 返回集合

`GET /api/tasks-page` 和 `GET /api/my-challenges` 返回同一种集合结构。区别是：`/api/tasks-page` 对管理员返回当前默认作用域内全量任务页数据，对普通成员返回等价于 `/api/my-challenges?scope=mine` 的数据；`/api/my-challenges?scope=all` 只允许管理员使用。

| 集合                    | 用途                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| `projects`              | 轻量项目注册表；管理员读模型返回当前作用域项目，成员读模型只返回与可见目标相关的项目      |
| `objectives`            | 页面根节点，也是挑战对象；可携带可空 `projectId` 作为前端项目分组字段                     |
| `results`               | 目标下的指标                                                                              |
| `tasks`                 | 目标下的任务和子任务                                                                      |
| `evidence`              | 证据                                                                                      |
| `feedback`              | 系统或管理反馈，不驱动悬赏状态机                                                          |
| `comments`              | 目标、指标、任务、子任务和反馈 issue 评论                                                 |
| `objectiveLoot`         | 结构化战利品提交记录                                                                      |
| `objectiveTrialReviews` | 目标试验收请求和指挥官反馈                                                                |
| `pointLedger`           | 验收结算后的成员积分流水                                                                  |
| `permissionRules`       | 前端操作权限                                                                              |

ORF 读模型不返回匿名互评原始数据。新匿名互评原始数据只进入本地结算服务。`pointLedger` 是公开积分结果，普通成员和管理员都可以读取；普通成员读模型只收敛目标、指标、战利品、评论等私有业务对象。

`PATCH /api/objectives/:objectiveId/publish` 是候选目标进入悬赏大厅的唯一发布动作，必须写入 `Objective.publishedAt`，并为当前作用域 active 用户创建 `objective.published` 系统通知；持久化通知遵守“触发人不接收自己消息”的原则。通知写入后，后端还会通过 `/api/events` 发送 `system.broadcast`，让当前作用域所有在线 active 用户即时看到横幅并刷新大厅。后续申请、征召、审核、重估、编辑和冻结只能更新对应业务字段或 `updatedAt`，不能覆盖 `publishedAt`。

`GET /api/bounties` 对所有已通过用户返回 `publicItems`，包含 `flowStatus in (open, applying, recruiting, reestimating)` 的公开大厅目标。`publicItems` 是大厅主列表，必须带上 `applications`、`pendingApplications`、`approvedApplicants`、`challengers`、`isCurrentChallenger`、`hasCurrentApplication` 和目标的 `publishedAt`，用于公开展示申请理由、申请人、已通过挑战者头像和发布到大厅时间。`availableItems` 只表示当前仍可发起申请的目标；`recruitmentItems` 表示当前 active 普通成员自己待接受的征召。指挥官/管理员读取同一接口时仍能看到大厅目标；前端可以完整显示申请 / 接受操作入口，但所有申请 / 接受动作接口必须返回 403 或等价 forbidden，不能把管理员写入 `challengerUserIds`、`assignedChallengerUserIds` 或申请记录。

申请挑战只接受 active 普通成员在 `open/applying/recruiting/reestimating` 发起，且 body 必须包含 trim 后非空的 `reason`；`reestimating` 目标收到新申请后仍保持 `reestimating`，不能回退到 `applying`；申请通过或拒绝只接受 `applying/recruiting/reestimating`。目标进入 `frozen/submitted/settled/closed` 后，即使旧数据仍有 pending 申请，审核接口也必须返回 409。

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

代码唯一事实源是 `src/domain/orfLifecycle/`。后端只调用其中的 guard 和 transition，不能在 repository、route 或页面模型里再维护独立的状态集合。

`Objective.stage` 只保留页面阶段兼容：`reestimating` 对应 `orfReestimate`，`frozen/submitted/settled/closed` 对应 `goalFrozen`。业务流转必须走发布、申请、征召、冻结、提交和验收接口，由这些接口同步写入兼容阶段字段；后端不提供单独改写 `stage` 或退回重估的旧入口。

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

旧 `POST /api/objectives/:objectiveId/contribution-reviews` 不再接受请求体，固定返回 `410`：

```json
{
  "error": "Anonymous contribution reviews must be submitted to the local settlement service"
}
```

新前端不调用该接口。普通成员页面把 `0..100` 的百分比转换为 `0..1` 的标准比例后，在浏览器本地用本地结算服务公钥加密，并直接提交到本地结算服务。

`POST /api/objectives/:objectiveId/trial-reviews` 使用与 `POST /api/objectives/:objectiveId/loot` 相同的请求体和指标主张校验。成功后写入 `objectiveTrialReviews`，不写入 `objectiveLoot`，不改变 `Objective.flowStatus` 和 `Objective.lootSubmittedAt`。同一目标只能有一条试验收记录。

`PATCH /api/objectives/:objectiveId/trial-reviews/:trialReviewId` 请求体：

```json
{
  "status": "approved",
  "commanderFeedback": "可正式提交"
}
```

`status` 只能是 `approved` 或 `needsWork`。指挥官只能反馈 `requested` 试验收，反馈后目标仍保持 `frozen`。

`POST /api/objectives/:objectiveId/review` 请求体：

```json
{
  "lootId": "loot-1",
  "resultReviews": [{ "resultId": "res-1", "acceptedResult": "completed" }],
  "contributionResolution": null,
  "reason": "验收说明"
}
```

目标结果由 `resultReviews` 汇总：全部指标完成则 `Objective.acceptedResult=completed`。本地结算服务解密匿名互评并计算贡献比例；ORF 后端只读取 `contributionResolution`，不读取新匿名互评原始数据。有缺评、分歧或申诉时，指挥官通过 `contributionResolution` 提供处理后的比例和说明。`contributionResolution.ratios[].memberUserId` 对应 `users.id`，是积分归属事实源；`member` 只作为展示名和旧请求兼容字段。

结算后后端写入：

- `Result.acceptedResult`
- `Objective.acceptedResult`
- `Objective.completionMultiplier`
- `Objective.objectiveBasePoints`
- `Objective.objectiveSettlementPoints`
- `pointLedger`

`Result.uncertaintyScore` 是指标积分事实源，由 `Result.uncertaintyLevel` 映射写入。指标可以先创建为待校准，但 `reestimating -> frozen` 前，后端必须校验目标下每个指标都已设置积分等级；`Objective.objectiveBasePoints` 只从这些指标积分汇总得到，不作为目标创建或发布接口的输入字段。

前端排行榜只读取公开 `pointLedger`，不自行计算个人贡献比例。普通成员和管理员都可以看到公开积分榜；匿名互评原始数据不通过该读模型返回。

## 权限约束

- 指挥官按管理员权限处理。
- 目标内容只能由指挥官修改。
- 指挥官可以编辑未冻结目标下指标。
- 挑战者只能在未过期 `reestimating` 状态提出或编辑自己参与目标下的指标；超过 `confirmationDueAt` 或目标冻结后均不可调整。
- 反馈状态只能由管理员、反馈创建人或 `owner` 指定处理人更新；普通成员不能关闭或改写他人反馈状态。
- 反馈创建以当前默认团队作用域为边界；active 团队成员可以创建不绑定目标或指标的内部反馈，反馈事实只写入团队反馈 issue。
- 反馈 `owner` 必须是当前默认作用域内 `active` 成员；停用、待审核、拒绝或不存在的姓名不能成为反馈处理人。
- 指标更新提案不接受 `feedbackId`，不会改写反馈状态；指标更新只影响结果和结果评论审计。
- 任务创建基于目标授权和排序，不要求关联指标，也不接受反馈来源；反馈不会被挂成任务来源。
- 任务和子任务维护权限以 `Objective.challengerUserIds` 为身份边界；同一目标正式挑战者可以共同新增、编辑、勾选、移动和删除目标下任务与子任务，旁观成员返回 403，指挥官/管理员可维护任意目标任务。
- `Task.assignee` 不表达所有权，`Task.createdBy` / `updatedBy` 只作为审计字段返回给前端和测试，不能参与维护授权判断。
- 任务 ID 必须使用带单调计数和 UUID 后缀的 `ORF-*` 形式；同一毫秒内的并发创建不能因为时间戳或伪随机数相同而撞主键。
- 当前不开放退回重估；重估截止后停止调整，不续期。
- 截止日期修改只写 `Objective.finalDueAt`；冻结后只能延后，不重开重估，也不修改 `confirmationDueAt`。
- 任务、子任务和评论允许在挑战协作中维护，但不自动推导验收或结算。
- 评论线程标题必须由后端根据真实目标、指标、任务或子任务解析；客户端提交的 `targetTitle` 只能作为兼容字段，不能覆盖真实标题。
- 评论回复的 `replyToMessageId` 必须属于同一评论线程，`replyToAuthor` 由后端用真实消息作者回填，不能信任客户端提交值。
- 删除评论消息时必须同步清理仍保留消息中的 `replyToMessageId` / `replyToAuthor`，不能留下指向已删除消息的断链回复。
- 并发给同一目标下的目标、指标、任务或子任务新增评论时，必须锁住目标后再查找或创建 open thread，避免同一目标生成多个打开中的根评论线程。
- `申请挑战` 只表达意愿，并必须保存申请理由；指挥官通过后才写入 `Objective.challengerUserIds`，通过后的目标仍在 `GET /api/bounties.publicItems` 中展示挑战者头像和剩余申请。
- 多名成员同时申请同一目标时，后端必须用行级锁保护 `challengeApplications` 的读改写，不能让后一次写入覆盖前一次申请。
- 审批申请、征召和接受征召都会同时读改写 `Objective.challengerUserIds` / `Objective.assignedChallengerUserIds` / `Objective.challengeApplications`，并同步显示名投影，必须在同一行级锁事务内完成。
- 并发新增或移动指标、任务、子任务时，后端必须锁住对应父级目标或任务后再计算 `sortOrder`，避免重复排序号导致页面顺序不稳定；任务排序父级是目标，不是指标。
- `征召挑战` 的成员必须是当前默认作用域内 `active` 用户；停用、待审核、拒绝或不存在的用户不能写入 `Objective.assignedChallengerUserIds`。
- `接受挑战` 只用于征召；当前不开放成员拒绝征召，有异议时线下找指挥官处理。
- `提交战利品` 仅允许目标挑战者在 `frozen` 状态执行。
- `提交试验收` 仅允许目标挑战者在 `frozen` 状态执行一次；`试验收反馈` 仅允许指挥官在 `frozen` 状态处理，且不推进状态。
- `验收结算` 仅允许指挥官在 `submitted` 状态执行。
- 多挑战者目标结算优先使用匿名互评汇总；缺评、分歧或申诉需要指挥官处理。
- 匿名互评和指挥官分歧处理的贡献比例必须是每个挑战者一项、范围 `0..1`、合计 `1` 的标准比例；后端不接受任意权重再静默归一化。
- 注册用户默认为 `pending`，只有 `active` 用户可访问业务 API。

## 任务与指标解耦迁移

任务已经从指标下移到目标下，后端契约如下：

- `Task.linkedObjectiveId` 是任务归属、权限、生命周期和排序边界。
- `Task.assignee` 是执行人提示，不是所有者；`Task.createdBy` / `updatedBy` 是审计信息，不改变同目标挑战者共同维护权限。
- `Task.linkedResultId` 已从任务业务类型、DTO、写入路径和数据库表中移除。
- `Result.taskIds` 已从指标业务类型和 DTO 中移除；指标删除不能删除目标下任务。
- `POST /api/tasks` 应基于 `linkedObjectiveId` 创建任务；候选目标和没有指标的目标也可以创建任务。
- `PATCH /api/tasks/:taskId/move` 只在同一目标下移动任务，不能通过移动任务改变指标归属。
- 迁移 `0020_drop_task_result_ownership` 删除旧 `tasks.linked_result_id` 外键和列；迁移前必须已完成 `tasks.linked_objective_id` 回填。
- 后端启动时必须检查当前运行时数据库契约：`tasks.linked_objective_id` 必须非空，`tasks.linked_result_id` 不得存在。如果检查失败，先对当前 `DATABASE_URL` 执行 `npm run db:migrate`，不能让用户在创建行动项时才遇到通用 500。
