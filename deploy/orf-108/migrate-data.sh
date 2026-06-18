#!/bin/sh
set -eu

backup_dir="${ORF_MIGRATION_BACKUP_DIR:-/mnt/data1/orf/migration}"
secrets_dir="${ORF_MIGRATION_SECRETS_DIR:-/mnt/data1/orf/secrets}"
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

if [ "${ORF_MIGRATION_SKIP_DATABASE:-}" != "1" ]; then
  require_env SOURCE_DATABASE_URL
  require_env TARGET_DATABASE_URL

  echo "Dumping source PostgreSQL to $dump_file"
  pg_dump_schema="${ORF_MIGRATION_PG_SCHEMA:-orf_current}"
  docker run --rm --network host \
    -e SOURCE_DATABASE_URL \
    -e pg_dump_schema="$pg_dump_schema" \
    -v "$backup_dir:/backup" \
    -v "$secrets_dir:$secrets_dir:ro" \
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
fi

if [ "${ORF_MIGRATION_SKIP_OBJECTS:-}" != "1" ]; then
  require_env SOURCE_OBJECT_STORAGE_ENDPOINT
  require_env SOURCE_OBJECT_STORAGE_ACCESS_KEY
  require_env SOURCE_OBJECT_STORAGE_SECRET_KEY
  require_env SOURCE_OBJECT_STORAGE_BUCKET
  require_env TARGET_OBJECT_STORAGE_ENDPOINT
  require_env TARGET_OBJECT_STORAGE_ACCESS_KEY
  require_env TARGET_OBJECT_STORAGE_SECRET_KEY
  require_env TARGET_OBJECT_STORAGE_BUCKET

  echo "Mirroring object storage"
  mc_options="${ORF_MIGRATION_MC_OPTIONS:---insecure}"
  mc_image="${ORF_MIGRATION_MC_IMAGE:-quay.io/minio/mc:latest}"
  docker run --rm --network host \
    -e SOURCE_OBJECT_STORAGE_ENDPOINT \
    -e SOURCE_OBJECT_STORAGE_ACCESS_KEY \
    -e SOURCE_OBJECT_STORAGE_SECRET_KEY \
    -e SOURCE_OBJECT_STORAGE_BUCKET \
    -e TARGET_OBJECT_STORAGE_ENDPOINT \
    -e TARGET_OBJECT_STORAGE_ACCESS_KEY \
    -e TARGET_OBJECT_STORAGE_SECRET_KEY \
    -e TARGET_OBJECT_STORAGE_BUCKET \
    -e mc_options="$mc_options" \
    --entrypoint /bin/sh \
    "$mc_image" \
    -eu -c '
      mc $mc_options alias set source "$SOURCE_OBJECT_STORAGE_ENDPOINT" "$SOURCE_OBJECT_STORAGE_ACCESS_KEY" "$SOURCE_OBJECT_STORAGE_SECRET_KEY" >/dev/null
      mc $mc_options alias set target "$TARGET_OBJECT_STORAGE_ENDPOINT" "$TARGET_OBJECT_STORAGE_ACCESS_KEY" "$TARGET_OBJECT_STORAGE_SECRET_KEY" >/dev/null
      mc $mc_options --quiet mb --ignore-existing "target/$TARGET_OBJECT_STORAGE_BUCKET" 2>/dev/null || true
      mc $mc_options --quiet anonymous set none "target/$TARGET_OBJECT_STORAGE_BUCKET" 2>/dev/null || true
      mc $mc_options --quiet mirror --overwrite --remove "source/$SOURCE_OBJECT_STORAGE_BUCKET" "target/$TARGET_OBJECT_STORAGE_BUCKET"
    '
fi

echo "$timestamp" > "$backup_dir/last-migration-at.txt"
echo "Migration copy complete at $timestamp"
