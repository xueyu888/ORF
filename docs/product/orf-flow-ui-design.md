# ORF Flow 产品界面设计文档

## 文档目标

本文档定义 ORF Flow 前端界面的页面设计、信息层级、跳转关系和交互边界。

后续所有影响界面效果、页面结构、导航关系、交互行为或可见文案的改动，都必须先更新或同步更新本文档，再修改前端代码。

本文档不替代 `orf-flow-frontend-prototype.md`。两者关系如下：

- `orf-flow-frontend-prototype.md` 定义产品定位、功能范围、数据模型、技术要求和验收标准。
- `orf-flow-ui-design.md` 定义界面如何组织、每个页面怎么呈现、用户从哪里进入和跳转到哪里。

## 是否需要界面设计文档

需要，但不应该写成像素级说明。

前端界面确实是所见即所得，尤其在没有后端业务规则时，截图和浏览器页面能直接表达很多视觉结果。但 ORF Flow 采用文档驱动代码，界面文档仍然有价值：

1. **记录设计意图**：界面只能看到结果，看不出为什么目标页优先展示结果，为什么任务页不能成为第一入口。
2. **约束后续改动**：后续调整颜色、布局、页面入口、信息优先级时，需要知道哪些可以改，哪些不能破坏 ORF 关系。
3. **降低 AI 随机发挥**：如果只看当前界面，AI 容易按自己的审美重构；文档能限定页面目标、参考来源和跳转关系。
4. **支持产品复盘**：当用户觉得某个页面“不对”时，可以先改文档里的页面目标、结构或交互，再生成代码。
5. **避免只改表面**：即使暂时没有后端，前端也已经包含业务对象关系：Objective、Result、Task、Feedback、Evidence、Decision。

本文档只写稳定设计决策，不重复记录每个 Tailwind class、每个颜色细节或每个像素尺寸。视觉细节以代码和截图验证为准，产品结构和交互意图以本文档为准。

## 全局界面原则

**界面语言**：界面以中文为主，ORF、Objective、Result、Feedback、Prompt、RAG、Agent、Recall@5、P95 等产品或技术术语可以保留英文。

**产品层级**：产品的一等对象必须是 Objective、Result、Feedback。Task 是第四层对象，只能作为 Result 的执行支撑。

**Linear 边界**：Linear 只作为任务执行层 UI 参考，包括高密度 sidebar、列表、筛选、快捷创建、详情面板和 Command-K；不能作为 ORF Flow 的产品信息架构参考。

**视觉风格**：默认深色 SaaS，高密度、克制、清晰。参考 Linear 的信息密度，但不复制 Linear 的品牌或视觉。

**布局规则**：左侧固定 Sidebar，顶部轻量 Topbar，主内容区使用卡片、表格、图表、时间线和看板组合。

**状态表达**：正常、风险、阻塞、草稿、评审中、已建动作、已更新结果、已关闭等状态必须通过中文标签和稳定颜色表达。

**反馈闭环**：所有反馈都必须呈现现象、证据、原因分类、影响、建议动作、关联目标或结果、处理状态。

**任务约束**：任务必须展示关联结果。没有关联结果的任务要提示它不符合 ORF 执行原则。

**首页约束**：Dashboard 第一屏禁止以任务列表为中心，必须优先展示 Objective 健康、Result 风险、Feedback 待处理和 ORF 决策信号。

**AI 应用语境**：界面必须持续出现幻觉率、检索 Recall@5、P95 时延、平均请求成本、工具调用成功率、评估覆盖率等大模型应用指标。

**指标模板约束**：Result 详情必须体现 Notion `指标模板` 的核心口径：指标名、要求、统计对象、完成标准、标准样本集、测量范围、负责人和评级。涉及 TopK、P95、成功率、覆盖率、时长的指标必须明确统计对象和完成标准。

## 主题系统

ORF Flow 使用一套 Linear-inspired 但不复制 Linear 的主题系统。后续新增 UI 必须复用语义 token，不直接在页面里写死 `text-white`、`bg-slate-*`、`border-white/*`、品牌色或一次性十六进制色值。

主题必须支持：

