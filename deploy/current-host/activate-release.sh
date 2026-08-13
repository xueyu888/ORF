#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
runtime_root="${ORF_CURRENT_HOST_RUNTIME_ROOT:-$HOME/.local/share/orf-production}"
config_root="${ORF_CURRENT_HOST_CONFIG_ROOT:-$HOME/.config/orf}"
unit="orf-backend-production.service"
node_bin="$runtime_root/node"
safe_tmp_dir="${ORF_PRODUCTION_TMPDIR:-/tmp}"
had_current=false
verify_only=false
previous_target="$(readlink "$runtime_root/releases/current" 2>/dev/null || true)"

if [[ "${1:-}" == "--verify-only" ]]; then
  verify_only=true
fi

systemd_unit_available() {
  systemctl --user cat "$unit" >/dev/null 2>&1
}

disable_systemd_unit() {
  if systemd_unit_available; then
    systemctl --user disable --now "$unit" >/dev/null 2>&1 || true
  fi
}

run_orf() {
  TMPDIR="$safe_tmp_dir" ORF_PRODUCTION_TMPDIR="$safe_tmp_dir" "$node_bin" "$repo_root/bin/orf.mjs" "$@"
}

configure_backend_restart() {
  export ORF_SYSTEMCTL_SCOPE=user
  unset ORF_BACKEND_RESTART_COMMAND

  if systemd_unit_available; then
    return
  fi

  local restart_command
  restart_command="$(printf 'cd %q && env TMPDIR=%q ORF_PRODUCTION_TMPDIR=%q %q %q restart backend' "$repo_root" "$safe_tmp_dir" "$safe_tmp_dir" "$node_bin" "$repo_root/bin/orf.mjs")"
  export ORF_BACKEND_RESTART_COMMAND="$restart_command"
}

resolve_backend_pid() {
  local systemd_pid=""
  if systemd_unit_available && systemctl --user is-active --quiet "$unit"; then
    systemd_pid="$(systemctl --user show "$unit" --property MainPID --value)"
    if [[ "$systemd_pid" =~ ^[0-9]+$ && "$systemd_pid" -gt 0 && -d "/proc/$systemd_pid" ]]; then
      echo "$systemd_pid systemd"
      return 0
    fi
  fi

  local pid_file="$runtime_root/data/backend-production.manual.pid"
  local manual_pid=""
  if [[ -f "$pid_file" ]]; then
    read -r manual_pid < "$pid_file" || true
    if [[ "$manual_pid" =~ ^[0-9]+$ && "$manual_pid" -gt 0 && -d "/proc/$manual_pid" ]]; then
      echo "$manual_pid detached"
      return 0
    fi
  fi

  return 1
}

if [[ "$verify_only" == true ]]; then
  :
elif [[ -L "$runtime_root/releases/current" ]]; then
  had_current=true
else
  run_orf down backend
fi

export ORF_RELEASES_ROOT="$runtime_root/releases"
export ORF_ENVIRONMENT_FILE="$config_root/orf.env"
export ORF_NODE_BIN="$node_bin"
export ORF_BACKEND_SYSTEMD_UNIT="$unit"
export ORF_BACKEND_HEALTH_URL="${ORF_BACKEND_HEALTH_URL:-http://127.0.0.1:8787/health}"
configure_backend_restart

if ! "$repo_root/deploy/current-host/activate-release-package.sh" "$@"; then
  if [[ "$had_current" == false ]]; then
    disable_systemd_unit
    run_orf up
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
    disable_systemd_unit
    rm -f "$runtime_root/releases/current"
    run_orf up
  fi
  exit 1
fi

backend_info="$(resolve_backend_pid)" || { echo "No production backend process found after activation" >&2; exit 1; }
read -r main_pid backend_mode <<< "$backend_info"
command_line="$(tr '\0' ' ' < "/proc/$main_pid/cmdline")"
if [[ "$command_line" != *"server.mjs"* || "$command_line" == *"tsx"* ]]; then
  echo "Unexpected production backend command: $command_line" >&2
  exit 1
fi

process_cwd="$(readlink "/proc/$main_pid/cwd")"
current_cwd="$(realpath "$runtime_root/releases/current")"
if [[ "$(realpath "$process_cwd")" != "$current_cwd" ]]; then
  echo "Production backend is not running from current release: pid=$main_pid cwd=$process_cwd current=$current_cwd" >&2
  exit 1
fi

curl --fail --silent --show-error "$ORF_BACKEND_HEALTH_URL" >/dev/null
echo "Current host now serves the complete compiled ORF release: mode=$backend_mode pid=$main_pid"
