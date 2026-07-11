# GitHub ORF 聊天同步 - 后端

## 目标

GitHub repository activity 进入 ORF 原生聊天频道，不进入外部聊天系统，也不进入独立通知中心。普通 commit/push/issue 同步消息只形成聊天未读和桌面红点，不进入 AppShell “待我处理”；只有后续被 ORF 业务模块建模成系统通知、@ 当前用户或进入当前用户关注的话题回复时，才会进入注意力待处理链路。

状态链：

1. GitHub repository、branch、commit 和 issue 是外部事实源。
2. `github_orf_chat_deliveries` 是 GitHub push/issues 聊天投递和去重事实源。
3. 投递结果是普通 `chat_messages`，由 ORF chat 负责频道可见性、未读、实时事件和推送。
4. `GITHUB_SYNC_STATE_FILE` 只记录轮询进度，不是消息事实源。

提交展示契约：

1. Webhook、GitHub API 轮询和本地 Git fallback 都必须先在各自适配边界归一为“最新提交在前”，聊天格式化层不再推断或反转来源顺序。
2. 推送正文先展示推送人、提交总数、仓库和分支，再展示最新 5 条提交；截断必须发生在顺序归一之后。
3. 推送人、可定位的提交作者、仓库名和短 SHA 都是可点击链接，并使用聊天统一的高识别度链接色；每条提交其余部分只保留单行标题，其余提交用数量提示及“查看全部变更”入口承接。
4. 机器人名称和时间由聊天消息头展示，正文不重复大标题。GitHub 与 GitLab 的 push 展示规则统一由 `git-push-chat-message.ts` 维护。

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `GITHUB_ORF_CHAT_ENABLED` | 是否启用 GitHub -> ORF 聊天集成。 |
| `GITHUB_ORF_CHAT_CHANNEL_ID` | 可选。指定已有 ORF 公开或私有频道；为空时按频道名自动创建或复用。 |
| `GITHUB_ORF_CHAT_CHANNEL_NAME` | 自动创建/复用频道的稳定 name，默认 `github`。 |
| `GITHUB_ORF_CHAT_CHANNEL_DISPLAY_NAME` | 自动创建频道显示名，默认 `GitHub`。 |
| `GITHUB_ORF_CHAT_CHANNEL_TYPE` | 自动创建频道类型，默认 `public`；`private` 会把创建时所有活跃成员加入频道。 |
| `GITHUB_ORF_CHAT_CHANNEL_PURPOSE` | 自动创建频道 purpose。 |
| `GITHUB_ORF_CHAT_CHANNEL_HEADER` | 自动创建频道 header。 |
| `GITHUB_ORF_CHAT_BOT_NAME` | ORF 聊天消息作者名称，默认 `GitHub`。 |
| `GITHUB_ORF_CHAT_BOT_EMAIL` | ORF 内部 bot 用户 email，默认 `github@orf.local`。 |
| `GITHUB_ORF_CHAT_WEBHOOK_MAX_BODY_BYTES` | 入站 webhook 最大 body，默认 1 MiB。 |
| `GITHUB_REPOSITORY_FULL_NAME` | 允许同步的仓库全名，默认 `xueyu888/ORF`。 |
| `GITHUB_SYNC_ENABLED` | 是否启用局域网轮询同步。 |
| `GITHUB_SYNC_BRANCH` | 兼容旧配置；当前同步不按分支过滤，任何分支推送都通知。 |
| `GITHUB_SYNC_INTERVAL_SECONDS` | 轮询间隔，默认 60 秒。 |
| `GITHUB_SYNC_LOOKBACK` | 每次从 GitHub 拉取的提交数量，默认 20。 |
| `GITHUB_SYNC_STATE_FILE` | 本地同步状态文件，用于记录已同步的最新提交。 |
| `GITHUB_SYNC_GIT_REMOTE` | GitHub API 被限流时使用的 Git remote，默认 `origin`。 |
| `GITHUB_ISSUES_SYNC_ENABLED` | 是否启用 GitHub open issues 轮询同步。 |
| `GITHUB_ISSUES_SYNC_INTERVAL_SECONDS` | issues 轮询间隔，默认 300 秒。 |
| `GITHUB_ISSUES_SYNC_LOOKBACK` | 每次从 GitHub 拉取的 open issues 数量，默认 50。 |
| `GITHUB_TOKEN` | 可选。私有仓库或需要更高 GitHub API 限额时填写。 |
| `GITHUB_WEBHOOK_SECRET` | 可选。只有启用 GitHub webhook 入站模式时才需要。 |

`GITHUB_ORF_CHAT_ENABLED=true`、`GITHUB_SYNC_ENABLED=true`、`GITHUB_ISSUES_SYNC_ENABLED=true` 或配置了 `GITHUB_WEBHOOK_SECRET` 时，后端会启用该集成。

## 局域网同步流程

1. ORF 后端启动后读取 `GITHUB_SYNC_STATE_FILE`。
2. 每隔 `GITHUB_SYNC_INTERVAL_SECONDS` 检查所有远端分支。
3. 如果发现任何分支有新提交，用 ORF 内部 GitHub bot 发到 ORF 聊天频道。
4. 首次启动只初始化基准提交，不补发历史提交。
5. 启动后新出现的分支会把最新提交作为一次推送消息发送。
6. GitHub API 被限流时，自动改用本地 git remote 检查。
7. 每次 push 的投递 key 是 `repository + ref + after_sha`，写入 `github_orf_chat_deliveries` 去重；webhook、GitHub API 轮询、本地 git fallback 或多个 ORF 实例检测到同一个 key 时，只有第一个成功 reserve 的实例会发送 ORF 聊天消息。
8. 如果某次发送失败，ledger 状态记录为 `failed`；下一次检测到同一个投递 key 时允许重新 reserve 并重试。超过 10 分钟仍停留在 `reserved` 的记录也允许重试。

## Issues 同步流程

1. ORF 后端启动后读取 `GITHUB_SYNC_STATE_FILE` 中的 issues 状态。
2. 首次启用时，如果仓库存在 open issues，会把当前 open issues 汇总发送到 ORF 聊天频道。
3. 后续每隔 `GITHUB_ISSUES_SYNC_INTERVAL_SECONDS` 检查 open issues。
4. 如果发现新打开或重新打开的 issue，会发送新增 issue 摘要。
5. 当前 open issues 汇总和新增 issue 摘要都写入 `github_orf_chat_deliveries` 去重，避免多实例或状态文件重置时重复刷屏。
6. 已通知过且仍处于 open 状态的 issue 不会在每次轮询时重复发送。

## 可选 Webhook 模式

如果 ORF 后端有公网 HTTPS 地址，可以在 GitHub 仓库的 Webhooks 中新增 webhook：

- Payload URL: `https://<ORF 后端公网域名>/webhooks/github/push`
- Content type: `application/json`
- Secret: 填写 `.env` 中的 `GITHUB_WEBHOOK_SECRET`
- Which events: `Just the push event`

如果要用 webhook 实时接收 issue opened/reopened 事件，新增第二个 webhook：

- Payload URL: `https://<ORF 后端公网域名>/webhooks/github/issues`
- Content type: `application/json`
- Secret: 填写 `.env` 中的 `GITHUB_WEBHOOK_SECRET`
- Which events: `Issues`

issue webhook 使用 `repository + issue number + action + issue occurrence` 作为投递 key，同一事件重试不会重复生成 ORF 聊天消息。

局域网环境不需要配置 GitHub webhook。
