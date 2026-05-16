# ORF 我的挑战页面 - 后端

## 范围

本文档定义悬赏大厅、我的挑战、战利品验收、积分榜和注册审核所需的后端契约。流程规则见 [ORF 悬赏目标流程设计.md](../rules/ORF%20悬赏目标流程设计.md)。

当前产品明确不支持多团队。数据库保留 `team_id` 作为技术预留，但后端不提供团队切换或多团队聚合接口。

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/tasks-page` | 返回目标、指标、任务、评论、战利品、积分流水和权限 |
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
| `PATCH` | `/api/objectives/:objectiveId/challenge/decline` | 被征召成员拒绝 |
| `PATCH` | `/api/objectives/:objectiveId/freeze` | 指挥官完成重估并冻结，进入 `frozen` |
| `PATCH` | `/api/objectives/:objectiveId/reopen-reestimate` | 指挥官从冻结退回重估 |
| `POST` | `/api/objectives/:objectiveId/loot` | 挑战者提交结构化战利品，进入 `submitted` |
| `POST` | `/api/objectives/:objectiveId/review` | 指挥官验收并结算，进入 `settled` |
| `POST` | `/api/results` | 创建悬赏指标；`managerDefined` 需要指挥官或 `result.create` 权限，`memberProposed` 仅允许正式挑战者在未过期 `reestimating` 阶段创建 |
| `PATCH` | `/api/results/:resultId` | 更新悬赏指标；挑战者仅能在未过期 `reestimating` 调整自己目标下的指标 |
| `POST` | `/api/tasks` | 创建任务 |
| `PATCH` | `/api/tasks/:taskId` | 更新任务 |
| `POST` | `/api/tasks/:taskId/checklist` | 创建子任务 |
| `PATCH` | `/api/tasks/:taskId/checklist/:itemId` | 更新子任务勾选状态 |
| `GET` | `/api/users` | 管理员读取成员和注册状态 |
| `PATCH` | `/api/registration-requests/:userId/approve` | 通过注册申请 |
| `PATCH` | `/api/registration-requests/:userId/reject` | 拒绝注册申请 |
| `PATCH` | `/api/users/:userId/disable` | 停用用户 |

## 返回集合

`GET /api/tasks-page` 和 `GET /api/my-challenges` 返回：

| 集合 | 用途 |
| --- | --- |
| `objectives` | 页面根节点，也是挑战对象 |
| `results` | 目标下的悬赏指标 |
| `tasks` | 指标下的任务和子任务 |
| `evidence` | 证据 |
| `feedback` | 系统或团队反馈，不驱动悬赏状态机 |
| `comments` | 目标、指标、任务、子任务评论 |
| `objectiveLoot` | 结构化战利品提交记录 |
| `pointLedger` | 验收结算后的成员积分流水 |
| `permissionRules` | 前端操作权限 |

`GET /api/bounties` 只返回 `flowStatus in (open, applying, recruiting)` 且当前用户尚未成为挑战者的目标。

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

`Objective.stage` 只保留页面阶段兼容：`reestimating` 对应 `orfReestimate`，`frozen/submitted/settled` 对应 `goalFrozen`。

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
  "acceptedResult": "completed",
  "resultReviews": [
    { "resultId": "res-1", "acceptedResult": "completed" }
  ],
  "contributionRatios": [
    { "member": "Kai Wang", "ratio": 1 }
  ],
  "reason": "验收说明"
}
```

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
- 挑战者只能在未过期 `reestimating` 状态调整自己参与目标下的悬赏指标；超过 `confirmationDueAt` 或目标冻结后均不可调整。
- 任务、子任务和评论允许在挑战协作中维护，但不自动推导验收或结算。
- `申请挑战` 只表达意愿；指挥官通过后才写入 `Objective.challengers`。
- `接受挑战` 只用于征召。
- `提交战利品` 仅允许目标挑战者在 `frozen` 状态执行。
- `验收结算` 仅允许指挥官在 `submitted` 状态执行。
- 注册用户默认为 `pending`，只有 `active` 用户可访问业务 API。
