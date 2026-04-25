# ORF Flow 前端原型产品规格

## 文档目标

本文件用于定义 ORF Flow 的前端原型开发方向。它是后续生成或修改前端代码的来源文档之一。

本文件只写产品与前端规格，不在当前步骤直接生成代码。后续开发必须基于本文档、仓库规则和代码规范执行。

页面结构、导航关系、交互入口和可见界面设计的详细说明见 `orf-flow-ui-design.md`。后续涉及界面效果的变更必须同步更新该界面设计文档。

## 产品名称

ORF Flow

## 产品定位

ORF Flow 是一个面向大模型应用开发团队的任务管理与目标闭环工具。

它不是普通 Todo，不是 Jira，也不是单纯 OKR 工具。它的核心是 ORF：

- O = Objective，阶段性目标。
- R = Results，可验证结果。
- F = Feedback，结构化反馈。

## 核心理念

1. 目标不是口号，必须拆成可验证结果。
2. 任务不是核心，任务只是支撑 Result 的执行动作。
3. Feedback 不是评论区，而是一个结构化对象，能够反向修正 Result。
4. 产品重点服务大模型应用开发团队，例如 Prompt 工程、RAG、Agent、模型评估、工程稳定性、成本、时延、幻觉率、工具调用成功率等场景。

## 产品层级硬约束

以下约束优先级高于任何参考产品和页面局部设计：

1. 产品的一等对象必须是 `Objective`、`Result`、`Feedback`。
2. `Task` 是第四层对象，只能作为 `Result` 的执行支撑，不能成为产品信息架构的核心。
3. Linear 只作为任务执行层 UI 参考，包括 sidebar 密度、列表、快捷创建、详情面板和 Command-K，不作为 ORF Flow 的产品信息架构参考。
4. Dashboard 第一屏禁止以任务列表为中心，必须优先呈现 Objective 健康、Result 风险、Feedback 待处理和 ORF 决策信号。
5. 任何 Task 入口都必须显式展示它支撑的 Result；没有 Result 关联的 Task 只能作为异常状态或待归类状态出现。
6. 后续新增页面时，如果 Objective、Result、Feedback 与 Task 的展示优先级冲突，必须优先保护 Objective、Result、Feedback。

## 我的分析结论

这个方向是成立的，而且比“通用任务管理工具”更有机会做出差异。

最关键的优点是：它没有把 Task 放在第一层，而是把 Objective、Result、Feedback 放在核心位置。这样产品不会退化成另一个 Todo / Jira，而是能表达 ORF 的真实价值：目标驱动、结果验证、反馈修正。

这个规格里最有价值的部分有四个：

1. **定位清楚**: 面向大模型应用开发团队，而不是泛泛的团队协作工具。
2. **关系清楚**: Objective → Result → Task → Feedback 的关系明确，能支撑 ORF 闭环。
3. **Feedback 差异化强**: Feedback 被设计成结构化对象，而不是评论或备注。
4. **AI 场景有真实语境**: hallucination rate、retrieval recall@5、p95 latency、avg cost per request、tool success rate、eval coverage 等指标能把产品从普通 OKR 工具里区分出来。

需要注意的风险也很明显：

1. **首版范围偏大**: 12 个页面、多个 modal、Command Menu、localStorage、图表、看板、详情页、Strategy Map 同时做，容易降低完成度。
2. **参考产品过多**: Linear、Tability、Perdoo、Quantive 都有价值，但首版应该优先统一成一种产品语言，避免拼贴感。
3. **Feedback 到 Result 的修改链路要做实**: 如果只是按钮和状态变化，差异化不够。必须让用户看到“反馈如何改变 Result 或生成 Task”。
4. **任务页不能反客为主**: Tasks 可以有 Linear 风格，但产品第一入口应始终是 Objective health 和 Feedback due。
5. **配置与本地状态要控制范围**: localStorage 只适合原型级状态保存，不要让数据同步逻辑变复杂。

建议开发顺序：

1. 先做 AppShell、Sidebar、Topbar、mock data、类型定义和路由骨架。
2. 第一阶段重点完成 `/dashboard`、`/objectives`、`/objectives/:objectiveId`、`/objectives/:objectiveId/results/:resultId`、`/feedback`、`/tasks`。
3. 第二阶段补齐 `/feedback/:feedbackId`、`/review`、`/strategy-map`、`/ai-evaluation`。
4. 第三阶段再做 `/reports`、`/settings`、Command Menu、modal 细节和 localStorage 完整体验。

