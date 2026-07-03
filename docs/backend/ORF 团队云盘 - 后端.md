# ORF 团队云盘 - 后端

## 事实源

- 团队云盘结构的事实源是 `drive_nodes`。根节点属于团队，子节点通过 `parent_id` 组成文件夹树。
- 文件元数据的事实源是 `drive_files`。文件原件只放对象存储，`drive_files.object_key` 不暴露给前端。
- 群聊快捷入口的事实源是 `chat_channel_drive_links`。群聊可以绑定多个云盘文件或文件夹，其中最多一个文件夹作为默认上传目标。
- `chat_channels.project_id` 仍然只是频道项目元数据，不再决定文件归属、文件权限或云盘树。
- `chat_attachments` 仍然只是聊天消息附件事实源，不自动迁移、不反向定义云盘库。

## 状态链

1. 用户打开一级云盘或群聊云盘入口时，后端确保当前团队有一个云盘根文件夹。
2. 创建文件夹只写 `drive_nodes`；同一父文件夹下的未删除节点名唯一。
3. 上传文件先把原件流式写入对象存储，再写入 `drive_nodes` 和 `drive_files`。
4. 群聊上传只是选择一个云盘文件夹作为落点；上传成功后可以在当前群聊生成一条普通消息动态。
5. 群聊绑定只写 `chat_channel_drive_links`，不改变云盘树结构，也不修改文件归属。
6. 删除文件或文件夹是软删除 `drive_nodes.deleted_at`；对象存储原件不直接暴露给浏览器。

## 权限

- 团队云盘读写沿用当前用户的团队作用域和聊天基础权限：读需要 `chat.read`，写需要 `chat.write`。
- 群聊云盘入口只对当前群聊成员开放，且只支持未归档的公开/私有群聊。
- 管理群聊云盘绑定需要频道管理权限，或当前用户在该频道内是 `owner` / `admin`。
- 默认上传目标只能是文件夹节点；文件节点可以作为快捷绑定，但不能作为上传落点。

## API

- `GET /api/drive`：返回团队云盘根节点、首层节点和上传大小限制。
- `GET /api/drive/nodes/:nodeId/children`：按文件夹懒加载子节点。
- `POST /api/drive/folders`：在指定父文件夹下创建子文件夹。
- `POST /api/drive/upload`：上传文件到指定父文件夹。
- `DELETE /api/drive/nodes/:nodeId`：软删除文件或文件夹。
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

## 不做的事

- 不把旧聊天附件批量导入云盘库。
- 不把 Project 本身提升为文件权限、文件归属或数据隔离边界。
- 不把 MinIO object key 暴露给前端。
- 不用测试或 UI 临时状态反向定义云盘契约。
