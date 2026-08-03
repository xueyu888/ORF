# ORF 我的挑战页面 - 后端

## 范围

本文档定义悬赏大厅、我的挑战、战利品验收、积分榜和注册审核所需的后端契约。流程规则见 [ORF 悬赏目标流程设计.md](../rules/ORF%20悬赏目标流程设计.md)。

当前产品明确不支持多团队。运行时只有一个默认作用域；数据库保留 `team_id` 作为底层存储 scope，业务 API 和 repository 不暴露团队切换或团队聚合。

## API

| 方法     | 路径                                                                         | 说明                                                                                                                                               |
| -------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/me/access`                                                             | 返回当前用户、当前作用域权限规则和当前用户可执行权限；Provider 全局权限判断使用该轻量读模型                                                        |
| `GET`    | `/api/tasks-page`                                                            | 管理员返回当前默认作用域内项目、目标、指标、任务、评论、战利品和积分流水；普通成员只返回 `my-challenges` 数据                                      |
| `GET`    | `/api/bounties`                                                              | 所有已通过用户返回悬赏大厅公开生命周期数据；角色只影响申请 / 接受动作能否写入，管理员不能因为无挑战权限而拿到空列表                                |
| `GET`    | `/api/events`                                                                | 已登录 active 用户的 SSE 实时事件流；`notification.created` 投递个人通知，`system.broadcast` 投递作用域横幅广播                                    |
| `GET`    | `/api/my-challenges`                                                         | 返回当前用户已参与的挑战目标                                                                                                                       |
| `POST`   | `/api/projects`                                                              | 指挥官创建轻量项目并返回 `{ project }`；项目只用于目标聚合展示，不是权限或生命周期边界                                                            |
| `DELETE` | `/api/projects/:projectId`                                                   | 指挥官删除轻量项目；若项目下有关联反馈则返回 409，若只有目标则目标统一移入未归属目标                                                               |
| `POST`   | `/api/objectives`                                                            | 挑战页按 Enter 或标题输入框失焦快速创建候选目标，默认 `flowStatus=candidate`                                                                       |
| `PATCH`  | `/api/objectives/:objectiveId`                                               | 指挥官更新目标标题或截止日期                                                                                                                       |
| `PATCH`  | `/api/objectives/:objectiveId/project`                                       | 指挥官更新目标项目归属；`projectId` 可为空，表示移出项目                                                                                           |
| `PATCH`  | `/api/objectives/:objectiveId/publish`                                       | 指挥官发布目标，进入 `open`                                                                                                                        |
| `POST`   | `/api/objectives/:objectiveId/recruitments`                                  | 指挥官征召 active 普通成员，进入 `recruiting`                                                                                                      |
| `POST`   | `/api/objectives/:objectiveId/challenge-applications`                        | active 普通成员填写 `reason` 申请挑战；已被征召成员不能申请，只能接受征召；`open/applying` 进入 `applying`，`recruiting/reestimating` 保持原流转状态 |
| `PATCH`  | `/api/objectives/:objectiveId/challenge-applications/:applicationId/approve` | 指挥官通过申请，写入挑战者并进入 `reestimating`                                                                                                    |
| `PATCH`  | `/api/objectives/:objectiveId/challenge-applications/:applicationId/reject`  | 指挥官拒绝申请                                                                                                                                     |
| `PATCH`  | `/api/objectives/:objectiveId/challenge`                                     | 被征召成员接受，写入挑战者并进入 `reestimating`                                                                                                    |
| `PATCH`  | `/api/objectives/:objectiveId/freeze`                                        | 指挥官完成重估并冻结，进入 `frozen`                                                                                                                |
| `POST`   | `/api/objectives/:objectiveId/alignment-requests`                            | 目标挑战者发起阶段对齐申请；`reestimating` 可申请完成重估，`frozen` 可申请重新重估且必须填写 `note` 理由，`submitted` 只能申请验收对齐                |
| `PATCH`  | `/api/objectives/:objectiveId/alignment-requests/:alignmentRequestId`         | 指挥官处理阶段对齐申请；重估完成申请可完成冻结或打回重估；重新重估申请通过时必须传 `confirmationDueAt`，通过后目标回到 `reestimating`                |
| `POST`   | `/api/objectives/:objectiveId/reinforcements`                                | 指挥官在 `frozen` 且尚未提交战利品前加派 active 普通成员，直接写入正式挑战者，目标仍保持 `frozen`                                                   |
| `POST`   | `/api/objectives/:objectiveId/loot`                                          | 挑战者提交结构化战利品，进入 `submitted`                                                                                                           |
| `POST`   | `/api/objectives/:objectiveId/trial-reviews`                                 | 挑战者发起一次试验收，目标仍保持 `frozen`                                                                                                          |
| `PATCH`  | `/api/objectives/:objectiveId/trial-reviews/:trialReviewId`                  | 指挥官反馈试验收，目标仍保持 `frozen`                                                                                                              |
| `POST`   | `/api/objectives/:objectiveId/contribution-reviews`                          | 已关闭的旧匿名互评接口，返回 `410`，原始互评只通过 ORF 代理提交到共享结算服务                                                                      |
| `POST`   | `/api/objectives/:objectiveId/review`                                        | 指挥官验收指标；通过时进入 `accepted`，不通过时进入 `revisionRequired`                                                                             |
| `POST`   | `/api/objectives/:objectiveId/settle`                                        | 指挥官确认贡献比例并写入结算事件；`revisionRequired` 写入逾期惩罚事件，`accepted` 写入最终结算事件并进入 `settled`                                 |
| `POST`   | `/api/results`                                                               | 创建指标并返回 `{ result }`；`managerDefined` 需要指挥官或 `result.create` 权限，`memberProposed` 仅允许 `Objective.challengerUserIds` 中的正式挑战者在未过期 `reestimating` 阶段创建 |
| `PATCH`  | `/api/results/:resultId`                                                     | 更新指标标题；指挥官可编辑未冻结目标下指标，`Objective.challengerUserIds` 中的挑战者仅能在未过期 `reestimating` 编辑自己目标下指标 |
| `PATCH`  | `/api/results/:resultId/details`                                             | 更新指标详情字段：`detail`；权限和生命周期锁与指标标题编辑一致 |
| `PATCH`  | `/api/results/:resultId/uncertainty`                                         | 更新指标等级和积分映射；仅未锁定目标可写，`submitted` 后不得修改。`uncertainty` 是当前实现保留的 API 名 |
| `PATCH`  | `/api/results/:resultId/confidence`                                          | 更新指标信心 |
| `PATCH`  | `/api/results/:resultId/order`                                               | 更新指标在同目标内的排序 |
| `POST`   | `/api/feedback`                                                              | 创建团队级内部反馈 issue，记录 `createdBy`、处理人、可空 `projectId`，并同步创建首条评论正文和可选附件；新反馈不接收目标或指标绑定                 |
| `PATCH`  | `/api/feedback/:feedbackId/metadata`                                         | 更新反馈标题、分类、影响、处理人和可空项目；Open 反馈允许管理员、创建人、处理人编辑，Closed 反馈只有管理员可编辑                                  |
| `PATCH`  | `/api/feedback/:feedbackId/status`                                           | 更新反馈状态；仅管理员、反馈创建人或指定处理人可执行                                                                                               |
| `GET`    | `/api/feedback/:feedbackId/subscription`                                     | 返回当前用户对该反馈的订阅状态：`none`、`participating`、`subscribed` 或 `muted`                                                                   |
| `PUT`    | `/api/feedback/:feedbackId/subscription`                                     | 设置当前用户对该反馈的显式订阅状态：`subscribed`、`muted` 或清除显式状态 `none`                                                                    |
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
读取目标数据时，`challengerUserIds` / `assignedChallengerUserIds` 是身份事实源，`challengeApplications[].applicantUserId` 是申请人身份事实源；`challengers` / `assignedChallengers` / `challengeApplications[].applicant` 是数据库和读模型从当前用户姓名派生的显示投影，`challengerProfiles` / `assignedChallengerProfiles` 是由同一身份集合派生的头像展示投影。数据库会持续拒绝非本团队用户、重复 ID、正式挑战者与待响应征召交叉以及无有效申请人的记录，用户改名会自动刷新姓名投影。写入挑战者集合时，后端还必须校验新参与者是当前作用域内的 active 普通成员，管理员只负责审核、冻结、验收和异常处理。`GET /api/my-challenges?scope=mine` 的正式挑战树只返回当前用户已经进入 `challengerUserIds` 的目标；同响应里的 `pendingChallengeApplications` 只从 `Objective.challengeApplications[]` 派生当前用户 `pending` 申请，不改变目标归属、指标权限、任务权限或结算参与者。申请、征召和正式参与追踪的前端事实入口是悬赏大厅 `GET /api/bounties` 中的 `challengeApplications`、`assignedChallengerUserIds` 和 `challengerUserIds` 投影。冻结后的加派不是大厅申请或征召，后端只在 `POST /api/objectives/:objectiveId/reinforcements` 中把 active 普通成员直接追加到 `challengerUserIds`，不写 `assignedChallengerUserIds`、不写 `challengeApplications`、不改变 `flowStatus`、不解锁指标，且目标已有战利品提交、验收结果或结算积分后必须拒绝。冻结后重新重估也不是大厅申请；它只通过 `objective_alignment_requests.kind=frozenReestimate` 由正式挑战者带理由申请、指挥官审批，审批通过后改变目标生命周期并重新开放现有重估权限。悬赏大厅读取是公开生命周期展示能力，不是挑战动作；后端不能用用户角色把 `GET /api/bounties` 的列表清空，申请和接受接口必须独立校验角色与状态。指挥官/管理员可以看到完整大厅数据和前端操作区，但对应 mutation 必须拒绝写入。

所有由用户输入的业务文本在 API 边界统一 `trim`。目标标题、指标标题、指标名称、任务标题、评论正文等必填字段去除空白后不能为空；任务说明、子任务标签等选填字段如果只包含空白，按未填写处理并落到后端默认值，不能把空白字符串写入数据库。行动项执行人必须是当前默认作用域内的 `active` 成员；前端不提供自由文本输入，空执行人由后端回落为当前用户。重新重估申请的 `note` 必须是 trim 后非空理由。日期型字段必须是合法 `YYYY-MM-DD`，例如 `2999-02-31` 必须返回 400。`Objective.finalDueAt` 是目标截止日期唯一事实源，只有指挥官可通过 `PATCH /api/objectives/:objectiveId` 修改；`candidate/open/applying/recruiting/reestimating` 可正常修改，`frozen` 只允许延后，`submitted/revisionRequired/accepted/settled/closed` 返回 409。目标处于 `reestimating` 且 `finalDueAt` 实际变更时，后端必须用同一套重估完成期限规则按 `acceptedAt + nextFinalDueAt` 重算并写入 `Objective.confirmationDueAt`；默认完成期限取剩余验收周期的 50%，按半天取整并保留至少半天。如果无法得到合法重估完成期限，返回 400。

项目归属 API 只改变聚合展示。`Project.name` 是项目名称事实源，`Objective.projectId` 是目标项目归属事实源且可为空，`Feedback.projectId` 是反馈项目归属事实源且可为空；无项目目标和无项目反馈都是合法状态。创建目标或反馈时可以传入 `projectId`，也可以省略或传空；传入不存在或不属于当前默认作用域的项目必须返回 400/409。`PATCH /api/objectives/:objectiveId/project` 只允许指挥官调用，可以把目标放入项目、移动到其他项目或移出项目，不能改变目标生命周期、挑战者、指标、任务或积分。`PATCH /api/feedback/:feedbackId/metadata` 可以把反馈放入项目、移动到其他项目或移出项目，项目变化只写反馈活动，不扩大通知收件人范围。`DELETE /api/projects/:projectId` 只删除项目注册表记录；如果项目下存在反馈，必须返回 409 并保留项目和反馈；如果没有反馈，项目下目标统一置为未归属，不删除目标、指标、行动项或结算事实。

`POST /api/objectives` 对应挑战页 temporary 目标标题输入框的 Enter 或失焦快速创建动作。创建请求发起后，前端先让本地 temporary 目标退出标题编辑态并留在原位；`POST` 成功返回的真实目标必须足以立即替换本地 temporary 目标，任务管理数据刷新只负责后续同步和撤掉覆盖层，不能成为创建成功 UI 的前置条件。创建成功后的真实目标继续保持同一套目标面板结构，但缺失指标和行动项时前端不渲染伪子行；前端从目标行 `+` 选择新增指标或新增行动项后，才通过 `POST /api/results` / `POST /api/tasks` 创建对应实体，返回的真实实体用于替换本次创建的 temporary 行。`POST /api/tasks/:taskId/checklist` 必须返回创建出来的 `TaskChecklistItem`，前端用真实子任务 id 替换 temporary 子任务，不能靠标题匹配。指标、任务和子任务创建成功后都使用一次性创建覆盖层桥接到 `/api/my-challenges` 刷新 materialize，不能在页面级刷新延迟时短暂回到旧列表。任务管理接口按 `createdAt desc, id desc` 返回目标源数据；挑战页在业务排序键相同时保留该源顺序，并且不能把目标标题作为列表排序键。由于 API 源顺序可能和本地 temporary 目标插入顺序不同，前端在提交目标时保留一次性的邻居锚点；`POST` 成功返回的真实目标可以作为页面级临时覆盖层连续替换 temporary 目标，任务管理数据刷新包含同一目标后撤掉覆盖层，但排序锚点继续保留到用户切换筛选或目标业务排序键变化。创建失败时，前端回到目标标题编辑态并保留用户输入。

任务和子任务完成状态接口只表达执行进度写入，不触发指标验收、目标提交、结算或积分。前端可以在挑战页展示层使用短生命周期完成状态覆盖层即时反馈点击；后端返回的任务管理数据仍是完成状态的持久化事实源，刷新数据包含同一任务或子任务完成状态后前端撤销覆盖层。

任务和子任务写入权限统一从父级 `Objective` 解析：新增、改名、改状态、勾选、移动和删除都会先把任务或子任务解析到 `Task.linkedObjectiveId`，再校验当前用户 id 是否在该目标的 `Objective.challengerUserIds`；指挥官按管理员权限通过。`Task.assignee` 只是执行提示，`Task.createdBy` / `updatedBy` 只记录创建和最近维护人，不能用来阻止同一目标下其他正式挑战者维护任务或子任务。`Task.definitionContributorUserIds` 是行动项定义者头像展示的唯一事实源：创建行动项和修改行动项标题会把当前用户追加进去并去重，状态勾选、完成状态和排序移动只表达执行或编排状态，不把用户加入定义者集合。任务读模型基于该集合派生 `definitionContributorProfiles`，用于普通成员也能直接展示所有定义过行动项的用户头像；`createdByName` / `createdByAvatarUrl` 只是兼容审计投影，不参与头像列语义、权限或所有权判断。

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
| `projects`              | 轻量项目注册表；管理员读模型返回当前作用域项目，成员读模型只返回与可见目标或反馈相关的项目 |
| `objectives`            | 页面根节点，也是挑战对象；可携带可空 `projectId` 作为前端项目分组字段                     |
| `results`               | 目标下的指标                                                                              |
| `tasks`                 | 目标下的任务和子任务                                                                      |
| `evidence`              | 证据                                                                                      |
| `feedback`              | 团队级内部反馈 issue，可携带可空 `projectId`，不驱动悬赏状态机                            |
| `comments`              | 目标、指标、任务、子任务和反馈 issue 评论                                                 |
| `objectiveLoot`         | 结构化战利品提交记录                                                                      |
| `objectiveTrialReviews` | 目标试验收请求和指挥官反馈                                                                |
| `pointLedger`           | 结算后的成员积分流水                                                                      |
| `userProfiles`          | 当前读模型已公开引用到的成员展示投影，仅包含 `id`、`name`、`avatarUrl`，供头像栈、排行榜和普通业务页解析成员显示 |

任务管理读模型不返回 `permissionRules` 或完整 `users` 管理集合；当前用户权限由 `/api/me/access` 单独返回，邮箱、角色、状态、最近在线等成员管理字段仍只通过管理员接口返回。`userProfiles` 只服务于本次返回数据里已经出现的用户 ID 展示，不作为成员目录或权限事实源。ORF 读模型不返回匿名互评原始数据。新匿名互评原始数据、服务器草稿、提交历史和汇总计算只在共享结算服务中作为事实源；ORF 后端只认证、校验权限、按服务端事实补齐矩阵并代理请求，指挥官验收页通过代理读取最新明细，不写入 ORF 读模型。`pointLedger` 是公开积分结果，普通成员和管理员都可以读取；普通成员读模型只收敛目标、指标、战利品、评论等私有业务对象。

`PATCH /api/objectives/:objectiveId/publish` 是候选目标进入悬赏大厅的唯一发布动作，必须写入 `Objective.publishedAt`，并为当前作用域 active 用户创建 `objective.published` 系统通知；持久化通知遵守“触发人不接收自己消息”的原则。通知写入后，后端还会通过 `/api/events` 发送 `system.broadcast`，让当前作用域所有在线 active 用户即时看到横幅并刷新大厅。后续申请、征召、审核、重估、编辑和冻结只能更新对应业务字段或 `updatedAt`，不能覆盖 `publishedAt`。

`GET /api/bounties` 对所有已通过用户返回 `publicItems`，包含 `flowStatus in (open, applying, recruiting, reestimating, frozen, submitted, revisionRequired, accepted, settled)` 的公开大厅目标，不包含 `candidate` 和 `closed`。`publicItems` 是大厅公开生命周期主列表，必须带上 `applications`、`pendingApplications`、`approvedApplicants`、`assignedChallengers`、`challengers`、`isCurrentChallenger`、`hasCurrentApplication` 和目标的 `publishedAt`，用于公开展示申请理由、申请人、待响应征召成员、已通过挑战者头像、发布到大厅时间和后续冻结、验收、返工、结算阶段。`availableItems` 只表示当前仍可发起申请的目标；`recruitmentItems` 表示当前 active 普通成员自己待接受的征召。指挥官/管理员读取同一接口时仍能看到大厅目标；前端可以完整显示申请 / 接受操作入口，但所有申请 / 接受动作接口必须返回 403 或等价 forbidden，不能把管理员写入 `challengerUserIds`、`assignedChallengerUserIds` 或申请记录。

申请挑战只接受 active 普通成员在 `open/applying/recruiting/reestimating` 发起，且 body 必须包含 trim 后非空的 `reason`；`reestimating` 目标收到新申请后仍保持 `reestimating`，不能回退到 `applying`；申请通过或拒绝只接受 `applying/recruiting/reestimating`。目标进入 `frozen/submitted/revisionRequired/accepted/settled/closed` 后，即使旧数据仍有 pending 申请，审核接口也必须返回 409。冻结后补充人手只走加派接口；加派是指挥官执行期调度能力，不恢复公开申请、征召或接受流程。

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
  | "revisionRequired"
  | "accepted"
  | "settled"
  | "closed";
```