首版验收时，重点不要看页面数量，而要看三件事：

1. 用户能不能一眼看懂 ORF 和普通任务管理的区别。
2. Result 是否真的可验证，而不是普通任务标题。
3. Feedback 是否真的能反向推动 Result 和 Task。

## 技术要求

- 使用 React + TypeScript + Vite。
- 使用 Tailwind CSS。
- 可以使用 shadcn/ui 风格组件，如果项目环境已支持。
- 使用 lucide-react 图标。
- 使用 recharts 做简单图表。
- 使用 React Router 实现页面跳转。
- 不需要真实后端。
- 所有数据使用前端 mock data。
- 可以使用 localStorage 保存用户在原型里的新增、编辑、状态切换操作。
- 必须是一个成熟产品感的原型，不要做成学生作业。
- 桌面端优先，宽度按 1440px 设计，但要具备基本响应式。
- 默认深色模式，整体质感参考 Linear 的高密度深色产品界面，但不要复制 Linear。
- 视觉重点参考 Tability 的目标卡片、check-in、进度图、dashboard 结构；Linear 的 sidebar、issue list、project detail；Perdoo 的 strategy map；Quantive 的 home screen 和 check-in 结构。

## 重要限制

- 不要使用任何真实产品的 logo、商标、原始图标、品牌色、截图或文案。
- 不要直接照抄 Tability / Linear / Perdoo / Quantive 的 UI。
- 只借鉴信息架构、组件组织、交互模式和视觉层级。
- Linear 的参考范围仅限任务执行层 UI 和高密度产品质感，不得把 Linear 的 Project / Issue / Cycle 信息架构迁移为 ORF Flow 的主模型。
- 界面语言以中文为主，产品名、ORF、Objective、Result、Feedback、Prompt、RAG、Agent、Recall@5、P95 等产品或技术术语可以保留英文。
- 所有文案都围绕 ORF Flow 和大模型应用开发团队重新设计。

## 页面参考来源

以下参考只用于信息架构、组件组织、交互模式和视觉层级，不复制真实产品的 UI、品牌、文案或视觉资产。

| 页面 | 主要参考 | 参考重点 | ORF Flow 转化 |
| --- | --- | --- | --- |
| `/dashboard` ORF 仪表盘 | Quantive Results + Tability | 首页待办、目标进度、check-in、目标健康卡片 | 团队首页优先展示 Objective 健康度、风险 Result、待处理 Feedback 和决策记录 |
| `/objectives` 目标列表 | Tability + Linear | 目标卡片、筛选、列表/卡片视图 | 目标作为第一层对象，显示进度、信心、Result 和 Feedback 数量 |
| `/objectives/:objectiveId` 目标工作台 | Linear Project Detail + Tability | 项目详情页、tabs、overview、目标进度与风险区 | 转成 Objective 工作台，围绕 Results、Tasks、Feedback、Decisions、Evaluation 组织 |
| `/objectives/:objectiveId/results/:resultId` 结果详情 | Tability Result/Check-in + Linear Detail Panel | 指标、证据、任务、反馈时间线 | Result 成为可验证对象，显示 baseline/current/target、证据、任务和反馈历史 |
| `/tasks` 任务 | Linear | issue list、board、detail panel、紧凑执行体验 | Task 只作为执行层，必须显示 linked Result |
| `/feedback` 反馈收件箱 | Productboard + Quantive Check-ins | 反馈收集、原因分类、结构化处理 | Feedback 不是评论，而是现象、证据、原因、影响、建议动作和状态流 |
| `/feedback/:feedbackId` 反馈详情 | Productboard + Linear Detail Panel | 单条反馈详情、证据、推荐动作 | Feedback 可以创建 Task、提出 Result 更新或标记为已知边界 |
| `/review` 周复盘 | Quantive Check-ins | 周期复盘、previous vs current、next actions | 形成 ORF 的 F 机制，比较本周变化、偏差、学习和下周调整 |
| `/strategy-map` 策略地图 | Perdoo Strategy Map | 战略地图、目标级联、line of sight | 展示 North Star → Pillars → Objectives → Results → Tasks |
| `/ai-evaluation` AI 评估 | 自定义 AI 应用评估中心 + Tability Dashboard | 指标卡、表格、场景卡、失败样本 | 体现大模型应用团队专属指标和从失败样本创建 Feedback |
| `/reports` 汇报 | Quantive Reports + Tability Dashboard | 管理层摘要、进度、风险、决策、下周重点 | 面向管理者汇总 ORF 状态和下一步决策 |
| `/settings` 设置 | Linear Settings + Quantive 配置 | 周期、团队、分类、规则开关 | 配置 ORF 周期、团队、反馈分类和闭环规则 |

