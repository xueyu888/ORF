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
- `notClaimed`：不主张该指标完成或证伪。

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

前端提交评分时只传逐指标整数百分比矩阵；ORF 后端从当前目标的服务端指标和挑战者快照补齐 `metricTitle`、`metricDetail`、`points`、挑战者展示名和 `memberUserId`，再转发给匿名互评服务：

```json
{
  "kind": "score",
  "metricRows": [
    {
      "metricId": "result-1",
      "allocations": [
        { "member": "Kai Wang", "memberUserId": "usr-kai", "percent": 60 },
        { "member": "Mia Zhang", "memberUserId": "usr-mia", "percent": 40 }
      ]
    }
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

`memberUserId` 对应 `users.id`，是贡献分配的身份事实源；`member` 是展示名兼容字段。`percent` 必须是 `0..100` 的整数。每个指标行必须覆盖当前目标的全部普通成员挑战者，不能重复成员，且合计精确为 `100`。匿名互评服务从逐指标 `metricRows` 统一派生目标级 `allocations` 和 `metricScores`；前端和 ORF 主后端都不把目标级 `allocations` 当作原始提交事实。弃权必须带非空 `abstentionReason`，不带 `allocations` 参与均值计算。

匿名互评链路不把原始 `metricRows`、草稿或弃权说明写入 ORF 数据库：前端通过 ORF 同源代理自动保存草稿到 `/api/local-settlement/objectives/:objectiveId/reviews/draft`，提交到 `/api/local-settlement/objectives/:objectiveId/reviews/submit`；ORF 后端只做认证、目标权限、状态校验和服务端事实补齐，然后转发到共享结算服务。共享结算服务维护一个覆盖式草稿、追加式提交历史，并从历史中按同一目标、同一 reviewer 派生最新评价；验收时通过 ORF 代理向指挥官返回最新提交状态、原始评分、弃权说明、均值和偏离提醒。ORF 结算接口只接收 `contributionResolution.ratios` 和公开积分结果。

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

提交成功后同步更新 `Objective.lootSubmittedAt`，并将 `Objective.flowStatus` 从 `frozen` 改为 `submitted`。

## 验收请求体

```json
{
  "lootId": "loot-1",
  "resultReviews": [{ "resultId": "res-1", "acceptedResult": "completed" }],
  "reason": "验收说明"
}
```

验收成功后：

- 写入 `Result.acceptedResult`。
- 按指标验收结论汇总并写入 `Objective.acceptedResult`。
- 写入 `Objective.completionMultiplier` 和 `Objective.objectiveBasePoints`。
- 将 `Objective.flowStatus` 改为 `accepted`。

验收不通过时，目标保持 `submitted`，不写入积分流水。

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

`contributionResolution` 填写指挥官确认的最终贡献比例；页面默认使用共享匿名互评结算服务返回的当前均值，指挥官可调整。单人目标也先进入 `accepted`，再由指挥官确认 `100%` 结算比例：

```json
{
  "ratios": [{ "member": "Kai Wang", "memberUserId": "usr-kai", "ratio": 1 }],
  "reason": "指挥官确认最终结算比例"
}
```

`contributionResolution.ratios` 使用同一标准比例契约：每个目标挑战者一项，范围 `0..1`，合计 `1`。后端写入积分时优先使用 `memberUserId`，只在旧请求没有该字段时按当前目标挑战者展示名兜底解析，且解析结果必须仍属于 `Objective.challengerUserIds`。

结算成功后：

- 按本地匿名互评结算结果或指挥官处理结果生成 `pointLedger`。
- `pointLedger.userId` 来自目标挑战者的 `Objective.challengerUserIds`；`memberName` 只是结算时按 UUID 派生的展示名快照。
- `pointLedger.points` 以 `0.01` 为最小单位分配，使用最大余数法保证个人积分合计等于目标结算积分。
- 将 `Objective.flowStatus` 改为 `settled`。

## 约束

- 只有 `Objective.challengerUserIds` 中的 active 普通成员可提交；`Objective.challengers` 只作为展示投影。
- 只有 `frozen` 目标可提交战利品。
- 试验收仅允许 `frozen` 目标的挑战者发起一次；指挥官反馈试验收不推进状态。
- 只有指挥官可验收。
- 只有 `submitted` 目标可验收。
- 只有指挥官可结算。
- 只有 `accepted` 目标可结算。
- 多个普通成员挑战者结算必须有 `contributionResolution.ratios`，来源可以是当前互评均值默认值，也可以是指挥官调整后的最终比例。
- 同一 reviewer 可重复提交匿名互评，共享结算服务保留提交历史；结算只使用每个 reviewer 最新一条记录。
- 当前目标挑战者可读取自己的服务器草稿和最新一版提交用于重新评价回填；同一目标再次提交后草稿清空，挑战者视角只看到新的最新评价。历史旧提交没有 `metricRows` 或 `metricScores` 时，只能展示最新目标级比例，不能还原指标行。
- 匿名互评评分拒绝非整数百分比、成员缺失、成员重复或行合计不为 `100`；最终结算比例拒绝超出 `0..1`、成员缺失、成员重复或合计不为 `1`。
- 缺评、弃权和超过 `10%` 的偏离只作为验收页提示，不阻止指挥官提交合法的最终结算比例。
- 匿名互评不能只依赖前端隐藏；新提交的原始互评不得进入 ORF 后端数据库或读模型，旧后端提交接口必须返回 `410`。
- 任务和子任务状态不自动决定目标完成。
