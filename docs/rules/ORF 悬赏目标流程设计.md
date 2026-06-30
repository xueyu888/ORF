# ORF 悬赏目标流程设计

## 核心口径

- 挑战对象是 `Objective`，页面称为“悬赏目标”。
- `Result` 是“指标”，只作为目标的验收口径和计分基础，不拥有独立截止日期。
- `Task` 是目标执行行动项，归属于 `Objective`，不归属于 `Result`。
- 挑战者身份绑定到 `Objective.challengerUserIds`，不绑定到 `Result`；`Objective.challengers` 只是按 UUID 派生的显示名投影。
- 挑战者只能是当前作用域内的 active 普通成员；指挥官/管理员不进入 `Objective.challengerUserIds`、`Objective.assignedChallengerUserIds` 或挑战申请。
- 同一目标下的任务和子任务由 `Objective.challengerUserIds` 共同维护；`assignee` 只是执行提示，`Task.createdBy` / `updatedBy` 只是审计字段，不能作为同目标成员之间的私有维护边界。
- 悬赏大厅是所有已通过用户都可见的公开生命周期看板，不只是未领取目标列表。`open`、`applying`、`recruiting`、`reestimating`、`frozen`、`submitted`、`revisionRequired`、`accepted`、`settled` 目标都在大厅展示当前申请人、申请理由、已通过挑战者头像、征召状态和后续冻结、验收、返工、结算状态；`candidate` 只在挑战页编辑，`closed` 不进入大厅主列表。角色只决定动作能否生效，不决定界面是否隐藏。active 普通成员可以在开放期申请公开目标或接受自己的征召；指挥官/管理员需要看到完整大厅界面和操作区，但点击申请或接受时必须被提示不能挑战，不能写入申请、接受或挑战者关系。
- 一个目标可以有多个挑战者；一个目标可以包含多个指标。
- 新建目标属于挑战页内的候选目标编辑流程；全局入口只负责把用户带到挑战页。页面先插入完整 temporary 目标面板，标题输入按 Enter 或输入框失焦快速创建 `candidate`；创建 UI 必须用单一 `objectiveCreationSession` 表达 `editingDraft → submittingDraft → submittedOverlay → anchoredCreated / failedEditingDraft`。请求发起后 temporary 目标立即退出标题编辑态、留在原位并在状态列显示“保存中”，此时重复点击全局 `新建目标` 只能提示“目标正在创建，请稍后”，不能发起第二次创建。`POST /api/objectives` 返回真实目标后立即连续替换为 persisted 目标并沿用原位置，任务管理数据刷新只负责撤掉覆盖层，一次性排序锚点保留到用户切换筛选或业务排序键变化，刷新前后都不能出现目标消失或跳位。没有真实指标或行动项时，不渲染“待定义指标 / 待创建行动项”伪子行；新增必须从父级 `+` 发起。真实目标行 hover 只保留一个主新增 `+`，点击后打开子级类型选择，只能在当前权限和状态允许的 `新增/提出指标`、`新增行动项` 中选择一项。任务行 `+` 直接新增该任务的 temporary 子任务。指标行没有 `+`，因为指标当前没有子级对象。点击 `+` 后才插入对应 temporary 行并进入标题编辑；提交成功后由后端返回的真实 `Result` / `Task` / `TaskChecklistItem` 进入一次性创建覆盖层并替换 temporary 行，直到挑战页刷新数据包含同一真实 id 后撤掉覆盖层。保存成功后不自动追加下一条 temporary 行，不在目标头堆叠多个相同 `+`。
- 指标、行动项和子行动项创建必须由单一 `childCreationSession` 表达 `editingDraft → submittingDraft → submittedOverlay / failedEditingDraft → idle`。temporary 行只是该会话的展示派生数据，POST 返回的真实实体只是待快照覆盖层，后端快照才是最终业务事实源。`submittingDraft` 必须携带唯一提交 token，旧请求返回不能接管已清理或新建的草稿；`submittedOverlay` 阶段不能再启动另一条子级创建，直到后端快照包含同一真实 id 或用户显式切换上下文清理会话。页面和组件不得分别维护 temporary 行、覆盖层和快照接管条件，避免形成多个事实源。
- 挑战页目标排序统一为：候选中目标、未分配的待申请/待征召目标、已分配执行中的目标、待验收目标、已验收目标、已结算目标、已关闭目标；同组内先按截止时间升序，再按创建日期降序；业务排序键相同则保留数据源顺序，目标标题不参与列表排序。
- 用户正在操作的目标使用列表位置锚点保持当前上下文稳定。审批申请、发布、冻结、验收等动作成功后，目标状态、挑战者、申请记录和权限立即按后端事实源刷新；当前目标在用户失焦、点击其他目标、切换筛选或离开页面前保持原展示位置，锚点释放后回到统一排序。
- 指挥官可以编辑目标和指标；目标冻结后，指标口径锁定。
- 挑战者只能在自己参与目标的未过期重估期提出指标或编辑已有指标。
- 冻结发生在重估完成之后，不发生在悬赏大厅或申请阶段。
- 任务、子任务和评论用于重估/拆解/协作，不表达对单个指标的影响，也不自动推导验收、完成或结算。
- 反馈不进入悬赏目标状态机；反馈指系统或管理层面的反馈。
- 系统消息不推进业务状态，只提醒对应角色处理申请、征召和战利品验收。
- 当前产品明确不支持多团队；运行时只有一个默认作用域，`team_id` 仅作为底层存储 scope，不进入业务口径。
- 注册后必须经过管理员审核，审核通过后才能使用 ORF。

