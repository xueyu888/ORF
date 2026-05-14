# ORF 二次元 UI 参考

## 参考来源

- 原神官网首页：https://genshin.hoyoverse.com/en/home
- 原神官网新闻页：https://genshin.hoyoverse.com/en/news
- 原神官网角色页：https://genshin.hoyoverse.com/en/character/mondstadt?char=0
- HoYoWiki 原神首页：https://wiki.hoyolab.com/pc/genshin/home
- 原神国服官网首页：https://www.yuanshen.com/#/

## 本地参考板

- `src/features/fantasy-ui/assets/reference-boards/fantasy-ui-panel-frames.png`：面板边框、卡片框、弹窗、章节标题、分隔线、标签芯片、角花参考。
- `src/features/fantasy-ui/assets/reference-boards/fantasy-ui-controls.png`：按钮、标签页、开关、复选框、搜索框、下拉、分页、状态徽章参考。
- `src/features/fantasy-ui/assets/reference-boards/fantasy-ui-navigation.png`：侧边栏、顶栏、菜单状态、用户面板、筛选面板、折叠区块、列表行参考。
- `src/features/fantasy-ui/assets/reference-boards/fantasy-ui-task-widgets.png`：任务卡、看板列头、日期片、进度条、统计卡、时间线、通知、任务详情参考。

这些图片只作为设计参考和素材库积累，不直接切图塞进运行时页面。运行时 UI 需要由 token、CSS 装饰原语和 React 组件组合生成，保证响应式、状态和可维护性。

## 预览入口

- 本地运行后访问 `/fantasy-ui` 查看组件库效果。
- 模块入口：`src/features/fantasy-ui/index.ts`。
- 组件入口：`src/features/fantasy-ui/FantasyUI.tsx`。
- Token 入口：`src/features/fantasy-ui/styles/fantasy-theme.css`。
- 组件样式入口：`src/features/fantasy-ui/styles/fantasy-components.css`。
- 主按钮 SVG 组装试验资产：`src/features/fantasy-ui/assets/buttons/primary-button-left.svg`、`primary-button-center.svg`、`primary-button-right.svg`。

## 工程化分层

| 层级 | 目标 | 当前落地 |
| --- | --- | --- |
| 设计 Token 层 | 统一颜色、圆角、阴影、边框、动效 | `src/features/fantasy-ui/styles/fantasy-theme.css` 的 `--gi-*` 变量 |
| 装饰原语层 | 沉淀角花、分隔线、纸感面、深蓝面 | `.gi-panel`、`.gi-card`、`.gi-corner`、`.gi-divider` |
| 基础组件层 | 按钮、表单、徽章、Tab、侧边栏、弹窗 | `FantasyButton`、`FantasyInput`、`FantasySelect`、`FantasyBadge`、`FantasyTabs`、`FantasySidebar`、`FantasyModal` |
| 业务组件层 | 带 ORF 语义的任务卡、看板列 | `FantasyTaskCard`、`FantasyKanbanColumn` |

## SVG 组装试验

当前先拿 `fantasy-ui-controls.png` 里的“新建任务”主按钮做试验：

- `primary-button-reference.png`：从参考板裁出的对照图，只用于 `/fantasy-ui` 视觉对比。
- `xinjian_renwu_exact.svg`：用户提供的 exact 源素材，文字已烘焙进图里，保留为素材源。
- `xinjian-renwu-exact-cutout.png`：从 exact 源素材提取并去白底后的运行时贴图。
- `primary-button-left.svg`：左端复杂轮廓和角花，纯 `path / gradient / filter`，不嵌入 PNG。
- `primary-button-center.svg`：中段可拉伸纹理，纯 `path / gradient / filter`，不嵌入 PNG。
- `primary-button-right.svg`：右端复杂轮廓和角花，纯 `path / gradient / filter`，不嵌入 PNG。
- `FantasyExactNewTaskButton`：使用 exact cutout 贴图的精确“新建任务”按钮组件，适合追求完全贴近素材。
- `FantasySvgButton`：用三段 SVG 和 CSS 组装，文字由 DOM 承载，支持可变宽度、hover、active、disabled。

