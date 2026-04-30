# ORF 任务管理页面 - 后端

本文档只记录任务管理页需要的后端数据契约：原始字段、枚举值和对象关系。

前端布局、派生状态、进度计算和视觉规则见 [ORF 任务管理页面 - 前端.md](./ORF%20任务管理页面%20-%20前端.md)。

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
- 目标、指标、任务等对象后续可扩展 `owner_user_id`、`visibility` 或对象级权限表。
- 查询层必须保留统一注入权限条件的空间，不能把权限判断散落在页面逻辑里。

权限管理建议分阶段实现：

1. 团队隔离：用户只能访问当前团队数据。
2. 角色权限：管理员、成员、只读、主管等角色。
3. 对象权限：目标、指标、任务级别的可见 / 可编辑 / 可审批。
4. 审计日志：记录状态变更、指标调整、目标确认等关键操作。

## 0.1 本地环境命令

本地 `.env` 需要包含：

```text
DATABASE_URL=postgresql://postgres:postgre@127.0.0.1:5432/mydb
BACKTEST_DB_URL=postgresql://postgres:postgre@127.0.0.1:5432/stock_backtest
SERVER_HOST=0.0.0.0
SERVER_PORT=8787
CORS_ORIGIN=http://localhost:5173
```

常用命令：

| 命令 | 作用 |
| --- | --- |
| `npm run db:generate` | 根据 Drizzle schema 生成 SQL migration。 |
| `npm run db:migrate` | 将 migration 应用到 `DATABASE_URL`。 |
| `npm run db:seed` | 将当前 mock ORF 数据写入数据库。 |
| `npm run server:dev` | 以 watch 模式启动后端。 |
| `npm run server:start` | 启动后端服务。 |

当前后端默认监听 `http://127.0.0.1:8787`。

## 0.2 当前 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/health` | 服务健康检查。 |
| `GET` | `/api/tasks-page` | 返回任务管理页需要的 `objectives`、`results`、`tasks`、`evidence`、`feedback`。 |
| `GET` | `/api/orf-state` | 返回兼容当前前端 mock 结构的 ORF 状态快照。 |
| `PATCH` | `/api/tasks/:taskId/status` | 更新任务原始状态，body: `{ "status": "Todo" }`。 |
| `PATCH` | `/api/tasks/:taskId/completion` | 设置任务完成状态，body: `{ "done": true }`。 |
| `PATCH` | `/api/tasks/:taskId/checklist/:itemId` | 设置子任务完成状态，body: `{ "done": true }`。 |

## 1. 返回集合

任务管理页当前需要以下集合：

| 集合 | 类型 | 用途 |
| --- | --- | --- |
| `objectives` | `Objective[]` | 页面根节点。 |
| `results` | `Result[]` | 目标下的指标节点。 |
| `tasks` | `Task[]` | 指标下的任务节点。 |
| `evidence` | `Evidence[]` | 用于计算指标最近更新时间。 |
| `feedback` | `Feedback[]` | 用于计算指标最近更新时间。 |

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

用于目标、指标、反馈相关对象的工作状态。

```ts
type WorkStatus = "On Track" | "At Risk" | "Blocked" | "Draft";
```

任务管理页用法：

- `Objective.status` 用于目标风险标签，前端展示为正常 / 有风险。
- `Result.status` 是后端原始状态；任务管理页的指标展示状态由前端 `indicatorStatus(result, tasks)` 派生，不直接等同于 `Result.status`。

### `TaskStatus`

用于任务原始状态。

```ts
type TaskStatus = "Backlog" | "Todo" | "In Progress" | "In Review" | "Done";
```

任务管理页会将其归一化成：

- 待办：`Backlog` / `Todo`
- 进行中：`In Progress` / `In Review`
- 已完成：`Done`

### `MetricDirection`

用于指标进度计算。

```ts
type MetricDirection = "increase" | "decrease";
```

## 4. 字段契约

### `Objective`

任务管理页使用字段：

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `id` | `string` | 目标唯一标识。 |
| `title` | `string` | 目标标题。 |
| `status` | `WorkStatus` | 目标风险标签数据源。 |
| `resultIds` | `string[]` | 查找目标下指标。 |
| `updatedAt` | `string` | 计算复盘日期兜底值。 |

目标行不依赖 `Objective.owner` 展示负责人；目标行头像组来自目标下可见指标的 `Result.owner`。

### `Result`

任务管理页使用字段：

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `id` | `string` | 指标唯一标识。 |
| `objectiveId` | `string` | 关联目标。 |
| `title` | `string` | 指标标题。 |
| `owner` | `string` | 指标负责人；一个指标只允许一个负责人。 |
| `status` | `WorkStatus` | 后端原始状态。 |
| `baseline` | `number` | 指标进度计算。 |
| `current` | `number` | 指标进度计算。 |
| `target` | `number` | 指标进度计算。 |
| `unit` | `string` | 指标值展示单位。 |
| `direction` | `MetricDirection` | 指标进度计算方向。 |

`Result.owner` 是任务管理页负责人展示和个人视图过滤的来源。

### `Task`

任务管理页使用字段：

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `id` | `string` | 任务唯一标识。 |
| `title` | `string` | 任务标题。 |
| `status` | `TaskStatus` | 任务展示状态和任务完成状态计算。 |
| `linkedObjectiveId` | `string` | 关联目标。 |
| `linkedResultId` | `string` | 关联指标。 |
| `dueDate` | `string` | 目标行日期优先来源。 |
| `updatedAt` | `string` | 任务行日期和指标最近更新时间来源。 |
| `checklist` | `TaskChecklistItem[]` | 子任务列表。 |

`Task.assignee` 可以存在于数据模型中，但任务管理页不展示任务负责人，也不使用任务负责人作为个人视图过滤条件。

### `TaskChecklistItem`

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `id` | `string` | 子任务唯一标识。 |
| `label` | `string` | 子任务标题。 |
| `done` | `boolean` | 子任务完成状态。 |
| `updatedAt` | `string` | 子任务最近更新时间。 |

### `Evidence`

任务管理页使用字段：

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `linkedResultId` | `string` | 关联指标。 |
| `date` | `string` | 指标最近更新时间候选值。 |

### `Feedback`

任务管理页使用字段：

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `linkedResultId` | `string` | 关联指标。 |
| `updatedAt` | `string` | 指标最近更新时间候选值。 |

## 5. 后端不负责的展示逻辑

后端只提供原始字段，不需要返回以下前端展示结果：

- `indicatorStatus(result, tasks)`
- `taskDisplayStatus(task)`
- `subtaskDisplayStatus(...)`
- `objectiveProgress(...)`
- `indicatorWorkProgress(...)`
- `taskWorkProgress(...)`
- 树形线条位置、图标颜色、状态标签样式。

这些逻辑由前端根据原始字段计算和展示。
