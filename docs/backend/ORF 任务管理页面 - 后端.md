# ORF 挑战页面 - 后端

## 接口访问约定

前端数据统一通过同源 `/api` 请求后端接口，例如 `/api/tasks`。
前端不直接写死后端域名或端口，开发和生产环境由代理或网关转发到实际后端服务。

本文档记录挑战页需要的后端数据契约：原始字段、枚举值和对象关系。

前端布局、UI 状态和视觉规则见 [ORF 挑战页面 - 前端.md](../frontend/ORF%20挑战页面%20-%20前端.md)。

目标进度条业务计算规则见 [目标进度条计算规则.md](./目标进度条计算规则.md)。

提交战利品契约见 [ORF 提交战利品 - 后端.md](./ORF%20提交战利品%20-%20后端.md)。

## 0. 技术选型

后端实现默认采用以下技术栈：

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 语言 | TypeScript | 与前端共享字段、枚举和类型语义，减少契约漂移。 |
| HTTP 框架 | Fastify | 轻量、性能稳定，适合 API 服务。 |
| 数据库 | PostgreSQL | 支持关系建模、事务、索引和后续权限查询。 |
| ORM / Query Builder | Drizzle | 类型安全、贴近 SQL，便于复杂筛选、聚合和权限条件控制。 |
| 请求校验 | Zod | 用于 API 入参、出参和共享 schema 校验。 |
| 后台任务 | Python worker 或 Node worker | AI 评估、报告生成、数据分析等任务按需求再定。 |

后续后端代码、迁移和 API 设计先按这套选型推进。

权限管理预留要求：

- 主要业务表从一开始预留 `team_id`、`created_by`、`updated_by`。
- 悬赏指标、任务等对象后续可扩展 `visibility` 或对象级权限表；目标不设置责任人语义。
- 查询层必须保留统一注入权限条件的空间，不能把权限判断散落在页面逻辑里。
- 产品文案中的“指挥官”不作为独立权限角色；后端权限校验按 `admin` / 管理员处理。
- 拖拽调整位置或父对象按编辑处理：对象 `id` 不变。
- 删除需要独立权限；删除有下级的对象时，后端必须校验对象关系。

权限管理建议分阶段实现：

1. 团队隔离：用户只能访问当前团队数据。
2. 角色权限：管理员、成员、只读等角色；指挥官动作复用管理员权限。
3. 对象权限：目标、悬赏指标、任务级别的可见 / 可编辑 / 可审批。
4. 审计日志：记录状态变更、悬赏指标调整、目标确认等关键操作。

## 0.1 本地环境命令

本地 `.env` 默认使用团队远程数据库配置。数据库配置从 `orf-team-database-config-20260506.zip` 解压得到，证书文件放在项目根目录 `certs/orf-postgres-root.crt`。

```text
DATABASE_URL=postgresql://orf_project_user:<password>@182.150.118.137:54321/orf?sslmode=verify-full&sslrootcert=./certs/orf-postgres-root.crt&options=-csearch_path%3Dorf_current%2Cpublic
SERVER_HOST=0.0.0.0
SERVER_PORT=8787
CORS_ORIGIN=http://localhost:5173
```

常用命令：

| 命令 | 作用 |
| --- | --- |
| `node scripts/verify-db.mjs` | 验证团队远程数据库连接、当前 schema 和 DDL 权限。 |
| `npm run db:local` | 启动本地 Docker PostgreSQL，监听 `127.0.0.1:54322`；默认团队数据库配置下不是必须依赖。 |
| `npm run db:generate` | 根据 Drizzle schema 生成 SQL migration。 |
| `npm run db:migrate` | 将 migration 应用到 `DATABASE_URL`；迁移记录写入当前 schema 的 `__drizzle_migrations`。 |
| `npm run db:seed` | 将初始 ORF 数据写入数据库。 |
| `npm run ory:dev` | 启动 Ory Kratos，数据库连接只读取 `.env`。 |
| `npm run server:dev` | 以 watch 模式启动后端。 |
| `npm run server:start` | 启动后端服务。 |

当前后端默认监听 `http://127.0.0.1:8787`。

