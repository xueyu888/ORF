# ORF Markdown 富文本模型

本文档记录 ORF 内部 Markdown 编辑与展示的统一业务模型。实现入口在 `src/features/rich-text/`。

## 状态链

```text
业务正文 body（ORF Markdown）
  -> token codec 解析业务 token
  -> 粘贴规范化把外部列表和编号转换为 ORF Markdown
  -> OrfRichTextDraft（用户可见 text + mentions + attachments）
  -> Draft 编辑器按光标和选区派生当前块状态
  -> 工具栏、快捷键、列表 Enter 和上传行为只修改 Draft
  -> Draft 序列化回 ORF Markdown body
  -> 交给评论、反馈或聊天业务接口持久化
  -> 通过共享 Markdown viewer 渲染为页面展示
  -> 用户复制时由共享投影生成可携带 Markdown，业务适配层再生成对应 HTML 和附件说明
  -> 剪贴板同时写入 text/html 与 text/plain；不支持富剪贴板时回退写入可携带 Markdown
```

必须保持的不变量：

1. 持久化事实源是 `body` 字符串，不是 Tiptap JSON。
2. 编辑态事实源是 `OrfRichTextDraft`；`draft.text` 是用户可见文本，`draft.mentions` 和 `draft.attachments` 是可序列化的业务引用。
3. textarea、选区、提及候选、上传状态和链接草稿只是临时 UI 状态；当前块类型始终从 `draft.text` 和选区派生。
4. `@[显示名](orf-user:{userId})` 是用户提及事实，业务只信 token 里的 `userId`。
5. 评论附件正文使用 `![alt](orf-attachment:{id})`；反馈原始报告创建阶段可以临时使用 `orf-pending-attachment:{clientId}` 表达报告附件位置，但该附件最终属于反馈报告附件事实源，不属于评论附件事实源。
6. Chat 文件附件不是正文 token，仍由 Chat 的 `attachmentIds` 和 `message.attachments` 管理。
7. `attachment.contentUrl`、`attachment.previewUrl`、`attachment.downloadUrl`、本地 object URL 和图片 `src` 都只是展示状态，不写入正文。
8. Chat 的 `@所有人` 是广播纯文本，服从后端广播匹配规则，不伪装成 `orf-user` token。
9. 复制是持久化正文的只读投影：标准 Markdown 结构必须保留，`orf-user` / `orf-attachment` 等内部 token 必须降级为可携带文本，不能把复制结果反写为消息事实。
10. Chat 消息的 HTML 和 Markdown 剪贴板载荷必须由同一次复制投影生成；浏览器不支持 `ClipboardItem` 或富格式写入失败时，只允许回退同一份 Markdown 文本，不能回退到另一套内容规则。

## 模块边界

| 模块 | 职责 | 不负责 |
| --- | --- | --- |
| `orfRichTextTokens.ts` | ORF 业务 token 的唯一语法源：生成、解析、匹配、替换 `orf-user` / `orf-attachment` / `orf-pending-attachment` | 评论、反馈、聊天的业务权限和上传接口 |
| `orfRichTextDraft.ts` | 编辑态 Draft 模型：从存储 body 解析、维护引用范围、文本变更 reconcile、序列化回 body、判断有效附件引用 | React 状态、DOM 选区、上传副作用 |
| `orfRichTextMarkdown.ts` | Markdown 纯文本降级、可携带 Markdown、摘要、提及提取等投影能力；对外兼容 re-export token API | 业务页面直接维护 token 正则或决定具体剪贴板 MIME |
| `orfRichTextClipboard.ts` | 外部剪贴板文本规范化：全角/中文有序编号、符号列表、列表项连续正文统一进入 ORF Markdown | 决定评论、反馈或 Chat 的业务提交 |
| `orfRichTextEditorModel.ts` | textarea Markdown 编辑模型：行范围、块状态、行级格式转换、列表续列/退出 | React 状态、业务持久化、附件上传 |
| `OrfRichTextEditor.tsx` | 通用 Markdown 编辑器外壳、工具栏、提及菜单、链接编辑、附件上传插槽、文件插入回调 | 决定附件属于评论还是 Chat |
| `OrfRichTextDraftEditor.tsx` | Draft 编辑适配：用户只编辑可见文本，提及和附件插入同步写入 Draft 引用 | 业务提交流程、附件文件持久化 |
| `OrfRichTextMarkdownViewer.tsx` | 通用 Markdown block/inline 渲染、嵌套 mark 展示、链接/提及/附件渲染插槽、可选标题链接兼容 | 决定聊天反馈链接或评论附件预览的业务行为 |
| `CommentPanel.tsx` | 评论草稿状态、回复/编辑状态、评论提交；在反馈详情中只承担后续讨论输入，不拥有反馈原始报告 | 重复维护 token 正则或接管 Draft 内部引用 |
| `chatRichTextDraftModel.ts` | Chat 草稿和 ORF Markdown 的转换、广播提及候选和纯文本提及边界 | UI 事件、发送副作用 |
| `ChatDraftEditor.tsx` | Chat 专用编辑适配：广播提及、表情、历史召回、最近消息快捷键、预览和发送状态 | 重复实现富文本编辑器 |
| `chatMarkdown.tsx` | Chat 专用展示适配：反馈链接、站内路由链接、系统广播提及 | 重复实现 Markdown block/inline 解析 |
| `chatMessageClipboard.tsx` | 把消息正文与独立附件组合为同源 HTML/Markdown 剪贴板载荷，并执行富格式写入和纯文本回退 | 消息持久化、编辑器状态、重新上传附件或复制内部业务 token |