- 暗色：默认模式，适合高密度执行工作台。
- 亮色：适合复盘、汇报、演示和长时间阅读。

实现约束：

- 全局主题由 `data-theme="dark|light"` 控制。
- 所有基础色放在 `src/styles.css` 的 `--orf-*` CSS variables。
- 页面和组件优先使用 `orf-card`、`orf-input`、`orf-text-primary`、`orf-text-secondary`、`orf-text-muted`、`orf-surface-muted`、`orf-border`、`orf-primary-action`、`orf-secondary-action`、`orf-badge-*` 等语义类。
- 状态颜色只能走 `orf-badge-success`、`orf-badge-warning`、`orf-badge-danger`、`orf-badge-info`、`orf-badge-accent`、`orf-badge-neutral`。
- 图表颜色使用 CSS variables，例如 `var(--orf-accent)`、`var(--orf-border)`、`var(--orf-text-muted)`。
- 新增组件时先判断它是主背景、卡片、弱面板、边框、主文本、次文本、弱文本、主动作还是状态标签，再选择对应 token。

主题视觉方向：

- 暗色背景接近深灰黑，而不是纯黑；卡片和弱面板依靠边框、阴影和轻微层级区分。
- 亮色背景接近冷灰白；卡片保持白底，边框轻，文本对比清晰。
- 强调色使用克制的蓝紫色，只用于主操作、选中态和少量高亮，不把整套 UI 做成单一紫色主题。
- 圆角以 6px - 8px 为主，保持高密度和工具感。

## 全局导航

### Sidebar

Sidebar 固定在左侧，宽度约 248px，高度 100vh。

顶部展示：

- 产品名：ORF Flow。
- 工作区：AI 应用团队。
- 当前周期：2026 Q2。

主导航项：

- 仪表盘：`/dashboard`
- 目标：`/objectives`
- 任务：`/tasks`
- 反馈：`/feedback`
- 周复盘：`/review`
- 策略地图：`/strategy-map`
- AI 评估：`/ai-evaluation`
- 汇报：`/reports`
- 设置：`/settings`

底部展示：

- Command Menu 入口：`⌘K 搜索`。
- 当前用户：Alex Chen / AI 产品经理。

### Topbar

Topbar 固定在内容区顶部。

左侧展示当前路径面包屑。

中间是全局搜索入口，点击后打开 Command Menu。

右侧包含：

- 新建反馈。
- 新建目标。
- 通知图标。
- 用户头像。

### Command Menu

快捷键 `Ctrl+K` 或点击 Sidebar 底部入口打开。

可搜索对象：

- 页面。
- 目标。
- 结果。
- 任务。
- 反馈。

点击搜索结果后跳转到对应页面，并关闭弹层。

## 跳转关系总览

```text
/dashboard
  -> /objectives
  -> /objectives/:objectiveId
  -> /feedback/:feedbackId
  -> /review

/objectives
  -> /objectives/:objectiveId

/objectives/:objectiveId
  -> /objectives/:objectiveId/results/:resultId
  -> /tasks
  -> /feedback/:feedbackId
  -> New Result modal
  -> New Feedback modal

/objectives/:objectiveId/results/:resultId
  -> New Feedback modal
  -> New Task modal
  -> Propose Result Update modal
  -> /feedback/:feedbackId

/tasks
  -> Task side panel
  -> New Task modal
  -> New Feedback modal

/feedback
  -> /feedback/:feedbackId
  -> New Feedback modal

/feedback/:feedbackId
  -> New Task modal
  -> Propose Result Update modal
  -> Mark as Known Boundary

/review
  -> Publish Review toast

/strategy-map
  -> /objectives/:objectiveId
  -> /objectives/:objectiveId/results/:resultId
  -> /tasks

/ai-evaluation
  -> New Feedback modal
  -> /objectives/:objectiveId/results/:resultId

/reports
  -> Presentation Mode toggle

/settings
  -> local settings state
  -> reset mock data
```

## 页面设计

### `/dashboard` 仪表盘

**页面目标**：让用户一进入产品就看到团队 ORF 健康状态，而不是任务清单。

**主要参考**：Quantive Results + Tability。

