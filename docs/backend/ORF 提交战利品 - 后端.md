# ORF 提交战利品 - 后端

## 接口

| 方法 | 路径 |
| --- | --- |
| `POST` | `/api/objectives/:objectiveId/loot` |

请求体：

```json
{ "body": "完成说明" }
```

## 保存字段

| 字段 | 说明 |
| --- | --- |
| `objectiveId` | 当前悬赏目标 ID |
| `body` | 战利品说明 |
| `submittedBy` | 提交人 |
| `lootSubmittedAt` | 提交时间，用于判断按时或延期 |

战利品必须说明目标下哪些悬赏指标已完成或被证伪，以及对应证据。

## 状态

提交成功后：

- 目标进入 `待验收`。
- 任务和子任务状态不自动决定目标完成。
- 后端返回更新后的数据，或要求前端重新拉取 `/api/tasks-page`。

旧接口 `/api/results/:resultId/loot` 和 `targetType=result` 战利品契约删除。
