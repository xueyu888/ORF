# ORF 注意力系统方案

本文档定义 ORF 注意力系统的产品和技术契约。当前 `xy` 分支已有 Win11 托盘、任务栏角标、任务栏闪烁和系统 Toast 的桌面底座；注意力系统把这些能力从“只由聊天未读总数驱动”升级为由可处理聊天提醒、系统通知、工作日志提醒、普通聊天未读、窗口状态和当前路由共同派生。

注意力系统不是独立通知中心，也不得绕过现有聊天和系统消息事实源。

## 核心原则

1. 通知事实继续由消息系统负责：业务事件写入 `notification_events`、`notification_receipts`、`notification_deliveries`，再投影到聊天系统消息。反馈只通过自己的 notification outbox 和 provider 提交通用通知请求，注意力系统不维护 `feedback.*` 规则清单。
2. 注意力系统只回答“此刻如何打扰用户”：红点、系统 Toast、任务栏闪烁、托盘入口、侧边栏待处理入口。
3. 注意力状态是前端和桌面壳的派生展示状态，不写数据库、不创建通知、不改变业务状态。
4. 业务模块不得直接调用 `flashFrame`、系统 `Notification`、托盘菜单或任务栏 overlay。
5. 侧边栏只展示“待我处理”入口和需要当前用户响应的摘要；普通聊天未读和 GitHub/GitLab 工程动态只留在聊天入口和桌面红点，不进入“待我处理”。
6. “已读”和“已处理”必须分离。注意力系统只能通过现有通知/聊天已读接口改变注意力状态，或通过已有业务提醒接口改变本地稍后提醒状态；不得直接把反馈、目标、工作日志等业务对象标记为已处理。

## 状态链和事实源