## 0.2 当前 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/health` | 服务健康检查。 |
| `GET` | `/api/tasks-page` | 返回挑战页需要的 `objectives`、`results`、`tasks`、`evidence`、`feedback`、`permissionRules`、`automaticCompletions`。 |
| `GET` | `/api/orf-state` | 返回 ORF 状态快照。 |
| `POST` | `/api/results` | 创建悬赏指标。 |
| TODO | `/api/result-candidates` | 成员提交候选悬赏指标。 |
| TODO | `/api/result-candidates/:candidateId/adopt` | 指挥官采纳候选悬赏指标，并发布到悬赏大厅；接口需管理员权限。 |
| `PATCH` | `/api/results/:resultId/challenge` | 接受优先挑战或征召，写入当前挑战者并进入确认期。 |
| `PATCH` | `/api/results/:resultId/priority-decline` | 提出人放弃优先挑战权，悬赏指标进入公共池。 |
| `POST` | `/api/results/:resultId/challenge-applications` | 其他成员申请挑战公共池中的悬赏指标。 |
| TODO | `/api/results/:resultId/challenge-applications/:applicationId/approve` | 指挥官确认挑战者；接口需管理员权限。 |
| `POST` | `/api/tasks` | 创建任务。 |
| `POST` | `/api/tasks/:taskId/checklist` | 创建子任务。 |
| `PATCH` | `/api/objectives/:objectiveId` | 更新目标标题，body: `{ "title": "..." }`。 |
| `PATCH` | `/api/objectives/:objectiveId/stage` | 更新目标阶段，body: `{ "stage": "goalFrozen" }`。 |
| `PATCH` | `/api/results/:resultId` | 更新悬赏指标标题，body: `{ "title": "..." }`。 |
| `PATCH` | `/api/tasks/:taskId` | 更新任务标题，body: `{ "title": "..." }`。 |
| `PATCH` | `/api/tasks/:taskId/status` | 更新任务原始状态，body: `{ "status": "Todo" }`。 |
| `PATCH` | `/api/tasks/:taskId/completion` | 设置任务完成状态，body: `{ "done": true }`。 |
| TODO | `/api/tasks/:taskId/archive` | 归档任务；归档不是删除，任务与悬赏指标的关联仍保留，默认挑战树查询隐藏归档任务。 |
| `PATCH` | `/api/tasks/:taskId/checklist/:itemId` | 设置子任务完成状态，body: `{ "done": true }`。 |
| `PATCH` | `/api/tasks/:taskId/checklist/:itemId/label` | 更新子任务标题，body: `{ "label": "..." }`。 |
| `PATCH` | `/api/results/:resultId/order` | 调整同一目标下的悬赏指标顺序。 |
| `PATCH` | `/api/tasks/:taskId/move` | 调整任务所属悬赏指标或同级顺序。 |
| `PATCH` | `/api/tasks/:taskId/checklist/:itemId/move` | 调整子任务所属任务或同级顺序。 |
| `DELETE` | `/api/objectives/:objectiveId` | 删除目标及其下级对象。 |
| `DELETE` | `/api/results/:resultId` | 删除悬赏指标及其下级对象。 |
| `DELETE` | `/api/tasks/:taskId` | 删除任务及其子任务。 |
| `DELETE` | `/api/tasks/:taskId/checklist/:itemId` | 删除子任务。 |

## 1. 返回集合

挑战页当前需要以下集合：

| 集合 | 类型 | 用途 |
| --- | --- | --- |
| `objectives` | `Objective[]` | 页面根节点。 |
| `results` | `Result[]` | 目标下的悬赏指标节点。 |
| `tasks` | `Task[]` | 悬赏指标下的任务节点。 |
| `evidence` | `Evidence[]` | 用于计算悬赏指标最近更新时间。 |
| `feedback` | `Feedback[]` | 用于计算悬赏指标最近更新时间。 |
| `permissionRules` | `PermissionRule[]` | 前端控制当前阶段下的操作入口。 |
| `automaticCompletions` | `Record<string, AutomaticCompletionResult>` | 后端自动化计算结果，仅目标冻结阶段返回对应目标结果。 |

## 2. 对象关系

固定层级：

```text
Objective
└─ Result
   └─ Task
      └─ TaskChecklistItem
```

关系字段：

- `Objective.resultIds[]` 指向目标下的 `Result.id`。
- `Result.objectiveId` 指向所属 `Objective.id`。
- `Task.linkedObjectiveId` 指向所属 `Objective.id`。
- `Task.linkedResultId` 指向所属 `Result.id`。
- `Task.checklist[]` 是任务的子任务列表。
- `Evidence.linkedResultId` 指向相关 `Result.id`。
- `Feedback.linkedResultId` 指向相关 `Result.id`。

## 3. 枚举

### `WorkStatus`

用于目标、悬赏指标、反馈相关对象的工作状态。

```ts
type WorkStatus = "On Track" | "At Risk" | "Blocked" | "Draft";
```

挑战页用法：

