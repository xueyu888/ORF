#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
runtime_root="${ORF_CURRENT_HOST_RUNTIME_ROOT:-$HOME/.local/share/orf-production}"
config_root="${ORF_CURRENT_HOST_CONFIG_ROOT:-$HOME/.config/orf}"
unit="orf-backend-production.service"
had_current=false
verify_only=false
previous_target="$(readlink "$runtime_root/releases/current" 2>/dev/null || true)"

if [[ "${1:-}" == "--verify-only" ]]; then
  verify_only=true
fi

if [[ "$verify_only" == true ]]; then
  :
elif [[ -L "$runtime_root/releases/current" ]]; then
  had_current=true
else
  node "$repo_root/bin/orf.mjs" down backend
fi

export ORF_RELEASES_ROOT="$runtime_root/releases"
export ORF_ENVIRONMENT_FILE="$config_root/orf.env"
export ORF_NODE_BIN="$runtime_root/node"
export ORF_BACKEND_SYSTEMD_UNIT="$unit"
export ORF_BACKEND_HEALTH_URL="${ORF_BACKEND_HEALTH_URL:-http://127.0.0.1:8787/health}"
export ORF_SYSTEMCTL_SCOPE=user

if ! "$repo_root/deploy/orf-108/activate-release.sh" "$@"; then
  if [[ "$had_current" == false ]]; then
    systemctl --user disable --now "$unit" >/dev/null 2>&1 || true
    node "$repo_root/bin/orf.mjs" up
  fi
  exit 1
fi

if [[ "$verify_only" == true ]]; then
  exit 0
fi

if ! "$repo_root/deploy/current-host/refresh-public-gateway.sh"; then
  echo "New release backend is healthy, but public-gateway activation failed." >&2
  if [[ -n "$previous_target" ]]; then
    echo "Restoring the previous complete application release: $previous_target" >&2
    "$repo_root/deploy/current-host/rollback-release.sh" "$previous_target"
  else
    systemctl --user disable --now "$unit" >/dev/null 2>&1 || true
    rm -f "$runtime_root/releases/current"
    node "$repo_root/bin/orf.mjs" up
  fi
  exit 1
fi

systemctl --user is-active --quiet "$unit"
main_pid="$(systemctl --user show "$unit" --property MainPID --value)"
command_line="$(tr '\0' ' ' < "/proc/$main_pid/cmdline")"
if [[ "$command_line" != *"server.mjs"* || "$command_line" == *"tsx"* ]]; then
  echo "Unexpected production backend command: $command_line" >&2
  exit 1
fi

echo "Current host now serves the complete compiled ORF release: pid=$main_pid"
