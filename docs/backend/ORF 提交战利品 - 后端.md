# ORF 提交战利品 - 后端

## 接口

| 方法    | 路径                                                        | 说明                                                             |
| ------- | ----------------------------------------------------------- | ---------------------------------------------------------------- |
| `POST`  | `/api/objectives/:objectiveId/loot`                         | 普通成员挑战者提交结构化战利品                                   |
| `POST`  | `/api/objectives/:objectiveId/trial-reviews`                | 普通成员挑战者发起一次试验收                                     |
| `PATCH` | `/api/objectives/:objectiveId/trial-reviews/:trialReviewId` | 指挥官反馈试验收                                                 |
| `POST`  | `/api/objectives/:objectiveId/contribution-reviews`         | 已关闭的旧匿名互评接口，返回 `410`，原始互评只通过 ORF 代理提交到共享结算服务 |
| `POST`  | `/api/objectives/:objectiveId/review`                       | 指挥官验收指标并结算积分                                         |

## 提交请求体

```json
{
  "body": "目标完成说明",
  "resultClaims": [
    {
      "resultId": "res-1",
      "claim": "completed",
      "evidenceText": "证据说明或链接"
    }
  ],
  "selfTestReportBody": "自测摘要",
  "selfTestReportUrl": null
}
```

`claim` 可取：

- `completed`：主张该指标完成。
- `falsified`：主张该指标被有效证伪。
- `notClaimed`：该指标未完成；前端展示为未勾选状态，提交时不要求证据。

自测报告文件化能力依赖编辑器接入，当前先保存 `selfTestReportBody` 文本摘要。

## 试验收

`POST /api/objectives/:objectiveId/trial-reviews` 使用与正式提交相同的请求体和指标主张校验，但保存到 `objectiveTrialReviews`：

| 字段                         | 说明                                      |
| ---------------------------- | ----------------------------------------- |
| `objectiveId`                | 当前悬赏目标 ID                           |
| `requestedByUserId`          | 发起试验收的挑战者 `users.id`，身份事实源 |
| `requestedBy`                | 发起试验收时的挑战者姓名展示快照          |
| `body`                       | 完成说明                                  |
| `resultClaims`               | 每个指标的主张和证据                      |
| `selfTestReportBody`         | 自测摘要                                  |
| `status`                     | `requested` / `approved` / `needsWork`    |
| `commanderFeedback`          | 指挥官反馈                                |
| `requestedAt` / `reviewedAt` | 发起和反馈时间                            |

同一目标只允许一条试验收记录。试验收只允许 `frozen` 目标的普通成员挑战者发起；成功后不修改 `Objective.flowStatus`、`Objective.lootSubmittedAt` 或积分字段。

试验收反馈请求体：

```json
{
  "status": "approved",
  "commanderFeedback": "可正式提交"
}
```

`status` 只能是 `approved` 或 `needsWork`。只有指挥官可反馈 `requested` 状态的试验收，反馈后目标仍保持 `frozen`。

## 匿名互评请求体

前端提交评分时只传目标级整数百分比 `allocations`；ORF 后端从当前目标挑战者快照补齐挑战者展示名和稳定 `memberUserId`，再转发给匿名互评服务：

```json
{
  "kind": "score",
  "allocations": [
    { "member": "Kai Wang", "memberUserId": "usr-kai", "percent": 60 },
    { "member": "Mia Zhang", "memberUserId": "usr-mia", "percent": 40 }
  ]
}
```

弃权 payload：

```json
{
  "kind": "abstain",
  "abstentionReason": "我只做了少量资料整理，无法判断其他人的贡献比例。"
}
```

`memberUserId` 对应 `users.id`，是贡献分配的身份事实源；`member` 只是展示文本。`percent` 必须是 `0..100` 的整数。`allocations` 必须覆盖当前目标的全部普通成员挑战者，不能重复成员，且合计精确为 `100`。弃权必须带非空 `abstentionReason`，不带 `allocations` 参与均值计算。

匿名互评链路不把原始 `allocations`、草稿或弃权说明写入 ORF 数据库：前端通过 ORF 同源代理自动保存草稿到 `/api/local-settlement/objectives/:objectiveId/reviews/draft`，提交到 `/api/local-settlement/objectives/:objectiveId/reviews/submit`；ORF 后端只做认证、目标权限、状态校验和服务端事实补齐，然后转发到共享结算服务。共享结算服务维护一个覆盖式草稿、追加式提交历史，并从历史中按同一目标、同一 reviewer 派生最新评价；结算时通过 ORF 代理向指挥官返回最新提交状态、原始评分、弃权说明、均值和偏离提醒。ORF 结算接口只接收 `contributionResolution.ratios` 和公开积分结果。旧主库表 `objective_contribution_reviews`、旧评价记录 DTO 和旧主库汇总算法已经删除；迁移发现旧表仍有记录时会中止并要求先归档，不能静默删除匿名历史。

