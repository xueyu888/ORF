# ORF 任务管理页面

本文档只记录两件事：

1. 页面字段怎么排，图标也算字段。
2. 状态和进度怎么算。

不写页面长相，不写普通点击交互，不写浏览器里能直接看出来的内容。

## 1. 字段排列

ORF 任务管理页固定四层结构：

```text
目标
└─ 指标
   └─ 任务
      └─ 子任务
```

目标框内的树形线条是固定样式，使用 `<HierarchyCell>` 复用。所有层次化线条都必须使用这套样式。

树线样式规则：

- 竖线必须连续，不按单行切成断裂短线。
- 当前节点用圆角弯线连接到内容字段。
- 线条颜色固定为 `#d0d5dd`。
- 缩进步长固定为 `28px`。
- 目标行不画树线，指标行开始画树线。

| 层级 | 对象 | 树形深度 | 说明 |
| --- | --- | ---: | --- |
| 1 | 目标 | 0 | 目标行不画树形线，是树根。 |
| 2 | 指标 | 1 | 指标行开始画树形线。 |
| 3 | 任务 | 2 | 任务行向指标缩进一层。 |
| 4 | 子任务 | 3 | 子任务行向任务缩进一层。 |

实现约束：

- `<HierarchyCell depth={1}>` 只负责字段对齐，不画线。
- `<HierarchyCell depth={2}>` 开始画第一条分支线。
- `<HierarchyCell depth={3}>` 画祖先竖线和当前圆角分支。

### 目标行 `<ObjectivePanel>`

| 顺序 | 字段 | 数据 / 组件 | 说明 |
| --- | --- | --- | --- |
| 1 | 目标图标 | `<ObjectiveFlagIcon>` | 旗子图标，只表示这是目标，不表达状态。素材：`src/assets/orf-icons/objective-flag.svg`。 |
| 2 | 目标标题 | `objective.title` | 已完成时划线变灰。 |
| 3 | 目标风险标签 | `objective.status` | 显示正常 / 有风险。 |
| 4 | 负责人头像组 | `taskOwners` / `<AvatarStack>` | 来自目标下可见任务负责人。 |
| 5 | 日期 | `objectiveDue` 或 `reviewDue` | 优先显示任务截止日期。 |
| 6 | 目标进度条 | `objectiveProgress(...)` | 目标唯一的进度表达。 |

目标行左右两侧都不显示展开图标。

### 指标行 `<ResultBlock>`

| 顺序 | 字段 | 数据 / 组件 | 说明 |
| --- | --- | --- | --- |
| 1 | 树形线条 | `<HierarchyCell depth={1}>` | 表示指标属于上方目标。 |
| 2 | 展开图标 | `<ChevronDown>` / `<ChevronRight>` | 只表示指标下方任务展开 / 折叠。 |
| 3 | 指标图标 | `<MetricSquareIcon>` | 正方形颜色块，颜色表达指标状态。素材：`src/assets/orf-icons/metric-square.svg`。 |
| 4 | 指标标题 | `result.title` | 已完成时划线变灰。 |
| 5 | 负责人 | `result.owner` / `<PersonValue>` | 指标负责人。 |
| 6 | 指标状态 | `indicatorStatus(result, tasks)` | 待办 / 进行中 / 待验收 / 已完成。 |
| 7 | 日期 | `updatedAt` | 指标相关任务、证据、反馈里的最近更新时间。 |

指标不显示进度条。

### 任务行 `<TaskRow>`