这个试验的目的不是替代所有组件，而是验证“复杂美术资产纯矢量 SVG 化 + CSS 组装 + 组件状态”的可行性。后续 Tab、Panel、TaskCard、Sidebar 也应按同样路线拆资产，而不是纯 CSS 硬画。

## 组件清单

| 参考板 | 元素 | 组件 / CSS | 说明 |
| --- | --- | --- | --- |
| `fantasy-ui-panel-frames.png` | 金色角花面板框 | `FantasyPanel` / `.gi-panel` / `.gi-corner` | 通用卡片、弹窗、任务分组容器 |
| `fantasy-ui-panel-frames.png` | 深蓝星纹面板 | `FantasyPanel variant="blue"` / `.gi-panel-blue` | 重点区、深色导航、主操作背景 |
| `fantasy-ui-panel-frames.png` | 分隔线和中心徽记 | `FantasyDivider` / `.gi-divider` | 模块标题下方、表单分组、信息分割 |
| `fantasy-ui-controls.png` / `xinjian_renwu_exact.svg` | 主按钮、次按钮、危险按钮 | `FantasyButton` / `.gi-button-*`，`FantasySvgButton` / `.gi-svg-button-*`，`FantasyExactNewTaskButton` / `.gi-exact-new-task-button` | `FantasyExactNewTaskButton` 是 exact 素材按钮；`FantasySvgButton` 是可换字三段 SVG 试验；普通按钮仍保留轻量 CSS 版本 |
| `fantasy-ui-controls.png` | 搜索框、下拉、筛选 | `FantasyInput`、`FantasySelect` | 低装饰、清晰可读，适合高频输入 |
| `fantasy-ui-controls.png` | 状态徽章 | `FantasyBadge` / `.gi-badge-*` | 进行中、完成、危险、待确认、低优先级 |
| `fantasy-ui-controls.png` | 标签页 | `FantasyTabs` / `.gi-tabs` | 支持 selected 和 focus-visible |
| `fantasy-ui-navigation.png` | 侧边栏项目状态 | `FantasySidebar` / `.gi-sidebar-item` | active、hover、长文本截断待继续增强 |
| `fantasy-ui-task-widgets.png` | 任务卡 | `FantasyTaskCard` / `.gi-task-card` | 标题截断、状态徽章、标签、截止日期 |
| `fantasy-ui-task-widgets.png` | 看板列 | `FantasyKanbanColumn` / `.gi-kanban-column` | 业务容器，组合任务卡和计数 |

## 设计规则

- 颜色优先从 `--gi-*` token 取，避免在业务组件里散落硬编码色值。
- 大结构可以强风格化：侧边栏、弹窗、任务卡、看板列头、重点面板。
- 高频控件保持克制：输入框、筛选项、表格行、分页不要过度装饰。
- 每个基础组件必须覆盖 `default`、`hover`、`active`、`focus-visible`、`disabled` 或对应业务状态。
- 角花、纹理、分隔线等装饰元素必须 `position: absolute` 或伪元素实现，不影响正常布局，也不拦截点击。
- 任务标题、项目名、用户昵称等可变文本必须支持截断或换行，不能撑破布局。

## ORF 落地原则

- 不复制原神官方素材、图标和具体 UI 资源，只参考配色、层次、布局语言。
- 本地四张参考板是用户设计的 ORF 风格基准，后续新组件先抽象为 token 和组件，再进入业务页面。
- 挑战工作台仍然以效率为核心：悬赏指标状态、任务状态、优先级、截止时间、挑战者、操作入口要比装饰更清楚。
- 推荐顺序：先打磨组件库，再逐步替换挑战页目标块、悬赏指标行、树形层级、块操作入口、状态标签和顶部筛选器。
