# Current Host Compiled Runtime

This directory switches only the current public ORF backend from the repository
development watcher to a compiled, immutable release managed by user systemd.
It does not perform the separate 199.199.199.108 database or gateway cutover.

## Ownership

- Application releases: `~/.local/share/orf-production/releases/<release-id>`.
- Active release: atomic `releases/current` symlink.
- Previous healthy release: `releases/previous` symlink.
- Runtime Node binary: `~/.local/share/orf-production/node` symlink to the
  validated Node executable present at install time.
- Runtime environment: `~/.config/orf/orf.env`, copied with mode `600` from the
  current host environment. Relative settings and client-update data paths are
  resolved to their existing absolute paths so activation does not create a
  second data source.
- GitHub polling cursor: `~/.local/share/orf-production/data/github-sync-state.json`;
  installation migrates the previous `.artifacts` cursor once and the immutable
  release never writes into its own directory.
- Logs: user journal for `orf-backend-production.service`; production does not
  append to the unbounded repository `.orf/logs/backend.log`.
- Shutdown first closes registered SSE streams and then waits for ordinary
  requests; systemd keeps a 15-second upper bound before forced termination.

## Install And Activate

```bash
deploy/current-host/install-runtime.sh
npm run build:release -- --allow-dirty --release-id local-validation
deploy/current-host/activate-release.sh .artifacts/releases/orf-local-validation-dirty.tar.gz
```

Formal production releases must be built from a clean committed worktree. The
dirty flag is permitted only for a local validation artifact before commit.

The first activation stops only the legacy detached backend, keeps the frontend
running, activates the compiled release, checks `/health`, and automatically
restores the legacy runtime if the compiled service cannot become healthy.
Subsequent activations use the immutable current/previous pointers and the
shared health-check rollback contract in `deploy/orf-108/activate-release.sh`.

## Manual Rollback And Logs

```bash
deploy/current-host/rollback-release.sh
deploy/current-host/logs.sh 200
```

Database migrations are forward-only. Application rollback never attempts to
reverse a migration.
