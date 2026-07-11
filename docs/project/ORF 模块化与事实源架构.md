# ORF 模块化与事实源架构

## 业务状态链

- `Objective` 是挑战流程的业务事实主体；`Objective.flowStatus` 是生命周期唯一业务状态，`stage` 只作为由 `flowStatus` 映射得到的页面兼容投影。生产代码只写 `flowStatus`，数据库触发器和约束负责派生并校验 `stage`。
- 主链路是 `candidate -> open/applying/recruiting -> reestimating -> frozen -> submitted -> accepted -> settled/closed`；`reestimating` 的默认完成期限由 `Objective.confirmationDueAt` 表达，到期后后端自动尝试冻结，手动提前完成和自动到期冻结共用同一套指标与等级积分校验。冻结后如需修改指标口径或等级积分，只能在正式提交战利品前由挑战者发起带理由的 `frozenReestimate` 对齐申请，指挥官审批并设置不超过 `finalDueAt` 的新 `confirmationDueAt` 后，目标从 `frozen` 回到现有 `reestimating` 链路。`submitted` 已有正式战利品和 `lootSubmittedAt`，不允许再重新重估或改等级积分。验收不通过走 `submitted -> revisionRequired -> submitted` 返工重提支线，发布、申请、征召、接受、冻结、重新重估、提交战利品、验收、返工重提和结算只能通过后端接口推进。
- `Result`、`Task`、评论、试验收、对齐申请、战利品和积分账本都挂在 `Objective` 下；它们是子事实或派生读模型，不反向拥有目标生命周期。
- 数据库是业务事实源；前端 `OrfState` 是服务端 read model 快照，`completion/title/creation` overlay 只是临时 UI 状态。
- 所有 ORF 业务读模型必须携带明确团队作用域；作用域缺失或团队不存在时明确失败，不能退回全库读取、默认团队或 Alex/Mia 等演示数据。
- 角色权限以 `role_permissions` 显式行作为团队配置事实；团队创建负责初始化权限，权限 GET 和业务鉴权只读，不能用读取副作用补齐数据。
- 悬赏大厅是发布后到结算的公开生命周期读模型，我的挑战是 `TaskManagementData` 的执行详情成员视图；它们都不是第二套事实源。
- 项目归属由 `Project` 注册表、可空 `Objective.projectId` 和可空 `Feedback.projectId` 组成；`Project.name` 是项目名称事实源，目标和反馈都可以保持未归属，项目不参与权限、成员、生命周期、反馈通知收件人或积分结算。
- 反馈 issue 的业务事实源是 `feedback`、`feedback_cause_categories`、`feedback_activity_events`、首条评论正文和 `feedback_subscriptions`。反馈项目归属、标题、影响、分类、处理人和状态是反馈元数据；正文和附件属于评论事实源；列表搜索、侧栏展示和参与者是派生展示状态。
- 匿名互评原始数据、服务器草稿、提交历史和汇总计算以共享结算服务为事实源；ORF 后端只认证、校验权限、按服务端指标和挑战者事实补齐矩阵并代理请求，不保存匿名原始评价。旧 `objective_contribution_reviews` 表、旧评价记录类型和旧主库汇总算法已经删除；ORF 业务事实源只接收指挥官确认后的结算事件、贡献分配和公开积分账本。旧提交 URL 仅保留返回 `410` 的协议墓碑，不拥有数据结构或业务逻辑。
- 新增模块必须通过显式输入输出组合，不让页面局部状态、仓库私有 helper 或旧 store mutation 成为隐式状态机。

## 当前模块边界

- `server/app.ts` 只负责 Fastify 装配、全局错误处理、跨域、上传限制和 route 注册。
- `server/routes/*` 负责 HTTP 解析、鉴权入口调用和响应映射；业务写入仍由 repository/service 函数执行。
- `server/realtime/orfReadModelInvalidations.ts` 负责统一发布 ORF 读模型失效事件；写仓库只声明事实变化原因和目标。
- `server/readModels/orfTaskManagementReadModel.ts` 负责从数据库事实构造 `TaskManagementData` 和 `OrfState` 快照；写入逻辑只通过 `getOrfStateSnapshot` 做写后回读。
- `server/readModels/orfChallengeReadModels.ts` 负责构造悬赏大厅读模型，并从 `TaskManagementData` 收敛我的挑战数据。
- `server/readModels/currentUserAccessReadModel.ts` 负责当前用户 access 读模型；Provider 全局权限判断只读取 `/api/me/access`，不依赖任务管理读模型。
- `server/repositories/orfFeedbackRepository.ts` 自包含反馈创建、owner 校验、元数据更新、状态变更权限、活动事件和写后回读；`server/repositories/feedbackSubscriptionRepository.ts` 自包含反馈普通通知收件人和订阅/静音状态；`feedbackRoutes` 不再依赖完整 `orfRepository`。
- `server/access/orfTargetAccess.ts` 负责 work item、feedback 的 scope 解析和访问边界判断，避免 `accessPolicy` 依赖完整写仓库。
- `src/domain/orfReadModel/` 是前后端共享 read model DTO 契约。
- `src/domain/orfChallengeEntry/` 是挑战入口关闭、申请、接受等纯派生判断。
- `src/state/OrfProvider.tsx` 负责会话、实时事件、全局通知和 Context 组合；业务 API 动作拆到 `orfProviderObjectiveActions`、`orfProviderResultActions`、`orfProviderTaskActions`、`orfProviderFeedbackActions`、`orfProviderUserActions`、`orfProviderCommentActions`。
- `src/state/orfStateSnapshot.ts` 负责前端空快照和纯标准化入口；旧 `OrfFlowStore` 及其本地业务 mutation 已删除。
- `src/testing/fixtures/initialOrfState.ts` 只保存测试演示 fixture；`src/data/initialOrfState.ts` 仅为现有数据化测试保留兼容转发，生产代码禁止依赖。
- `src/features/challenge/hooks/useChallengeReadModelData.ts` 负责挑战页 read model 加载与快照合并，页面本体负责交互编排和渲染。

## 当前不变量

- 后端数据库是唯一业务事实源；前端不直接持久化 objective/result/task/feedback/comment 业务事实。
- 正常服务端和前端依赖图中不得出现测试演示 fixture；空状态必须显式构造为空数组和空身份，不能通过“复制演示状态后清空部分字段”得到。
- 目标参与者身份只由 `challengerUserIds`、`assignedChallengerUserIds` 和申请记录中的 `applicantUserId` 表达；数据库持续校验这些 ID 属于同一团队、集合内部不重复且正式挑战者与待响应征召不交叉。姓名数组和申请人姓名由 ID 派生，用户改名后自动刷新，不能参与权限、归属或结算判断。
- `src/domain/orfObjectiveParticipants/` 是参与者身份解析、成员判断和结算目标构造的唯一 capability 边界；后端权限、评论、工作日志、战利品和匿名互评代理不得自行用姓名或平行数组索引重新定义参与者语义。
- Provider 只组合 action hook，不直接拼接 Objective、Result、Task、Feedback 的业务写入流程。
- Read model 可以服务页面展示和写后回读，但不能成为第二套业务事实源；写入仍必须先落数据库，再发布失效事件，再刷新快照。
- 悬赏入口判断、挑战者身份判断、生命周期窗口判断优先使用 `src/domain/*` 纯函数，页面和 Provider 不复制业务条件。