## 接入面

评论：

- 草稿事实源是 `OrfRichTextDraft`，不是裸 `body` 字符串。
- 附件上传成功后，编辑区显示 `附件：文件名`，Draft 记录 attached 或 pending 引用；提交时统一序列化为正文中的附件 token。
- 编辑历史评论时，正文 token 反解析为可读文本和 Draft 引用；已上传附件的预览 URL 来自 `message.attachments`。
- 展示历史评论时，正文通过共享 viewer 渲染；评论层只注入成员提及、外链点击、标题链接兼容和附件预览/下载行为。

反馈原始报告：

- 可复用 Draft 编辑体验和 pending 附件位置模型，但提交给反馈模块的是 `description` 与报告附件文件。
- 报告附件提交后归 `feedback_report_attachments`，后续展示使用反馈报告附件投影；不能把原始报告伪装成评论首消息，也不能从 `comment_attachments` 回填反馈报告。
- 新建反馈只按 Draft 中仍有效的 pending 附件引用提交文件，不再用 `body.includes(...)` 判断附件是否被引用。

Chat：

- 对外仍兼容现有 `ChatDraft`，以免改动发送、历史、localStorage 和乐观消息链路。
- 编辑器内部以 ORF Markdown 字符串驱动 textarea 编辑；`ChatDraft` 和 Markdown 之间通过 `serializeDraft` / `draftFromStoredBody` 适配。
- 普通成员提及序列化为 `orf-user` token。
- 广播提及插入普通 `@所有人` 文本。
- 粘贴或拖放文件交给 Chat 附件上传，不插入评论附件 token。
- Chat 图片查看器只由同一条消息的 `message.attachments` 中 `image/*` 附件派生；桌面和桌面浏览器优先把当前图片组写入 `orf:chat-image-popout:*` 临时展示 payload 并打开 `/chat/image-popout/:popoutId` 独立窗口，弹窗被拦截或移动端视口才回落到 AppShell 下的内嵌浮窗。窗口位置、窗口尺寸、最大化/还原、图片缩放、旋转、适应/原图、缩略图、上一张/下一张和下载都不写入正文 token、附件存储字段或用户设置。
- Chat 文件附件预览类型由聊天附件投影的 `previewKind` 统一表达；`.md/.markdown` 与 `text/markdown` 必须进入共享 Markdown viewer，纯文本进入文本预览，PDF 进入浏览器 PDF 预览，HTML、SVG、XML 和未知类型保持下载。预览弹窗只消费服务端投影和临时加载状态，不在组件内按 MIME 重建另一套判断。
- Chat 消息展示通过共享 viewer 渲染；Chat 层只注入反馈链接、站内路由、系统广播提及样式，以及系统反馈评论通知允许展示的评论图片快照。评论图片仍归 `comment_attachments` 所有，不复制为 Chat 附件。
- Chat 的“复制消息”保留标准 Markdown 结构；成员提及复制为可读 `@名称`，正文附件 token 和独立 Chat 附件复制为文字说明，不把对象存储地址或内部 ID 放入剪贴板。支持富剪贴板的环境同时写入共享 viewer 生成的 `text/html` 与可携带 Markdown `text/plain`，因此粘贴到富文本应用保留视觉格式，粘贴回 ORF 仍能恢复 Markdown 结构；只支持纯文本写入的环境使用同一份 Markdown 回退。
- Chat 通知、反馈列表和搜索预览只消费共享模型提供的 token 和纯文本投影，不再各自复制 Markdown stripping 或 `orf-user` 正则。

## Markdown 结构范围

共享模型当前负责以下结构的双向转换：

- 段落和硬换行。
- 标题、无序列表、有序列表、引用。
- 外部粘贴列表规范化：`1、`、`1)`、`（1）`、全角句点和常见符号列表统一转成 Markdown 列表；列表项后紧跟的说明行归入该列表项，避免展示时拆成多个从 1 开始的新列表。
- 展示层列表模型支持嵌套列表、列表项连续正文和有序列表起始编号。
- 列表上下文感知：光标位于列表行时工具栏显示 active，按 Enter 自动续列，空列表项按 Enter 退出列表。
- 加粗、斜体、删除线、行内代码和链接。
- 嵌套行内 mark，例如加粗、斜体、删除线同时作用于同一段文本。
- ORF 用户提及节点。
- ORF 附件节点。
- 展示层兼容 `www.` 自动链接。
- 评论展示额外开启“标题 + URL”的标题链接兼容；Chat 默认不继承这个行为。

这意味着工具栏产生的结构再次打开时必须仍能被编辑模型识别为对应 Markdown 结构，不能只在展示层渲染成列表、编辑时退化为不可感知的普通文本。

## 后续约束

- 新增正文能力必须先进入共享富文本模型，再由业务适配层选择是否启用。
- 不得在评论、反馈、Chat 中再次复制 `orf-user` 或 `orf-attachment` token 正则作为事实源。
- 业务页面不得直接用字符串包含判断附件或提及是否有效；必须读取 Draft 引用或共享 token 模型的解析结果。
- 不得把当前块类型保存为业务字段；列表、引用、标题状态必须始终从 Markdown 文本和选区派生。
- 如果未来要持久化 Tiptap JSON，必须先重新定义后端存储、迁移、兼容和安全边界，不能作为当前编辑器实现的副作用引入。
