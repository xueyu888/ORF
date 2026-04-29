# ORF 任务管理页面

本文档只解决三件事：

1. 页面上每一块应该叫什么名字。
2. 这些名字对应到哪个代码组件。
3. 每个组件负责什么交互。

不在本文档里重复描述页面长什么样。页面布局以浏览器实际页面为准。

## 1. 组件层次

```text
任务管理页面
├─ 左侧侧边栏
│  └─ 侧边栏链接项[]
└─ 任务管理主体
   ├─ ORF 流程条
   ├─ 团队指标概览
   │  └─ 指标卡片[]
   ├─ 视图切换标签
   └─ 目标面板[]
      └─ 结果/指标块[]
         └─ 任务行[]
            └─ 子任务行[]
```

说明：

- 这张图只写组件名，不写数据字段。
- `[]` 表示同级有多个。
- 顶部操作栏暂时不纳入本文档。
- 页面细节直接看浏览器页面，不在文档里画页面布局。

## 2. 组件命名表

| 中文组件名 | 代码名 | 代码位置 | 说明 |
| --- | --- | --- | --- |
| 左侧侧边栏 | `Sidebar` | `src/components/Sidebar.tsx` | 左侧全局导航区域。 |
| 侧边栏链接项 | `SidebarLink` | `src/components/Sidebar.tsx` | 侧边栏里的单个导航入口。 |
| 任务管理主体 | `TasksPage` | `src/pages/TasksPage.tsx` | `/tasks` 页面主体。 |
| ORF 流程条 | `FlowStageControl` | `src/pages/TasksPage.tsx` | 目标设定、指标领取、重估、冻结、确认。 |
| 团队指标概览 | `TeamDashboard` | `src/pages/TasksPage.tsx` | 团队视图下的统计概览区。 |
| 指标卡片 | `DashboardMetric` | `src/pages/TasksPage.tsx` | 团队指标概览里的单张统计卡。 |
| 视图切换标签 | `ScopeTabs` | `src/pages/TasksPage.tsx` | 团队 / 个人切换。 |
| 目标面板 | `ObjectivePanel` | `src/pages/TasksPage.tsx` | 单个目标及其下属结果和任务。 |
| 结果/指标块 | `ResultBlock` | `src/pages/TasksPage.tsx` | 单个结果/指标及其下属任务。 |
| 任务行 | `TaskRow` | `src/pages/TasksPage.tsx` | 单个任务。 |
| 子任务行 | `SubtaskRow` | `src/pages/TasksPage.tsx` | 任务 checklist 中的单个子项。 |
| 任务状态选择器 | `TaskStatusSelect` | `src/pages/TasksPage.tsx` | 修改任务状态的下拉选择器。 |

## 3. 辅助组件

这些也是代码里的组件，但主要用于展示，不建议作为页面沟通里的主名称。

| 中文组件名 | 代码名 | 用途 |
| --- | --- | --- |
| 目标图标 | `GoalIcon` | 目标行左侧的完成 / 目标图标。 |
| 状态圆点 | `StatusDot` | 结果、任务、子任务左侧的完成状态圆点。 |
| 头像组 | `AvatarStack` | 目标面板里的多人头像组。 |
| 人员头像 | `PersonAvatar` | 单个人员头像。 |
| 人员信息 | `PersonValue` | 头像 + 人名。 |
| 日期显示 | `DateValue` | 日期字段展示。 |
| 进度显示 | `ProgressValue` | 短进度条 + 百分比。 |
| 完成状态标签 | `CompletionChip` | 已完成 / 进行中 / 待办标签。 |
| 状态标签 | `StatusChip` | 通用状态标签。 |

## 4. 当前不是独立组件的区域

这些区域页面上能看到，但当前代码里没有单独抽成组件。沟通时可以用中文叫法，但改代码时要定位到父组件。

