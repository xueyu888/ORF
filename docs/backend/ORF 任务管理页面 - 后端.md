# ORF 我的挑战页面 - 后端

## 范围

本文档定义悬赏大厅和我的挑战所需的后端契约。流程规则见 [ORF 悬赏目标流程设计.md](../rules/ORF%20悬赏目标流程设计.md)。

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/tasks-page` | 返回目标、指标、任务、评论、权限等页面数据 |
| `POST` | `/api/objectives` | 创建悬赏目标 |
| `PATCH` | `/api/objectives/:objectiveId` | 更新目标 |
| `PATCH` | `/api/objectives/:objectiveId/stage` | 更新目标阶段 |
| `POST` | `/api/objectives/:objectiveId/challenge-applications` | 申请加入目标挑战 |
| TODO | `/api/objectives/:objectiveId/challenge-applications/:applicationId/approve` | 确认挑战者 |
| `PATCH` | `/api/objectives/:objectiveId/challenge` | 接受确认或征召，写入挑战者 |
| `POST` | `/api/objectives/:objectiveId/loot` | 提交目标战利品 |
| `POST` | `/api/results` | 创建悬赏指标 |
| `PATCH` | `/api/results/:resultId` | 更新悬赏指标 |
| `POST` | `/api/tasks` | 创建任务 |
| `PATCH` | `/api/tasks/:taskId` | 更新任务 |
| `PATCH` | `/api/tasks/:taskId/completion` | 更新任务勾选状态，仅表示执行进度 |
| `POST` | `/api/tasks/:taskId/checklist` | 创建子任务 |
| `PATCH` | `/api/tasks/:taskId/checklist/:itemId` | 更新子任务勾选状态，仅表示执行进度 |
| `PATCH` | `/api/results/:resultId/order` | 调整同一目标下的指标顺序 |
| `PATCH` | `/api/tasks/:taskId/move` | 移动任务 |
| `PATCH` | `/api/tasks/:taskId/checklist/:itemId/move` | 移动子任务 |
| `DELETE` | `/api/objectives/:objectiveId` | 删除目标及下级对象 |
| `DELETE` | `/api/results/:resultId` | 删除指标及下级对象 |
| `DELETE` | `/api/tasks/:taskId` | 删除任务及子任务 |
| `DELETE` | `/api/tasks/:taskId/checklist/:itemId` | 删除子任务 |

已删除接口：

| 路径 | 原因 |
| --- | --- |
| `/api/results/:resultId/challenge` | 挑战者不绑定指标 |
| `/api/results/:resultId/challenge-applications` | 申请挑战在目标层级 |
| `/api/results/:resultId/priority-decline` | 候选指标优先规则未定 |
| `/api/results/:resultId/loot` | 战利品提交在目标层级 |

## 返回集合

`GET /api/tasks-page` 返回：

| 集合 | 用途 |
| --- | --- |
| `objectives` | 页面根节点，也是挑战对象 |
| `results` | 目标下的悬赏指标 |
| `tasks` | 指标下的任务 |
| `evidence` | 证据和更新时间 |
| `feedback` | 反馈和更新时间 |
| `comments` | 评论和战利品说明 |
| `permissionRules` | 前端操作权限 |

后端不返回任务推导完成结果。

## 对象关系

```text
Objective
└─ Result
   └─ Task
      └─ TaskChecklistItem
```

关键关系：

- `Objective.resultIds[] -> Result.id`
- `Result.objectiveId -> Objective.id`
- `Task.linkedObjectiveId -> Objective.id`
- `Task.linkedResultId -> Result.id`
- `Task.checklist[] -> TaskChecklistItem[]`

挑战、征召、申请、确认期字段只存在于 `Objective`。

## 枚举

```ts
type WorkStatus = "On Track" | "At Risk" | "Blocked" | "Draft";
type TaskStatus = "Backlog" | "Todo" | "In Progress" | "In Review" | "Done";
type MetricDirection = "increase" | "decrease";
type UncertaintyLevel = "入门" | "进阶" | "破局" | "渡劫" | "飞升";
```

`TaskStatus` 只表示执行进度，不触发验收或结算。

## 字段契约

### `Objective`

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `id` | `string` | 目标 ID |
| `title` | `string` | 标题 |
| `stage` | `OrfStage` | 阶段 |
| `status` | `WorkStatus` | 风险状态 |
| `resultIds` | `string[]` | 下级指标 |
| `progress` | `number` | 后端维护的目标进度 |
| `finalDueAt` | `string` | 目标截止时间 |
| `challengers` | `string[]` | 目标挑战者；我的挑战过滤和互评范围 |
| `assignedChallengers` | `string[]` | 待接受征召成员 |
| `challengeApplications` | `ChallengeApplication[]` | 申请记录 |
| `acceptedAt` | `string \| null` | 接受挑战时间 |
| `confirmationDueAt` | `string \| null` | 确认期截止 |
| `confirmedAt` | `string \| null` | 冻结时间 |
| `lootSubmittedAt` | `string \| null` | 战利品提交时间 |
| `acceptedResult` | `"completed" \| "falsified" \| "overturned" \| "abandoned" \| "overdelivered" \| null` | 目标验收结果 |
| `completionMultiplier` | `number \| null` | 完成系数 |

### `Result`

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `id` | `string` | 指标 ID |
| `objectiveId` | `string` | 所属目标 |
| `title` | `string` | 标题 |
| `status` | `WorkStatus` | 原始状态 |
| `source` | `"managerDefined" \| "memberProposed"` | 来源 |
| `definer` | `string` | 定义分归属 |
| `uncertaintyLevel` | `UncertaintyLevel` | 目标总分来源 |
| `baseline` / `current` / `target` | `number` | 指标进度展示 |
| `unit` | `string` | 单位 |
| `direction` | `MetricDirection` | 进度方向 |
| `acceptedResult` | `"unreviewed" \| "completed" \| "falsified" \| "failed"` | 指标验收结果 |

`Result` 不承载挑战者、征召、申请、确认期或优先挑战字段。

### `Task`

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `id` | `string` | 任务 ID |
| `title` | `string` | 标题 |
| `status` | `TaskStatus` | 执行状态 |
| `linkedObjectiveId` | `string` | 所属目标 |
| `linkedResultId` | `string` | 所属指标 |
| `dueDate` | `string` | 任务截止时间 |
| `updatedAt` | `string` | 更新时间 |
| TODO: `archivedAt` | `string \| null` | 归档时间 |
| `checklist` | `TaskChecklistItem[]` | 子任务 |

任务执行人可以存在于数据模型中，但不作为我的挑战过滤条件。

### `TaskChecklistItem`

| 字段 | 类型 |
| --- | --- |
| `id` | `string` |
| `label` | `string` |
| `done` | `boolean` |
| `updatedAt` | `string` |

## 约束

- 我的挑战过滤：`currentUser in Objective.challengers`。
- 任务和子任务勾选状态不推导目标完成、指标完成或积分结算。
- `Objective.progress` 由后端维护，规则见 [目标进度条计算规则.md](./目标进度条计算规则.md)。
- 创建、编辑、删除、拖拽、确认挑战者、征召、验收和结算都必须校验权限。
- 拖拽不改变对象 `id`。
- 指标只能在同一目标内排序。
- 任务和子任务可在允许范围内移动，但不能转换对象类型。
- 删除有下级的对象时，后端必须按真实关系计算影响范围。
