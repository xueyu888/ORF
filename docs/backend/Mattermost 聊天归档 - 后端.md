# Mattermost 聊天归档 - 后端

## 定位

Mattermost 聊天归档是独立外部集成模块，只镜像 Mattermost 频道内容，方便 ORF 在自己的 PostgreSQL 中检索和管理历史聊天。

它不属于 ORF 系统内消息、评论或业务流程状态：

1. 不写入 `notifications`，不生成铃铛消息。
2. 不写入 `comment_messages`，不绑定 objective/result/task/subtask。
3. 不反向驱动 ORF 业务状态。
4. Mattermost post id 是幂等事实键；ORF 只保存同步镜像。

## 当前试探边界

第一版用于试探单频道链路：

1. `MATTERMOST_ARCHIVE_ENABLED=false` 默认关闭。
2. 开启后默认只选择当前同步账号可见频道中，名称或显示名以 `LLM` 开头的第一个频道。
3. `MATTERMOST_ARCHIVE_CHANNEL_LIMIT=1` 保证先试一个频道；改为 `0` 后才同步所有匹配频道。
4. 只同步频道，不同步 DM 或群聊。
5. 压缩包、安装包和大文件不复制进对象存储，只记录附件元数据。
6. 图片附件可通过 `MATTERMOST_ARCHIVE_COPY_IMAGES=true` 复制到 MinIO；试探期允许复制小图片。

## 数据模型

归档数据独立存放：

| 表 | 职责 |
| --- | --- |
| `mattermost_archive_channels` | Mattermost 频道快照。 |
| `mattermost_archive_posts` | 频道消息正文、作者、时间、编辑/删除状态和 file id 列表。 |
| `mattermost_archive_post_files` | 附件元数据、存储策略、复制状态和对象存储 key。 |
| `mattermost_archive_sync_cursors` | 每个频道的回填进度、最后同步时间和错误。 |

PostgreSQL 是消息和元数据事实源；MinIO 只保存允许复制的图片对象。浏览器和业务 DTO 不直接暴露 bucket、endpoint 或 object key。

## 查看器接口

聊天归档查看器是系统管理下的 admin-only 只读页面：

1. 前端路径：`/system/mattermost-archive`。
2. 查询接口：`GET /api/mattermost-archive`。
3. 图片预览接口：`GET /api/mattermost-archive/files/:fileId/content`。
4. 查询参数：
   - `q`：模糊搜索消息正文、频道名、作者名和文件名。
   - `channelId`：限定频道。
   - `page` / `limit`：分页，`limit` 最大 `200`。
   - `includeDeleted`：是否显示已删除记录，默认 `true`。

查看器不触发 Mattermost 在线拉取，只读取已同步到 PostgreSQL 的归档镜像。图片预览接口只返回 `storage_status = copied` 且 `mime_type` 为 `image/*` 的对象；非图片、超限文件和复制失败文件只展示元数据。

## 同步规则

1. 后端使用 Mattermost API，不直接读取 Mattermost 内部数据库。
2. 频道选择先按 `MATTERMOST_ARCHIVE_CHANNEL_IDS`，未配置时按 `MATTERMOST_ARCHIVE_CHANNEL_NAME_PREFIX`。
3. 每次同步先按 `since` 补增量，再按 `before` 继续历史回填。
4. 消息按 Mattermost post id upsert，重复同步不会产生重复记录。
5. 删除消息保留归档记录和 `deleted_at`，正文清空，避免删除后的正文继续留存。
6. 附件按文件类型和大小分类：
   - `image/*` 且不超过 `MATTERMOST_ARCHIVE_MAX_IMAGE_BYTES`，允许复制。
   - 压缩包、安装包和超限文件只保留元数据。
   - 非图片附件只保留元数据。

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `MATTERMOST_ARCHIVE_ENABLED` | 是否启用后台归档，默认 `false`。 |
| `MATTERMOST_ARCHIVE_ACCESS_TOKEN` | 可选，归档专用 token。 |
| `MATTERMOST_ARCHIVE_LOGIN_ID` / `MATTERMOST_ARCHIVE_PASSWORD` | 可选，归档专用登录。 |
| `MATTERMOST_ARCHIVE_CHANNEL_IDS` | 可选，逗号分隔频道 ID；配置后优先于名称前缀。 |
| `MATTERMOST_ARCHIVE_CHANNEL_NAME_PREFIX` | 频道名称或显示名前缀，试探期默认 `LLM`。 |
| `MATTERMOST_ARCHIVE_CHANNEL_LIMIT` | 匹配频道数量上限；`1` 表示只试第一个，`0` 表示不限制。 |
| `MATTERMOST_ARCHIVE_POSTS_PER_PAGE` | 每页拉取 posts 数量，默认 `60`，最大 `200`。 |
| `MATTERMOST_ARCHIVE_BACKFILL_PAGE_LIMIT` | 单次同步最多回填页数，默认 `1`。 |
| `MATTERMOST_ARCHIVE_SYNC_INTERVAL_SECONDS` | 后台同步间隔，默认 `300`。 |
| `MATTERMOST_ARCHIVE_INCLUDE_DELETED` | 是否拉取删除状态，默认 `true`。 |
| `MATTERMOST_ARCHIVE_SYNC_FILES` | 是否同步附件元数据，默认 `true`。 |
| `MATTERMOST_ARCHIVE_COPY_IMAGES` | 是否复制图片附件到 MinIO，默认 `true`。 |
| `MATTERMOST_ARCHIVE_MAX_IMAGE_BYTES` | 图片复制大小上限，默认 `10485760`。 |

## 试探脚本

只跑一次同步：

```bash
npm run mattermost:archive:sync
```

脚本复用 `scripts/with-public-ca.mjs`，共享 Mattermost/MinIO 公共 CA 配置。
