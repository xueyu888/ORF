# Mattermost Jira 提醒 - 后端

## 目标

ORF 后端常驻运行时，每天在配置时间向 `LLM Application Group` 成员逐个发送 Jira 填写提醒。

该集成只把 Mattermost 频道作为成员来源，不向频道内发群消息。

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `MATTERMOST_URL` | Mattermost 站点地址。 |
| `MATTERMOST_LOGIN_ID` | 用于发消息的 Mattermost 登录账号。 |
| `MATTERMOST_PASSWORD` | Mattermost 登录密码。 |
| `MATTERMOST_JIRA_REMINDER_ENABLED` | 是否启用 Jira 提醒，默认 `false`。 |
| `MATTERMOST_JIRA_REMINDER_BOT_TOKEN` | Jira 提醒专用 bot token。优先级高于通用 Mattermost 登录账号。 |
| `MATTERMOST_JIRA_REMINDER_LOGIN_ID` | 可选。未使用 bot token 时的提醒专用登录账号。 |
| `MATTERMOST_JIRA_REMINDER_PASSWORD` | 可选。未使用 bot token 时的提醒专用登录密码。 |
| `MATTERMOST_JIRA_REMINDER_SOURCE_CHANNEL_ID` | 成员来源频道 ID，配置为 `LLM Application Group` 对应频道。 |
| `MATTERMOST_JIRA_REMINDER_TIME` | 每日提醒时间，`HH:mm` 格式，默认 `17:00`。 |
| `MATTERMOST_JIRA_REMINDER_TIME_ZONE` | 提醒时间所属时区，默认 `Asia/Shanghai`。 |
| `MATTERMOST_JIRA_REMINDER_MESSAGE` | 私信内容，默认 `今天 {{time}} 了，请记得填写 Jira。`。支持 `{{date}}`、`{{time}}`。 |
| `MATTERMOST_JIRA_REMINDER_CHECK_INTERVAL_SECONDS` | 后台检查间隔，默认 30 秒。 |
| `MATTERMOST_JIRA_REMINDER_REQUIRE_BOT` | 是否要求发送账号必须是 bot，默认 `true`。 |
| `MATTERMOST_JIRA_REMINDER_SKIP_BOTS` | 是否跳过 bot 用户，默认 `true`。 |
| `MATTERMOST_JIRA_REMINDER_STATE_FILE` | 已发送状态文件，默认 `.artifacts/mattermost-jira-reminder-state.json`。 |

## 运行规则

1. 后端启动后每隔 `MATTERMOST_JIRA_REMINDER_CHECK_INTERVAL_SECONDS` 检查一次本地时间。
2. 命中 `MATTERMOST_JIRA_REMINDER_TIME` 的分钟时，读取来源频道成员。
3. 默认校验发送账号必须是 bot。
4. 过滤发送账号自己、已删除用户和 bot 用户。
5. 对剩余成员创建或复用 DM channel，并逐个发送提醒。
6. 每成功发送一个用户就写入状态文件，同一天同一用户不会重复发送。

如果 ORF 后端在当天配置分钟内没有运行，本轮提醒不会延迟补发。
