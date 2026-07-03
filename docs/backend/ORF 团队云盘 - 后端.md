# ORF 团队云盘 - 后端

## 事实源

- 团队云盘结构的事实源是 `drive_nodes`。根节点属于团队，子节点通过 `parent_id` 组成文件夹树。
- 文件元数据的事实源是 `drive_files`。文件原件只放对象存储，`drive_files.object_key` 不暴露给前端。
- 文件版本历史的事实源是 `drive_file_versions`。`drive_files` 保存当前版本投影，历史版本不可由 UI 状态反推。
- 文件活动审计的事实源是 `drive_node_events`。新建、上传、删除、恢复、版本变化、上下文绑定都进入同一活动流。
- 工作上下文的事实源是 `drive_node_context_links`。文件或文件夹可以关联项目、目标、指标、任务、反馈、工作日志、群聊频道、聊天消息或话题上下文，但上下文不拥有文件。
- 群聊快捷入口的事实源是 `chat_channel_drive_links`。群聊可以绑定多个云盘文件或文件夹，其中最多一个文件夹作为默认上传目标。
- `chat_channels.project_id` 仍然只是频道项目元数据，不再决定文件归属、文件权限或云盘树。
- `chat_attachments` 仍然只是聊天消息附件事实源，不自动迁移、不反向定义云盘库。

## 状态链

1. 用户打开一级云盘或群聊云盘入口时，后端确保当前团队有一个云盘根文件夹。
2. 创建文件夹只写 `drive_nodes`；同一父文件夹下的未删除节点名唯一。
3. 上传文件先把原件流式写入对象存储，再写入 `drive_nodes`、`drive_files` 和 `drive_file_versions` 的初始版本。
4. 上传新版本只追加 `drive_file_versions`，再更新 `drive_files` 当前版本投影和 `drive_nodes.updated_at`。
5. 搜索、最近列表、详情面板、版本列表和活动流都是后端读模型；前端不维护第二套文件事实。
6. 群聊上传只是选择一个云盘文件夹作为落点；上传成功后可以在当前群聊生成一条普通消息动态。
7. 群聊绑定只写 `chat_channel_drive_links`，不改变云盘树结构，也不修改文件归属。
8. 删除文件或文件夹是软删除 `drive_nodes.deleted_at`；恢复是清空被删子树的删除字段。对象存储原件不直接暴露给浏览器。

## 权限

- 团队云盘读写沿用当前用户的团队作用域和聊天基础权限：读需要 `chat.read`，写需要 `chat.write`。
- 群聊云盘入口只对当前群聊成员开放，且只支持未归档的公开/私有群聊。
- 管理群聊云盘绑定需要频道管理权限，或当前用户在该频道内是 `owner` / `admin`。
- 默认上传目标只能是文件夹节点；文件节点可以作为快捷绑定，但不能作为上传落点。

## API

- `GET /api/drive`：返回团队云盘根节点、首层节点和上传大小限制。
- `GET /api/drive/search?q=&type=&previewKind=&status=&source=&contextType=&contextId=&uploaderId=&updated=`：按名称、文件名、MIME、上下文标题和绑定标签搜索资源，并支持节点类型、预览类型、状态、来源、上下文类型、精确上下文 ID、上传人和更新时间筛选；`scope=trash` 仅作为旧参数兼容。
- `GET /api/drive/trash`：返回回收站顶层资源。
- `GET /api/drive/nodes/:nodeId/children`：按文件夹懒加载子节点。
- `GET /api/drive/nodes/:nodeId/details`：返回节点详情、路径、工作上下文、版本和活动。
- `POST /api/drive/folders`：在指定父文件夹下创建子文件夹。
- `POST /api/drive/upload`：上传文件到指定父文件夹。
- `DELETE /api/drive/nodes/:nodeId`：软删除文件或文件夹。
- `POST /api/drive/nodes/:nodeId/restore`：从回收站恢复文件或文件夹。
- `POST /api/drive/nodes/:nodeId/context-links`：把文件或文件夹关联到项目、目标、指标、任务、反馈、工作日志、群聊频道、聊天消息或话题上下文。
- `DELETE /api/drive/nodes/:nodeId/context-links/:linkId`：移除上下文关联。
- `GET /api/drive/files/:fileId/versions`：返回文件版本历史。
- `POST /api/drive/files/:fileId/versions`：上传并切换到新版本。
- `POST /api/drive/files/:fileId/versions/:versionId/restore`：把历史版本恢复为新的当前版本。
- `GET /api/drive/files/:fileId/content?disposition=inline|attachment`：通过后端读取或下载文件。
- `GET /api/chat/channels/:channelId/drive`：返回团队云盘 bootstrap 和当前群聊绑定列表。
- `POST /api/chat/channels/:channelId/drive/links`：把云盘文件或文件夹绑定到群聊，可同时设为默认上传目标。
- `PATCH /api/chat/channels/:channelId/drive/links/:linkId`：更新群聊绑定标签或默认上传目标。
- `DELETE /api/chat/channels/:channelId/drive/links/:linkId`：移除群聊快捷绑定。
- `POST /api/chat/channels/:channelId/drive/upload`：上传文件到云盘文件夹，并在群聊生成上传动态。

## 预览

- 后端根据真实文件头、声明 MIME 和文件名派生 `preview_kind`。
- 图片只允许真实识别出的常见图片类型内联预览。
- PDF 需要文件头匹配 `%PDF-` 才按 PDF 预览。
- Markdown、文本、JSON、CSV、日志按纯文本预览。
- HTML、SVG、XML 和未知类型不直接 inline，默认下载，避免脚本或主动内容进入页面。

## 对标产品能力映射

- Slack 式群聊资源入口：`chat_channel_drive_links` 让频道以轻量资源流显示已绑定资源、默认上传文件夹、搜索命令行、上传图标、面板拖拽上传、团队资源查找和选中资源预览；固定到频道、下载、打开详情等次级操作收在资源菜单里，版本、回收站、上下文管理等完整操作留在 `/resources`。
- Google Drive 式搜索预览：`/api/drive/search`、详情面板和安全预览 URL 都由后端统一输出；搜索读模型会合并 `drive_node_context_links` 与 `chat_channel_drive_links`，但不读取对象存储正文做全文索引。
- Dropbox 式可靠恢复：`drive_nodes.deleted_at` 驱动回收站，`drive_file_versions` 支持版本恢复，`drive_node_events` 保留操作证据。
- Linear 式工作上下文：`drive_node_context_links` 把文件显式关联到项目、目标、指标、任务、反馈、工作日志或聊天上下文，但不改变这些业务对象或云盘自身事实源；目标、任务和反馈页面只通过 `/api/drive/search?contextType=...&contextId=...` 读取相关资源投影，不在业务页复制云盘管理状态机。

## 不做的事

- 不把旧聊天附件批量导入云盘库。
- 不把 Project 本身提升为文件权限、文件归属或数据隔离边界。
- 不把 MinIO object key 暴露给前端。
- 不把群聊快捷绑定、项目上下文、目标上下文或其他工作对象上下文当作文件归属。
- 不做永久删除、配额、外链分享、全文内容索引或 AI 摘要；这些需要单独的保留、安全和权限决策。
- 不用测试或 UI 临时状态反向定义云盘契约。