| 中文叫法 | 当前所在组件 | 说明 |
| --- | --- | --- |
| 品牌区 | `Sidebar` | 显示产品图标、产品名、设置图标。 |
| 工作区入口 | `Sidebar` | 显示团队、周期和切换图标。 |
| 我的焦点 | `Sidebar` + `SidebarLink` | 实际指向仪表盘。 |
| 导航分组 | `Sidebar` | `WORK`、`REPORTS`、`ORG`。 |
| 搜索入口 | `Sidebar` | 打开命令搜索菜单。 |
| 用户信息 | `Sidebar` | 显示当前用户和角色。 |
| 任务工具栏 | `TasksPage` | 包含 `ScopeTabs`、全部周期按钮、筛选按钮。 |
| 全部周期按钮 | `TasksPage` | 目前只有按钮外观，没有下拉。 |
| 筛选按钮 | `TasksPage` | 目前只有按钮外观，没有筛选面板。 |
| 目标摘要行 | `ObjectivePanel` | 目标面板顶部那一行。 |
| 结果/指标信息行 | `ResultBlock` | 结果/指标块顶部那一行。 |
| 任务信息行 | `TaskRow` | 任务行主体。 |

## 5. 交互规则

| 交互 | 触发组件 | 影响组件 / 状态 | 当前行为 |
| --- | --- | --- | --- |
| 切换团队 / 个人 | 视图切换标签 | `scope` | 团队视图显示全部任务；个人视图只显示 `Alex Chen` 相关任务。 |
| 切换流程阶段 | ORF 流程条 | `flowStage` | 点击任意阶段即可切换，没有顺序限制。 |
| 显示 / 隐藏团队指标概览 | 视图切换标签 | 团队指标概览 | 团队视图显示，个人视图隐藏。 |
| 展开 / 折叠结果 | 结果/指标块 | `collapsedResultIds` | 点击结果/指标行左侧图标，显示或隐藏下属任务。 |
| 展开 / 折叠任务 | 任务行 | `collapsedTaskIds` | 有子任务时可点击任务行左侧图标，显示或隐藏子任务。 |
| 修改任务状态 | 任务状态选择器 | `Task.status` | 只有 `flowStage === "orfReestimate"` 时可编辑。 |
| 打开命令搜索 | 搜索入口 | 命令搜索菜单 | 点击 `⌘K 搜索` 打开。 |
| 点击全部周期 | 全部周期按钮 | 暂无 | 目前没有下拉逻辑。 |
| 点击筛选 | 筛选按钮 | 暂无 | 目前没有筛选面板。 |

## 6. 数据字段归类

| 数据类别 | 主要字段 | 主要使用组件 |
| --- | --- | --- |
| 页面状态 | `scope`、`flowStage`、`collapsedResultIds`、`collapsedTaskIds` | 任务管理主体 |
| 目标数据 | `objective.title`、`objective.status`、`objective.progress`、`objective.resultIds` | 目标面板 |
| 结果/指标数据 | `result.title`、`result.owner`、`result.status`、`result.current`、`result.target` | 结果/指标块 |
| 任务数据 | `task.title`、`task.assignee`、`task.status`、`task.updatedAt`、`task.checklist` | 任务行 |
| 子任务数据 | `item.label`、`item.done` | 子任务行 |
| 团队统计数据 | `completedResults`、`totalResults`、`waitingResults`、`activeTaskCount` | 团队指标概览、指标卡片 |
| 侧边栏数据 | `navItems`、`sidebarGroups`、当前工作区、当前用户 | 左侧侧边栏 |

## 7. 当前实现限制

| 项目 | 当前状态 |
| --- | --- |
| 当前成员 | 个人视图硬编码为 `Alex Chen`。 |
| 权限系统 | 没有真实主管 / 成员权限。 |
| 流程推进 | 可以任意点击阶段，没有顺序限制。 |
| 周期筛选 | `全部周期` 只有按钮，没有下拉。 |
| 筛选面板 | `筛选` 只有按钮，没有面板。 |
| 侧边栏折叠 | 没有窄侧栏模式。 |
| 目标折叠 | 目标面板不支持折叠。 |
| 子任务编辑 | 子任务不支持独立编辑。 |