指挥官是产品称呼，权限上按管理员处理。

## 流程

```text
在挑战页输入目标标题并按 Enter 或输入框失焦创建候选目标
→ 发布到悬赏大厅
→ 成员申请挑战 / 指挥官征召
→ 指挥官确认申请，或被征召成员接受
→ 重估目标下的指标、难度、任务和验收口径
→ 重估完成期限到期自动冻结，或指挥官提前完成并冻结目标
→ 如冻结后仍需调整指标或难度，挑战者填写理由申请重新重估并由指挥官审批回到重估
→ 挑战者提交目标战利品
→ 指挥官验收目标
→ 目标级积分结算
```

“确认”不是一个独立阶段，而是一次动作：确认申请或接受征召后，成员成为目标挑战者，目标进入 `reestimating`。

## 状态机

| `Objective.flowStatus` | 页面文案 | 进入条件 | 主要操作 |
| --- | --- | --- | --- |
| `candidate` | 候选中 | 创建目标后默认进入 | 指挥官编辑目标、定义指标、维护目标行动项、发布 |
| `open` | 可申请 | 指挥官发布候选目标 | 成员申请挑战、指挥官征召 |
| `applying` | 申请中 | 至少一名成员提交申请 | 指挥官通过或拒绝申请 |
| `recruiting` | 征召中 | 指挥官指定待接受成员 | 被征召成员接受 |
| `reestimating` | 重估中 | 申请被通过或征召被接受；重新重估审批通过 | 其他 active 普通成员继续申请；指挥官改目标和指标；挑战者提出指标、编辑指标与难度、维护任务、评论；挑战者申请完成重估后，指挥官完成并冻结或打回重估；重估完成期限到期后后端自动尝试冻结 |
| `frozen` | 已冻结 | 重估完成期限到期且冻结校验通过，或指挥官确认重估完成 | 挑战者填写理由申请重新重估；挑战者提交战利品 |
| `submitted` | 待验收 | 挑战者提交战利品 | 指挥官验收指标；不再允许改难度或重新重估 |
| `revisionRequired` | 待返工 | 指挥官验收不通过 | 截止日已到且 `deadlinePenalty` 尚未结算时进行匿名互评和逾期惩罚结算；挑战者继续完成并重新提交 |
| `accepted` | 已验收 | 指挥官确认验收通过 | 挑战者匿名互评；指挥官确认结算 |
| `settled` | 已结算 | 指挥官确认最终比例并写入积分 | 查看结果和排行榜 |
| `closed` | 已关闭 | 目标关闭或放弃 | 无 |

`Objective.stage` 保留为页面阶段字段：重估对应 `orfReestimate`，冻结后对应 `goalFrozen`。业务流转以 `flowStatus` 为准。

生命周期规则的代码唯一事实源是 `src/domain/orfLifecycle/`：`policy.ts` 定义每个 `flowStatus` 的能力矩阵和排序/文案口径，`guards.ts` 只导出语义化判断，`transitions.ts` 只导出状态迁移和 `stage` 兼容规则。后端仓库、前端 store 和页面能力层不得再各自维护 `flowStatus` 集合或局部状态机。

## 页面边界