- `Objective.status` 用于目标风险标签，前端展示为正常 / 有风险。
- `Result.status` 是后端原始状态；挑战页的悬赏指标展示状态由前端 `indicatorStatus(result, automaticCompletion)` 映射，不直接等同于 `Result.status`。

### `TaskStatus`

用于任务原始状态。

```ts
type TaskStatus = "Backlog" | "Todo" | "In Progress" | "In Review" | "Done";
```

挑战页会将其归一化成：

- 待办：`Backlog` / `Todo`
- 进行中：`In Progress` / `In Review`
- 已完成：`Done`

### `MetricDirection`

用于悬赏指标进度计算。

```ts
type MetricDirection = "increase" | "decrease";
```

### `UncertaintyLevel`

用于悬赏指标的不确定性等级，也是积分计算的不确定性分来源。

```ts
type UncertaintyLevel = "入门" | "进阶" | "破局" | "渡劫" | "飞升";
```

对应不确定性分和判断标准：

| 等级 | 不确定性分 | 判断标准 |
| --- | ---: | --- |
| 入门 | 10 | 路径非常清楚，有现成方案可以参考。大部分悬赏指标的不确定性分默认为 10。 |
| 进阶 | 30 | 方向清楚，有成熟参考方案，不需要创造新方法。但复杂度明显更高。 |
| 破局 | 90 | 没有现成答案，需要定义新的判断标准、评估口径、业务规则或验证方法，并通过实际数据证明可行。 |
| 渡劫 | 270 | 关键假设本身不确定，可能推翻原目标；需要跨业务、数据、模型、产品多方验证，失败概率高。 |
| 飞升 | 810 | 需要形成行业级、平台级或方法论级突破，完成后显著改变现有能力边界。 |

## 4. 字段契约

### `Objective`

挑战页使用字段：

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `id` | `string` | 目标唯一标识。 |
| `title` | `string` | 目标标题。 |
| `stage` | `OrfStage` | 目标当前阶段。 |
| `status` | `WorkStatus` | 目标风险标签数据源。 |
| `resultIds` | `string[]` | 查找目标下悬赏指标。 |
| `progress` | `number` | 后端计算后的目标进度，前端只负责展示。 |
| `updatedAt` | `string` | 计算复盘日期兜底值。 |

目标行不展示责任人；目标行头像组来自目标下可见悬赏指标的 `Result.owner`。

### `Result`

挑战页使用字段：

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `id` | `string` | 悬赏指标唯一标识。 |
| `objectiveId` | `string` | 关联目标。 |
| `title` | `string` | 悬赏指标标题。 |
| `owner` | `string` | 当前挑战者；一个悬赏指标最多一个挑战者。 |
| `status` | `WorkStatus` | 后端原始状态。 |
| `source` | `"managerDefined" \| "memberProposed"` | 悬赏指标来源。 |
| `definer` | `string` | 悬赏指标定义人；用于悬赏指标定义分归属。 |
| `finalDueAt` | `string` | 指挥官设置的悬赏指标最终截止时间；大厅剩余时间、排序和确认期计算都以它为准。 |
| `assignedChallenger` | `string \| null` | 指挥官指定的待接受挑战者；接受挑战后写入 `owner`。 |
| `acceptedAt` | `string \| null` | 挑战者接受挑战时间，用于计算确认期。 |
| `confirmationDueAt` | `string \| null` | 悬赏指标确认截止时间。 |
| `confirmedAt` | `string \| null` | 悬赏指标冻结确认时间。 |
| `priorityChallengeExpiresAt` | `string \| null` | 成员提出的候选悬赏指标被采纳后，提出人 2 小时优先挑战权的过期时间。 |
| `priorityDeclinedBy` | `string[]` | 放弃优先挑战权的提出人列表；放弃后不得再次挑战同一悬赏指标。 |
| `challengeApplications` | `ChallengeApplication[]` | 成员申请挑战记录；申请不写入 `owner`。 |
| `uncertaintyLevel` | `UncertaintyLevel` | 悬赏指标不确定性等级；结算积分按不确定性分 × 完成系数计算。 |
| `baseline` | `number` | 悬赏指标进度计算。 |
| `current` | `number` | 悬赏指标进度计算。 |
| `target` | `number` | 悬赏指标进度计算。 |
| `unit` | `string` | 悬赏指标值展示单位。 |
| `direction` | `MetricDirection` | 悬赏指标进度计算方向。 |

`Result.owner` 只表示已接受挑战的挑战者，是挑战页个人视图过滤的来源；目标不使用责任人语义，征召中待接受的人使用 `assignedChallenger`。