**信息结构**：

1. 页面标题和周期操作。
2. KPI 卡片：进行中的目标、有风险的结果、待处理反馈、工程信心。
3. 目标健康看板：展示 3 个目标卡片。
4. 待处理反馈：展示需要处理的结构化反馈。
5. 风险雷达：展示原因分类分布。
6. 决策记录：展示近期关键决策。
7. 我的 ORF 待办：展示与结果、反馈、任务、复盘有关的待办。

**交互**：

- 点击目标卡片进入目标工作台。
- 点击反馈卡片进入反馈详情。
- 点击开始周复盘进入 `/review`。
- 点击查看全部进入 `/objectives`。

**设计约束**：

- 第一屏必须优先展示目标健康和反馈风险。
- 任务只能出现在待办区，不能成为首页主内容。

### `/objectives` 目标列表

**页面目标**：管理 ORF 的 O 层，帮助用户查找、筛选和创建目标。

**主要参考**：Tability + Linear。

**信息结构**：

1. 页面标题、说明和新建目标按钮。
2. 筛选栏：搜索、状态、负责人、周期、视图切换。
3. 卡片视图：展示目标说明、负责人、周期、信心、进度、结果数量、反馈数量。
4. 表格视图：适合高密度浏览。

**交互**：

- 搜索和状态筛选即时生效。
- 卡片或表格行点击进入 `/objectives/:objectiveId`。
- 新建目标打开 New Objective modal。

**设计约束**：

- 目标说明必须说明团队要改变什么状态。
- 目标卡片必须同时显示结果和反馈，不允许只显示任务数。

### `/objectives/:objectiveId` 目标工作台

**页面目标**：作为单个 Objective 的核心工作台，集中展示结果、任务、反馈、决策和评估。

**主要参考**：Linear Project Detail + Tability。

**信息结构**：

1. Header：目标标题、状态、负责人、周期、信心、进度。
2. Summary：为什么重要、边界、不做什么、成功定义、最新反馈。
3. Tabs：概览、结果、任务、反馈、决策、评估。
4. 概览主区：进度概览、结果卡片、反馈时间线。
5. 右侧信息栏：ORF 完整性检查、开放风险、相关 AI 系统。

**交互**：

- 新建结果打开 New Result modal。
- 新建反馈打开 New Feedback modal，并预填目标。
- 结果卡片进入 `/objectives/:objectiveId/results/:resultId`。
- 反馈卡片进入 `/feedback/:feedbackId`。
- 任务 Tab 可以切换任务状态。
- 反馈 Tab 可以切换反馈状态。

**设计约束**：

- 目标工作台必须围绕 Results 和 Feedback 展开。
- Tasks Tab 是执行层，不是默认核心视图。

### `/objectives/:objectiveId/results/:resultId` 结果详情

**页面目标**：让 Result 成为可验证、可执行、可反馈调整的对象。

**主要参考**：Tability Result/Check-in + Linear Detail Panel。

**信息结构**：

1. Header：结果标题、状态、负责人、信心、操作按钮。
2. Metric Card：基线、当前值、目标值、方向、进度和趋势图。
3. Evidence Panel：评估运行、日志样本、用户反馈、仪表盘快照、事故报告等证据。
4. Linked Tasks：支撑当前结果的任务。
5. Feedback History：当前结果相关反馈。
6. 指标口径栏：指标名、要求、统计对象、完成标准、标准样本集、测量范围、评级、复盘节奏。
7. ORF 质量检查：可度量、有证据、已关联目标、反馈已更新、有任务支撑、口径清楚、没有模糊词。

**交互**：

- 添加证据按钮预留为 Add Evidence modal。
- 新建反馈预填当前结果。
- 创建任务预填当前结果。
- 提出结果更新打开 Propose Result Update modal。
- 信心滑杆可以调整结果信心。

**设计约束**：

- 结果必须显示 baseline/current/target。
- 反馈历史必须能解释结果为什么需要调整。
- 指标要求必须遵守“指标名：要求”的格式。
- 不允许在 Result 的核心要求中使用“尽量、较好、完善、高效”等模糊词。
- 响应时间、P95、TopK、成功率、覆盖率等指标必须说明统计对象、完成标准和样本范围。

