#!/usr/bin/env bash

set -euo pipefail

runtime_root="${ORF_CURRENT_HOST_RUNTIME_ROOT:-$HOME/.local/share/orf-production}"
releases_root="$runtime_root/releases"
unit="orf-backend-production.service"
health_url="${ORF_BACKEND_HEALTH_URL:-http://127.0.0.1:8787/health}"
current_target="$(readlink "$releases_root/current" 2>/dev/null || true)"
rollback_target="${1:-$(readlink "$releases_root/previous" 2>/dev/null || true)}"

[[ -n "$current_target" ]] || { echo "Current release pointer is missing" >&2; exit 1; }
[[ -n "$rollback_target" ]] || { echo "Previous release pointer is missing; pass an explicit release id" >&2; exit 1; }
[[ -d "$releases_root/$rollback_target" ]] || { echo "Rollback release not found: $rollback_target" >&2; exit 1; }

next_link="$releases_root/.rollback-$(date +%s)"
ln -s "$rollback_target" "$next_link"
mv -Tf "$next_link" "$releases_root/current"
systemctl --user restart "$unit"

for _ in $(seq 1 30); do
  if curl --fail --silent --show-error "$health_url" >/dev/null; then
    previous_link="$releases_root/.previous-$(date +%s)"
    ln -s "$current_target" "$previous_link"
    mv -Tf "$previous_link" "$releases_root/previous"
    echo "Rolled ORF back from $current_target to $rollback_target"
    exit 0
  fi
  sleep 1
done

restore_link="$releases_root/.restore-$(date +%s)"
ln -s "$current_target" "$restore_link"
mv -Tf "$restore_link" "$releases_root/current"
systemctl --user restart "$unit"
echo "Rollback target failed health check; restored $current_target" >&2
exit 1