`Result.uncertaintyLevel` 是唯一评级字段。

确认期计算：

```text
剩余时间 = finalDueAt - acceptedAt
原始确认期 = 剩余时间 × 30%
确认期 = clamp(roundToHalfDay(原始确认期), 0.5 天, 9 天)
confirmationDueAt = acceptedAt + 确认期
```

如果 `finalDueAt - acceptedAt < 0.5 天`，后端不得开始挑战，必须要求指挥官延长最终截止时间或关闭悬赏指标；该操作按管理员权限校验。

### `Task`

挑战页使用字段：

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `id` | `string` | 任务唯一标识。 |
| `title` | `string` | 任务标题。 |
| `status` | `TaskStatus` | 任务展示状态和任务完成状态计算。 |
| `linkedObjectiveId` | `string` | 关联目标。 |
| `linkedResultId` | `string` | 关联悬赏指标。 |
| `dueDate` | `string` | 任务自身截止时间。 |
| `updatedAt` | `string` | 任务行日期和悬赏指标最近更新时间来源。 |
| TODO: `archivedAt` | `string \| null` | 任务归档时间；有值表示任务已归档。归档任务默认从挑战树隐藏，但 `linkedResultId` 不变。 |
| `checklist` | `TaskChecklistItem[]` | 子任务列表。 |

`Task.dueDate` 不替代 `Result.finalDueAt`。`Task.assignee` 可以存在于数据模型中，但挑战页不展示任务执行人，也不使用任务执行人作为个人视图过滤条件。

### `TaskChecklistItem`

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `id` | `string` | 子任务唯一标识。 |
| `label` | `string` | 子任务标题。 |
| `done` | `boolean` | 子任务完成状态。 |
| `updatedAt` | `string` | 子任务最近更新时间。 |

### `Evidence`

挑战页使用字段：

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `linkedResultId` | `string` | 关联悬赏指标。 |
| `date` | `string` | 悬赏指标最近更新时间候选值。 |

### `Feedback`

挑战页使用字段：

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `linkedResultId` | `string` | 关联悬赏指标。 |
| `updatedAt` | `string` | 悬赏指标最近更新时间候选值。 |

## 5. 后端与前端职责边界

后端负责返回目标进度字段：

- `Objective.progress`
- `automaticCompletions`

目标进度业务计算规则见 [目标进度条计算规则.md](./目标进度条计算规则.md)。

后端负责自动化完成的业务计算，前端只把计算结果映射成 UI 状态。

后端不需要返回以下纯展示结果：

- `indicatorStatus(result, automaticCompletion)`
- `taskDisplayStatus(task)`
- `subtaskDisplayStatus(...)`
- `indicatorWorkProgress(...)`
- `taskWorkProgress(...)`
- 树形线条位置、图标颜色、状态标签样式。

这些展示逻辑由前端根据后端字段计算和展示。

## 6. 交互业务约束

前端负责操作入口和 UI 状态；后端负责数据约束、权限校验和关系一致性。

| 操作 | 后端约束 |
| --- | --- |
| 拖拽目标 | 不支持拖拽目标。 |
| 拖拽悬赏指标 | 悬赏指标只能在同一目标内排序。 |
| 拖拽任务 | 任务可在同一悬赏指标内排序，也可移动到其他悬赏指标下。 |
| 拖拽子任务 | 子任务可在同一任务内排序，也可移动到其他任务下。 |
| 拖拽转换 | 不允许悬赏指标、任务、子任务之间互相转换。 |
| 拖拽身份 | 拖拽是编辑操作，不是删除后重建；对象 `id` 不变。 |
| 拖拽关联 | 拖拽后评论、历史记录和完成状态保留。 |
| TODO: 归档任务 | 归档是隐藏操作，不是删除操作；归档后任务 `id`、评论、历史记录、完成状态、`linkedObjectiveId` 和 `linkedResultId` 都必须保留。 |
| TODO: 归档查询 | `/api/tasks-page` 默认不返回已归档任务；后续若提供归档视图，应通过显式筛选参数返回。 |
| 删除目标 | 删除目标会影响其下悬赏指标、任务和子任务。 |
| 删除悬赏指标 | 删除悬赏指标会影响其下任务和子任务。 |
| 删除任务 | 删除任务会影响其下子任务。 |
| 删除子任务 | 只删除当前子任务。 |
| 删除确认数量 | 后端按真实对象关系计算受影响下级数量，前端只展示。 |
| 权限校验 | 创建、编辑、删除、拖拽都必须按当前用户权限校验。 |
