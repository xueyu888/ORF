# ORF 模块化与事实源架构

## 业务状态链

- `Objective` 是挑战流程的业务事实主体；`Objective.flowStatus` 是生命周期唯一业务状态，`stage` 只作为页面兼容阶段。
- 主链路是 `candidate -> open/applying/recruiting -> reestimating -> frozen -> submitted -> accepted -> settled/closed`；冻结后如需修改指标口径，只能由挑战者发起 `frozenReestimate` 对齐申请，指挥官审批并设置不超过 `finalDueAt` 的新 `confirmationDueAt` 后，目标从 `frozen` 回到现有 `reestimating` 链路。验收不通过走 `submitted -> revisionRequired -> submitted` 返工重提支线，发布、申请、征召、接受、冻结、冻结后重开重估、提交战利品、验收、返工重提和结算只能通过后端接口推进。
- `Result`、`Task`、评论、试验收、对齐申请、战利品和积分账本都挂在 `Objective` 下；它们是子事实或派生读模型，不反向拥有目标生命周期。
- 数据库是业务事实源；前端 `OrfState` 是服务端 read model 快照，`completion/title/creation` overlay 只是临时 UI 状态。
- 悬赏大厅是发布后到结算的公开生命周期读模型，我的挑战是 `TaskManagementData` 的执行详情成员视图；它们都不是第二套事实源。
- 项目归属由 `Project` 注册表和可空 `Objective.projectId` 组成；`Project.name` 是项目名称事实源，目标可以保持未归属，项目不参与权限、成员、生命周期或积分结算。
- 匿名互评原始数据、服务器草稿、提交历史和汇总计算以共享结算服务为事实源；ORF 后端只认证、校验权限、按服务端指标和挑战者事实补齐矩阵并代理请求，不保存匿名原始评价。ORF 业务事实源只接收指挥官确认后的结算事件、贡献分配和公开积分账本。
- 新增模块必须通过显式输入输出组合，不让页面局部状态、仓库私有 helper 或旧 store mutation 成为隐式状态机。

## 当前模块边界

- `server/app.ts` 只负责 Fastify 装配、全局错误处理、跨域、上传限制和 route 注册。
- `server/routes/*` 负责 HTTP 解析、鉴权入口调用和响应映射；业务写入仍由 repository/service 函数执行。
- `server/realtime/orfReadModelInvalidations.ts` 负责统一发布 ORF 读模型失效事件；写仓库只声明事实变化原因和目标。
- `server/readModels/orfTaskManagementReadModel.ts` 负责从数据库事实构造 `TaskManagementData` 和 `OrfState` 快照；写入逻辑只通过 `getOrfStateSnapshot` 做写后回读。
- `server/readModels/orfChallengeReadModels.ts` 负责构造悬赏大厅读模型，并从 `TaskManagementData` 收敛我的挑战数据。
- `server/readModels/currentUserAccessReadModel.ts` 负责当前用户 access 读模型；Provider 全局权限判断只读取 `/api/me/access`，不依赖任务管理读模型。
- `server/repositories/orfFeedbackRepository.ts` 自包含反馈创建、owner 校验、状态变更权限和写后回读，`feedbackRoutes` 不再依赖完整 `orfRepository`。
- `server/access/orfTargetAccess.ts` 负责 work item、feedback 的 scope 解析和访问边界判断，避免 `accessPolicy` 依赖完整写仓库。
- `src/domain/orfReadModel/` 是前后端共享 read model DTO 契约。
- `src/domain/orfChallengeEntry/` 是挑战入口关闭、申请、接受等纯派生判断。
- `src/state/OrfProvider.tsx` 负责会话、实时事件、全局通知和 Context 组合；业务 API 动作拆到 `orfProviderObjectiveActions`、`orfProviderResultActions`、`orfProviderTaskActions`、`orfProviderFeedbackActions`、`orfProviderUserActions`、`orfProviderCommentActions`。
- `src/state/orfStateSnapshot.ts` 负责前端空快照和标准化入口；`OrfFlowStore` 不再作为 Provider 的事实源。
- `src/features/challenge/hooks/useChallengeReadModelData.ts` 负责挑战页 read model 加载与快照合并，页面本体负责交互编排和渲染。

## 当前不变量

- 后端数据库是唯一业务事实源；前端不直接持久化 objective/result/task/feedback/comment 业务事实。
- Provider 只组合 action hook，不直接拼接 Objective、Result、Task、Feedback 的业务写入流程。
- Read model 可以服务页面展示和写后回读，但不能成为第二套业务事实源；写入仍必须先落数据库，再发布失效事件，再刷新快照。
- 悬赏入口判断、挑战者身份判断、生命周期窗口判断优先使用 `src/domain/*` 纯函数，页面和 Provider 不复制业务条件。
