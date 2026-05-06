# Codex 活动播报 - 后端

## 目标

把 Codex 每轮工作完成后的人工总结发送到 Mattermost 的 ORF 频道，形成轻量活动记录。

当前实现支持两种触发方式：

- 手动触发：用 `npm run codex:report -- --summary "..."` 发一条活动小报。
- 自动触发：Codex 的 `notify` hook 调用 `notify-hook.sh`，在 ORF 工作区每轮任务结束后自动发一条活动小报。

## 代码位置

| 路径 | 说明 |
| --- | --- |
| `server/integrations/codex-activity-reporter/index.ts` | 格式化活动消息，并调用 Mattermost API 发帖。 |
| `server/integrations/codex-activity-reporter/cli.ts` | 命令行入口。 |
| `server/integrations/codex-activity-reporter/notify-hook.sh` | Codex `notify` hook 适配器。 |

该集成不挂载到 ORF 业务 API，不依赖 `server/env.ts`。

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `MATTERMOST_URL` | Mattermost 站点地址。 |
| `MATTERMOST_LOGIN_ID` | 用于发消息的 Mattermost 登录账号。 |
| `MATTERMOST_PASSWORD` | Mattermost 登录密码。 |
| `MATTERMOST_CHANNEL_ID` | 默认目标频道 ID。 |
| `CODEX_ACTIVITY_CHANNEL_ID` | 可选。单独指定活动播报频道；不填则使用 `MATTERMOST_CHANNEL_ID`。 |
| `CODEX_ACTIVITY_SCOPE` | 可选。默认 `orf`，只播报 ORF 工作区；设为 `all` 时播报所有 Codex 工作区。 |
| `CODEX_ACTIVITY_INCLUDE_DETAILS` | 可选。默认 `true`，自动播报会带上完成详情；设为 `false` 时只发任务摘要。 |
| `CODEX_ACTIVITY_STYLE` | 可选。默认 `rotate`，按顺序轮换风格；也可以固定为 `poem`、`ci`、`classical`、`humor`、`serious`、`cold-joke`、`wuxia`、`sci-fi`、`radio`、`news`、`diary`、`stage`。 |
| `CODEX_ACTIVITY_STYLE_STATE_FILE` | 可选。默认 `.artifacts/codex-activity-style-state.json`，记录下一条要使用的轮换风格。 |

## 使用方式

预览消息，不发送：

```bash
npm run codex:report -- --summary "把 Codex 活动播报接到 Mattermost ORF 频道" --dry-run
```

指定一种风格预览：

```bash
npm run codex:report -- --summary "把 Codex 活动播报接到 Mattermost ORF 频道" --style classical --dry-run
```

发送消息：

```bash
npm run codex:report -- --summary "把 Codex 活动播报接到 Mattermost ORF 频道" --detail "独立放在 integrations 目录"
```

自动触发依赖 `~/.codex/config.toml` 中的：

```toml
notify = ["/home/xue/.codex/codex_notify.sh"]
```

`codex_notify.sh` 会把 Codex 传入的任务摘要、结果摘要和工作区上下文转给 `notify-hook.sh`。