## 整体视觉方向

整体风格：

- 深色 SaaS 产品。
- 左侧固定 sidebar。
- 顶部有轻量 topbar。
- 主内容区采用卡片、表格、看板、时间线、图表组合。
- 视觉密度接近 Linear：信息多但不乱。
- 页面切换稳定，不做花哨动画。
- 可以有轻量 framer-motion 动效，但不要喧宾夺主。

状态颜色：

- On Track：绿色。
- At Risk：黄色 / 橙色。
- Blocked：红色。
- Draft：灰色。
- Reviewing：蓝紫色。

设计 token 要求：

- 所有主题色必须集中在 `src/styles.css` 的 `--orf-*` CSS variables。
- 页面代码必须优先使用 `orf-card`、`orf-input`、`orf-text-primary`、`orf-text-secondary`、`orf-text-muted`、`orf-surface-muted`、`orf-border`、`orf-primary-action`、`orf-secondary-action`、`orf-badge-*` 等语义类。
- 不要在新增页面中直接写死 `text-white`、`bg-slate-*`、`border-white/*`、产品品牌色或一次性十六进制颜色。
- 默认暗色主题，同时提供亮色主题。
- primary accent 使用克制的蓝紫色，只用于主操作、选中态和少量高亮，不要把整套界面做成单一紫色主题。
- success / warning / danger / info / neutral 必须通过 `orf-badge-*` 状态类表达。

字体：

- 使用系统字体：Inter / ui-sans-serif / system-ui。
- 标题清晰但不要巨大。
- 正文使用 13px - 14px。
- 表格和列表偏高密度。

## 参考产品与转化方式

### Tability

参考重点：

- Objective / OKR 卡片如何展示进度、信心、风险。
- Check-in 如何作为每周更新出现。
- Dashboard 如何把目标、任务、进度图、风险状态放在一个页面。
- 目标和任务之间如何建立上下文连接。
- Strategy Map 如何展示目标之间的依赖和级联。

转化到 ORF Flow：

- OKR 改成 ORF。
- Key Result 改成 Result。
- Check-in 改成 Feedback。
- 每个 Result 必须能看到指标、当前值、目标值、证据、任务、反馈历史。
- 每个 Feedback 必须能反向生成 Result 调整建议。

### Linear

参考重点：

- 左侧 sidebar 的高密度导航。
- 顶部 breadcrumb / tabs / filters 的处理。
- Issue list 的紧凑行布局。
- 右侧 detail panel 或详情页的信息组织。
- Command-K 快速跳转体验。
- 空状态设计。
- 快速创建 issue / task 的 modal。

转化到 ORF Flow：

- Linear 只影响执行层 UI 语言，不影响产品对象模型。
- Issue list 的密度和快捷交互可以转成 Task 页面与 Task side panel。
- Project detail 的视觉组织方式可以启发 Objective workspace 的布局，但 Objective workspace 必须以 Results 和 Feedback 为中心。
- Cycle 只能作为 ORF 周期筛选和上下文，不作为主对象。
- Task 必须显示它支撑哪个 Result。
- 不要让 Task 成为第一层核心，第一层核心是 Objective 和 Result。

### Perdoo

参考重点：

- Strategy Map。
- 公司目标、战略支柱、团队目标之间的级联关系。
- 从日常工作到战略目标的 line of sight。

转化到 ORF Flow：

- 做一个 Strategy Map 页面。
- 展示 North Star Objective、Strategic Pillars、Team Objectives、Results、Tasks。
- 用户可以从任意节点跳转到对应详情页。
- 节点之间用线连接，不需要复杂编辑，但要视觉上成熟。

### Quantive Results

参考重点：

- Home screen 分成 To-do、My OKRs、My teams' OKRs、Progress。
- Check-ins 围绕目标进展、上下文、挑战展开。
- Check-in 可以按周期进行，并且比较当前和历史。

转化到 ORF Flow：

- Dashboard 中必须有 My ORF Todo、My Objectives、Team Objectives、Progress、Feedback Due。
- Feedback Review 页面必须能比较本周和上周。
- Feedback 表单不是普通评论，要有结构化字段。

## 信息架构与路由