| 页面 | 状态 |
| --- | --- |
| 悬赏大厅 | 所有已通过用户可见 `open`、`applying`、`recruiting`、`reestimating`、`frozen`、`submitted`、`revisionRequired`、`accepted`、`settled` 的公开生命周期状态；默认显示全部公开悬赏，并按 `开放中 / 已冻结 / 待验收 / 待返工 / 待结算 / 已结算 / 我的相关` 过滤；奖励列只展示难度、分数和征召标记，不承载生命周期状态；参与列展示申请者、挑战者并高亮当前用户身份；操作列只表达当前用户可执行动作或暂无操作；active 普通成员可在冻结前申请公开目标或接受自己的征召；申请必须填写理由；通过后挑战者头像继续挂在大厅目标上，冻结、验收、返工和结算后仍保留公开展示；新悬赏发布写入聊天里的系统公告并通过实时横幅广播提醒在线用户；指挥官/管理员完整显示大厅界面，但挑战动作被提示并阻断 |
| 我的挑战 / 挑战工作台 | 指挥官可见 `candidate` 和全量挑战，并可按正式挑战者筛选目标；成员只见 `Objective.challengerUserIds` 包含自己的 `reestimating`、`frozen`、`submitted`、`revisionRequired`、`accepted`、`settled` |
| 成员管理 | 注册待审核、启用、拒绝、停用 |
| 统计 | `pointLedger` 结算后的成员积分 |

## 重估与冻结

重估阶段用于把挑战开始前的不确定性处理掉：

- 指挥官可以修改目标标题、边界、截止时间等目标内容。
- 指挥官可以新增和编辑目标下的指标。
- 指挥官可以在候选目标内先维护目标行动项；这些任务仍归属于 `Objective`，不归属于指标。
- 挑战者可以提出指标，也可以编辑该目标下已有指标。
- 同一目标的正式挑战者可以共同新增、编辑、勾选、移动和删除目标下的任务与子任务，并维护评论，用来拆解执行动作和协作记录；任务不挂到指标下，执行人和创建人不形成私有所有权。
- 目标至少已有一个指标，且每个指标都已校准积分等级后，指挥官才能冻结目标。

`Objective.finalDueAt` 是目标截止日期的唯一事实源。只有指挥官可以修改：`candidate/open/applying/recruiting/reestimating` 可正常调整；`frozen` 只允许因延期等异常原因把日期延后；`submitted/revisionRequired/accepted/settled/closed` 不允许修改。目标仍处于 `reestimating` 且最终截止日期实际变更时，`Objective.confirmationDueAt` 按挑战接受时间和新的最终截止日期重新计算：重估完成期限取剩余验收周期的 50%，按半天取整，保留至少半天的最小窗口，不再设置固定最长天数。冻结后延后截止日期不重新重估，也不改变 `confirmationDueAt`。

难度等级只能在正式提交战利品前调整。`reestimating` 期间可按权限直接编辑指标口径和难度；挑战者申请完成重估后，指挥官可以提前完成并冻结，也可以打回重估，目标仍保持 `reestimating`。到达 `confirmationDueAt` 后，后端自动尝试冻结；若缺少指标或难度等级未校准，则自动冻结被阻断并保留 `reestimating`，补齐后仍走同一套完成重估与冻结校验。冻结后指标口径和难度默认稳定，不允许直接编辑。若挑战者发现冻结后仍需修复，只能带理由发起 `frozenReestimate` 对齐申请；指挥官审批通过时设置新的 `confirmationDueAt`，该时间必须晚于当前时间且不能超过 `Objective.finalDueAt` 当日 23:59。审批通过后目标退回现有 `reestimating/orfReestimate` 链路并清空当前 `confirmedAt`，改完后仍需重新申请完成重估或等到新期限自动冻结。`confirmationDueAt` 到期后停止挑战者指标调整，不提供不经审批的独立续期入口。目标进入 `submitted` 后，正式战利品和 `lootSubmittedAt` 已成为验收与结算事实，不允许再通过重估修改难度或口径。

## 征召与申请

