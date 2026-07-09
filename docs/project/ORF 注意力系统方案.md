# ORF 注意力系统方案

本文档定义 ORF 注意力系统的产品和技术契约。当前 `xy` 分支已有 Win11 托盘、任务栏角标、任务栏闪烁和系统 Toast 的桌面底座；注意力系统把这些能力从“只由聊天未读总数驱动”升级为由聊天未读、系统通知、工作日志提醒、窗口状态和当前路由共同派生。

注意力系统不是独立通知中心，也不得绕过现有聊天和系统消息事实源。

## 核心原则

1. 通知事实继续由消息系统负责：业务事件写入 `notification_events`、`notification_receipts`、`notification_deliveries`，再投影到聊天系统消息。
2. 注意力系统只回答“此刻如何打扰用户”：红点、系统 Toast、任务栏闪烁、托盘入口、侧边栏待处理入口。
3. 注意力状态是前端和桌面壳的派生展示状态，不写数据库、不创建通知、不改变业务状态。
4. 业务模块不得直接调用 `flashFrame`、系统 `Notification`、托盘菜单或任务栏 overlay。
5. 侧边栏只展示“待我处理”入口和强提醒摘要；完整历史仍回到聊天里的 `我的系统通知`，实际处理仍回到业务 `targetHref`。
6. “已读”和“已处理”必须分离。注意力系统只能通过现有通知/聊天已读接口改变注意力状态，或通过已有业务提醒接口改变本地稍后提醒状态；不得直接把反馈、目标、工作日志等业务对象标记为已处理。

## 状态链和事实源

```text
业务 mutation 成功
  -> 通知事件写入 notification_events / notification_receipts / notification_deliveries
  -> 系统消息投影到 chat_messages
  -> 前端读取聊天未读、系统通知、工作日志提醒、窗口状态、当前路由和用户偏好
  -> buildAttentionState 派生注意力状态
  -> AppShell 展示侧边栏待我处理入口
  -> Win11 桌面壳展示任务栏角标、系统 Toast、任务栏闪烁、托盘图标闪烁和托盘菜单
```

唯一事实源：

| 事实 | 权威来源 |
| --- | --- |
| 业务状态 | 目标、反馈、评论、工作日志、数据同步等原业务表 |
| 系统通知事件和收件人 | `notification_events`、`notification_receipts` |
| 系统通知到聊天的投递 | `notification_deliveries` |
| 系统消息阅读入口 | `chat_messages`、`chat_channels.system_kind` |
| 聊天未读 | `chat_channel_members`、`chat_thread_follows` 派生的聊天未读读模型 |
| 工作日志欠账是否继续提醒 | `work_log_reminder_states` |
| 注意力等级、最新强提醒、是否需要闪烁 | `buildAttentionState` 的前端派生结果 |
| Toast/flash 冷却和同事件去重 | 前端或桌面壳本地运行态；当前桌面 flash 冷却为 12 秒 |

## 注意力等级

`none` 表示没有注意力输出；实际展示等级分为四类。

| 等级 | 展示效果 | 适合事件 |
| --- | --- | --- |
| `badge` | 只显示侧边栏/移动底部导航/任务栏/托盘红点或数字 | 普通群聊未读、普通系统公告、`objective.published`、`worklog.submitted`、`objective.settled` |
| `toast` | Windows 右下角系统 Toast；点击进入聊天或业务目标 | 私聊、普通回复、`feedback.commented`、`feedback.status.changed`、`comment.reply.created` |
| `flash` | `toast` + Win11 任务栏图标闪烁 + 右下角托盘图标闪烁；任务栏闪烁仅在窗口不在前台时触发 | `comment.mention.created`、聊天 `@我`、私聊、我关注的话题有回复 |
| `urgent` | `toast` + 任务栏闪烁 + 右下角托盘图标闪烁 + 托盘置顶入口 + 侧边栏“待我处理”置顶 | `feedback.assigned`、`objective.recruitment.created`、`objective.reinforcement.added`、`objective.alignment.requested`、`objective.loot.submitted`、`objective.peerReview.requested`、`objective.revision.required`、active `WorkLogReminderState`、`data.sync.conflict` |

默认等级只是初始策略；运行时必须结合当前上下文降级或抑制。

## 运行时降级规则

1. 当前用户自己触发的事件不提醒。
2. 当前用户正在查看对应聊天频道、话题或业务页面时，不弹系统 Toast，不闪烁任务栏；必要时只保留红点或侧边栏入口。
3. 静音频道不触发聊天类 Toast、flash 或 urgent；反馈指派、工作日志欠账、数据同步冲突等强业务事件不应被聊天静音误伤。
4. Win11 窗口聚焦并可见时通常不 flash；窗口失焦、最小化或隐藏到托盘时才允许 flash。
5. 同一事件只弹一次 Toast；重复实时事件只能刷新未读和待处理入口。
6. 同类高频提醒需要合并或冷却，不能连续刷屏。
7. `urgent` 在对应事实仍未解除前保留在“待我处理”，但不持续弹 Toast 或持续闪烁。

