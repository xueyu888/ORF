# ORF 提交战利品 - 后端

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/objectives/:objectiveId/loot` | 普通成员挑战者提交结构化战利品 |
| `POST` | `/api/objectives/:objectiveId/trial-reviews` | 普通成员挑战者发起一次试验收 |
| `PATCH` | `/api/objectives/:objectiveId/trial-reviews/:trialReviewId` | 指挥官反馈试验收 |
| `POST` | `/api/objectives/:objectiveId/contribution-reviews` | 已关闭的旧匿名互评接口，返回 `410`，原始互评只提交到本地结算服务 |
| `POST` | `/api/objectives/:objectiveId/review` | 指挥官验收指标并结算积分 |

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

| 字段 | 说明 |
| --- | --- |
| `objectiveId` | 当前悬赏目标 ID |
| `requestedBy` | 发起试验收的挑战者姓名 |
| `body` | 完成说明 |
| `resultClaims` | 每个指标的主张和证据 |
| `selfTestReportBody` | 自测摘要 |
| `status` | `requested` / `approved` / `needsWork` |
| `commanderFeedback` | 指挥官反馈 |
| `requestedAt` / `reviewedAt` | 发起和反馈时间 |

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

```json
{
  "allocations": [
    { "member": "Kai Wang", "ratio": 0.6 },
    { "member": "Mia Zhang", "ratio": 0.4 }
  ]
}
```

`ratio` 是本地结算服务和 ORF 结算接口使用的标准比例，范围为 `0..1`。一份匿名互评必须覆盖当前目标的全部普通成员挑战者，不能重复成员，且 `ratio` 合计必须为 `1`。前端页面用 `0..100` 的百分比输入，再在浏览器本地转换为标准比例并加密。

新匿名互评链路不把原始 `allocations` 写入 ORF 后端：前端用本地结算服务公钥加密后直接提交到本地结算服务；本地服务解密、保存、汇总，并在验收时向 ORF 前端返回最终贡献比例。ORF 后端只接收 `contributionResolution.ratios` 和公开积分结果。

## 保存字段

战利品保存到 `objectiveLoot`：

| 字段 | 说明 |
| --- | --- |
| `objectiveId` | 当前悬赏目标 ID |
| `submittedBy` | 提交人姓名 |
| `body` | 目标完成说明 |
| `resultClaims` | 每个指标的主张和证据 |
| `selfTestReportBody` | 自测摘要 |
| `selfTestReportUrl` | 自测报告文件 URL，占位 |
| `submittedAt` | 提交时间 |

提交成功后同步更新 `Objective.lootSubmittedAt`，并将 `Objective.flowStatus` 从 `frozen` 改为 `submitted`。

## 验收请求体

```json
{
  "lootId": "loot-1",
  "resultReviews": [
    { "resultId": "res-1", "acceptedResult": "completed" }
  ],
  "contributionResolution": null,
  "reason": "验收说明"
}
```

`contributionResolution` 填写本地匿名互评结算服务返回的最终贡献比例；缺评、分歧或申诉时可由指挥官手动处理：

```json
{
  "ratios": [{ "member": "Kai Wang", "ratio": 1 }],
  "reason": "处理互评分歧"
}
```

`contributionResolution.ratios` 使用同一标准比例契约：每个目标挑战者一项，范围 `0..1`，合计 `1`。

验收成功后：

- 写入 `Result.acceptedResult`。
- 按指标验收结论汇总并写入目标结算字段。
- 按本地匿名互评结算结果或指挥官处理结果生成 `pointLedger`。
- `pointLedger.userId` 只在目标所属默认作用域内按挑战者姓名解析；底层存储 scope 间的同名用户不能被错误关联。
- 将 `Objective.flowStatus` 改为 `settled`。

## 约束

- 只有 `Objective.challengers` 中的普通成员可提交。
- 只有 `frozen` 目标可提交战利品。
- 试验收仅允许 `frozen` 目标的挑战者发起一次；指挥官反馈试验收不推进状态。
- 只有指挥官可验收。
- 只有 `submitted` 目标可验收。
- 多个普通成员挑战者结算必须有本地结算服务返回的贡献比例，或有指挥官分歧处理结果。
- 同一 reviewer 可重复提交匿名互评，本地结算服务保留历史；结算只使用每个 reviewer 最新一条记录。
- 匿名互评和分歧处理都拒绝超出 `0..1`、成员缺失、成员重复或合计不为 `1` 的贡献比例。
- 匿名互评不能只依赖前端隐藏；新提交的原始互评不得进入 ORF 后端数据库或读模型，旧后端提交接口必须返回 `410`。
- 任务和子任务状态不自动决定目标完成。
