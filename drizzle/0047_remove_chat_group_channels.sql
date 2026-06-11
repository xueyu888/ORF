UPDATE chat_channels AS channel
SET
  type = 'private'::chat_channel_type,
  display_name = COALESCE(NULLIF(channel.display_name, ''), member_names.display_name, '私有频道')
FROM (
  SELECT
    member.channel_id,
    LEFT(string_agg(users.name, ', ' ORDER BY users.name), 120) AS display_name
  FROM chat_channel_members AS member
  INNER JOIN users ON users.id = member.user_id
  INNER JOIN chat_channels AS grouped_channel ON grouped_channel.id = member.channel_id
  WHERE grouped_channel.type = 'group'
  GROUP BY member.channel_id
) AS member_names
WHERE channel.id = member_names.channel_id
  AND channel.type = 'group';
--> statement-breakpoint
UPDATE chat_channels
SET
  type = 'private'::chat_channel_type,
  display_name = COALESCE(NULLIF(display_name, ''), '私有频道')
WHERE type = 'group';
--> statement-breakpoint
ALTER TYPE chat_channel_type RENAME TO chat_channel_type_with_group;
--> statement-breakpoint
CREATE TYPE chat_channel_type AS ENUM ('public', 'private', 'direct');
--> statement-breakpoint
ALTER TABLE chat_channels
  ALTER COLUMN type TYPE chat_channel_type
  USING type::text::chat_channel_type;
--> statement-breakpoint
DROP TYPE chat_channel_type_with_group;