代码唯一事实源是 `src/domain/orfLifecycle/`。后端只调用其中的 guard 和 transition，不能在 repository、route 或页面模型里再维护独立的状态集合。

`Objective.stage` 只保留页面和既有数据化测试兼容，并由 `Objective.flowStatus` 唯一派生：`candidate` 对应 `goalSetting`，`open/applying/recruiting` 对应 `resultClaiming`，`reestimating` 对应 `orfReestimate`，`frozen/submitted/revisionRequired/accepted/settled/closed` 对应 `goalFrozen`。生产 transition 只写 `flowStatus`；数据库触发器覆盖任何直接传入的 `stage`，约束保证二者不能漂移。后端不提供单独改写 `stage` 或退回重估的旧入口。

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
  "error": "Anonymous contribution reviews must be submitted through the local settlement proxy"
}
```

新前端不调用该接口。普通成员页面只提交目标级 `0..100` 整数百分比 `allocations` 到 `/api/local-settlement/objectives/:objectiveId/reviews/submit`，输入到一半自动保存到 `/api/local-settlement/objectives/:objectiveId/reviews/draft`。ORF 后端按当前目标挑战者事实补齐成员展示名和稳定 `memberUserId` 后转发给共享结算服务。重新评价时，当前挑战者可通过 `/api/local-settlement/objectives/:objectiveId/reviews/me` 读取自己的服务器草稿和最新一版提交回填；历史逐指标旧提交只作为兼容明细展示，新提交不再产生 `metricRows`。

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
  "reason": "验收说明"
}
```

