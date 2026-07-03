# ORF 项目文件管理 - 后端

## 事实源

- 群聊绑定项目的事实源是 `chat_channels.project_id`。一个群聊最多绑定一个项目，多个群聊可以绑定同一个项目。
- 项目文件空间的事实源是 `project_file_trees`、`project_file_nodes`、`project_files`。
- 文件原件只放对象存储（MinIO/S3 兼容存储），对象 key 只保存在 `project_files.object_key`，浏览器只拿后端受控 URL。
- `chat_attachments` 仍然只是消息附件事实源，不自动迁移、不反向定义项目文件库。

## 状态链

1. 频道管理员在群聊设置或项目文件面板里设置 `chat_channels.project_id`。
2. 用户打开群聊项目文件入口时，后端按频道绑定项目确保该项目的默认根文件夹存在。
3. 创建文件夹只写 `project_file_nodes`，同一父文件夹下的未删除节点名唯一。
4. 上传文件先把原件流式写入对象存储，再写入 `project_file_nodes` 和 `project_files` 元数据。
5. 上传成功后在当前群聊发一条普通聊天动态，指向项目文件受控预览 URL。
6. 删除文件或文件夹是软删除 `project_file_nodes.deleted_at`，不直接删除 MinIO 原件。

## 权限

- 读权限继承绑定同一项目的群聊成员：用户只要属于任一绑定该项目的未归档公共/私有频道，就能读取该项目文件。
- 写权限继承聊天写权限：用户必须能读当前频道、拥有 `chat.write`，并且当前频道已绑定项目。
- 频道绑定项目属于频道配置，沿用频道管理权限；系统频道和私聊不参与项目文件绑定。

## API

- `GET /api/chat/channels/:channelId/project-files`：返回绑定项目、默认根文件夹和首层节点。
- `GET /api/chat/channels/:channelId/project-files/nodes/:nodeId/children`：按文件夹懒加载子节点。
- `POST /api/chat/channels/:channelId/project-files/folders`：在指定父文件夹下创建子文件夹。
- `POST /api/chat/channels/:channelId/project-files/upload`：上传文件到指定父文件夹。
- `DELETE /api/chat/channels/:channelId/project-files/nodes/:nodeId`：软删除文件或文件夹。
- `GET /api/project-files/:fileId/content?disposition=inline|attachment`：通过后端读取或下载文件。

## 预览

- 后端根据真实文件头、声明 MIME 和文件名派生 `preview_kind`。
- 图片只允许真实识别出的常见图片类型内联预览。
- PDF 需要文件头匹配 `%PDF-` 才按 PDF 预览。
- Markdown、文本、JSON、CSV、日志按纯文本预览。
- HTML、SVG、XML 和未知类型不直接 inline，默认下载，避免脚本或主动内容进入页面。

## 不做的事

- 不把旧聊天附件批量导入项目文件库。
- 不把 Project 本身提升为权限边界；权限仍来自绑定群聊。
- 不把 MinIO object key 暴露给前端。
- 不用测试或 UI 临时状态反向定义项目文件契约。
