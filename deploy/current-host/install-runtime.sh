#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
runtime_root="${ORF_CURRENT_HOST_RUNTIME_ROOT:-$HOME/.local/share/orf-production}"
config_root="${ORF_CURRENT_HOST_CONFIG_ROOT:-$HOME/.config/orf}"
unit_root="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
node_bin="$(readlink -f "$(command -v node)")"

[[ -x "$node_bin" ]] || { echo "Node runtime not found" >&2; exit 1; }
[[ -f "$repo_root/.env" ]] || { echo "Runtime environment not found: $repo_root/.env" >&2; exit 1; }

install -d -m 700 "$runtime_root" "$runtime_root/data" "$runtime_root/releases" "$config_root"
install -d -m 755 "$unit_root"
ln -sfn "$node_bin" "$runtime_root/node"
install -m 600 "$repo_root/.env" "$config_root/orf.env"

node --input-type=module - "$config_root/orf.env" "$repo_root" "$runtime_root" <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [environmentFile, repoRoot, runtimeRoot] = process.argv.slice(2);
const pathKeys = new Set([
  "ORF_CLIENT_UPDATE_ASSET_DIR",
  "ORF_FIREBASE_SERVICE_ACCOUNT_PATH",
  "ORF_PUBLIC_CA_CERT",
  "ORF_SETTINGS_DATA_DIR",
]);
let lines = readFileSync(environmentFile, "utf8").split(/\r?\n/).map((line) => {
  const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
  if (!match || !pathKeys.has(match[1])) return line;
  const quote = match[2].startsWith('"') && match[2].endsWith('"') ? '"' : "";
  const rawValue = quote ? match[2].slice(1, -1) : match[2];
  if (!rawValue || path.isAbsolute(rawValue)) return line;
  return `${match[1]}=${quote}${path.resolve(repoRoot, rawValue)}${quote}`;
});
const githubStateFile = path.join(runtimeRoot, "data", "github-sync-state.json");
const githubStateIndex = lines.findIndex((line) => line.startsWith("GITHUB_SYNC_STATE_FILE="));
if (githubStateIndex >= 0) lines[githubStateIndex] = `GITHUB_SYNC_STATE_FILE=${githubStateFile}`;
else lines.push(`GITHUB_SYNC_STATE_FILE=${githubStateFile}`);
if (!lines.some((line) => line.startsWith("NODE_EXTRA_CA_CERTS="))) {
  const caLine = lines.find((line) => line.startsWith("ORF_PUBLIC_CA_CERT="));
  if (caLine) lines.push(`NODE_EXTRA_CA_CERTS=${caLine.slice(caLine.indexOf("=") + 1)}`);
}
writeFileSync(environmentFile, `${lines.join("\n").replace(/\n+$/, "")}\n`, { mode: 0o600 });
NODE

if [[ ! -f "$runtime_root/data/github-sync-state.json" && -f "$repo_root/.artifacts/github-sync-state.json" ]]; then
  install -m 600 "$repo_root/.artifacts/github-sync-state.json" "$runtime_root/data/github-sync-state.json"
fi

install -m 644 "$repo_root/deploy/current-host/orf-backend-production.service" "$unit_root/orf-backend-production.service"
systemctl --user daemon-reload
systemctl --user enable orf-backend-production.service >/dev/null

echo "Installed ORF production runtime"
echo "  Node: $runtime_root/node"
echo "  Environment: $config_root/orf.env"
echo "  Unit: $unit_root/orf-backend-production.service"
