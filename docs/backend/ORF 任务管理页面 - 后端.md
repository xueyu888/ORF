# ORF 我的挑战页面 - 后端

## 范围

本文档定义悬赏大厅和我的挑战所需的后端契约。流程规则见 [ORF 悬赏目标流程设计.md](../rules/ORF%20悬赏目标流程设计.md)。

## 技术选型

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 语言 | TypeScript | 与前端共享类型语义 |
| HTTP 框架 | Fastify | 当前后端服务框架 |
| 数据库 | PostgreSQL | 业务数据唯一事实源 |
| ORM | Drizzle | schema、migration 和类型安全查询 |
| 入参校验 | Zod | API 请求和响应结构校验 |
| 后台任务 | Node worker / Python worker | AI 评估、报告生成和数据分析按需求接入 |

后端实现必须保留：

- 业务表预留 `team_id`、`created_by`、`updated_by`。
- 查询层统一注入权限条件。
- 产品文案中的“指挥官”按管理员权限校验。
- 拖拽、删除、确认挑战者、征召、验收和结算都在后端校验权限。
- 删除有下级的对象时，后端按真实对象关系计算影响范围。

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
| TODO | `/api/objectives/:objectiveId/review` | 验收目标，写入指标验收结果和目标结算字段 |
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

## 积分结算职责

完整规则见 [积分结算规则.md](../rules/积分结算规则.md) 和 [贡献评价与积分分配规则.md](../rules/贡献评价与积分分配规则.md)。

后端负责计算并返回目标级积分字段：

```text
objectiveBasePoints =
  sum(result.uncertaintyScore)
  where result.acceptedResult in (completed, falsified)

objectiveSettlementPoints =
  objectiveBasePoints × objective.completionMultiplier
```

个人积分在目标结算后计算：

```text
memberSettlementPoints =
  objectiveSettlementPoints × contributionRatio(member)

memberPoints =
  memberSettlementPoints
  + definitionPoints for accepted result definitions by member
```

结算约束：

- `Result` 只提供目标总分来源，不直接分配给个人。
- `Objective.challengers` 是目标级互评和个人积分分配范围。
- 按时或延期只看 `Objective.lootSubmittedAt` 和 `Objective.finalDueAt`。
- 悬赏指标定义分固定为 2 分，由后端根据 `Result.definer` 和 `Result.acceptedResult` 归属。
- 前端只展示后端返回的结算字段，不自行计算个人贡献比例。

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
| `objectiveBasePoints` | `number` | 目标总分 |
| `objectiveSettlementPoints` | `number \| null` | 目标结算积分 |

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
| `uncertaintyScore` | `number` | 不确定性分 |
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
- `申请挑战` 和 `接受挑战` 仅在目标未关闭、未提交战利品、未验收、未结算时允许。
- `提交战利品` 仅允许 `Objective.challengers` 中的成员执行；目标已关闭、已提交、已验收或已结算时拒绝。
- 任务和子任务勾选状态不推导目标完成、指标完成或积分结算。
- `Objective.progress` 由后端维护，规则见 [目标进度条计算规则.md](./目标进度条计算规则.md)。
- 创建、编辑、删除、拖拽、确认挑战者、征召、验收和结算都必须校验权限。
- 拖拽不改变对象 `id`。
- 指标只能在同一目标内排序。
- 任务和子任务可在允许范围内移动，但不能转换对象类型。
- 删除有下级的对象时，后端必须按真实关系计算影响范围。