1. `/dashboard`：ORF Dashboard，团队首页，展示目标、结果、反馈、风险、待办。
2. `/objectives`：Objectives，目标列表，支持筛选和跳转。
3. `/objectives/:objectiveId`：Objective Detail，单个 Objective 工作台，是产品最核心页面。
4. `/objectives/:objectiveId/results/:resultId`：Result Detail，单个 Result 的指标、证据、任务、反馈详情。
5. `/tasks`：Tasks，Linear 风格任务执行列表和看板。
6. `/feedback`：Feedback Inbox，所有结构化反馈的收集、分类、处理。
7. `/feedback/:feedbackId`：Feedback Detail，单条反馈详情，可转成任务或 Result 调整。
8. `/review`：Weekly Review，每周 ORF 复盘，比较本周与上周，输出决策。
9. `/strategy-map`：Strategy Map，展示 Objective、Result、Task 的层级关系。
10. `/ai-evaluation`：AI Evaluation，大模型应用评估中心，展示评估集、测试运行、幻觉率、召回率、时延、成本等。
11. `/reports`：Reports，汇报视图，适合管理者查看。
12. `/settings`：Settings，周期、团队、标签、反馈原因分类配置。

所有页面都必须能通过 sidebar 或页面内链接跳转。

## 全局布局

### AppShell

全局布局由 Sidebar、Topbar 和主内容区组成。

### Sidebar

顶部：

- ORF Flow logo 文本，不需要真实 logo。
- Workspace switcher: “AI Application Team”。
- 当前 Cycle: “2026 Q2”。

主导航：

- Dashboard。
- Objectives。
- Tasks。
- Feedback。
- Weekly Review。
- Strategy Map。
- AI Evaluation。
- Reports。
- Settings。

底部：

- Command Menu 提示：“⌘K Search”。
- 当前用户：“Alex Chen / AI PM”。
- 小头像，可用 initials。

细节：

- 当前路由高亮。
- 每个导航项有 lucide icon。
- 高度 100vh。
- 宽度约 248px。
- 深色背景，与主内容区有边框分隔。

### Topbar

- 左侧：breadcrumb，例如 “Objectives / AI Agent Reliability”。
- 中间：全局搜索框，占位符 “Search objectives, results, feedback...”。
- 右侧：New Feedback、New Objective、Bell 图标、用户头像。
- New Feedback 打开 modal。
- New Objective 打开 modal。

### Command Menu

- 按 Ctrl+K 或点击 sidebar 底部入口打开。
- 弹层居中。
- 可搜索页面、Objective、Result、Task、Feedback。
- 点击条目跳转对应页面。
- 不需要真实搜索算法，mock filter 即可。

## Mock 数据

团队背景：

大模型应用开发团队，正在建设 AI 标准平台、知识库问答、Agent 工具调用、评估体系和权限审计。

### Objectives

Objective 1：

- 标题：建立可持续交付大模型应用的工程能力。
- 说明：把团队从 Demo 驱动转向可评估、可追踪、可灰度、可回滚的工程化交付方式。
- Owner: Mia Zhang。
- Cycle: 2026 Q2。
- 状态：At Risk。
- 信心：68%。

Results：

1. 核心 AI 场景评估集覆盖率达到 90%，baseline 35%，current 62%，target 90%，status At Risk。
2. RAG 检索 Recall@5 达到 85%，baseline 58%，current 76%，target 85%，status On Track。
3. 线上幻觉率降低到 3% 以下，baseline 11%，current 6.5%，target 3%，status At Risk。
4. Agent 工具调用成功率达到 96%，baseline 81%，current 91%，target 96%，status On Track。
5. P95 响应时延控制在 3 秒以内，baseline 6.8s，current 4.2s，target 3.0s，status At Risk。

Objective 2：

- 标题：建立结构化 Feedback 闭环，持续修正 Prompt、RAG 与 Agent 流程。
- 说明：将线上失败案例沉淀为可分类、可追踪、可转化为改进动作的反馈系统。
- Owner: Ethan Liu。
- Cycle: 2026 Q2。
- 状态：On Track。

Results：

1. 每周 100% 核心失败案例进入 Feedback Inbox。
2. 80% Feedback 能完成原因分类。
3. 高风险 Feedback 在 48 小时内形成调整动作。
4. 每两周更新一次评估集和回归用例。

Objective 3：

- 标题：降低 AI 应用运行成本并保持回答质量。

Results：

1. 单次请求平均成本降低 35%。
2. 高成本链路 100% 可观测。
3. Prompt token 冗余降低 25%。
4. 缓存命中率达到 40%。

