# GitLab Mattermost 项目 Hook 自动收敛 - 后端

## 目标

GitLab Free/CE 没有可用的 group webhook。为了让 `develop` 下新建项目也自动进入 Mattermost GitLab 插件通知链路，ORF 后端提供一个项目 webhook reconciler：

1. 定时读取 GitLab `develop` 组下所有项目。
2. 对每个项目读取 project webhooks。
3. 缺少 Mattermost GitLab 插件 webhook 时自动创建。
4. 已有 webhook 但分支过滤或事件配置不一致时自动修正。
5. 维持 GitLab `push_event_hooks_limit`，避免一次 push 多个分支时 GitLab 不触发 webhook。

## 事实源和边界

唯一事实源是 GitLab group project list。项目 webhook 是派生配置，可以由 reconciler 重建。

Mattermost GitLab 插件 webhook URL 和 secret 是目标契约。插件 secret 不能从 Mattermost `/api/v4/config` 读出真实值，因为 API 会返回脱敏值；生产环境应显式配置 `GITLAB_MATTERMOST_WEBHOOK_SECRET`，已有本机部署也可以用 `GITLAB_MATTERMOST_WEBHOOK_SECRET_CONFIG_FILE` 从真实 `config.json` 读取。

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `GITLAB_MATTERMOST_WEBHOOK_RECONCILE_ENABLED` | 是否启用自动收敛。 |
| `GITLAB_URL` | GitLab 站点地址。 |
| `GITLAB_USER` | 使用 credential file 时匹配的 GitLab 用户名。 |
| `GITLAB_MATTERMOST_WEBHOOK_RECONCILE_GROUP` | 要覆盖的 GitLab group，默认 `develop`。 |
| `GITLAB_MATTERMOST_WEBHOOK_RECONCILE_INTERVAL_SECONDS` | 周期检查间隔，默认 60 秒。 |
| `GITLAB_MATTERMOST_WEBHOOK_RECONCILE_ACCESS_TOKEN` | 推荐的 GitLab API token。 |
| `GITLAB_MATTERMOST_WEBHOOK_RECONCILE_CREDENTIALS_FILE` | 本机 fallback，从 git credential store 中读取 GitLab 用户名密码，再换取临时 OAuth token。 |
| `GITLAB_MATTERMOST_WEBHOOK_URL` | Mattermost GitLab 插件 webhook URL。 |
| `GITLAB_MATTERMOST_WEBHOOK_SECRET` | Mattermost GitLab 插件 webhook secret。 |
| `GITLAB_MATTERMOST_WEBHOOK_SECRET_CONFIG_FILE` | 本机 fallback，从 Mattermost `config.json` 读取真实插件 secret。 |
| `GITLAB_MATTERMOST_WEBHOOK_RECONCILE_PUSH_EVENT_HOOKS_LIMIT` | GitLab 单次 push 可触发 webhook 的 ref 数量上限，默认 1000；设为 0 则不修改。 |

## 运行方式

后端启动时会随 optional integrations 注册并立即收敛一次，然后按间隔继续检查。

也可以手动执行一次：

```bash
npm run gitlab:webhooks:reconcile
```

## 验证

成功收敛后，每个 `develop/*` 项目都应有一个指向 Mattermost GitLab 插件的 project webhook，并满足：

- `push_events=true`
- `branch_filter_strategy=all_branches`
- `push_events_branch_filter=null`
- `alert_status=executable`

GitLab hook test 返回 `201 Created` 表示 GitLab 已能带正确 secret 调用 Mattermost 插件。