目标结果由 `resultReviews` 汇总：全部指标完成则 `Objective.acceptedResult=completed`。每次验收都写入 `objectiveAcceptanceReviews` 审计记录。验收通过时写入指标验收结果、目标验收结果、倍率和目标基础分，并将 `Objective.flowStatus` 改为 `accepted`；验收不通过时写入失败结论并将目标改为 `revisionRequired`，目标仍需继续完成后重新提交。

`POST /api/objectives/:objectiveId/settle` 请求体：

```json
{
  "lootId": "loot-1",
  "contributionResolution": {
    "ratios": [{ "member": "Kai Wang", "memberUserId": "usr-kai", "ratio": 1 }],
    "reason": "指挥官确认最终结算比例"
  },
  "reason": "目标结算"
}
```

共享结算服务计算当前匿名互评均值；ORF 后端通过同源代理读取提交状态、目标级原始评分、弃权说明、偏离提醒和默认比例。指挥官结算时通过 `contributionResolution` 提供确认后的比例和说明。`contributionResolution.ratios[].memberUserId` 对应 `users.id`，是积分归属事实源；`member` 只作为展示文本。单人目标也走同一结算事件，默认用 `100%` 比例确认。

结算后后端写入：

- `objectiveSettlementEvents`
- 追加式 `pointLedger`
- `pointLedger.settlementPeriodAt`，由该目标最后一条通过验收的 `objectiveAcceptanceReviews.reviewedAt` 派生，用于统计页月度、季度和年度归属；`pointLedger.createdAt` 仅表示写账时间
- `Objective.objectiveBasePoints`
- `Objective.objectiveSettlementPoints` 展示汇总
- 最终结算时写入 `Result.acceptedResult`、`Objective.acceptedResult`、`Objective.completionMultiplier` 并进入 `settled`