建议冷却口径：

| 行为 | 建议冷却 |
| --- | --- |
| 同一事件 Toast | 只允许一次 |
| 同类 Toast | 60 秒 |
| 任务栏 flash | 当前实现 12 秒 |
| 托盘图标 flash | `flash/urgent` 且 `count > 0` 时持续闪烁，直到注意力等级降级或清空 |
| 未处理 urgent 再提醒 | 10 分钟，且必须尊重工作日志等业务自身的 `next_remind_at` |

## 侧边栏待我处理

“待我处理”应放在 AppShell 侧边栏，而不是藏在聊天页内部。原因是漏消息的核心问题通常是用户没有意识到要打开聊天；全局侧边栏入口可以在任何页面提供工作注意力信号。

结构边界：

```text
侧边栏待我处理     负责当前需要注意的摘要和入口
聊天我的系统通知   负责完整消息历史和已读/未读
业务页面 targetHref 负责真正处理目标、反馈、工作日志或数据冲突
```

有待处理项时侧边栏入口展示：

```text
待我处理 3
@我 1 · 指派 1 · 日志 1
```

`AttentionState.count = 0` 时不渲染侧边栏“待我处理”和移动端底部 `待办` 入口；空状态不占导航位置，也不显示一个可点但无内容的图标。

点开后的面板只展示轻量摘要：

```text
待我处理

强提醒
[工作日志] 你还有 1 天未提交
打开

[反馈] 登录页问题已指派给你
打开

普通提醒
[@我] 张三在「目标 A」提到了你
打开
```

面板动作边界：

| 动作 | 含义 | 是否允许第一阶段实现 |
| --- | --- | --- |
| 打开 | 跳转到 `targetHref` 或聊天系统消息 | 允许 |
| 标记已读 | 调用现有通知/聊天已读能力，只改变注意力状态 | 已实现通知项打开后标已读、通知全部已读 |
| 稍后提醒 | 只在已有业务语义支持时实现，例如工作日志 `next_remind_at` | 可后续实现 |
| 标记已处理 | 改变反馈、目标、工作日志等业务状态 | 不允许由注意力系统直接实现 |

## 桌面壳职责

Win11 桌面壳只消费注意力状态，不理解业务语义。

保留现有兼容接口：

```ts
setChatUnreadCount({ count })
```

新增统一接口：

```ts
setAttentionState({
  body,
  count,
  latestEventId,
  latestTargetPath,
  level,
  reason,
  title,
  toast
})
```

兼容规则：

```ts
setChatUnreadCount({ count }) => setAttentionState({
  count,
  level: count > 0 ? "badge" : "none",
  reason: "chat.unread"
})
```

桌面表现：

| 等级 | 任务栏 overlay | Windows 系统 Toast | 任务栏 flash | 托盘图标 flash | 托盘菜单 |
| --- | --- | --- | --- | --- | --- |
| `none` | 清空 | 不展示 | 停止 | 停止 | 普通菜单 |
| `badge` | 显示数字/红点 | 不展示 | 不触发 | 不触发 | 打开待处理提醒、打开聊天、打开我的系统通知 |
| `toast` | 显示数字/红点 | 展示一次 | 不触发 | 不触发 | 打开聊天/系统通知 |
| `flash` | 显示数字/红点 | 展示一次 | 窗口不在前台时触发 | 持续闪烁 | 打开最新提醒 |
| `urgent` | 显示数字/红点 | 展示一次 | 窗口不在前台时触发 | 持续闪烁 | 置顶“打开待处理提醒” |

托盘菜单建议：

```text
ORF
打开待处理提醒（3）
打开聊天
打开我的系统通知
---
刷新 ORF
开机自启 ✓
退出
```

`勿扰 1 小时` 属于新的个人偏好或本地运行态策略，是否实现需要单独决策，不能在第一阶段默认加入。

## 前端模型职责

当前前端实现一个纯模型：

```ts
type AttentionLevel = "none" | "badge" | "toast" | "flash" | "urgent";

type AttentionSource = "chat" | "notification" | "worklog";

type AttentionItem = {
  body: string;
  createdAt: string;
  eventId: string;
  kind?: NotificationKind | "chat.mention" | "chat.thread" | "chat.unread" | "worklog.reminder";
  level: Exclude<AttentionLevel, "none">;
  source: AttentionSource;
  targetPath: string;
  title: string;
};

type AttentionState = {
  body: string;
  count: number;
  flashCount: number;
  items: AttentionItem[];
  latestEventId: string | null;
  latestTargetPath: string | null;
  level: AttentionLevel;
  reason: string | null;
  signature: string;
  title: string;
  urgentCount: number;
};
```

