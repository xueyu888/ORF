# Codex 活动播报 - 后端

## 目标

把 Codex 每轮工作完成后的活动摘要发送到 Mattermost 的 ORF 频道，形成轻量活动记录。每轮真实对话只产生一条 Mattermost 消息。

播报不是会话转发器：原始用户消息和 Codex 回复只作为分类信号使用，输出前会改写成简明活动总结，再套用当前轮换风格。消息正文要先说本轮任务，再说具体动作，最后点明结果或影响；中文主文案不用“标题：正文”的小标题格式，并压成一句简短、清晰、有气势的话，不能只写“问答清楚”“气势拉满”这类空泛判断；英文行也用一句话覆盖中文主文案，并保留关键英文单词音标和语法说明；部分风格可以追加本地文字表情包 cue。

当前实现支持两种触发方式：

- 手动触发：用 `npm run codex:report -- --summary "..."` 发一条活动小报。
- 自动触发：Codex 的 `notify` hook 调用 `notify-hook.sh`，在 ORF 工作区每轮真实对话结束后自动发一条活动小报。

## 代码位置

| 路径 | 说明 |
| --- | --- |
| `server/integrations/codex-activity-reporter/index.ts` | 抽象总结活动、套用风格，并调用 Mattermost API 发帖。 |
| `server/integrations/codex-activity-reporter/cli.ts` | 命令行入口。 |
| `server/integrations/codex-activity-reporter/notify-hook.sh` | Codex `notify` hook 适配器，过滤 Codex 内部短标题生成通知。 |

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
| `CODEX_ACTIVITY_INCLUDE_DETAILS` | 可选。默认 `true`，自动播报会把完成详情作为分类信号；输出仍是改写后的摘要，不原样复制详情。设为 `false` 时只使用任务摘要。 |
| `CODEX_ACTIVITY_STYLE` | 可选。默认 `rotate`，按顺序轮换风格；也可以固定为 `poem`、`ci`、`classical`、`humor`、`meme`、`serious`、`cold-joke`、`wuxia`、`sci-fi`、`radio`、`news`、`diary`、`stage`。 |
| `CODEX_ACTIVITY_STYLE_STATE_FILE` | 可选。默认 `.artifacts/codex-activity-style-state.json`，记录下一条要使用的轮换风格。 |

## 使用方式

预览消息，不发送。传入的文字只用于判断活动类型，输出不会原样复制：

```bash
npm run codex:report -- --summary "调整 Codex 活动播报" --detail "避免复制原始会话，只发送改写摘要" --dry-run
```

指定一种风格预览：

```bash
npm run codex:report -- --summary "调整 Codex 活动播报" --detail "避免复制原始会话，只发送改写摘要" --style classical --dry-run
```

发送消息：

```bash
npm run codex:report -- --summary "调整 Codex 活动播报" --detail "避免复制原始会话，只发送改写摘要"
```

自动触发依赖 `~/.codex/config.toml` 中的：

```toml
notify = ["/home/xue/.codex/codex_notify.sh"]
```

`codex_notify.sh` 会把 Codex 传入的任务摘要、结果摘要和工作区上下文转给 `notify-hook.sh`。仓库内 formatter 会再次抽象总结，Mattermost 里不展示原始会话文本。
