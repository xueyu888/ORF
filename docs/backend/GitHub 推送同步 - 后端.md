# GitHub 推送同步 - 后端

## 目标

在局域网环境中，由 ORF 后端主动拉取 GitHub 上 `xueyu888/ORF` 仓库的所有分支，把任何分支新增的提交摘要转发到 Mattermost 的 `LLM / ORF` 频道。

该方案不要求 ORF 后端有公网域名，也不要求 GitHub 能访问局域网机器。

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `MATTERMOST_URL` | Mattermost 站点地址。 |
| `MATTERMOST_LOGIN_ID` | 用于发消息的 Mattermost 登录账号。 |
| `MATTERMOST_PASSWORD` | Mattermost 登录密码。 |
| `MATTERMOST_CHANNEL_ID` | 目标频道 ID，当前 ORF 频道为 `5bs9q1hs7b8mfx9xp389bp8wmo`。 |
| `GITHUB_REPOSITORY_FULL_NAME` | 允许同步的仓库全名，默认 `xueyu888/ORF`。 |
| `GITHUB_SYNC_ENABLED` | 是否启用局域网轮询同步，当前设为 `true`。 |
| `GITHUB_SYNC_BRANCH` | 兼容旧配置；当前同步不按分支过滤，任何分支推送都通知。 |
| `GITHUB_SYNC_INTERVAL_SECONDS` | 轮询间隔，当前为 60 秒。 |
| `GITHUB_SYNC_LOOKBACK` | 每次从 GitHub 拉取的提交数量，当前为 20。 |
| `GITHUB_SYNC_STATE_FILE` | 本地同步状态文件，用于记录已同步的最新提交。 |
| `GITHUB_SYNC_GIT_REMOTE` | GitHub API 被限流时使用的 Git remote，默认 `origin`。 |
| `GITHUB_TOKEN` | 可选。私有仓库或需要更高 GitHub API 限额时填写。 |
| `GITHUB_WEBHOOK_SECRET` | 可选。只有启用 GitHub webhook 入站模式时才需要。 |

## 局域网同步流程

1. ORF 后端启动后读取 `GITHUB_SYNC_STATE_FILE`。
2. 每隔 `GITHUB_SYNC_INTERVAL_SECONDS` 检查所有远端分支。
3. 如果发现任何分支有新提交，把新增提交列表发到 Mattermost ORF 频道。
4. 首次启动只初始化基准提交，不补发历史提交。
5. 启动后新出现的分支会把最新提交作为一次推送通知发送。
6. GitHub API 被限流时，自动改用本地 git remote 检查，不影响推送通知。

## 可选 webhook 模式

如果未来 ORF 后端有公网 HTTPS 地址，也可以在 GitHub 仓库的 Webhooks 中新增 webhook：

- Payload URL: `https://<ORF 后端公网域名>/webhooks/github/push`
- Content type: `application/json`
- Secret: 填写 `.env` 中的 `GITHUB_WEBHOOK_SECRET`
- Which events: `Just the push event`

局域网环境不需要配置 GitHub webhook。
