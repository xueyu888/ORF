# ORF 提交战利品 - 后端

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/objectives/:objectiveId/loot` | 挑战者提交结构化战利品 |
| `POST` | `/api/objectives/:objectiveId/contribution-reviews` | 挑战者提交匿名互评贡献比例 |
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

`contributionResolution` 只在匿名互评缺评、分歧或申诉时填写：

```json
{
  "ratios": [{ "member": "Kai Wang", "ratio": 1 }],
  "reason": "处理互评分歧"
}
```

验收成功后：

- 写入 `Result.acceptedResult`。
- 按指标验收结论汇总并写入目标结算字段。
- 按匿名互评结果或分歧处理结果生成 `pointLedger`。
- `pointLedger.userId` 只在目标所属团队内按挑战者姓名解析；跨团队同名用户不能被错误关联。
- 将 `Objective.flowStatus` 改为 `settled`。

## 约束

- 只有 `Objective.challengers` 中的成员可提交。
- 只有 `frozen` 目标可提交战利品。
- 只有指挥官可验收。
- 只有 `submitted` 目标可验收。
- 多挑战者结算必须有可用匿名互评汇总，或有指挥官分歧处理结果。
- 任务和子任务状态不自动决定目标完成。
