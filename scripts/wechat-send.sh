#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/wechat-send.sh [--prepare] [--keep-clipboard] CONTACT MESSAGE

Examples:
  scripts/wechat-send.sh 冯成 "测试一下"
  scripts/wechat-send.sh --prepare 冯成 "先填好但不发送"

Options:
  --prepare         Fill the message box but do not press Enter.
  --keep-clipboard  Leave the Windows clipboard as the message text.
USAGE
}

prepare=0
keep_clipboard=0

while (($# > 0)); do
  case "$1" in
    --prepare|--no-send)
      prepare=1
      shift
      ;;
    --keep-clipboard)
      keep_clipboard=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    -*)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
    *)
      break
      ;;
  esac
done

if (($# != 2)); then
  usage >&2
  exit 2
fi

contact=$1
message=$2
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
ps_script=$(wslpath -w "$script_dir/wechat-send.ps1")

args=(-NoProfile -ExecutionPolicy Bypass -File "$ps_script" -Contact "$contact" -Message "$message")
if ((prepare)); then
  args+=(-NoSend)
fi
if ((keep_clipboard)); then
  args+=(-KeepClipboard)
fi

powershell.exe "${args[@]}"
