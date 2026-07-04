WITH uploaded_chat_files AS (
  SELECT DISTINCT ON (m.channel_id, n.id)
         'chat-drive-link-backfill-' || md5(m.id || ':' || n.id) AS id,
         m.team_id,
         m.channel_id,
         n.id AS node_id,
         m.author_user_id AS created_by,
         m.created_at
  FROM chat_messages m
  CROSS JOIN LATERAL regexp_matches(m.body, '/api/drive/files/([^/)]+)/content', 'g') AS matched(file_id)
  INNER JOIN drive_files f ON f.id = matched.file_id[1] AND f.team_id = m.team_id
  INNER JOIN drive_nodes n ON n.id = f.node_id AND n.team_id = m.team_id AND n.deleted_at IS NULL
  INNER JOIN chat_channels c ON c.id = m.channel_id AND c.team_id = m.team_id AND c.archived_at IS NULL AND c.type IN ('public', 'private')
  WHERE m.deleted_at IS NULL
    AND (m.body LIKE '上传了云盘文件：%' OR m.body LIKE '上传了云盘文件:%')
  ORDER BY m.channel_id, n.id, m.created_at ASC
)
INSERT INTO chat_channel_drive_links (id, team_id, channel_id, node_id, label, is_default_upload_target, created_by, created_at, updated_at)
SELECT id, team_id, channel_id, node_id, NULL, false, created_by, created_at, created_at
FROM uploaded_chat_files
ON CONFLICT (channel_id, node_id) DO NOTHING;