逾期惩罚结算通知和最终结算通知都只发给目标 `Objective.challengerUserIds` 中仍为 active 的相关成员。通知正文只说明结算事件和跳转位置，不携带匿名互评原始评分、比例矩阵或个人积分明细。

`Objective.objectiveBasePoints` 是目标基础分事实源，由指挥官直接设置为正整数。目标进入 `accepted` 并打开最终匿名互评后锁定目标分数；此前即使已冻结或已提交待验收，指挥官仍可修改。指标不再设置等级积分，`Result.uncertaintyLevel` / `Result.uncertaintyScore` 仅作为历史兼容字段保留，不参与新结算。

`Result.detail` 是指标详情唯一事实源。评论只保存讨论记录，不承载指标详情定义；战利品提交和验收读取同一个 `Result.detail` 字段作为只读上下文。

前端排行榜通过 `/api/reports-page` 读取 `ReportsPageData` 统计页公开读模型，管理员和普通成员使用同一口径。排行榜积分只读取公开 `pointLedger`，不自行计算个人贡献比例。月度、季度和年度范围按 `pointLedger.settlementPeriodAt` 判断，不能用互评结算完成或账本写入的 `pointLedger.createdAt`。完成率是 `src/domain/reportsLeaderboard` 的派生口径：以同一时间范围内有积分流水的成员-目标为统计对象，结合目标统计状态和最小验收结论判断。目标只要出现过 `objectiveAcceptanceReviews.acceptedResult = abandoned`，就代表截止验收未通过，该目标后续返工通过也不计入完成率已完成数。`/api/reports-page` 只返回目标统计状态、最小验收结论、公开积分流水和成员展示投影，不返回任务、评论、战利品正文、验收原因或匿名互评原始数据，也不构造完整 `TaskManagementData`。

