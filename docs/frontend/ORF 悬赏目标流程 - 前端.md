# ORF 悬赏目标流程 - 前端

## 页面定位

悬赏大厅只展示尚未被任何成员正式接受的悬赏目标。申请被指挥官确认，或征召被成员接受后，目标进入重估并出现在我的挑战页面。

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
| 顶部栏 | `悬赏大厅` |
| 概览 | 当前周期、可申请数量、征召数量 |
| 工具栏 | 搜索、难度筛选、排序 |
| 悬赏目标列表 | 目标行列表；征召目标置顶 |
| 确认弹窗 | `申请挑战` 或 `接受挑战` 的二次确认 |
| 管理动作 | 指挥官发布候选目标、审核申请、重估完成后冻结 |

## 悬赏目标列表

目标行默认展示：

- 征召令标记；仅征召目标显示。
- 最高难度。
- 目标总分。
- 目标标题。
- 指标摘要。
- 剩余时间。
- 当前操作。

目标行以 `Objective` 为主。

目标行使用 Expandable Row：默认显示摘要；鼠标移入或键盘聚焦整行时，在当前行内展开目标说明、提出人和完整指标。

点击目标行不打开详情弹窗。点击 `申请挑战` 或 `接受挑战` 打开确认弹窗。

## 征召目标

征召目标放入同一个悬赏目标列表并置顶展示，只在对应目标行显示 `征召令` 标记。

当前阶段被征召成员必须接受挑战。接受后成为目标挑战者，并进入重估阶段。

## 状态

| 状态 | 前端展示 |
| --- | --- |
| 候选中 | 仅指挥官在挑战页可见，可发布到悬赏大厅 |
| 可申请 | 显示在悬赏目标列表 |
| 申请中 | 显示在悬赏目标列表，操作为已申请 |
| 征召中 | 显示在悬赏目标列表顶部，并显示 `征召令` |
| 重估中 | 显示在我的挑战；指挥官可新增和编辑指标，挑战者可提出和编辑指标，指挥官可冻结 |
| 已冻结 | 显示提交战利品入口；不再开放指标调整 |
| 待验收 | 显示验收入口 |
| 已结算 | 显示结算结果和积分 |

`flowStatus` 是前端状态展示的主字段。`stage` 只用于兼容页面阶段样式。

悬赏大厅申请入口、挑战页申请审核入口和冻结样式必须按统一 `flowStatus` 生命周期判断；冻结后残留的 pending 申请不展示通过或拒绝操作。

## 数据口径

| 字段 | 用途 |
| --- | --- |
| `Objective.challengers` | 当前目标挑战者；用于挑战者数量和互评范围 |
| `Objective.challengeApplications` | 当前用户申请状态 |
| `Objective.assignedChallengers` | 当前用户是否被征召 |
| `Objective.flowStatus` | 候选、申请、征召、重估、冻结、验收和结算状态 |
| `Objective.finalDueAt` | 剩余时间、排序和按时结算判断 |
| `Result[]` | 目标下的指标清单、最高难度和目标总分来源 |
| `ObjectiveLoot[]` | 战利品提交和验收展示 |
| `PointLedgerEntry[]` | 统计页积分来源 |
| `BountyHallItem.isRecruitment` | 是否展示 `征召令` 并置顶 |
| `BountyHallItem.hasCurrentApplication` | 是否禁用重复申请 |

不在 `Result` 层表达挑战关系。

## 接口契约

悬赏大厅前端使用悬赏大厅专用接口读取列表数据。

| 接口 | 用途 |
| --- | --- |
| `GET /api/bounties` | 读取征召目标、可申请目标和列表辅助数据 |
| `POST /api/objectives/:objectiveId/challenge-applications` | 申请挑战 |
| `PATCH /api/objectives/:objectiveId/challenge` | 接受征召 |
| `PATCH /api/objectives/:objectiveId/challenge/decline` | 拒绝征召 |
| `PATCH /api/objectives/:objectiveId/challenge-applications/:applicationId/approve` | 指挥官通过申请，目标进入重估 |
| `PATCH /api/objectives/:objectiveId/challenge-applications/:applicationId/reject` | 指挥官拒绝申请 |
| `PATCH /api/objectives/:objectiveId/publish` | 指挥官发布候选目标 |
| `PATCH /api/objectives/:objectiveId/freeze` | 指挥官完成重估并冻结 |
| `POST /api/objectives/:objectiveId/loot` | 挑战者提交结构化战利品 |
| `POST /api/objectives/:objectiveId/review` | 指挥官验收并结算 |

`GET /api/bounties` 的列表项以 `Objective` 为挑战对象，包含该目标下的 `Result[]` 作为指标清单。前端不从任务管理页大快照自行拼装悬赏大厅列表。

## 注册审核

注册成功后前端展示等待审核页，不加载业务数据。管理员在成员管理页处理 `pending` 用户：通过后进入 `active`，拒绝后进入 `rejected`，停用后进入 `disabled`。

## 候选指标

候选指标的优先参与规则未定。当前不提供候选指标优先挑战入口，只保留 TODO。