## 保存字段

战利品保存到 `objectiveLoot`：

| 字段                 | 说明                            |
| -------------------- | ------------------------------- |
| `objectiveId`        | 当前悬赏目标 ID                 |
| `submittedByUserId`  | 提交人的 `users.id`，身份事实源 |
| `submittedBy`        | 提交人姓名展示快照              |
| `body`               | 目标完成说明                    |
| `resultClaims`       | 每个指标的主张和证据            |
| `selfTestReportBody` | 自测摘要                        |
| `selfTestReportUrl`  | 自测报告文件 URL，占位          |
| `submittedAt`        | 提交时间                        |

提交成功后同步更新 `Objective.lootSubmittedAt`。首次提交将 `Objective.flowStatus` 从 `frozen` 改为 `submitted`；待返工目标重新提交时，将 `Objective.flowStatus` 从 `revisionRequired` 改回 `submitted`，并清空上一轮目标验收结论，上一轮明细保留在验收记录中。

## 验收请求体

```json
{
  "lootId": "loot-1",
  "resultReviews": [{ "resultId": "res-1", "acceptedResult": "completed" }],
  "reason": "验收说明"
}
```

验收成功后：

- 写入一条 `objectiveAcceptanceReviews`，记录本次 `lootId`、目标结论、逐指标结论、验收说明和验收人。
- 写入 `Result.acceptedResult`。
- 按指标验收结论汇总并写入 `Objective.acceptedResult`；该字段记录最近一次验收结论，不反向定义生命周期状态。
- 写入 `Objective.completionMultiplier` 和 `Objective.objectiveBasePoints`。
- 验收通过时将 `Objective.flowStatus` 改为 `accepted`，并提醒挑战者可以重新检查匿名互评。
- 验收不通过时将 `Objective.flowStatus` 改为 `revisionRequired`，目标仍需继续完成后重新提交。

验收不通过本身不直接写入积分流水；如果已经到达目标截止日，指挥官仍应组织匿名互评并执行逾期惩罚结算。

## 结算请求体

```json
{
  "lootId": "loot-1",
  "contributionResolution": {
    "ratios": [{ "member": "Kai Wang", "memberUserId": "usr-kai", "ratio": 1 }],
    "reason": "指挥官确认最终结算比例"
  },
  "reason": "目标结算"
}
```

`contributionResolution` 填写指挥官确认的贡献比例；页面默认使用共享匿名互评结算服务返回的当前均值，指挥官可调整。单人目标也走同一结算事件，只是默认比例为 `100%`：

```json
{
  "ratios": [{ "member": "Kai Wang", "memberUserId": "usr-kai", "ratio": 1 }],
  "reason": "指挥官确认最终结算比例"
}
```

`contributionResolution.ratios` 使用同一标准比例契约：每个目标挑战者一项，范围 `0..1`，合计 `1`。后端写入积分时只使用 `memberUserId` 归属积分，`member` 不参与匹配，且每个 `memberUserId` 必须属于 `Objective.challengerUserIds`。

结算成功后：

