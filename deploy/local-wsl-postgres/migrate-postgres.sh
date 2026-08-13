#!/bin/sh
set -eu

backup_dir="${ORF_MIGRATION_BACKUP_DIR:-/mnt/data1/orf/migration}"
dump_file="$backup_dir/orf.dump"
timestamp="$(date +%Y%m%d%H%M%S)"

require_env() {
  name="$1"
  eval "value=\${$name:-}"
  if [ -z "$value" ]; then
    echo "$name is required" >&2
    exit 2
  fi
}

mkdir -p "$backup_dir"

require_env SOURCE_DATABASE_URL
require_env TARGET_DATABASE_URL

echo "Dumping source PostgreSQL to $dump_file"
pg_dump_schema="${ORF_MIGRATION_PG_SCHEMA:-orf_current}"
docker run --rm --network host \
  -e SOURCE_DATABASE_URL \
  -e pg_dump_schema="$pg_dump_schema" \
  -v "$backup_dir:/backup" \
  postgres:17-alpine \
  sh -eu -c 'pg_dump "$SOURCE_DATABASE_URL" --schema="$pg_dump_schema" --format=custom --file=/backup/orf.dump'

if [ "${ORF_MIGRATION_ALLOW_DESTRUCTIVE_RESTORE:-}" != "1" ]; then
  echo "Refusing to restore target database without ORF_MIGRATION_ALLOW_DESTRUCTIVE_RESTORE=1" >&2
  exit 3
fi

echo "Restoring target PostgreSQL from $dump_file"
docker run --rm --network host \
  -e TARGET_DATABASE_URL \
  postgres:17-alpine \
  sh -eu -c '
    psql "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL
DROP EXTENSION IF EXISTS pg_trgm CASCADE;
DROP EXTENSION IF EXISTS btree_gin CASCADE;
DROP SCHEMA IF EXISTS orf_current CASCADE;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS btree_gin WITH SCHEMA public;
SQL
  '

docker run --rm --network host \
  -e TARGET_DATABASE_URL \
  -v "$backup_dir:/backup" \
  postgres:17-alpine \
  sh -eu -c 'pg_restore --no-owner --no-acl --dbname "$TARGET_DATABASE_URL" /backup/orf.dump'

echo "$timestamp" > "$backup_dir/last-migration-at.txt"
echo "PostgreSQL migration copy complete at $timestamp"
