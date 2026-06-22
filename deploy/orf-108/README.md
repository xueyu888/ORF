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
- 108 must have working system DNS before ORF starts. The prepared host uses
  `/etc/systemd/resolved.conf.d/orf-dns.conf` so host services can reach GitHub,
  Docker Hub, and release endpoints.
- `/mnt/data1/orf/secrets` owns runtime secrets and is intentionally excluded
  from the repository.

## Files

- `docker-compose.postgres.yml`: target ORF PostgreSQL.
- `postgres-init/001-init-orf.sh`: creates the canonical `orf_current` schema.
- `orf-backend.service`: host systemd unit for the ORF backend.
- `orf-local-private-service.service`: host systemd unit for the private
  settlement/archive dependency.

The public gateway, Ory, and MinIO still use the repository's existing
`docker-compose.ory.yml`, `docker-compose.minio.yml`, `docker-compose.public.yml`,
and `scripts/prepare-public-ip-infra.mjs` contract.

## Cutover Checklist

1. Keep 199.199.199.8 writable and 108 as a stale-but-ready replica.
2. Run a rehearsal restore to 108 and verify `npm run orf -- status` from 108.
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