### `/tasks` 任务

**页面目标**：提供开发团队熟悉的执行列表和看板，但强制体现任务与结果的关系。

**主要参考**：Linear。

**信息结构**：

1. 页面标题、说明、新建任务按钮。
2. 筛选栏：状态、执行人、关联结果。
3. 视图切换：列表 / 看板。
4. 列表列：ID、任务、状态、优先级、执行人、截止日期。
5. 看板列：待整理、待办、进行中、评审中、已完成。
6. 右侧任务详情面板。

**交互**：

- 任务状态可直接切换。
- 点击任务行打开右侧详情面板。
- 任务详情可标记完成或创建反馈。
- 新建任务打开 New Task modal。

**设计约束**：

- 每个任务都必须显示“支撑结果”。
- 任务页不能出现目标层战略总结，避免喧宾夺主。

### `/feedback` 反馈收件箱

**页面目标**：把 Feedback 从评论变成结构化对象。

**主要参考**：Productboard + Quantive Check-ins。

**信息结构**：

1. 页面标题、说明、新建反馈按钮。
2. 筛选栏：原因、状态、影响。
3. 反馈卡片列表：现象、原因分类、状态、关联结果、建议调整。
4. 洞察面板：原因分布、高影响反馈、未分类、平均响应时间、最高频问题。
5. 状态流：新反馈 → 评审中 → 已建动作 → 已更新结果 → 已关闭。

**交互**：

- 点击反馈卡片进入 `/feedback/:feedbackId`。
- 新建反馈打开 New Feedback modal。
- 筛选即时生效。

**设计约束**：

- 反馈必须显示现象、原因、影响、证据和建议动作。
- 反馈不能退化成自由评论区。

### `/feedback/:feedbackId` 反馈详情

**页面目标**：处理单条反馈，并决定它应转成任务、结果更新还是已知边界。

**主要参考**：Productboard + Linear Detail Panel。

**信息结构**：

1. Header：反馈 ID、状态、影响、负责人、创建日期、操作按钮。
2. Phenomenon：清晰展示问题现象。
3. Evidence：展示日志、测试结果、用户反馈或评估样本。
4. Cause Analysis：展示原因分类和解释。
5. Suggested Adjustment：展示建议动作。
6. Activity Timeline：展示处理过程。
7. 右侧信息栏：关联目标、关联结果、推荐动作。

**交互**：

- 创建任务打开 New Task modal，并带入反馈来源。
- 提出结果更新打开 Propose Result Update modal。
- 标记为已知边界会关闭反馈。

**设计约束**：

- 反馈详情必须能反向影响任务或结果。
- 不能只做只读详情页。

### `/review` 周复盘

**页面目标**：让 ORF 的 F 形成周期性机制，比较本周和上周的变化。

**主要参考**：Quantive Check-ins。

**信息结构**：

1. Header：周期、周范围、发布按钮。
2. What changed：信心变化、结果当前值变化、新增反馈、关闭任务。
3. What is off track：有风险的结果和原因分类。
4. What did we learn：本周洞察。
5. What will change next week：下周决策清单。
6. Review Summary Editor：自动生成式摘要，可编辑。

**交互**：

- 发布复盘显示 toast。

**设计约束**：

- 周复盘必须围绕反馈学习和结果调整。
- 不能只汇报任务完成数量。

### `/strategy-map` 策略地图

**页面目标**：展示从北极星目标到日常任务的 ORF 关系。

**主要参考**：Perdoo Strategy Map。

**信息结构**：

1. Header：页面标题、说明、周期筛选。
2. 主画布：North Star → Strategic Pillars → Objectives → Results → Tasks。
3. 节点卡片：类型、标题、状态、负责人、进度。
4. 右侧 Inspector：展示当前选中节点详情和打开按钮。

**交互**：

- 点击目标节点进入目标工作台。
- 点击结果节点进入结果详情。
- 点击任务节点进入任务页。
- 选中节点后右侧 Inspector 更新。

**设计约束**：

- 策略地图展示关系，不做复杂图编辑。
- 连线和层级用于解释 ORF 上下游，不追求自由画布能力。

