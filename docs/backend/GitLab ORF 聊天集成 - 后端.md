# GitLab ORF 聊天集成 - 后端

## 目标

GitLab 项目动态进入 ORF 原生聊天，而不是进入独立通知系统或系统会话。

状态链：

1. GitLab project 是外部事实源。
2. `gitlab_orf_project_channels` 是 GitLab project 到 ORF `chat_channels` 的唯一映射事实源。
3. `gitlab_orf_event_deliveries` 是 GitLab webhook 事件投递和去重事实源。
4. 投递结果是普通 `chat_messages`，由现有聊天系统负责频道可见性、未读、实时事件和推送副作用。

## 边界

GitLab push、tag、merge request、issue、pipeline 这类工程动态是项目频道消息，不写入 `notification_events` / `notification_receipts`。

只有当 GitLab 事件后续被建模为 ORF 内部任务、反馈、审批或个人待办时，才应由业务模块发布系统会话事件。

GitLab 工程动态只进入 ORF 原生聊天链路，不再维护外部聊天兼容链路。

## 数据模型

| 表 | 职责 |
| --- | --- |
| `gitlab_orf_project_channels` | 每个 GitLab project 在某个 ORF team 下对应一个聊天频道。 |
| `gitlab_orf_event_deliveries` | 记录 GitLab 事件 key 的 reserve、delivered、failed、ignored 状态，避免 webhook 重试或多实例重复发消息。 |
| `chat_channels` | ORF 原生聊天频道事实源。 |
| `chat_messages` | ORF 原生聊天消息事实源。 |

事件 key 优先使用 GitLab `X-Gitlab-Event-UUID`。没有该 header 时，由 project id、事件类型、ref、对象属性和 SHA 生成稳定摘要。

## 配置

| 变量 | 说明 |
| --- | --- |
| `GITLAB_ORF_CHAT_ENABLED` | 是否启用 GitLab -> ORF 聊天集成。 |
| `GITLAB_URL` | GitLab 站点地址。 |
| `GITLAB_ORF_CHAT_GROUP` | 要覆盖的 GitLab group，默认 `develop`。 |
| `GITLAB_ORF_CHAT_RECONCILE_INTERVAL_SECONDS` | project/channel/hook 收敛间隔，默认 60 秒。 |
| `GITLAB_ORF_CHAT_ACCESS_TOKEN` | GitLab API token，用于列出 group projects 并维护 project webhooks。 |
| `GITLAB_ORF_CHAT_WEBHOOK_URL` | ORF 入站 webhook URL，例如 `https://orf.example.com/webhooks/gitlab/orf-chat`。 |
| `GITLAB_ORF_CHAT_WEBHOOK_SECRET` | GitLab project webhook 的 secret token，ORF 校验 `X-Gitlab-Token`。 |
| `GITLAB_ORF_CHAT_WEBHOOK_MAX_BODY_BYTES` | 入站 webhook 最大 body，默认 1 MiB。 |
| `GITLAB_ORF_CHAT_CHANNEL_TYPE` | 自动创建频道类型，默认 `public`；`private` 会把创建时所有活跃成员加入频道，后续新成员不自动加入。 |
| `GITLAB_ORF_CHAT_BOT_NAME` | ORF 聊天消息作者名称，默认 `GitLab`。 |
| `GITLAB_ORF_CHAT_BOT_EMAIL` | ORF 内部 bot 用户 email，默认 `gitlab@orf.local`。 |

## 运行方式

后端启动时随 optional integrations 注册：

- 如果配置了 `GITLAB_ORF_CHAT_WEBHOOK_SECRET`，注册 `/webhooks/gitlab/orf-chat`。
- 如果同时配置了 `GITLAB_URL`、`GITLAB_ORF_CHAT_ACCESS_TOKEN`、`GITLAB_ORF_CHAT_WEBHOOK_URL` 和 secret，启动后立即收敛一次，并按间隔继续收敛。

也可以手动执行一次：

```bash
npm run gitlab:orf-chat:reconcile
```

管理员也可以在 `系统管理 -> 系统设置 -> GitLab 聊天绑定` 中查看当前 project/channel 映射，把某个 GitLab project 改绑到已有 ORF 公开或私有频道，并手动触发一次收敛。

## 收敛规则

每次收敛会：

1. 读取 `GITLAB_ORF_CHAT_GROUP` 下所有项目。
2. 为每个 project 确保一个 ORF 聊天频道和一条 `gitlab_orf_project_channels` 映射。
3. 确保 project webhook 指向 `GITLAB_ORF_CHAT_WEBHOOK_URL`。
4. webhook 事件开启 push、tag push、merge request、issue、pipeline。

频道名由 GitLab project path 和 project id 生成，避免同名项目或重命名导致频道混用。

如果管理员已经在系统设置中把 project 绑定到某个已有频道，收敛只更新 project path、URL 和 last seen 信息，不会覆盖这个频道选择。

## 管理接口

| 接口 | 职责 |
| --- | --- |
| `GET /api/settings/gitlab-orf-chat` | 返回配置状态、GitLab project 列表、当前映射和可绑定频道。 |
| `PUT /api/settings/gitlab-orf-chat/projects/:projectId/channel` | 保存单个 project 到已有频道的绑定。 |
| `POST /api/settings/gitlab-orf-chat/reconcile` | 管理员手动触发一次 project/channel/hook 收敛。 |

## 失败和重试

事件先写入 `gitlab_orf_event_deliveries` 的 `reserved` 状态，再调用现有聊天发送路径。

- 发送成功后状态变为 `delivered`，并记录 `chat_message_id`。
- 发送失败后状态变为 `failed`，同一个事件再次进入时允许重试。
- `reserved` 超过 10 分钟也允许重新 reserve，避免进程中断留下永久占用。
