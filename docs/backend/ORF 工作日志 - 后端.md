# ORF 工作日志 - 后端

## 范围

工作日志记录“某个用户在某一天做了什么”。普通成员的日志必须绑定到自己参与的目标；指挥官/管理员可以记录自己的日常工作，目标可以为空。它是独立事实源，不属于评论、任务进度、战利品、验收或积分。

## 事实源

`work_log_entries` 是唯一事实源：

| 字段 | 含义 |
| --- | --- |
| `author_user_id` | 日志归属用户，使用 `users.id` |
| `work_date` | 日志所属自然日，`YYYY-MM-DD` |
| `objective_id` | 当前仍存在时的目标链接；未指定目标或目标删除后置空 |
| `objective_id_snapshot` | 填写时目标 ID 快照；未指定目标时为空 |
| `objective_title_snapshot` | 填写时目标标题快照；未指定目标时为空 |
| `body_markdown` | Markdown 日志正文 |
| `sort_order` | 当天多目标日志顺序 |

同一 `team_id + author_user_id + work_date + objective_id_snapshot` 只能有一条目标日志。同一 `team_id + author_user_id + work_date` 只能有一条未指定目标的日常日志。目标改名或删除后，历史日志继续显示快照；编辑已有日志只修改正文和排序，不重写目标快照。

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/work-logs/objectives` | 当前用户可填写日志的目标 |
| `GET` | `/api/work-logs/my-day?date=YYYY-MM-DD` | 当前用户某天日志 |
| `PUT` | `/api/work-logs/my-day/:date` | 保存当前用户某天全部日志 |
| `GET` | `/api/work-logs/activity?from=&to=&userId=&objectiveId=` | 团队日志活动流 |

`PUT /api/work-logs/my-day/:date` 请求体：

```json
{
  "entries": [
    {
      "objectiveId": "obj-1",
      "bodyMarkdown": "今天完成了接口联调。"
    },
    {
      "objectiveId": null,
      "bodyMarkdown": "整理了例会结论和明天安排。"
    }
  ]
}
```

## 权限

- active 普通成员可以写自己的工作日志，且 `objectiveId` 必须属于当前默认作用域并包含当前用户 `users.id`。
- active 指挥官/管理员可以写自己的工作日志；`objectiveId` 可以为空。若指定目标，目标必须属于当前默认作用域。
- 任何人都不能代别人填写工作日志。
- 已有日志可以由本人继续编辑，即使目标后来改名、删除或成员关系变化。
- active 团队成员都可以读取团队活动流。

## 提醒

后端启动 `workLogReminderScheduler`，默认在 `Asia/Shanghai` 每天 `17:20` 检查：

- 当前团队 active 指挥官/管理员，或至少有一个可填写目标的 active 普通成员。
- 用户当天尚未写日志。
- 当天尚未收到过 `worklog.reminder` 通知。

满足条件时写入通知中心，并通过 SSE 向这些用户发送 `workLogReminder` sticky 横幅。提醒不创建日志、不改变目标、不影响进度、验收或积分。