### `/ai-evaluation` AI 评估

**页面目标**：体现 ORF Flow 面向大模型应用开发团队，而不是普通项目管理工具。

**主要参考**：自定义 AI 应用评估中心 + Tability Dashboard。

**信息结构**：

1. 指标卡片：准确率、幻觉率、Recall@5、工具调用成功率、P95 时延、平均请求成本。
2. 评估运行表格：Run、Scenario、Dataset、Model、Prompt、RAG、Accuracy、Hallucination、Latency、Cost、Status。
3. 场景卡片：Permission Q&A、Contract Review Assistant、Ticket Creation Agent、Knowledge Base Search、Cost Analysis Assistant。
4. 失败样本：问题、模型回答、期望答案、判定原因、创建反馈按钮。

**交互**：

- 点击创建反馈，从失败样本生成 New Feedback modal。
- 关联结果可进入结果详情。

**设计约束**：

- 必须保留 AI 应用质量、成本、时延、可靠性指标。
- 失败样本必须能进入反馈闭环。

### `/reports` 汇报

**页面目标**：面向管理者汇总 ORF 状态、风险、决策和下周重点。

**主要参考**：Quantive Reports + Tability Dashboard。

**信息结构**：

1. Executive Summary。
2. Objective Progress。
3. Results at Risk。
4. Feedback Themes。
5. Decisions Made。
6. Next Week Focus。

**交互**：

- Presentation Mode 切换更适合汇报的大卡片布局。
- Copy Summary 预留复制摘要能力。

**设计约束**：

- 汇报页只做汇总，不承载深度编辑。
- 管理者应能快速看到风险、决策和下周重点。

### `/settings` 设置

**页面目标**：配置周期、团队、反馈分类和 ORF 规则。

**主要参考**：Linear Settings + Quantive 配置结构。

**信息结构**：

1. 周期：2026 Q2、2026 Q3 草稿。
2. 团队：AI 应用团队、平台工程、评估团队。
3. 反馈分类：展示和新增原因分类。
4. ORF 规则：任务必须关联结果、反馈必须有证据、启用每周反馈节奏、自动生成复盘摘要。
5. 原型数据：重置 mock 数据。

**交互**：

- 新增反馈分类保存到本地状态。
- 开关只影响本地状态。
- 重置 Mock 数据会清空 localStorage 并恢复初始数据。

**设计约束**：

- 设置页只放产品行为配置，不放业务内容编辑。
- 配置项应支持“配置即功能”的代码规范。

## Modal 设计

### New Objective

字段：

- 目标标题。
- 为什么重要。
- 负责人。
- 周期。
- 边界 / 不做什么。

保存后新增目标，并显示 toast。

### New Result

字段：

- 所属目标。
- 结果标题。
- 指标。

保存后新增结果，并显示 toast。

### New Feedback

字段：

- 现象。
- 关联结果。
- 原因分类。
- 影响。
- 来源。
- 负责人。
- 建议调整。

保存后新增反馈，并显示 toast。

### New Task

字段：

- 任务标题。
- 说明。
- 关联结果。
- 执行人。
- 优先级。

保存后新增任务，并显示 toast。

### Propose Result Update

字段：

- 当前结果。
- 更新后的结果。
- 修改原因。

保存后写入决策记录，并把相关反馈状态改为“已更新结果”。

## 文档同步规则

涉及界面的改动必须同步到本文档，包括：

- 新增、删除或调整页面。
- 改变页面信息层级。
- 改变 Sidebar、Topbar、Command Menu 的导航关系。
- 改变卡片、表格、看板、时间线、图表的用途。
- 改变可见文案的产品口径。
- 改变 Modal 字段或保存后的行为。
- 改变 Objective、Result、Task、Feedback 的展示关系。

不需要同步到本文档的内容：

- 不影响界面行为的内部重命名。
- 纯格式化。
- 不改变用户可见效果的代码拆分。
- 构建工具的内部配置，除非会影响运行、路由或资源加载。

每次界面代码变更的最终说明都必须指出对应来源文档。如果没有对应文档，必须先补文档，再改代码。