## 权限约束

- 指挥官按管理员权限处理。
- 目标内容只能由指挥官修改。
- 指挥官可以编辑未冻结目标下指标。
- 挑战者只能在未过期 `reestimating` 状态提出、编辑或删除自己参与目标下的指标；超过 `confirmationDueAt` 或目标冻结后均不可调整。该指标维护能力不授予 `objective.delete`，挑战者不能删除目标。
- 反馈状态只能由管理员、反馈创建人或 `ownerUserId` 指定处理人更新；普通成员不能关闭或改写他人反馈状态。
- 反馈创建以当前默认团队作用域为边界；active 团队成员可以创建不绑定目标或指标的内部反馈，反馈事实只写入团队反馈 issue。
- 反馈 `ownerUserId` 必须是当前默认作用域内 `active` 成员；停用、待审核、拒绝或不存在的用户不能成为反馈处理人。
- 指标更新提案不接受 `feedbackId`，不会改写反馈状态；指标更新只影响结果和结果评论审计。
- 任务创建基于目标授权和排序，不要求关联指标，也不接受反馈来源；反馈不会被挂成任务来源。
- 任务和子任务维护权限以 `Objective.challengerUserIds` 为身份边界；同一目标正式挑战者可以共同新增、编辑、勾选、移动和删除目标下任务与子任务，旁观成员返回 403，指挥官/管理员可维护任意目标任务。
- `Task.assignee` 不表达所有权，`Task.createdBy` / `updatedBy` 只作为审计字段返回给前端和测试，不能参与维护授权判断；`Task.definitionContributorUserIds` 只表达谁定义过行动项，读模型派生的 `definitionContributorProfiles` 用于行动项定义者头像组展示。
- 任务 ID 必须使用带单调计数和 UUID 后缀的 `ORF-*` 形式；同一毫秒内的并发创建不能因为时间戳或伪随机数相同而撞主键。
- 重估覆盖指标口径和目标协作拆解。`reestimating` 阶段挑战者申请完成重估后，指挥官可以提前完成并冻结，也可以把该对齐申请标记为 `needsWork` 打回重估；到达 `Objective.confirmationDueAt` 后，后端调度器会按同一套冻结校验自动尝试冻结。目标至少已有一个指标后才能从 `reestimating` 进入 `frozen`；未满足时自动冻结会被阻断并保留 `reestimating`，等待补齐后重新走完成重估或下次调度。
- 冻结后不允许直接改指标口径。目标挑战者可以发起 `frozenReestimate` 对齐申请，申请必须填写理由；指挥官审批通过时必须设置新的 `confirmationDueAt`，该时间必须晚于当前时间且不能超过 `Objective.finalDueAt` 当日 23:59。审批通过后目标从 `frozen/goalFrozen` 回到 `reestimating/orfReestimate`，清空当前 `confirmedAt`，复用现有指标编辑权限和完成重估后再次冻结的状态链；申请记录保留申请理由和审批时的 `confirmationDueAt` 快照。目标进入 `submitted` 后，`objectiveLoot` 和 `Objective.lootSubmittedAt` 已成为正式提交事实，后端不得接受重新重估。目标基础分由指挥官直接编辑，在 `accepted` 前不因冻结或提交而锁定。
- 截止日期修改以 `Objective.finalDueAt` 为唯一输入；目标仍处于 `reestimating` 且日期实际变更时同步重算 `confirmationDueAt`，冻结后直接改截止日期只能延后，不会自动重新重估或修改 `confirmationDueAt`。重新重估必须走 `frozenReestimate` 对齐申请审批。
- 任务、子任务和评论允许在挑战协作中维护，但不自动推导验收或结算。
- 评论线程标题必须由后端根据真实目标、指标、任务或子任务解析；客户端提交的 `targetTitle` 只能作为兼容字段，不能覆盖真实标题。
- 评论回复的 `replyToMessageId` 必须属于同一评论线程，`replyToAuthor` 由后端用真实消息作者回填，不能信任客户端提交值。
- 删除评论消息时必须同步清理仍保留消息中的 `replyToMessageId` / `replyToAuthor`，不能留下指向已删除消息的断链回复。
- 并发给同一目标下的目标、指标、任务或子任务新增评论时，必须锁住目标后再查找或创建 open thread，避免同一目标生成多个打开中的根评论线程。
- `申请挑战` 只表达意愿，并必须保存申请理由；指挥官通过后才写入 `Objective.challengerUserIds`，通过后的目标仍在 `GET /api/bounties.publicItems` 中展示挑战者头像、剩余申请和后续生命周期状态。
- 多名成员同时申请同一目标时，后端必须用行级锁保护 `challengeApplications` 的读改写，不能让后一次写入覆盖前一次申请。
- 审批申请、征召和接受征召都会在同一行级锁事务内读改写 `Objective.challengerUserIds` / `Objective.assignedChallengerUserIds` / `Objective.challengeApplications`；生产仓储只写 ID 事实，显示名投影由数据库和 read model 统一派生。
- 并发新增或移动指标、任务、子任务时，后端必须锁住对应父级目标或任务后再计算 `sortOrder`，避免重复排序号导致页面顺序不稳定；任务排序父级是目标，不是指标。
- `征召挑战` 的成员必须是当前默认作用域内 `active` 用户；停用、待审核、拒绝或不存在的用户不能写入 `Objective.assignedChallengerUserIds`。
- `接受挑战` 只用于征召；当前不开放成员拒绝征召，有异议时线下找指挥官处理。
- `提交战利品` 仅允许目标挑战者在 `frozen` 或 `revisionRequired` 状态执行。
- `提交试验收` 仅允许目标挑战者在 `frozen` 状态执行一次；`试验收反馈` 仅允许指挥官在 `frozen` 状态处理，且不推进状态。
- `验收` 仅允许指挥官在 `submitted` 状态执行；验收通过后进入 `accepted`，验收不通过进入 `revisionRequired`。
- `结算` 允许指挥官在 `revisionRequired` 执行逾期惩罚结算，或在 `accepted` 执行最终结算；单人目标也必须走对应结算事件。
- `匿名互评` 只在当前结算事件窗口开放时允许提交：`revisionRequired` 必须已到截止日且尚未写入 `deadlinePenalty`，`accepted` 必须尚未写入 `finalCompletion`。
- 多挑战者目标结算优先使用匿名互评当前均值作为默认比例；缺评、弃权、分歧或申诉只提示指挥官，不阻塞结算。
- 匿名互评评分和指挥官最终确认的贡献比例必须是每个挑战者一项、范围 `0..1`、合计 `1` 的标准比例；后端不接受任意权重再静默归一化。
- 注册用户默认为 `pending`，只有 `active` 用户可访问业务 API。