### Feedback 原因分类

- Requirement Gap：需求定义不清。
- Prompt Issue：Prompt 约束不足。
- Retrieval Issue：检索召回不足。
- Rerank Issue：排序不准。
- Knowledge Gap：知识库缺失或过期。
- Model Limitation：模型能力边界。
- Tool Failure：Agent 工具调用失败。
- Permission Issue：权限或数据访问问题。
- Latency Issue：时延问题。
- Cost Issue：成本问题。
- UX Issue：用户体验问题。
- Evaluation Gap：评估集未覆盖。

### Feedback 示例

1. 用户问“权限策略继承规则”时，系统给出了旧版本答案。证据为 3 条线上日志，引用来源均为 2025 版权限文档。原因分类为 Knowledge Gap + Retrieval Issue。影响高，可能导致客户配置错误。建议动作是更新知识库元数据，增加文档版本过滤，补充回归用例。关联 Result 为 RAG 检索 Recall@5 达到 85%，状态 Reviewing。
2. Agent 在调用工单系统 API 时经常重复提交。证据为过去 7 天出现 18 次重复调用。原因分类为 Tool Failure + Prompt Issue。影响中高。建议动作是增加 idempotency key，工具调用前增加状态确认步骤。关联 Result 为 Agent 工具调用成功率达到 96%，状态 Action Created。
3. 用户对“模型部署成本”追问时，回答延迟超过 8 秒。原因分类为 Latency Issue + Cost Issue。建议动作是引入缓存，拆分长上下文，增加 cost-aware routing。关联 Result 为 P95 响应时延控制在 3 秒以内。

### Tasks 示例

- 构建 RAG 召回评估脚本。
- 为权限文档增加版本元数据。
- 建立 Prompt regression suite。
- 增加 Agent 工具调用幂等保护。
- 接入成本统计面板。
- 增加 hallucination judge。
- 梳理高频失败案例 Top 20。
- 灰度发布新版检索策略。
- 建立 Feedback to Result 调整流程。

## 页面要求

### `/dashboard` - ORF Dashboard

目标：让用户一进来就看到整个团队的 ORF 状态。

内容：

- 顶部标题 “ORF Dashboard”。
- 副标题 “Objective-driven execution for AI application teams”。
- Cycle selector: “2026 Q2”。
- 按钮 “Start Weekly Review”，跳转 `/review`。
- KPI Cards: Active Objectives 3、Results At Risk 5、Feedback Due 7、Engineering Confidence 72%。
- Objective Health Board: 展示 3 个 Objective，点击跳转详情。
- Feedback Due Panel: 展示待处理 Feedback，点击跳转详情。
- Risk Radar: 用 recharts 展示 Prompt Issue、Retrieval Issue、Knowledge Gap、Tool Failure、Latency Issue、Cost Issue。
- Decision Log: 展示最近决策。
- My ORF Todo: Update 2 Results、Review 3 Feedback、Close 4 Tasks、Prepare weekly check-in。

### `/objectives` - Objectives

目标：展示所有 Objectives，支持筛选、搜索、创建。

内容：

- 标题 “Objectives”。
- 说明 “Manage the O layer of ORF. Objectives define the state your team wants to change.”。
- 按钮 “New Objective”。
- 筛选栏：Search、Status、Owner、Cycle、Confidence range。
- View toggle: Cards / Table。
- Cards view 展示标题、说明、owner、cycle、confidence、status、progress、result 数量、feedback 数量、last updated。
- Table view 列为 Objective、Owner、Status、Confidence、Progress、Results、Feedback、Last Check-in、Actions。
- New Objective modal 包含 Objective title、Why it matters、Owner、Cycle、Boundary / Non-goals、Initial Results。

### `/objectives/:objectiveId` - Objective Detail

这是最重要的页面，要做成成熟 SaaS 的核心工作台。

顶部：

- Breadcrumb: Objectives / 当前目标。
- 大标题、状态 badge、owner、cycle、confidence score、progress。
- 按钮 New Result、New Feedback、More。

Summary Card：

- Objective statement。
- Why it matters。
- Boundary / Non-goals。
- Success definition。
- Last feedback summary。

Tabs：

- Overview。
- Results。
- Tasks。
- Feedback。
- Decisions。
- Evaluation。

Overview：

