UPDATE role_permissions
SET actions = (
  SELECT jsonb_agg(permission ORDER BY permission)
  FROM (
    SELECT DISTINCT permission
    FROM jsonb_array_elements_text(actions || '["chat.read","chat.write","chat.channel.create"]'::jsonb) AS item(permission)
  ) merged
)
WHERE role = 'member'
  AND stage = 'global'
  AND resource = 'permissionKeys'
  AND NOT (
    actions ? 'chat.read'
    AND actions ? 'chat.write'
    AND actions ? 'chat.channel.create'
  );
