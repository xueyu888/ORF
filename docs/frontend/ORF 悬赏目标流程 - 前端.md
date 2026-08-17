# ORF 悬赏目标流程 - 前端

## 页面定位

悬赏大厅向所有已通过用户展示公开悬赏目标从开放到结算的生命周期状态，是全员可见的公开看板，不只是未领取目标列表。角色只影响动作能否生效，不影响界面完整性：active 普通成员可以在开放期填写理由申请公开目标或接受自己的征召；指挥官/管理员也必须看到完整大厅界面和操作区，但点击申请 / 接受时不能提交成功，必须弹窗提醒“指挥官不应该申请挑战”。指挥官发布新悬赏后，已登录 active 用户通过 `system.broadcast` 实时事件看到横幅广播，非发布者还会在聊天里的系统公告留下 `objective.published` 记录；悬赏大厅收到广播后刷新公开列表。普通成员发起的申请、被征召目标和正式参与目标统一在悬赏大厅 `我的相关` 分组追踪；申请被指挥官确认，或征召被成员接受后，目标进入重估并出现在我的挑战页面；同时该目标继续留在悬赏大厅，后续冻结、验收、结算也保留公开展示。

相关文档：

| 内容 | 文档 |
| --- | --- |
| 流程规则 | [ORF 悬赏目标流程设计.md](../rules/ORF%20悬赏目标流程设计.md) |
| 我的挑战 | [ORF 我的挑战页面 - 前端.md](./ORF%20我的挑战页面%20-%20前端.md) |
| 战利品提交 | [ORF 提交战利品页 - 前端.md](./ORF%20提交战利品页%20-%20前端.md) |
| 积分展示 | [积分结算规则 - 前端.md](./积分结算规则%20-%20前端.md) |

## 页面内容

| 区域 | 必要内容 |
| --- | --- |
| 顶部栏 | `悬赏大厅`；有权限时显示 `新建目标`，点击后进入挑战页页面内创建入口 |
| 概览 | 当前周期、公开悬赏数量、开放中数量、挑战者数量、征召数量 |
| 工具栏 | 搜索、等级筛选、排序 |
| 分组标签 | `全部`、`开放中`、`已冻结`、`待验收`、`待结算`、`已结算`、`我的相关`；生命周期分组只从 `Objective.flowStatus` 派生，`我的相关` 只从当前用户申请、征召和正式挑战者身份派生 |
| 悬赏目标列表 | 目标行列表；所有已通过用户可见；当前用户自己的征召目标置顶 |
| 申请弹窗 | 普通成员 `申请挑战` 时填写申请理由；`接受挑战` 仍使用二次确认 |
| 管理动作 | 指挥官在挑战页内新建并编辑候选目标；发布后进入悬赏大厅；审核申请、重估完成后冻结、重新重估审批也在挑战页处理 |

## 悬赏目标列表

目标行默认展示：

- 征召令标记；仅征召目标显示。
- 最高等级。
- 目标基础分；无指标或存在未校准指标时显示“待校准”，不显示 `0 分` 误导用户。
- 目标标题。
- 参与状态：已通过挑战者头像、待响应征召成员、申请中成员和申请理由摘要；如果当前用户在其中，头像或申请标记必须用克制高亮表示“你”。
- 指标摘要。
- 发布时间和剩余时间；二者分列展示，发布时间来自 `Objective.publishedAt`，不是目标创建时间或更新时间。
- 当前操作；操作列只表达当前用户能做什么：申请挑战、接受挑战、进入自己的目标、查看目标或暂无操作，不重复展示生命周期状态。

目标行以 `Objective` 为主。

目标行使用 Expandable Row：默认显示摘要；鼠标移入或键盘聚焦整行时，在当前行内展开目标说明、提出人和完整指标。

点击目标行不打开详情弹窗。普通成员点击 `申请挑战` 打开带申请理由的表单弹窗，点击 `接受挑战` 打开确认弹窗；当前用户已是挑战者时，操作列提供进入目标入口。指挥官/管理员点击同类挑战入口时打开阻断弹窗，提示其不能申请或接受挑战。

## 征召目标

征召目标放入同一个悬赏目标列表并置顶展示，只在对应目标行显示 `征召令` 标记。

被征召普通成员只能接受征召。接受后成为目标挑战者，并进入重估阶段；有异议时线下找指挥官处理。

## 状态