- Progress Overview: 总 progress bar、confidence trend line chart、result status breakdown。
- Results Grid: 每个 Result 一张卡，包含指标、进度、状态、owner、evidence count、feedback count、linked task count。
- Feedback Timeline: 展示最近 Feedback、cause、evidence、suggested adjustment、action status。
- 右侧信息栏：ORF Integrity Check、Open Risks、Related AI Systems、Quick Actions。

Results tab：

- 表格列 Result、Metric、Baseline、Current、Target、Status、Confidence、Owner、Last Feedback。
- 支持 status filter 和 New Result。

Tasks tab：

- Linear 风格 issue list。
- 每个 task 必须显示 linked Result。
- 支持 Backlog、Todo、In Progress、In Review、Done。

Feedback tab：

- 展示该 Objective 相关 Feedback。
- 支持 cause、severity、status 过滤。
- 状态包括 New、Reviewing、Action Created、Result Updated、Closed。

Decisions tab：

- 展示决策日志，包含 decision、reason、evidence、owner、date、impacted result。

Evaluation tab：

- 展示 accuracy、hallucination rate、retrieval recall@5、p95 latency、cost per request、tool success rate。
- 使用 recharts 展示趋势。

### `/objectives/:objectiveId/results/:resultId` - Result Detail

目标：让 Result 成为可验证、可执行、可反馈的对象。

内容：

- Breadcrumb、Result title、Status badge、Owner、Confidence。
- 按钮 Add Evidence、New Feedback、Create Task、Propose Result Update。
- Metric Card: baseline、current、target、progress、unit、direction、trend chart。
- Evidence Panel: eval run、log sample、user interview、dashboard snapshot、incident report。
- Linked Tasks: 任务列表，可切换状态。
- Feedback History: 结构化反馈时间线，支持 Convert to task 和 Update Result。
- 右侧 Result Definition 和 ORF Quality Check。

关键交互：

- Propose Result Update 打开 modal，填写当前 Result、建议修改后的 Result、修改原因、关联 Feedback。
- New Feedback 预填当前 Result。

### `/tasks` - Tasks

目标：提供开发团队熟悉的任务执行体验，但强制体现任务和 Result 的关系。

内容：

- 标题 “Tasks”。
- 说明 “Tasks are execution units. They should support measurable Results.”。
- View toggle: List / Board。
- Filter: Status、Assignee、Linked Result、Priority、Cause category。
- List view 参考 Linear issue list 密度。
- Board view 列为 Backlog、Todo、In Progress、In Review、Done。
- Task detail side panel 展示 title、description、status、assignee、linked Objective、linked Result、feedback origin、checklist、activity。

重要规则：

- 如果 task 没有 linked Result，显示 warning：“This task is not linked to any Result. ORF recommends linking execution to measurable outcomes.”

### `/feedback` - Feedback Inbox

目标：把 Feedback 从评论变成结构化对象。

内容：

- 标题 “Feedback Inbox”。
- 说明 “Capture signals, classify causes, and update Results.”。
- 按钮 “New Feedback”。
- 筛选：Cause、Severity、Status、Linked Objective、Linked Result、Source、Date range。
- Feedback 卡片包含 phenomenon、cause badges、severity、linked objective/result、evidence count、suggested adjustment、status、owner、created time。
- 右侧 Insight Panel 包含 Feedback by Cause chart、High Severity count、Unclassified count、Avg response time、Top recurring issue。
- 状态流：New → Reviewing → Action Created → Result Updated → Closed。

New Feedback modal 字段：

- Phenomenon。
- Evidence。
- Cause Category。
- Impact。
- Linked Objective。
- Linked Result。
- Suggested Adjustment。
- Source。
- Owner。

### `/feedback/:feedbackId` - Feedback Detail

内容：

- Feedback ID、状态 badge、severity、owner、created date、linked objective/result。
- Phenomenon。
- Evidence。
- Cause Analysis。
- Suggested Adjustment。
- Decision Area: Create Task、Propose Result Update、Mark as Known Boundary。
- Activity Timeline。
- 右侧 Linked Objective card、Linked Result card、Similar Feedback、Recommended Actions。

交互：

- Create Task 打开 modal 并预填 title 和 description。
- Propose Result Update 打开 modal。
- Mark as Known Boundary 把状态改成 Closed，并在 Activity Timeline 添加记录。

### `/review` - Weekly Review

目标：让 ORF 的 F 形成周期性机制。

内容：

- 标题 “Weekly Review”。
- Cycle: 2026 Q2。
- Week: Apr 20 - Apr 26。
- 按钮 “Publish Review”。
- What changed?
- What is off track?
- What did we learn?
- What will change next week?
- Review Summary Editor。

