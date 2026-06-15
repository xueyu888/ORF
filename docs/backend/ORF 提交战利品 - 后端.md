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

评分 payload 在浏览器内加密前的业务结构：

```json
{
  "kind": "score",
  "allocations": [
    { "member": "Kai Wang", "memberUserId": "usr-kai", "ratio": 0.6 },
    { "member": "Mia Zhang", "memberUserId": "usr-mia", "ratio": 0.4 }
  ]
}
```

弃权 payload 在浏览器内加密前的业务结构：

```json
{
  "kind": "abstain",
  "abstentionReason": "我只做了少量资料整理，无法判断其他人的贡献比例。"
}
```

`memberUserId` 对应 `users.id`，是贡献分配的身份事实源；`member` 是展示名兼容字段。`ratio` 是共享结算服务和 ORF 结算接口使用的标准比例，范围为 `0..1`。一份评分必须覆盖当前目标的全部普通成员挑战者，不能重复成员，且 `ratio` 合计必须为 `1`。前端页面用 `0..100` 的百分比输入，再在浏览器本地转换为标准比例并加密。弃权必须带非空 `abstentionReason`，不带 `allocations` 参与均值计算。

新匿名互评链路不把原始 `allocations` 或弃权说明写入 ORF 数据库：前端通过 ORF 同源代理读取共享结算服务公钥，在浏览器内加密后把 encrypted envelope 提交到 ORF 代理；ORF 后端只做认证、目标权限和状态校验，然后转发到共享结算服务，不解密、不保存原始互评。共享结算服务解密、保存、汇总，并在验收时通过 ORF 代理向指挥官返回最新提交状态、原始评分、弃权说明、均值和偏离提醒。ORF 结算接口只接收 `contributionResolution.ratios` 和公开积分结果。

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
- 同一 reviewer 可重复提交匿名互评，共享结算服务保留历史；结算只使用每个 reviewer 最新一条记录。
- 匿名互评评分和最终结算比例都拒绝超出 `0..1`、成员缺失、成员重复或合计不为 `1` 的比例。
- 缺评、弃权和超过 `10%` 的偏离只作为验收页提示，不阻止指挥官提交合法的最终结算比例。
- 匿名互评不能只依赖前端隐藏；新提交的原始互评不得进入 ORF 后端数据库或读模型，旧后端提交接口必须返回 `410`。
- 任务和子任务状态不自动决定目标完成。