| 状态 | 前端展示 |
| --- | --- |
| 候选中 | 仅指挥官在挑战页可见，可先定义指标和维护目标行动项，再发布到悬赏大厅 |
| 可申请 | 所有已通过用户可见并显示申请操作区；active 普通成员可正常申请，指挥官/管理员点击申请时弹窗阻断 |
| 申请中 | 所有已通过用户可见；已申请成员显示已申请，并在悬赏大厅 `我的相关` 分组只读追踪；其他用户仍按当前状态显示完整操作区，指挥官/管理员点击挑战动作时弹窗阻断 |
| 征召中 | 所有已通过用户可见并展示待响应征召成员；被征召普通成员置顶显示 `征召令` 并可接受，指挥官/管理员点击接受或申请类动作时弹窗阻断 |
| 重估中 | 继续显示在悬赏大厅，展示已通过挑战者头像和未处理申请；未参与 active 普通成员仍可申请挑战，已参与成员显示进入目标；同时显示在我的挑战；指挥官可新增和编辑指标、设置目标分数，挑战者可提出和编辑指标；已有至少一个指标时指挥官可冻结 |
| 已冻结 | 继续显示在悬赏大厅；不再开放公开申请或征召接受；指挥官可在挑战工作台加派 active 普通成员为正式挑战者，正式挑战者可在提交战利品前填写理由申请重新重估，或在我的挑战里提交战利品 |
| 待验收 | 继续显示在悬赏大厅；不再开放加入，也不再开放重新重估；指挥官在挑战页验收，进入已验收前仍可修改目标分数 |
| 已验收 | 继续显示在悬赏大厅的 `待结算` 分组；不再开放加入，等待最终贡献比例和积分结算 |
| 已结算 | 继续显示在悬赏大厅，展示结算后的公开结果入口和参与状态 |

`flowStatus` 是前端状态展示的主字段。`stage` 只用于兼容页面阶段样式。

悬赏大厅申请入口、挑战页申请审核入口、冻结样式、重新重估申请和加派入口必须按统一 `flowStatus` 生命周期判断；冻结后残留的 pending 申请不展示通过或拒绝操作。重新重估只在挑战页通过 `frozenReestimate` 对齐申请处理，挑战者提交时必须填写理由，指挥官审批时设置新的重估截止时间，不能超过目标验收截止时间；该入口只存在于 `frozen`，目标进入 `submitted` 后不再出现。加派入口只属于挑战工作台的指挥官执行期调度，不在悬赏大厅开放。

## 数据口径

| 字段 | 用途 |
| --- | --- |
| `Objective.challengerUserIds` | 当前普通成员挑战者的身份事实源；权限、去重、当前用户判断和互评范围都以该字段为准 |
| `Objective.challengers` | 按 `challengerUserIds` 派生的挑战者显示名投影；只用于头像、筛选标签和文案展示 |
| `Objective.challengeApplications[].applicantUserId` | 申请人的身份事实源；当前用户是否已申请、申请审核和重复申请判断都以该字段为准 |
| `Objective.challengeApplications[].applicant` | 申请人显示名快照和申请理由展示；指挥官/管理员触发挑战动作时不能新增申请 |
| `Objective.assignedChallengerUserIds` | 被征召普通成员的身份事实源；当前用户是否被征召和接受征召判断以该字段为准 |
| `Objective.assignedChallengers` | 按 `assignedChallengerUserIds` 派生的被征召成员显示名投影 |
| `Objective.flowStatus` | 候选、申请、征召、重估、冻结、验收、待返工和结算状态 |
| `Objective.publishedAt` | 指挥官发布到悬赏大厅的日期；大厅显示和发布时间排序使用该字段 |
| `Objective.finalDueAt` | 剩余时间、排序和按时结算判断 |
| `Result[]` | 目标下的指标清单、指标详情、最高等级和目标基础分来源；`detail` 是指标详情事实源；`uncertaintyLevel` 是当前实现的等级字段名，未设置时该指标积分仍为待校准；指标不拥有独立截止日期 |
| `ObjectiveLoot[]` | 战利品提交和验收展示 |
| `PointLedgerEntry[]` | 统计页积分来源 |
| `BountyHallData.publicItems` | 大厅公开生命周期列表，包含 `open/applying/recruiting/reestimating/frozen/submitted/revisionRequired/accepted/settled` 目标，不包含 `candidate/closed` |
| `BountyHallItem.isRecruitment` | 是否展示 `征召令` 并置顶 |
| `BountyHallItem.hasCurrentApplication` | 当前普通成员是否已申请，用于禁用重复申请；指挥官/管理员不能用该字段伪造可写申请状态 |
| `BountyHallItem.applications` | 申请记录投影来源；`我的相关` 分组按当前用户申请、征召和正式挑战者身份过滤，并展示最新申请的 `pending/approved/declined` 结果 |
| `BountyHallItem.challengers` | 已通过挑战者头像和姓名展示来源；身份判断仍使用对应用户 UUID |
| `BountyHallItem.assignedChallengers` | 待响应征召成员姓名展示来源；身份判断仍使用 `Objective.assignedChallengerUserIds` |
| `BountyHallItem.pendingApplications` | 申请中成员和理由摘要来源 |