## 任务与指标解耦迁移

任务已经从指标下移到目标下，后端契约如下：

- `Task.linkedObjectiveId` 是任务归属、权限、生命周期和排序边界。
- `Task.assignee` 是执行人提示，不是所有者；`Task.createdBy` / `updatedBy` 是审计信息，不改变同目标挑战者共同维护权限；`Task.definitionContributorUserIds` 只用于展示谁定义过该行动项。
- `Task.linkedResultId` 已从任务业务类型、DTO、写入路径和数据库表中移除。
- `Result.taskIds` 已从指标业务类型和 DTO 中移除；指标删除不能删除目标下任务。
- `POST /api/tasks` 应基于 `linkedObjectiveId` 创建任务；候选目标和没有指标的目标也可以创建任务。
- `PATCH /api/tasks/:taskId/move` 只在同一目标下移动任务，不能通过移动任务改变指标归属。
- 迁移 `0020_drop_task_result_ownership` 删除旧 `tasks.linked_result_id` 外键和列；迁移前必须已完成 `tasks.linked_objective_id` 回填。
- 后端启动时必须检查当前运行时数据库契约：`tasks.linked_objective_id` 和 `tasks.definition_contributor_user_ids` 必须非空，`tasks.linked_result_id` 不得存在。如果检查失败，先对当前 `DATABASE_URL` 执行 `npm run db:migrate`，不能让用户在创建行动项时才遇到通用 500。