- 查看悬赏大厅不等于拥有挑战动作权限。大厅列表和操作区对所有已通过用户开放；申请和接受动作只对符合条件的 active 普通成员生效。指挥官/管理员点击申请或接受时，前端必须用弹窗提示其不应申请挑战，后端也必须拒绝写入。
- `Objective.publishedAt` 是目标发布到悬赏大厅的时间，发布动作写入一次；目标创建时间和后续更新时间不能作为大厅发起时间展示。发布动作同时生成 `objective.published` 系统通知，并向在线 active 用户发送 `system.broadcast`，分别用于聊天系统公告、横幅广播和大厅刷新。
- 申请挑战只表达意愿，不直接成为挑战者；申请必须填写 `reason`，大厅和指挥官审核都读取同一条申请记录。
- 申请挑战只允许 active 普通成员在 `open`、`applying`、`recruiting`、`reestimating` 发起；已是挑战者或已有 pending 申请不能重复申请。
- 指挥官通过申请后，普通成员申请人成为挑战者，目标进入重估；该目标继续留在悬赏大厅，公开展示已通过挑战者和仍待处理的申请。
- 申请审核只允许在 `applying`、`recruiting`、`reestimating`。
- 征召发生在目标层级，不存在指标级征召。
- 征召对象只能是 active 普通成员。
- 被征召成员只能接受征召；有异议时线下找指挥官处理。
- 被征召成员接受后成为挑战者，目标进入重估。
- `frozen`、`submitted`、`revisionRequired`、`accepted`、`settled`、`closed` 不再接受或审核挑战申请；历史残留的 pending 申请只读，不应展示通过或拒绝操作。

## 战利品

战利品提交发生在目标层级，且仅允许普通成员挑战者在 `frozen` 状态提交。

挑战者在 `frozen` 状态可发起一次目标级试验收。试验收复用战利品的完成说明、指标主张、证据和自测摘要，但保存为 `objectiveTrialReviews`，不写入 `objectiveLoot`，不改变 `Objective.flowStatus`，不触发验收或结算。指挥官只能反馈“可正式提交”或“需补充”；正式提交仍必须由挑战者后续提交目标战利品完成，提交后目标才进入 `submitted`。

战利品结构化保存到 `objectiveLoot`：

- `body`：完成说明。
- `resultClaims`：每个指标的完成、证伪或未完成状态；接口内部兼容值 `notClaimed` 在界面展示为“未完成”。
- `evidenceText`：每个指标对应的证据说明。
- `selfTestReportBody` / `selfTestReportUrl`：自测报告占位。

自测报告的文件化打开和编辑依赖编辑器能力，当前先保留 TODO，提交页先支持文本摘要。

## 验收与积分

指挥官验收 `submitted` 目标后：

- 写入 `objectiveAcceptanceReviews`，保留每次验收的战利品、指标结论、目标结论、说明和验收人。
- 写入每个 `Result.acceptedResult`。
- 按每个指标验收结论汇总 `Objective.acceptedResult`；该字段记录最近一次验收结论，不反向定义生命周期状态。
- 写入 `completionMultiplier`、`objectiveBasePoints`；`objectiveBasePoints` 从已冻结指标的积分汇总得到，不作为目标初始化字段手填。
- 验收通过时 `Objective.flowStatus` 从 `submitted` 进入 `accepted`，并提醒挑战者可以重新检查匿名互评。
- 验收不通过时 `Objective.flowStatus` 从 `submitted` 进入 `revisionRequired`；如果已到截止日且 `deadlinePenalty` 尚未结算，仍要进行匿名互评和逾期惩罚结算。

指挥官结算 `revisionRequired` 或 `accepted` 目标后：

- 读取匿名互评提交状态、原始评分、弃权说明、均值和偏离提醒。
- 确认本次结算事件的贡献比例。
- 写入 `objectiveSettlementEvents`，并追加生成 `pointLedger`；历史账本不得删除。
- `Objective.objectiveSettlementPoints` 只是该目标已写入账本积分的展示汇总，成员排行榜只读取后端结算后的积分流水。
- `revisionRequired` 的 `deadlinePenalty` 事件按目标基础分 `50%` 写入惩罚积分，目标仍保持 `revisionRequired`。
- `deadlinePenalty` 已写入后，同一待返工阶段不再继续开放惩罚互评或惩罚结算；挑战者必须重新提交，指挥官重新验收通过进入 `accepted` 后，再开放最终互评和 `finalCompletion` 结算。
- `accepted` 的 `finalCompletion` 事件在已有惩罚事件时写入剩余 `50%`，否则沿用按时/延期完成倍率；最终结算后 `Objective.flowStatus` 从 `accepted` 进入 `settled`。
- 向目标 `Objective.challengerUserIds` 中的 active 成员发送个人系统通知；通知不包含匿名互评明细。

Result 的不确定性分是冻结前必须明确的积分事实源。Objective 不初始化积分，目标总分由目标下指标的不确定性分相加得到；Result 不直接给个人分积分，个人积分按目标级结算事件的贡献比例分配。单人目标也走相同结算事件，默认比例为 `100%`。

## TODO

- 自测报告文件编辑器接入后，提交页应从文本摘要升级为可打开、可编辑、可引用的报告文件。