输入：

| 输入 | 用途 |
| --- | --- |
| `chatUnreadSummary` | 普通未读、@我、线程未读聚合 |
| `AppNotification[]` / `unreadNotificationCount` | 系统通知 kind、targetHref、readAt |
| `WorkLogReminderState` | 工作日志欠账是否仍需提醒 |
| `AppAttentionState` | 当前窗口是否被用户主动查看 |
| 当前路由和聊天视图状态 | 判断是否正在看目标 |
| 个人通知偏好 | 判断 Toast、系统通知或勿扰策略 |

输出：

| 输出 | 消费方 |
| --- | --- |
| `AttentionState.level/count/latestTargetPath` | 桌面壳 |
| `AttentionState.items` | 侧边栏待我处理面板 |
| `AttentionState.title/body` | 系统 Toast |

## 当前实现范围

当前实现完成最小闭环：

1. `chatUnreadSummary.totalUnreadCount > 0` 派生 `badge`。
2. 聊天 `@我` 派生 `flash`；聊天线程回复派生 `toast`；普通聊天未读只派生 `badge`。聊天实时 Toast 继续由原聊天原生通知模型负责，避免重复分发。
3. `worklog.reminder.required` 或 active `WorkLogReminderState` 派生 `urgent`，并通过 `shouldRemindNow` 尊重工作日志自身提醒节奏。
4. 业务系统通知按 `NotificationKind` 映射为 `badge`、`toast`、`flash` 或 `urgent`；正在查看对应目标时降级为 `badge`。
5. Win11 托盘菜单新增“打开待处理提醒”，点击后跳转到 `latestTargetPath`；`flash/urgent` 且 `count > 0` 时右下角托盘图标同步闪烁，清空或降级后恢复常态图标。
6. 侧边栏新增“待我处理”入口，只在 `AttentionState.count > 0` 时展示数量和轻量面板；通知项点击进入现有聊天系统消息或业务页面前会调用通知已读接口，面板也提供“通知全部已读”用于清理历史未读积压。
7. 移动端底部导航只在 `AttentionState.count > 0` 时新增 `待办` 入口，不新增独立页面；点击进入最新待处理目标或个人系统通知，最新项是通知时先调用通知已读接口。

当前不做：

1. 不新增独立通知中心页面。
2. 不实现“标记已处理”动作；注意力系统不得直接改变反馈、目标、工作日志等业务状态。
3. 不改变通知收件人、权限、E2E 隔离或业务状态流。
4. 不把 AppShell 变成业务状态事实源。
5. 不新增勿扰、同类 Toast 60 秒合并或用户级通知偏好入口；后续需要单独决策。

## 验收场景

| 场景 | 期望 |
| --- | --- |
| 窗口打开且正在看当前聊天 | 不弹系统 Toast，不 flash |
| 窗口打开但在其他页面 | 可弹系统 Toast，保留 badge |
| 窗口失焦 | `flash` 或 `urgent` 触发任务栏闪烁和托盘图标闪烁 |
| 窗口最小化 | `flash` 或 `urgent` 触发系统 Toast、任务栏闪烁和托盘图标闪烁 |
| 窗口隐藏到托盘 | `flash` 或 `urgent` 触发托盘图标闪烁，托盘菜单可以打开待处理提醒 |
| 点击系统 Toast | 跳到 `latestTargetPath` |
| 点击托盘“打开待处理提醒” | 跳到 `latestTargetPath` |
| 工作日志欠账仍 active | 侧边栏“待我处理”保留工作日志项 |
| 工作日志欠账 resolved | 侧边栏“待我处理”移除工作日志项 |
| 同一事件重复实时推送 | 不重复 Toast |
| 自己触发的通知事件 | 不进入强提醒 |
| 静音聊天频道收到普通消息 | 不触发 Toast、flash 或 urgent |

## 文档归属

| 文档 | 职责 |
| --- | --- |
| 本文档 | 注意力系统方案、等级表、派生边界和桌面表现 |
| [消息系统开发.md](./消息系统开发.md) | 通知事实源、投递链、系统会话和已实现事件 |
| [AppShell - 前端.md](../frontend/AppShell%20-%20前端.md) | 侧边栏“待我处理”入口、全局浮层和移动端避让 |
| [AppShell - 后端.md](../backend/AppShell%20-%20后端.md) | AppShell 后端依赖边界；注意力系统第一阶段不新增后端事实源 |
| [client-release.md](./client-release.md) | Win11 客户端发布、安装和原生桌面能力验证 |