| 顺序 | 字段 | 数据 / 组件 | 说明 |
| --- | --- | --- | --- |
| 1 | 树形线条 | `<HierarchyCell depth={2}>` | 表示任务属于上方指标。 |
| 2 | 展开图标 | `<ChevronDown>` / `<ChevronRight>` | 只有存在子任务时显示；图标在任务勾选框左侧。 |
| 3 | 勾选框 | `<CompletionCheckbox>` / `<CompletionCircleIcon>` | 圆形勾选框，勾上后任务进入已完成。素材：`src/assets/orf-icons/completion-circle-*.svg`。 |
| 4 | 任务标题 | `task.title` | 已完成时划线变灰。 |
| 5 | 执行人 | `task.assignee` / `<PersonValue>` | 任务负责人。 |
| 6 | 任务状态 | `task.status` / `<TaskStatusSelect>` | 只显示待办 / 进行中 / 已完成。 |
| 7 | 日期 | `task.updatedAt` | 任务最近更新时间。 |

任务不显示进度条。任务可以折叠子任务。任务行树形横线只连接到展开图标左侧，展开图标和任务勾选框之间留空，不画横线。

### 子任务行 `<SubtaskRow>`

| 顺序 | 字段 | 数据 / 组件 | 说明 |
| --- | --- | --- | --- |
| 1 | 树形线条 | `<HierarchyCell depth={3}>` | 表示子任务属于上方任务。 |
| 2 | 勾选框 | `<CompletionCheckbox>` / `<CompletionCircleIcon>` | 圆形勾选框，勾上后子任务进入已完成。素材：`src/assets/orf-icons/completion-circle-*.svg`。 |
| 3 | 子任务标题 | `item.label` | 已完成时划线变灰。 |
| 4 | 执行人 | 无 | 当前显示 `-`。 |
| 5 | 子任务状态 | `subtaskDisplayStatus(...)` | 待办 / 进行中 / 已完成。 |
| 6 | 日期 | 无 | 当前显示 `-`。 |

子任务不显示进度条。

## 2. 状态规则

| 对象 | 状态 | 状态来源 |
| --- | --- | --- |
| 目标 | 无独立状态图标 | 只通过目标进度条表达完成情况。 |
| 指标 | 待办 / 进行中 / 待验收 / 已完成 | `indicatorStatus(result, tasks)`。 |
| 任务 | 待办 / 进行中 / 已完成 | `task.status` 归一化后显示。 |
| 子任务 | 待办 / 进行中 / 已完成 | `item.done` 和所在任务状态共同决定。 |

状态视觉规则：

- 已完成：标题划线并变灰。
- 目标：保留旗子图标，但图标不表达状态。
- 指标：保留正方形颜色块，颜色表达状态。
- 任务、子任务：保留圆形勾选框，勾选框表达完成。
- 只有目标显示进度条；指标、任务、子任务不显示进度条。

## 3. 目标进度

目标进度由指标平均得到；指标下有任务时，指标进度由任务平均得到；任务下有子任务时，任务进度由子任务平均得到。

```text
s(待办) = 0
s(进行中) = 0.5
s(已完成) = 1

p(子任务) = s(子任务状态)

p(任务) =
  平均值(p(子任务[]))，如果任务下有子任务
  s(任务状态)，如果任务下没有子任务

p(指标) =
  平均值(p(任务[]))，如果指标下有任务
  指标自身完成率，如果指标下没有任务

p(目标) = 平均值(p(指标[]))

目标进度条 = round(p(目标) × 100%)
```

指标自身完成率由 `resultProgress(result)` 计算。

## 4. 代码定位

| 区域 | 组件 |
| --- | --- |
| 页面主体 | `<TasksPage>` @`src/pages/TasksPage.tsx` |
| 目标行 | `<ObjectivePanel>` |
| 指标行 | `<ResultBlock>` |
| 任务行 | `<TaskRow>` |
| 子任务行 | `<SubtaskRow>` |
| 树形线条 | `<HierarchyCell>` @`src/components/OrfHierarchyTree.tsx` |
| 图标组件 | `src/components/OrfIconAssets.tsx` |
| 图标素材 | `src/assets/orf-icons/` |
| 目标旗子图标 | `<ObjectiveFlagIcon>` |
| 指标正方形色块 | `<MetricSquareIcon>` |
| 勾选框 | `<CompletionCheckbox>` |
