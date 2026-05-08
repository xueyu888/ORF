# Codex 活动播报 - 后端

## 目标

把 Codex 每轮工作完成后的活动摘要发送到 Mattermost 的 ORF 频道，形成轻量活动记录。每轮真实对话只产生一条 Mattermost 消息。

播报不是会话转发器，也不是关键词分类器。Codex 每轮完成后应生成一句本轮会话的真实工作总结，formatter 只负责脱敏、压成单句、套用当前轮换风格并发送到 Mattermost。每条消息开头用 Markdown 分隔线 `---` 拉开边界，方便在 Mattermost 里区分轮次。消息正文要先说本轮任务，再说具体动作，最后点明结果或影响；中文主文案不用“标题：正文”的小标题格式，并压成一句简短、清晰、有气势的话，不能只写“问答清楚”“气势拉满”“整理了项目文档”这类空泛判断。

播报必须点名本轮真实工作对象和可见结果。输入信号里出现页面、模块、文档或业务对象名称时，中文主文案和英文行都要保留该对象。例如本轮在设计 `悬赏大厅`，播报必须写出 `悬赏大厅`，并说明实际改了主动挑战、征召令、可挑战悬赏或积分贡献等结构；不能退化成“调整了前端体验”或“整理了项目文档”。

自动 hook 优先读取 Codex 最终回复中的 `播报摘要：...` 行。这个摘要由 Codex 根据本轮对话和实际改动自行生成，不由 formatter 根据业务关键词套模板。formatter 没有读到 `播报摘要：...` 时，才从 summary / details 中选择较具体的一句作为兜底。

英文行必须与中文摘要表达同一件事。自动 hook 优先读取最终回复中的 `播报英文：...` 行；没有读到时不强行生成英文元描述，避免中英文对不上。读到英文摘要时，formatter 会追加当前轮换风格的英文尾句，并保留关键英文单词音标和语法说明；部分风格可以追加本地文字表情包 cue。

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
| `CODEX_ACTIVITY_INCLUDE_DETAILS` | 可选。默认 `true`，自动播报会把完成详情作为总结来源；输出会脱敏并压成一句话。设为 `false` 时只使用任务摘要。 |
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

`codex_notify.sh` 会把 Codex 传入的任务摘要、结果摘要和工作区上下文转给 `notify-hook.sh`。其中结果摘要优先取最终回复中的 `播报摘要：...` 行，英文摘要优先取 `播报英文：...` 行。仓库内 formatter 只做脱敏、单句压缩和格式包装，不按固定业务规则改写成套话。