要求：

- 体现 check-in 的周期感。
- 能比较 previous vs current。
- 强调 progress、achievements、challenges、next actions。

### `/strategy-map` - Strategy Map

目标：展示 O-R-Task 的上下游关系，参考 Strategy Map，但做成 ORF 版本。

层级：

- North Star: “Build reliable AI application delivery capability”。
- Strategic Pillars: Evaluation First、Reliable RAG、Agent Safety、Cost & Latency Control、Feedback-driven Iteration。
- Objectives。
- Results。
- Tasks。

实现方式：

- 不需要复杂图编辑库。
- 可以用 CSS grid + SVG lines。
- 节点是卡片。
- 线条连接上下层。
- 点击节点跳转对应详情页。
- 节点状态用边框颜色表示。
- hover 节点时高亮相关连接线。
- 右侧 Inspector 展示所选节点详情。

### `/ai-evaluation` - AI Evaluation

目标：体现产品不是普通 OKR 工具，而是面向大模型应用团队。

内容：

- 标题 “AI Evaluation”。
- 说明 “Track quality, cost, latency, and reliability of AI application flows.”。
- Metric Cards: Accuracy 82%、Hallucination Rate 6.5%、Recall@5 76%、Tool Success Rate 91%、P95 Latency 4.2s、Avg Cost / Request $0.038。
- Eval Runs Table。
- Scenario Cards: Permission Q&A、Contract Review Assistant、Ticket Creation Agent、Knowledge Base Search、Cost Analysis Assistant。
- Failure Samples: 问题、模型回答、期望答案、判定原因、create feedback 按钮。

交互：

- 点击 Create Feedback，从失败样本生成 Feedback。
- 点击 linked result 跳转 Result Detail。
- 表格支持简单筛选。

### `/reports` - Reports

目标：管理层汇报视图。

内容：

- 标题 “Reports”。
- 按钮 “Presentation Mode”。
- 按钮 “Copy Summary”。
- Executive Summary。
- Objective Progress。
- Results at Risk。
- Feedback Themes。
- Decisions Made。
- Next Week Focus。

Presentation Mode 可以只是切换成更大卡片布局，不需要导出 PDF。

### `/settings` - Settings

设置项：

- Cycles: 2026 Q2、2026 Q3 Draft。
- Teams: AI Application Team、Platform Engineering、Evaluation Team。
- Feedback Taxonomy: 展示所有 cause categories，可新增 category，local state 即可。
- ORF Rules: Require Result for Task、Require Evidence for Feedback、Weekly Feedback Cadence、Auto-create review summary。

## 组件设计要求

请拆成清晰组件，不要把所有东西写在一个文件里。

建议组件：

- AppShell。
- Sidebar。
- Topbar。
- CommandMenu。
- StatusBadge。
- ConfidenceBadge。
- ProgressBar。
- MetricCard。
- ObjectiveCard。
- ResultCard。
- FeedbackCard。
- FeedbackTimeline。
- TaskRow。
- TaskBoard。
- TaskSidePanel。
- EvidenceList。
- DecisionLog。
- ORFIntegrityCheck。
- StrategyNode。
- StrategyMapCanvas。
- NewObjectiveModal。
- NewFeedbackModal。
- NewTaskModal。
- ResultUpdateModal。

数据文件：

- `src/data/mockData.ts`。

类型文件：

- `src/types/orf.ts`。

路由：

- `src/App.tsx` 中配置 React Router。
- 每个页面单独文件：
  - `DashboardPage.tsx`。
  - `ObjectivesPage.tsx`。
  - `ObjectiveDetailPage.tsx`。
  - `ResultDetailPage.tsx`。
  - `TasksPage.tsx`。
  - `FeedbackInboxPage.tsx`。
  - `FeedbackDetailPage.tsx`。
  - `WeeklyReviewPage.tsx`。
  - `StrategyMapPage.tsx`。
  - `AIEvaluationPage.tsx`。
  - `ReportsPage.tsx`。
  - `SettingsPage.tsx`。

## 数据模型

### Objective

- id。
- title。
- description。
- whyItMatters。
- owner。
- cycle。
- status。
- confidence。
- progress。
- boundary。
- successDefinition。
- resultIds。
- feedbackIds。
- taskIds。
- createdAt。
- updatedAt。

### Result

