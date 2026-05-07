#!/usr/bin/env bash
set -euo pipefail

orf_root=${CODEX_ACTIVITY_ORF_ROOT:-/home/xue/code/ORF}
scope=${CODEX_ACTIVITY_SCOPE:-orf}
cwd=${CODEX_ACTIVITY_CWD:-}
repo=${CODEX_ACTIVITY_REPO:-}
branch=${CODEX_ACTIVITY_BRANCH:-}
summary=${CODEX_ACTIVITY_SUMMARY:-${CODEX_NOTIFY_TASK:-}}
detail=${CODEX_ACTIVITY_DETAIL:-${CODEX_NOTIFY_EXTRA:-}}
include_details=${CODEX_ACTIVITY_INCLUDE_DETAILS:-true}
log_file="$orf_root/.artifacts/codex-activity-reporter.log"

if [[ ! -d "$orf_root" ]]; then
  exit 0
fi

if [[ "$scope" != "all" ]]; then
  case "$cwd" in
    "$orf_root"|"$orf_root"/*) ;;
    *) exit 0 ;;
  esac
fi

if [[ -z "$summary" ]]; then
  summary="完成了一轮 Codex 会话"
fi

if [[ "$summary" == *"short title for a task that will be created from that prompt"* ]]; then
  exit 0
fi

mkdir -p "$(dirname "$log_file")"

args=(run codex:report -- --summary "$summary")

if [[ "$include_details" == "true" && -n "$detail" ]]; then
  args+=(--detail "$detail")
fi

context=""
if [[ -n "$repo" && -n "$branch" ]]; then
  context="$repo:$branch"
elif [[ -n "$repo" ]]; then
  context="$repo"
fi

if [[ "$include_details" == "true" && -n "$context" ]]; then
  args+=(--detail "工作区：$context")
fi

(
  cd "$orf_root"
  if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
    # shellcheck source=/dev/null
    . "$HOME/.nvm/nvm.sh"
    nvm use default --silent >/dev/null 2>&1 || true
  fi
  npm "${args[@]}"
) >>"$log_file" 2>&1 || true
