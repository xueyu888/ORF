# ORF 108 Deployment

This directory defines the 199.199.199.108 staging/cutover environment. It keeps
deployment mechanics outside ORF business modules.

## Runtime Ownership

- Existing 199.199.199.8 remains the production source of truth until cutover.
- 199.199.199.108 is prepared as a parallel target.
- Final cutover requires a short write freeze, final database restore, object
  storage sync, Ory verification, and gateway health checks.
- ORF owns the stable web entry. External engineering activity is delivered
  into ORF native chat through the backend integrations, not through a separate
  chat runtime.

## Ports

| Service | 108 listener before public mapping | Public role |
| --- | ---: | --- |
| ORF Web | `8443` | Stable app/client entry |
| Ory Public | `18443` | Browser/Ory public API |
| MinIO S3 | `19443` | Private S3-compatible API via gateway |
| ORF API | `127.0.0.1:8787` | Backend only, proxied by ORF Web |
| ORF PostgreSQL | `127.0.0.1:5432` | Internal target DB for app and Ory |
| ORF local private service | `127.0.0.1:8799` | Internal settlement dependency |

PostgreSQL is loopback-only in the prepared target. Do not expose it publicly
until TLS, least-privilege credentials, and `pg_hba.conf` are explicitly handled.

## Host Runtime Prerequisites

- `/opt/orf/node` points to the prepared Node.js runtime used by systemd units.
- `/mnt/data1/orf/releases/<release-id>` stores immutable application releases;
  `/mnt/data1/orf/releases/current` is the only activation pointer used by
  systemd. Runtime startup does not read the Git checkout or `node_modules`.
- 108 must have working system DNS before ORF starts. The prepared host uses
  `/etc/systemd/resolved.conf.d/orf-dns.conf` so host services can reach GitHub,
  Docker Hub, and release endpoints.
- `/mnt/data1/orf/secrets` owns runtime secrets and is intentionally excluded
  from the repository.

## Files

- `docker-compose.postgres.yml`: target ORF PostgreSQL.
- `postgres-init/001-init-orf.sh`: creates the canonical `orf_current` schema.
- `orf-backend.service`: host systemd unit for the ORF backend.
- `activate-release.sh`: verifies a release archive, runs the compiled migration
  runner, switches `current` atomically, restarts the backend, and rolls the
  application pointer back when the health check fails.
- `orf-local-private-service.service`: host systemd unit for the private
  settlement/archive dependency.

The public gateway, Ory, and MinIO still use the repository's existing
`docker-compose.ory.yml`, `docker-compose.minio.yml`, `docker-compose.public.yml`,
and `scripts/prepare-public-ip-infra.mjs` contract.

## Immutable Application Release

Build on a clean build machine, never on the runtime host:

```bash
npm ci
npm run build:release
```

The command creates `.artifacts/releases/orf-<release-id>.tar.gz` and a matching
SHA-256 file. The archive contains only compiled backend and migration entry
points, the production web build, Drizzle SQL migrations, public defaults, and
`release.json`; it does not contain TypeScript source or `node_modules`.
The build rejects a dirty Git worktree so the manifest commit identifies the
actual source. `--allow-dirty` exists only for local artifact validation and
marks the manifest/release id as dirty.

Copy the archive and checksum to 108, then activate it:

```bash
sudo deploy/orf-108/activate-release.sh /path/to/orf-<release-id>.tar.gz
```

To verify checksum, manifest, file inventory, and every artifact hash without
installing or restarting anything:

```bash
deploy/orf-108/activate-release.sh --verify-only /path/to/orf-<release-id>.tar.gz
```

`orf-backend.service` executes `/opt/orf/node/bin/node server.mjs` from
`releases/current`. It must never run `npm install`, `npm run`, or `tsx`.
`ORF_SETTINGS_DATA_DIR` and `ORF_CLIENT_UPDATE_ASSET_DIR` point to
`/mnt/data1/orf/data`, outside immutable releases.

The gateway reads `ORF_WEB_RELEASE_DIR=/mnt/data1/orf/releases/current/web`.
Because Docker resolves a bind-mounted symlink when the container is created,
recreate only `public-gateway` after activating a release so it mounts the new
web directory; this does not rebuild or reinstall the application:

```bash
docker compose --env-file /mnt/data1/orf/secrets/orf.env \
  -f docker-compose.ory.yml -f docker-compose.minio.yml -f docker-compose.public.yml \
  up -d --no-deps --force-recreate public-gateway
```

Rollback is an atomic `current` symlink switch plus service restart. Database
migrations are forward-only: automatic health-check rollback restores the
previous application release, but never attempts a destructive database
rollback.

## Cutover Checklist

1. Keep 199.199.199.8 writable and 108 as a stale-but-ready replica.
2. Run a rehearsal restore to 108 and verify dependency and service health from
   the build/operations workspace; application runtime itself must not use npm.
3. Freeze ORF writes on 199.199.199.8.
4. Run the final database restore and MinIO sync.
5. Start/restart ORF on 108 and confirm:
   - `https://127.0.0.1:8443/health` through the gateway.
   - `http://127.0.0.1:8787/health` for backend.
   - `http://127.0.0.1:8799/health` for local private service.
   - Ory `/health/ready` and MinIO `/minio/health/live`.
6. Change router/DuckDNS to point the public ORF ports to 108.
7. Keep 199.199.199.8 unchanged for rollback until the new environment is
   observed stable.
