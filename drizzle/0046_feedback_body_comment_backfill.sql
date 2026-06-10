WITH feedback_body_source AS (
  SELECT
    f.id AS feedback_id,
    f.team_id,
    f.phenomenon,
    btrim(f.suggested_adjustment) AS body,
    COALESCE(f.created_by, f.owner_user_id) AS author_user_id,
    f.created_at::timestamptz AS created_at
  FROM "feedback" f
  WHERE btrim(COALESCE(f.suggested_adjustment, '')) <> ''
    AND COALESCE(f.created_by, f.owner_user_id) IS NOT NULL
),
valid_feedback_body_source AS (
  SELECT
    source.*,
    u.name AS author_name,
    'cthread-feedback-body-' || substr(md5(source.feedback_id), 1, 24) AS thread_id,
    'cmsg-feedback-body-' || substr(md5(source.feedback_id), 1, 24) AS message_id
  FROM feedback_body_source source
  INNER JOIN "users" u ON u.id = source.author_user_id
),
inserted_threads AS (
  INSERT INTO "comment_threads" (
    "id",
    "team_id",
    "target_type",
    "target_id",
    "target_title",
    "status",
    "created_by",
    "created_at",
    "updated_at"
  )
  SELECT
    source.thread_id,
    source.team_id,
    'feedback',
    source.feedback_id,
    source.phenomenon,
    'open',
    source.author_user_id,
    source.created_at,
    source.created_at
  FROM valid_feedback_body_source source
  ON CONFLICT ("id") DO NOTHING
  RETURNING "target_id"
),
inserted_messages AS (
  INSERT INTO "comment_messages" (
    "id",
    "thread_id",
    "author_user_id",
    "author",
    "body",
    "created_at",
    "parent_message_id",
    "reply_to_message_id",
    "reply_to_author",
    "sort_order"
  )
  SELECT
    source.message_id,
    source.thread_id,
    source.author_user_id,
    source.author_name,
    source.body,
    source.created_at,
    NULL,
    NULL,
    NULL,
    0
  FROM valid_feedback_body_source source
  ON CONFLICT ("id") DO NOTHING
  RETURNING "id"
),
migrated_feedback AS (
  SELECT source.feedback_id
  FROM valid_feedback_body_source source
  INNER JOIN inserted_messages message ON message.id = source.message_id
)
UPDATE "feedback" f
SET "suggested_adjustment" = ''
FROM migrated_feedback migrated
WHERE f.id = migrated.feedback_id;
