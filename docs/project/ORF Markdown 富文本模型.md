# ORF Markdown 富文本模型

本文档记录 ORF 内部 Markdown / WYSIWYG 的统一业务模型。实现入口在 `src/features/rich-text/`。

## 状态链

```text
业务正文 body（ORF Markdown）
  -> 解析为 Tiptap 文档
  -> 用户在 WYSIWYG 中编辑
  -> 序列化回 ORF Markdown body
  -> 交给评论、反馈或聊天业务接口持久化
  -> 通过共享 Markdown viewer 渲染为页面展示
```

必须保持的不变量：

1. 持久化事实源是 `body` 字符串，不是 Tiptap JSON。
2. Tiptap 文档只存在于编辑器内部，是临时编辑状态。
3. `@[显示名](orf-user:{userId})` 是用户提及事实，业务只信 token 里的 `userId`。
4. 评论附件正文使用 `![alt](orf-attachment:{id})` 或新建反馈阶段的 `orf-pending-attachment:{clientId}`。
5. Chat 文件附件不是正文 token，仍由 Chat 的 `attachmentIds` 和 `message.attachments` 管理。
6. `attachment.contentUrl`、`attachment.previewUrl`、`attachment.downloadUrl`、本地 object URL 和图片 `src` 都只是展示状态，不写入正文。
7. Chat 的 `@所有人` 是广播纯文本，服从后端广播匹配规则，不伪装成 `orf-user` token。

## 模块边界

| 模块 | 职责 | 不负责 |
| --- | --- | --- |
| `orfRichTextMarkdown.ts` | ORF Markdown token 编解码、Markdown 和 Tiptap JSON 互转、token 匹配、纯文本降级 | 评论、反馈、聊天的业务权限和上传接口 |
| `orfRichTextExtensions.ts` | Tiptap 的 ORF mention 节点和附件节点 | 业务持久化 |
| `OrfRichTextEditor.tsx` | 通用 WYSIWYG 编辑、工具栏、提及菜单、链接编辑、附件上传插槽、文件插入回调 | 决定附件属于评论还是 Chat |
| `OrfRichTextMarkdownViewer.tsx` | 通用 Markdown block/inline 渲染、嵌套 mark 展示、链接/提及/附件渲染插槽、可选标题链接兼容 | 决定聊天反馈链接或评论附件预览的业务行为 |
| `CommentPanel.tsx` | 评论/反馈草稿状态、回复/编辑状态、评论提交 | 重复维护 token 正则 |
| `chatRichTextDraftModel.ts` | Chat 草稿和 ORF Markdown 的转换、广播提及候选和纯文本提及边界 | UI 事件、发送副作用 |
| `ChatDraftEditor.tsx` | Chat 专用编辑适配：广播提及、表情、历史召回、最近消息快捷键、预览和发送状态 | 重复实现富文本编辑器 |
| `chatMarkdown.tsx` | Chat 专用展示适配：反馈链接、站内路由链接、系统广播提及 | 重复实现 Markdown block/inline 解析 |

## 接入面

评论和反馈：

- 草稿事实源是 `{ body: string }`。
- 附件上传成功后插入 ORF 附件 token，提交时保持为正文中的附件 token。
- 编辑历史评论时，正文 token 反解析为可读节点；已上传附件的预览 URL 来自 `message.attachments`。
- 展示历史评论时，正文通过共享 viewer 渲染；评论层只注入成员提及、外链点击、标题链接兼容和附件预览/下载行为。

Chat：

- 对外仍兼容现有 `ChatDraft`，以免改动发送、历史、localStorage 和乐观消息链路。
- 编辑器内部以 ORF Markdown 驱动 WYSIWYG；`ChatDraft` 和 Markdown 之间通过 `serializeDraft` / `draftFromStoredBody` 适配。
- 普通成员提及序列化为 `orf-user` token。
- 广播提及插入普通 `@所有人` 文本。
- 粘贴或拖放文件交给 Chat 附件上传，不插入评论附件 token。
- Chat 消息展示通过共享 viewer 渲染；Chat 层只注入反馈链接、站内路由和系统广播提及样式。
- Chat 通知、反馈列表和搜索预览只消费共享模型提供的纯文本降级结果，不再各自复制 Markdown stripping 规则。

## Markdown 结构范围

共享模型当前负责以下结构的双向转换：

- 段落和硬换行。
- 标题、无序列表、有序列表、引用。
- 加粗、斜体、删除线、行内代码和链接。
- 嵌套行内 mark，例如加粗、斜体、删除线同时作用于同一段文本。
- ORF 用户提及节点。
- ORF 附件节点。
- 展示层兼容 `www.` 自动链接。
- 评论展示额外开启“标题 + URL”的标题链接兼容；Chat 默认不继承这个行为。

这意味着工具栏产生的结构再次打开时必须保持为可编辑结构，不能退化为裸 Markdown 文本。

## 后续约束

- 新增正文能力必须先进入共享富文本模型，再由业务适配层选择是否启用。
- 不得在评论、反馈、Chat 中再次复制 `orf-user` 或 `orf-attachment` token 正则作为事实源。
- 如果未来要持久化 Tiptap JSON，必须先重新定义后端存储、迁移、兼容和安全边界，不能作为当前编辑器实现的副作用引入。