- id。
- objectiveId。
- title。
- description。
- metricName。
- baseline。
- current。
- target。
- unit。
- direction: `increase` | `decrease`。
- status。
- confidence。
- owner。
- evidenceIds。
- taskIds。
- feedbackIds。
- trend: array of date/value。
- reviewCadence。

### Feedback

- id。
- phenomenon。
- evidenceIds。
- causeCategories。
- impact。
- linkedObjectiveId。
- linkedResultId。
- suggestedAdjustment。
- source。
- status。
- owner。
- createdAt。
- updatedAt。
- activity。

### Task

- id。
- title。
- description。
- status。
- priority。
- assignee。
- linkedObjectiveId。
- linkedResultId。
- feedbackOriginId。
- dueDate。
- tags。
- checklist。
- createdAt。
- updatedAt。

### Evidence

- id。
- type。
- title。
- summary。
- source。
- date。
- owner。
- linkedResultId。
- linkedFeedbackId。

### Decision

- id。
- title。
- reason。
- evidence。
- owner。
- date。
- linkedObjectiveId。
- linkedResultId。
- linkedFeedbackId。

## 关键交互

必须实现：

1. 页面跳转：Sidebar 跳转，Objective 卡片跳转 Objective Detail，Result 卡片跳转 Result Detail，Feedback 卡片跳转 Feedback Detail，Strategy Map 节点跳转对应详情。
2. Modal: New Objective、New Result、New Feedback、New Task、Propose Result Update。
3. 状态更新：Task 状态可切换，Feedback 状态可切换，Result confidence 可调整，简单保存到 localStorage。
4. Command Menu: Ctrl+K 打开，可以搜索页面和 mock 数据，点击跳转。
5. Toast: 保存、发布、创建任务、更新 Result 时显示 toast。
6. Empty State: 筛选无结果时显示成熟的 empty state。
7. Loading Skeleton: 页面首次加载可以模拟 300ms loading skeleton。

## 产品细节

### 文案

文案要专业，不要泛泛。

错误示例：

- Improve AI。
- Do task。
- Fix bug。

正确示例：

- Reduce hallucination in permission-policy answers。
- Add version-aware filtering to RAG retrieval。
- Create regression set for ticket creation agent。
- Classify feedback by retrieval, prompt, tool and evaluation gaps。

### ORF 关系

- Objective 页面必须能看到 Results。
- Result 页面必须能看到 Tasks 和 Feedback。
- Feedback 页面必须能产生 Task 或 Result Update。
- Task 页面必须显示 linked Result。
- Strategy Map 必须显示 Objective → Result → Task。

### 任务层级

- Dashboard 第一屏不要以任务列表开头。
- 第一屏必须是 Objective health 和 Feedback due。
- Tasks 是执行层，不是顶层战略层。

### Feedback 结构

Feedback 至少包含：

- phenomenon。
- evidence。
- cause category。
- impact。
- suggested adjustment。
- linked result。
- status。

### 大模型应用指标

必须出现以下指标：

- hallucination rate。
- retrieval recall@5。
- p95 latency。
- avg cost per request。
- tool success rate。
- eval coverage。
- prompt version。
- RAG version。
- model version。

## 验收标准

1. 看起来像一个真实成熟的 SaaS 产品，而不是静态 demo。
2. 至少 10 个页面都能通过路由跳转。
3. 数据不是 lorem ipsum，而是大模型应用团队真实语境。
4. Objective、Result、Task、Feedback 的关系清楚。
5. Feedback 能反向推动 Result 和 Task，这是产品差异点。
6. UI 有明显参考 Tability / Linear / Perdoo / Quantive 的信息架构优点，但视觉是原创的。
7. 深色模式有高级感，组件间距、字体大小、hover、badge、progress、chart 都要统一。
8. 没有后端也能通过 mock data 和 localStorage 体验完整流程。
9. 页面不要只堆内容，要有清晰的层级、重点和空白。
10. 代码结构清晰，可继续扩展成真实产品。

## 开发前待确认

进入代码实现前，建议先确认以下决策：

1. 首版是否一次性做完 12 个页面，还是先做核心 6 个页面并保留其余路由占位。
2. 是否引入 shadcn/ui。如果引入，需要先建立 Tailwind 和组件生成规则。
3. localStorage 需要保存哪些状态：新增、编辑、状态切换、modal 表单，还是只保存关键状态。
4. Strategy Map 首版是否只做静态关系图，还是支持节点选择和 hover 高亮。
5. 是否把 ORF Flow 作为产品名，仓库名继续保持 ORF。