```text
业务 mutation 成功
  -> 业务模块提交通知请求；反馈先提交 feedback_event_dispatches outbox
  -> 通知事件写入 notification_events / notification_receipts / notification_deliveries
  -> 系统消息投影到 chat_messages
聊天消息事务提交
  -> 按收件人发送轻量 realtime（强提醒原因、统一目标、发送者展示身份）
  -> 前端立即产生短生命周期强提醒意图
  -> 前端读取可处理聊天提醒、普通聊天未读、系统通知、工作日志提醒、窗口状态、当前路由和用户偏好
  -> buildAttentionState 派生注意力状态
  -> AppShell 展示侧边栏待我处理入口
  -> Win11 桌面壳展示任务栏角标、系统 Toast、任务栏闪烁、托盘图标闪烁和托盘菜单
  -> 持久未读对账成功后接管或清除 realtime 强提醒意图
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
| 待处理数量、桌面红点数量、注意力等级、最新强提醒、是否需要闪烁 | `buildAttentionState` 的前端派生结果 |
| realtime 强提醒意图 | 当前客户端内存；仅用于填补消息到达与持久未读对账之间的时间窗，不写数据库 |
| Toast/flash 冷却和同事件去重 | 前端或桌面壳本地运行态；当前桌面 flash 冷却为 12 秒 |

## 注意力等级

`none` 表示没有注意力输出；实际展示等级分为四类。

| 等级 | 展示效果 | 适合事件 |
| --- | --- | --- |
| `badge` | 只显示聊天入口、任务栏和托盘无数字红点；不单独生成“待我处理”入口 | 普通群聊未读、GitHub/GitLab 工程动态、普通系统公告、`objective.published`、`worklog.submitted`、`objective.settled` |
| `toast` | Windows 右下角系统 Toast；点击进入聊天或业务目标 | 普通回复、我关注的话题有回复、`comment.reply.created`、业务通知 provider 标记为普通待看提醒的事件 |
| `flash` | `toast` + Win11 任务栏与右下角托盘的整枚 ORF 图标持续闪烁；窗口不在前台时额外触发系统任务栏提醒 | `comment.mention.created`、私聊、聊天具名 `@我`、`@所有人`、话题内显式提及 |
| `urgent` | `toast` + 任务栏闪烁 + 右下角托盘图标闪烁 + 托盘置顶入口 + 侧边栏“待我处理”置顶 | 业务通知 provider 标记为 `action_required` 的反馈事件、`objective.recruitment.created`、`objective.reinforcement.added`、`objective.alignment.requested`、`objective.loot.submitted`、`objective.peerReview.requested`、`objective.revision.required`、active `WorkLogReminderState`、`data.sync.conflict` |

默认等级只是初始策略；运行时必须结合当前上下文降级或抑制。

## 运行时降级规则

1. 当前用户自己触发的事件不提醒。
2. 当前用户正在查看对应聊天频道、话题或业务页面时，不弹系统 Toast，不闪烁任务栏；必要时只保留红点或侧边栏入口。
3. 静音频道抑制普通聊天 Toast；但私聊和实际命中当前用户的具名/广播提及仍保留托盘持续闪烁，避免静音让高相关消息完全不可见。反馈指派、工作日志欠账、数据同步冲突等强业务事件也不应被聊天静音误伤。
4. 普通聊天总未读只进入聊天入口角标和 `AttentionState.badgeCount`；只有后端 `actionableMessageUnreadCount` 覆盖的 @我/私聊、我关注的话题回复或业务系统通知才进入 `AttentionState.count` 和“待我处理”。
5. Win11 窗口聚焦并可见时通常不 flash；窗口失焦、最小化或隐藏到托盘时才允许 flash。
6. 同一事件只弹一次 Toast；系统频道聊天消息只是通知事件的阅读投影，不再重复弹聊天 Toast。重复实时事件只能刷新未读和待处理入口。
7. 同类高频提醒需要合并或冷却，不能连续刷屏。
8. `urgent` 在对应事实仍未解除前保留在“待我处理”，但不持续弹 Toast 或持续闪烁。
9. realtime 强提醒不得自行清除；只有持久未读、系统通知和同步游标都对账成功后才能由持久投影接管。对账失败时保留临时强提醒，避免网络竞态吞掉托盘闪烁。

建议冷却口径：

| 行为 | 建议冷却 |
| --- | --- |
| 同一事件 Toast | 只允许一次 |
| 同类 Toast | 60 秒 |
| 系统任务栏 flash | 当前实现 12 秒冷却；只作为窗口不在前台时的附加提醒 |
| 任务栏/托盘整图 flash | `flash/urgent` 且 `count > 0` 时在深色彩色 X 正常帧和亮色白色 X 提醒帧之间持续闪烁，直到注意力等级降级或清空；两帧都保持整枚图标可见，不使用数字或透明消失制造闪烁 |
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

普通聊天未读不等于待处理。GitHub commit、GitLab push、普通项目频道消息等只让聊天入口和桌面 `badgeCount` 增加；除非消息进入后端 `actionableMessageUnreadCount`，例如明确 @ 当前用户、属于私聊、进入当前用户关注的话题回复，或被业务模块建模成系统通知，否则不得出现在“待我处理”。

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

聊天 Toast 和系统通知 Toast 复用同一个桌面渲染契约：标题、正文、目标路径、提醒等级、事件 ID，以及可选的发送者展示身份。发送者头像 URL 仍由用户头像事实派生；前端使用当前登录态读取头像并缩放为受限 PNG，Windows 壳只把这份展示数据写入有数量上限的临时图片缓存，再以 `appLogoOverride + hint-crop="circle"` 渲染。无头像、读取失败或非用户事件统一回退为姓名首字头像或 ORF 应用图标，不新增头像事实表，也不让桌面壳读取业务接口。

保留现有兼容接口：

```ts
setChatUnreadCount({ count })
```

新增统一接口：

```ts
setAttentionState({
  badgeCount,
  body,
  count,
  latestEventId,
  latestTargetPath,
  level,
  reason,
  title,
  toast,
  workItemCount
})
```

兼容规则：

```ts
setChatUnreadCount({ count }) => setAttentionState({
  badgeCount: count,
  count,
  level: count > 0 ? "badge" : "none",
  reason: "chat.unread",
  workItemCount: 0
})
```

`count` 在桌面 IPC 中保留为旧壳兼容红点数量；新桌面壳使用 `badgeCount` 派生任务栏/托盘的 `normal/unread/attention` 图标状态，使用 `workItemCount` 判断是否展示“打开待处理提醒”。前端 `AttentionState.count` 仍表示 AppShell 侧边栏和移动端 `待办` 的待处理数量。任务栏和托盘图标不显示未读数字，数量只保留在聊天入口、待处理入口和托盘菜单文案。

桌面表现：

| 等级 | 任务栏图标 | Windows 系统 Toast | 系统任务栏 flash | 托盘图标 | 托盘菜单 |
| --- | --- | --- | --- | --- | --- |
| `none` | 正常高清 ORF 图标 | 不展示 | 停止 | 正常高清 ORF 图标 | 普通菜单 |
| `badge` | 无数字红点图标 | 不展示 | 不触发 | 无数字红点图标 | 仅有普通聊天未读时显示“打开聊天（n）”；有待处理项时显示“打开待处理提醒（n）” |
| `toast` | 无数字红点图标 | 展示一次 | 不触发 | 无数字红点图标 | 打开聊天/系统通知 |
| `flash` | 正常帧与亮色提醒帧整图交替 | 展示一次 | 窗口不在前台时触发 | 同步整图交替 | 打开最新提醒 |
| `urgent` | 正常帧与亮色提醒帧整图交替 | 展示一次 | 窗口不在前台时触发 | 同步整图交替 | 置顶“打开待处理提醒” |

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
  kind?: NotificationKind | "chat.direct" | "chat.mention" | "chat.thread" | "worklog.reminder";
  level: Exclude<AttentionLevel, "none">;
  source: AttentionSource;
  targetPath: string;
  title: string;
};

type AttentionState = {
  badgeCount: number;
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
| `chatUnreadSummary` | 普通未读、`actionableMessageUnreadCount`、私聊未读、主消息提及、话题提及、话题未读聚合；`mentionCount` 只由 `mainMentionCount + threadMentionCount` 派生，普通未读只生成 `badgeCount` |
| `AppNotification[]` / `unreadNotificationCount` | 系统通知 kind、targetHref、readAt |
| `WorkLogReminderState` | 工作日志欠账是否仍需提醒 |
| `AppAttentionState` | 当前窗口是否被用户主动查看 |
| 当前路由和聊天视图状态 | 判断是否正在看目标 |
| 个人通知偏好 | 判断 Toast、系统通知或勿扰策略 |

输出：

| 输出 | 消费方 |
| --- | --- |
| `AttentionState.badgeCount/level/latestTargetPath` | 桌面壳任务栏/托盘图标状态和普通聊天未读入口 |
| `AttentionState.count/items` | 侧边栏和移动端“待我处理” |
| `AttentionState.title/body` | 系统 Toast |

## 当前实现范围

当前实现完成最小闭环：

1. `chatUnreadSummary.totalUnreadCount > 0` 只派生 `badgeCount` 和 `badge`，不增加 `AttentionState.count`，不生成“待我处理”项。
2. 私聊、聊天具名 `@我`、`@所有人` 和话题内显式提及在 realtime 到达时立即产生 `flash` 意图，再由持久未读汇总接管；两者按消息和提醒类型合并计数，不能重复生成“待我处理”项。普通关注话题回复派生 `toast`，普通聊天未读只派生聊天入口和桌面红点。聊天实时 Toast 仍由聊天原生通知模型一次性投递，强提醒意图只驱动统一注意力状态和托盘/任务栏，不重复弹 Toast。
3. `worklog.reminder.required` 或 active `WorkLogReminderState` 派生 `urgent`，并通过 `shouldRemindNow` 尊重工作日志自身提醒节奏。
4. 业务系统通知按通用 notification presentation 的 attention level 派生为 `badge`、`toast`、`flash` 或 `urgent`；正在查看对应目标时降级为 `badge`。注意力系统不维护反馈专属 `feedback.*` kind 清单。
5. Win11 托盘菜单提供“打开待处理提醒”，点击后跳转到 `latestTargetPath`；任务栏与托盘共用 `normal/unread/attention` 三态图标事实源，使用适合各自系统槽位的独立逻辑尺寸和同一份四倍超采样渲染。`unread` 只显示无数字红点；`flash/urgent` 且 `count > 0` 时整枚图标在正常帧和高对比提醒帧之间持续闪烁，清空或降级后同步恢复 unread/normal 图标。
6. 侧边栏新增“待我处理”入口，只在 `AttentionState.count > 0` 时展示数量和轻量面板；通知项点击进入现有聊天系统消息或业务页面前会调用通知已读接口，面板也提供“通知全部已读”用于清理历史未读积压。
7. 移动端底部导航只在 `AttentionState.count > 0` 时新增 `待办` 入口，不新增独立页面；点击进入最新待处理目标或个人系统通知，最新项是通知时先调用通知已读接口。
8. 首次 SSE 连接、每次重连、网络恢复、窗口聚焦和页面重新可见都会进入同一个 `connectionEpoch` 对账链；未读汇总恢复后重新派生 `AttentionState`，桌面任务栏和托盘不依赖错过的瞬时事件继续保持旧状态。
9. 恢复对账只刷新持久未读和注意力派生状态，不补弹已经错过的一次性 Toast；同一实时消息仍按 `messageId` 去重，避免连接抖动导致重复系统通知。
10. 聊天和有用户触发人的系统 Toast 展示发送者头像；Windows 使用临时本地 PNG 生成圆形 `appLogoOverride`，其他桌面平台使用同一 PNG 作为通知 icon。Android 继续使用应用通知图标，因为现有本地通知插件的 `largeIcon` 契约只接受 Android drawable 资源，不另建一套头像缓存和下载链。

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
| 私聊或用户触发的系统通知弹出 | 展示发送者头像；头像不可用时回退为姓名首字头像或 ORF 图标 |
| 窗口隐藏到托盘 | `flash` 或 `urgent` 触发托盘图标闪烁，托盘菜单可以打开待处理提醒 |
| 点击系统 Toast | 跳到 `latestTargetPath` |
| 点击托盘“打开待处理提醒” | 跳到 `latestTargetPath` |
| 工作日志欠账仍 active | 侧边栏“待我处理”保留工作日志项 |
| 工作日志欠账 resolved | 侧边栏“待我处理”移除工作日志项 |
| 同一事件重复实时推送 | 不重复 Toast |
| 客户端更新期间收到私聊或 @，随后首次连接 | 无需刷新即可恢复未读，失焦时任务栏和托盘按 `flash` 状态提示 |
| 聊天页在连接恢复后才挂载 | 页面读取当前连接 epoch，补做频道、消息窗口和话题对账 |
| 用户停在历史消息位置时恢复 | 后台取得最新窗口但保持阅读锚点，只提示有新消息；进入最新位置后显示已同步消息 |
| 自己触发的通知事件 | 不进入强提醒 |
| 静音聊天频道收到普通消息 | 不触发 Toast、flash 或 urgent |
| 静音聊天频道中的私聊或消息实际提到当前用户 | 不弹普通聊天 Toast，但托盘持续闪烁并保留任务栏角标 |
| realtime 到达后未读汇总请求仍在进行 | 立即进入 `flash`；对账成功后由持久未读接管，对账失败不提前清除 |
| GitHub commit 同步到普通 GitHub 频道 | 聊天入口和桌面红点可增加；侧边栏“待我处理”和移动端 `待办` 不显示 |
| 聊天系统通知消息被读到 | 对应 `notification_receipts.read_at` 同步更新，“待我处理”减少 |

## 文档归属

| 文档 | 职责 |
| --- | --- |
| 本文档 | 注意力系统方案、等级表、派生边界和桌面表现 |
| [消息系统开发.md](./消息系统开发.md) | 通知事实源、投递链、系统会话和已实现事件 |
| [AppShell - 前端.md](../frontend/AppShell%20-%20前端.md) | 侧边栏“待我处理”入口、全局浮层和移动端避让 |
| [AppShell - 后端.md](../backend/AppShell%20-%20后端.md) | AppShell 后端依赖边界；注意力系统第一阶段不新增后端事实源 |
| [生产发布执行手册.md](./生产发布执行手册.md) | 客户端发布和更新广播的操作流程 |