不在 `Result` 层表达挑战关系。

## 接口契约

悬赏大厅前端使用悬赏大厅专用接口读取列表数据。

| 接口 | 用途 |
| --- | --- |
| `GET /api/bounties` | 读取公开生命周期目标、当前用户待接受征召和申请/接受动作辅助数据 |
| `GET /api/events` | 已登录用户的 SSE 实时事件流；收到 `system.broadcast` 后触发横幅广播并刷新大厅，收到 `notification.created` 后更新聊天里的系统会话 |
| `POST /api/objectives/:objectiveId/challenge-applications` | 申请挑战，body 必须包含 `reason` |
| `PATCH /api/objectives/:objectiveId/challenge` | 接受征召 |
| `PATCH /api/objectives/:objectiveId/challenge-applications/:applicationId/approve` | 指挥官通过申请，目标进入重估 |
| `PATCH /api/objectives/:objectiveId/challenge-applications/:applicationId/reject` | 指挥官拒绝申请 |
| `PATCH /api/objectives/:objectiveId/publish` | 指挥官发布候选目标 |
| `PATCH /api/objectives/:objectiveId/base-points` | 指挥官修改目标基础分；进入 `settled` 前可改，确认结算后锁定 |
| `PATCH /api/objectives/:objectiveId/freeze` | 指挥官完成重估并冻结 |
| `POST /api/objectives/:objectiveId/alignment-requests` | 挑战者申请完成重估、重新重估或验收对齐；重新重估只允许 `frozen` 目标且必须提交理由，待验收目标只能申请验收对齐 |
| `PATCH /api/objectives/:objectiveId/alignment-requests/:alignmentRequestId` | 指挥官处理对齐申请；重新重估审批通过时传新的 `confirmationDueAt` |
| `POST /api/objectives/:objectiveId/reinforcements` | 指挥官在冻结后、战利品提交前加派正式挑战者 |
| `PATCH /api/results/:resultId/details` | 指挥官或重估期内挑战者编辑指标详情 |
| `PATCH /api/results/:resultId/execution-completion` | 目标正式挑战者或指挥官在 `reestimating/frozen/revisionRequired` 勾选指标执行完成 |
| `POST /api/objectives/:objectiveId/loot` | 挑战者提交结构化战利品 |
| `POST /api/objectives/:objectiveId/review` | 指挥官验收指标 |
| `POST /api/objectives/:objectiveId/settle` | 指挥官确认结算 |

`GET /api/bounties` 的列表项以 `Objective` 为挑战对象，包含该目标下的 `Result[]` 作为指标清单，并用同一条 `challengeApplications` 数据展示申请理由和申请状态。该接口服务大厅公开生命周期数据，不能因为当前用户是指挥官/管理员而清空列表，也不能在目标进入 `reestimating/frozen/submitted/revisionRequired/accepted/settled` 后把目标从大厅移除。前端不从任务管理页大快照自行拼装悬赏大厅列表；操作区展示由 `BountyHallItem.isRecruitment`、当前用户最新申请、`BountyHallItem.isCurrentChallenger` 和 `Objective.flowStatus` 决定，动作生效再由当前用户角色和后端 mutation 校验。指挥官/管理员触发申请 / 接受时，前端必须先弹窗提示并保持原状态，不能本地伪造已申请或已接受。冻结后加派只会让大厅读模型展示新的挑战者头像和相关状态，不在大厅生成 `isRecruitment`、申请状态或接受动作。

指挥官/管理员在悬赏大厅单击目标行时，只让当前行获得焦点并展开详情；双击目标行才做查看定位：跳转到 `/tasks#objective:{objectiveId}`，由挑战工作台已有的目标锚点负责切到全局范围、清空工作台筛选并滚动到对应目标。这个跳转不修改申请、征召、挑战者或目标状态；普通未挑战成员仍通过申请 / 接受动作进入后续流程，不能把大厅双击当成“加入我的挑战”。

## 注册审核

注册成功后前端展示等待审核页，不加载业务数据。管理员在成员管理页处理 `pending` 用户：通过后进入 `active`，拒绝后进入 `rejected`，停用后进入 `disabled`。

## 候选指标

候选指标的优先参与规则未定。当前不提供候选指标优先挑战入口，只保留 TODO。
