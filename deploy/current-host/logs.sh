#!/usr/bin/env bash

set -euo pipefail

lines="${1:-200}"
[[ "$lines" =~ ^[1-9][0-9]{0,4}$ ]] || { echo "Usage: $0 [line-count]" >&2; exit 2; }
exec journalctl --user -u orf-backend-production.service --no-pager -n "$lines"
