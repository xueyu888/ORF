# Codex 活动播报 - 后端

## 目标

把 Codex 每轮工作完成后的活动摘要发送到 Mattermost 的 ORF 频道，形成轻量活动记录。每轮真实对话只产生一条 Mattermost 消息。

播报不是会话转发器，也不是关键词分类器。Codex 每轮结束时应由 AI 生成四个字段：中文问题、英文回答、中文语法解释和表情包提示。formatter 只负责脱敏、压缩、格式包装并发送到 Mattermost，不能根据“文档”“后端”“评论”这类关键词自行编套话。每条消息开头用 Markdown 分隔线 `---` 拉开边界，方便在 Mattermost 里区分轮次。

消息模板固定为：

```text
---
问题：{中文写用户这一轮真正的问题、质疑或要求，不照抄原话，但保留具体对象}
Answer: {英文总结 Codex 这一轮给出的回答、判断或完成结果}
语法：{中文解释 Answer 里一个真实出现的英文表达}
表情包：{贴合语境的梗图名}
```

播报必须保留本轮真实对象和关系。输入信号里出现页面、模块、文档或业务对象名称时，`问题` 和 `Answer` 都不能退化成泛化描述。例如本轮讨论 `悬赏大厅`，就要保留 `悬赏大厅` 以及主动挑战、征召令、可挑战悬赏或积分贡献等具体结构；如果用户是在质疑“三个文档都一样是否应该改成引用”，播报要写清楚这是引用关系和单一来源问题，不能写成“更新了文档”。

自动 hook 优先读取 Codex 最终回复中的 `播报问题：...`、`播报回答：...`、`播报语法：...`、`播报表情：...` 行。这四个字段由 Codex 根据本轮对话和实际处理结果生成，不由 formatter 根据业务关键词套模板。旧字段 `播报摘要：...` 和 `播报英文：...` 只作为兼容输入；新回复应使用 `播报问题` 和 `播报回答`。

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
| `CODEX_ACTIVITY_STYLE` | 可选。保留兼容旧配置；当前统一输出正常简洁格式。 |
| `CODEX_ACTIVITY_STYLE_STATE_FILE` | 可选。保留兼容旧配置。 |

## 使用方式

预览消息，不发送。传入的文字只作为兜底信号；正式自动播报应优先由 Codex 最终回复提供四个 `播报...` 字段：

```bash
npm run codex:report -- --summary "调整 Codex 活动播报" --detail "避免复制原始会话，只发送改写摘要" --dry-run
```

指定旧风格名预览时，也会输出统一的简洁格式：

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

`codex_notify.sh` 会把 Codex 传入的任务摘要、结果摘要和工作区上下文转给 `notify-hook.sh`。其中活动内容优先取最终回复中的 `播报问题：...`、`播报回答：...`、`播报语法：...`、`播报表情：...` 行。仓库内 formatter 只做脱敏、单句压缩和格式包装；没有显式字段时只做保守兜底，不能把讨论、质疑或引用关系泛化成“文档更新”。