- 写入一条 `objectiveSettlementEvents`，记录结算事件类型、关联战利品、基础分、事件倍率和事件分值。
- 按本地匿名互评结算结果或指挥官处理结果追加生成 `pointLedger`，不得删除同一目标历史账本。
- `pointLedger.userId` 来自目标挑战者的 `Objective.challengerUserIds`；`memberName` 只是结算时按 UUID 派生的展示名快照。
- 成果归属由 `objectiveSettlementEvents.achievementStart/achievementEnd` 保存（数据库 DATE，包含首尾日期）。结算请求必须显式传入 `achievementPeriod: {start,end}`，后端验证真实日期及顺序，与事件、个人账本在同一事务提交。目标 `cycle` 只可作为页面建议，不作为已结算事实源。
- `pointLedger` 通过 `settlementEventId` 取得归属区间，读模型展开为 `achievementPeriod`；账本不独立保存可修改的归属。验收 `reviewedAt`、事件及账本 `createdAt` 均保留真实时间，不用于成果周期筛选。
- 后一次结算不得移动前一次结算的归属。管理员更正调用 `PATCH /api/objectives/:objectiveId/settlements/:eventId/achievement-period`，提交 `achievementPeriod`、`expectedPeriod` 和 `reason`，在事务内核验旧值并记录 `settlement_period_corrections`；不会重发积分、改变原始时间或绕过团队权限。
- 缺失区间的历史事件、无事件关联的账本不得从验收日期猜测归属，读取返回 `achievementPeriod:null`。旧 `settlement_period_at` 暂留为迁移归档，退出新代码业务读写，待生产新版本切换和归档核验后再安排物理删除。
- 已存在的历史补差 `scoreScaleCorrection` 与迁移专用 `historicalLedgerRestore` 是账务记录，不属于正常生命周期结算类型，不影响互评窗口或目标完成状态。恢复工具只按明确清单关联已有账本，不追加积分。恢复记录的基础分与事件分值均为所关联原账本的有符号合计，倍率为 1，仅作历史金额留档，不重新运行评分规则。
- 历史恢复按目标、同一次原账本时间及说明核对；事件日期沿用原记录，用户明确更正的历史日期须写入依据。原账本时间保持不变，执行者及实际补录时间另写 `settlement_period_corrections` 审计；不把历史日期伪装成迁移执行日期。迁移清单保存原流水和新关联，事务中校验金额、成员、日期、目标状态不变，重复执行不得生成新事件或积分。
- `pointLedger.points` 以 `0.01` 为最小单位分配，使用最大余数法保证个人积分合计等于目标结算积分。
- `Objective.objectiveSettlementPoints` 只是该目标已写入账本积分的展示汇总，生命周期仍以 `Objective.flowStatus` 为准。

正常生命周期结算事件分为两类：

- `deadlinePenalty`：目标已到截止日且验收不通过时，在 `revisionRequired` 状态执行；事件倍率为 `50%`，写入惩罚积分后目标仍保持 `revisionRequired`，挑战者必须继续完成并重新提交。
- `finalCompletion`：最终验收通过后在 `accepted` 状态执行；如果此前已有 `deadlinePenalty`，该事件写入 `0` 分，本期扣掉的分不补回；否则沿用原按时/延期完成倍率。该事件完成后将 `Objective.flowStatus` 改为 `settled`。

## 约束

- 只有 `Objective.challengerUserIds` 中的 active 普通成员可提交；`Objective.challengers` 只作为展示投影。
- 只有 `frozen` 或 `revisionRequired` 目标可提交战利品。
- 试验收仅允许 `frozen` 目标的挑战者发起一次；指挥官反馈试验收不推进状态。
- 只有指挥官可验收。
- 只有 `submitted` 目标可验收。
- 只有指挥官可结算。
- `revisionRequired` 目标只有在截止日已到且同类惩罚事件尚未结算时可执行逾期惩罚结算。
- `accepted` 目标只有在最终结算事件尚未结算时可执行最终结算。
- 匿名互评提交和指挥官汇总读取使用同一结算事件窗口判断：`revisionRequired` 只在截止日已到且 `deadlinePenalty` 尚未结算时开放；惩罚结算完成后关闭，直到挑战者重新提交并再次验收进入 `accepted` 后，才按 `finalCompletion` 重新开放。
- 多个普通成员挑战者结算必须有 `contributionResolution.ratios`，来源可以是当前互评均值默认值，也可以是指挥官调整后的最终比例。
- 同一 reviewer 可重复提交匿名互评，共享结算服务保留提交历史；结算只使用每个 reviewer 最新一条记录。
- 当前目标挑战者可读取自己的服务器草稿和最新一版提交用于重新评价回填；同一目标再次提交后草稿清空，挑战者视角只看到新的最新评价。历史旧提交没有 `metricRows` 或 `metricScores` 时，只能展示最新目标级比例，不能还原指标行。
- 匿名互评评分拒绝非整数百分比、成员缺失、成员重复或行合计不为 `100`；最终结算比例拒绝超出 `0..1`、成员缺失、成员重复或合计不为 `1`。
- 缺评、弃权和超过 `10%` 的偏离只作为验收页提示，不阻止指挥官提交合法的最终结算比例。
- 匿名互评不能只依赖前端隐藏；新提交的原始互评不得进入 ORF 后端数据库或读模型，旧后端提交接口必须返回 `410`。
- 任务和子任务状态不自动决定目标完成。

## 成果区间迁移（2026-09-28）

结构迁移 0102 仅增加可空区间、合法性约束和更正审计表，不推断历史日期。新结算必须提供有效区间；历史空值由迁移核对清单显式处理。AIO 八月授权批次以准确目标 ID 清单迁移为 2026-08-01 至 2026-08-31，保留原积分、人员、事件和时间。其余历史记录归属处理需管理员明确确认。
