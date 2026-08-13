# ORF Local WSL PostgreSQL Migration

This directory owns only the local PostgreSQL source-of-truth migration on the
same physical machine:

```text
Windows PostgreSQL service
  -> dump/restore
  -> WSL Docker PostgreSQL
  -> ORF DATABASE_URL / ORY_DATABASE_URL
```

It does not define a remote-host cutover, router change, DuckDNS move, ORF web
gateway migration, or a second application runtime.

## Ownership

- Current source before cutover: the existing Windows PostgreSQL service and
  its `orf_current` schema.
- Target after cutover: PostgreSQL running in WSL/Linux, preferably through the
  local Docker compose file in this directory.
- ORF application runtime remains owned by `deploy/current-host` and `orf up`.
- MinIO, Ory, public gateway, and client update assets are outside this
  directory unless a later explicit migration decision says otherwise.

## Files

- `docker-compose.postgres.yml`: local WSL PostgreSQL container.
- `postgres-init/001-init-orf.sh`: creates the canonical `orf_current` schema.
- `postgres.env.example`: example compose/migration variables.
- `migrate-postgres.sh`: dumps `SOURCE_DATABASE_URL` and restores it into
  `TARGET_DATABASE_URL`.

## Rehearsal

Run the WSL PostgreSQL target on a non-production port while the Windows
PostgreSQL service still owns `5432`:

```bash
cd deploy/local-wsl-postgres
cp postgres.env.example postgres.env
docker compose --env-file postgres.env -f docker-compose.postgres.yml up -d
```

Then run a rehearsal restore:

```bash
ORF_MIGRATION_BACKUP_DIR=/mnt/data1/orf/migration \
SOURCE_DATABASE_URL='postgresql://orf_project_user:...@127.0.0.1:5432/orf?sslmode=require&options=-csearch_path%3Dorf_current%2Cpublic' \
TARGET_DATABASE_URL='postgresql://orf_project_user:...@127.0.0.1:55432/orf?options=-csearch_path%3Dorf_current%2Cpublic' \
ORF_MIGRATION_ALLOW_DESTRUCTIVE_RESTORE=1 \
./migrate-postgres.sh
```

Verify the target before any cutover:

```bash
psql "$TARGET_DATABASE_URL" -c 'select current_user, current_database(), current_schema()'
psql "$TARGET_DATABASE_URL" -c 'select count(*) from users'
```

## Final Cutover

1. Freeze ORF writes.
2. Run a final dump/restore into the WSL PostgreSQL target.
3. Stop the Windows PostgreSQL service.
4. Start or rebind WSL PostgreSQL on the final local ORF database endpoint.
5. Update ORF runtime env so `DATABASE_URL`, `REMOTE_DATABASE_URL` if present,
   `ORY_DATABASE_URL`, and `ORY_DATABASE_PROBE_URL` point to WSL PostgreSQL.
6. Run `node scripts/verify-db.mjs`.
7. Run `orf up` and verify backend/gateway health.
8. Keep the Windows PostgreSQL data directory backed up until the WSL database
   has been observed stable.

Deleting the Windows PostgreSQL service or data directory is a separate
destructive operation and must only happen after the final restore, ORF health
checks, and explicit confirmation that rollback to the Windows service is no
longer needed.
