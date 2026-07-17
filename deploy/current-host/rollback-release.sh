#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
runtime_root="${ORF_CURRENT_HOST_RUNTIME_ROOT:-$HOME/.local/share/orf-production}"
releases_root="$runtime_root/releases"
unit="orf-backend-production.service"
health_url="${ORF_BACKEND_HEALTH_URL:-http://127.0.0.1:8787/health}"
gateway_script="$repo_root/deploy/current-host/refresh-public-gateway.sh"
current_target="$(readlink "$releases_root/current" 2>/dev/null || true)"
rollback_target="${1:-$(readlink "$releases_root/previous" 2>/dev/null || true)}"

[[ -n "$current_target" ]] || { echo "Current release pointer is missing" >&2; exit 1; }
[[ -n "$rollback_target" ]] || { echo "Previous release pointer is missing; pass an explicit release id" >&2; exit 1; }
[[ -d "$releases_root/$rollback_target" ]] || { echo "Rollback release not found: $rollback_target" >&2; exit 1; }

switch_current_release() {
  local target="$1"
  local next_link="$releases_root/.rollback-$(date +%s)-$RANDOM"
  ln -s "$target" "$next_link"
  mv -Tf "$next_link" "$releases_root/current"
}

wait_for_backend() {
  for _ in $(seq 1 30); do
    if curl --fail --silent --show-error "$health_url" >/dev/null; then
      return 0
    fi
    sleep 1
  done
  return 1
}

restore_current_release() {
  switch_current_release "$current_target"
  systemctl --user restart "$unit"
  if ! wait_for_backend; then
    echo "Failed to restore backend release: $current_target" >&2
    return 1
  fi
  "$gateway_script"
}

switch_current_release "$rollback_target"
systemctl --user restart "$unit"

if ! wait_for_backend; then
  echo "Rollback backend failed health check; restoring $current_target" >&2
  restore_current_release || true
  exit 1
fi

if ! "$gateway_script"; then
  echo "Rollback public-gateway activation failed; restoring $current_target" >&2
  restore_current_release || true
  exit 1
fi

previous_link="$releases_root/.previous-$(date +%s)"
ln -s "$current_target" "$previous_link"
mv -Tf "$previous_link" "$releases_root/previous"
echo "Rolled complete ORF release back from $current_target to $rollback_target"
