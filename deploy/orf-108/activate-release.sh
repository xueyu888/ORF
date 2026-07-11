#!/usr/bin/env bash

set -euo pipefail

verify_only=false
if [[ "${1:-}" == "--verify-only" ]]; then
  verify_only=true
  shift
fi

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 [--verify-only] /path/to/orf-<release-id>.tar.gz" >&2
  exit 2
fi

archive="$(realpath "$1")"
checksum_file="${archive}.sha256"
releases_root="${ORF_RELEASES_ROOT:-/mnt/data1/orf/releases}"
environment_file="${ORF_ENVIRONMENT_FILE:-/mnt/data1/orf/secrets/orf.env}"
node_bin="${ORF_NODE_BIN:-/opt/orf/node/bin/node}"
backend_unit="${ORF_BACKEND_SYSTEMD_UNIT:-orf-backend.service}"
health_url="${ORF_BACKEND_HEALTH_URL:-http://127.0.0.1:8787/health}"
incoming_dir=""

cleanup() {
  if [[ -n "$incoming_dir" ]]; then
    rm -rf "$incoming_dir"
  fi
}
trap cleanup EXIT

[[ -f "$archive" ]] || { echo "Release archive not found: $archive" >&2; exit 1; }
[[ -f "$checksum_file" ]] || { echo "Release checksum not found: $checksum_file" >&2; exit 1; }
[[ -x "$node_bin" ]] || { echo "Node runtime not executable: $node_bin" >&2; exit 1; }

(
  cd "$(dirname "$archive")"
  sha256sum --check "$(basename "$checksum_file")"
)

if [[ "$verify_only" == true ]]; then
  incoming_dir="$(mktemp -d "${TMPDIR:-/tmp}/orf-release-verify.XXXXXX")"
else
  mkdir -p "$releases_root"
  incoming_dir="$(mktemp -d "$releases_root/.incoming.XXXXXX")"
fi
tar --extract --gzip --file "$archive" --directory "$incoming_dir" --no-same-owner --no-same-permissions

release_id="$($node_bin --input-type=module - "$incoming_dir" <<'NODE'
import crypto from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const releaseRoot = process.argv[2];
const manifest = JSON.parse(await readFile(path.join(releaseRoot, "release.json"), "utf8"));
if (manifest.formatVersion !== 1 || !/^[0-9A-Za-z][0-9A-Za-z._-]{0,127}$/.test(manifest.releaseId)) {
  throw new Error("Invalid release manifest");
}
async function listFiles(directory, prefix = "") {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await listFiles(path.join(directory, entry.name), relativePath));
    else if (entry.isFile() && relativePath !== "release.json") files.push(relativePath);
    else if (!entry.isFile()) throw new Error(`Release contains special file: ${relativePath}`);
  }
  return files.sort();
}
const expectedFiles = Object.keys(manifest.files ?? {}).sort();
const actualFiles = await listFiles(releaseRoot);
if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) throw new Error("Release file list does not match manifest");
for (const [relativePath, expectedHash] of Object.entries(manifest.files ?? {})) {
  if (relativePath.includes("..") || path.isAbsolute(relativePath)) throw new Error(`Unsafe manifest path: ${relativePath}`);
  const hash = crypto.createHash("sha256");
  for await (const chunk of createReadStream(path.join(releaseRoot, relativePath))) hash.update(chunk);
  const actualHash = hash.digest("hex");
  if (actualHash !== expectedHash) throw new Error(`Artifact hash mismatch: ${relativePath}`);
}
console.log(manifest.releaseId);
NODE
)"

if [[ "$verify_only" == true ]]; then
  echo "Verified ORF release $release_id"
  exit 0
fi

[[ -f "$environment_file" ]] || { echo "Environment file not found: $environment_file" >&2; exit 1; }
target_dir="$releases_root/$release_id"
[[ ! -e "$target_dir" ]] || { echo "Immutable release already exists: $target_dir" >&2; exit 1; }
mv "$incoming_dir" "$target_dir"
incoming_dir=""
chmod -R a-w "$target_dir"

set -a
# target-env.example is intentionally shell-compatible as well as systemd-compatible.
# shellcheck disable=SC1090
source "$environment_file"
set +a

(
  cd "$target_dir"
  "$node_bin" migrate.mjs
)

previous_target="$(readlink "$releases_root/current" 2>/dev/null || true)"
next_link="$releases_root/.current-${release_id}"
ln -s "$release_id" "$next_link"
mv -Tf "$next_link" "$releases_root/current"

systemctl restart "$backend_unit"

healthy=false
for _ in $(seq 1 30); do
  if curl --fail --silent --show-error "$health_url" >/dev/null; then
    healthy=true
    break
  fi
  sleep 1
done

if [[ "$healthy" != true ]]; then
  echo "New release failed health check: $release_id" >&2
  if [[ -n "$previous_target" ]]; then
    rollback_link="$releases_root/.rollback-${release_id}"
    ln -s "$previous_target" "$rollback_link"
    mv -Tf "$rollback_link" "$releases_root/current"
    systemctl restart "$backend_unit"
    echo "Application symlink rolled back to $previous_target; database migrations are forward-only and were not reverted." >&2
  else
    rm -f "$releases_root/current"
    echo "No previous application release existed; removed the failed current pointer. Database migrations are forward-only and were not reverted." >&2
  fi
  exit 1
fi

echo "Activated ORF release $release_id"
echo "Previous release: ${previous_target:-none}"
echo "Current release: $releases_root/current"
