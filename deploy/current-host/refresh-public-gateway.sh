#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
runtime_root="${ORF_CURRENT_HOST_RUNTIME_ROOT:-$HOME/.local/share/orf-production}"
config_root="${ORF_CURRENT_HOST_CONFIG_ROOT:-$HOME/.config/orf}"
environment_file="${ORF_ENVIRONMENT_FILE:-$config_root/orf.env}"
health_url="${ORF_PUBLIC_GATEWAY_HEALTH_URL:-https://127.0.0.1:8443/health}"
expected_web_dir="$runtime_root/releases/current/web"

[[ -f "$environment_file" ]] || { echo "Runtime environment not found: $environment_file" >&2; exit 1; }
[[ -d "$expected_web_dir" ]] || { echo "Current release web directory not found: $expected_web_dir" >&2; exit 1; }

compose_command=(
  docker compose
  --env-file "$environment_file"
  -f "$repo_root/docker-compose.ory.yml"
  -f "$repo_root/docker-compose.minio.yml"
  -f "$repo_root/docker-compose.public.yml"
)

"${compose_command[@]}" up -d --no-deps --force-recreate public-gateway

container_id="$("${compose_command[@]}" ps -q public-gateway)"
[[ -n "$container_id" ]] || { echo "public-gateway container was not created" >&2; exit 1; }

mounted_web_dir="$(docker inspect "$container_id" --format '{{range .Mounts}}{{if eq .Destination "/usr/share/nginx/orf/dist"}}{{.Source}}{{end}}{{end}}')"
[[ -n "$mounted_web_dir" ]] || { echo "public-gateway is missing the ORF web mount" >&2; exit 1; }
[[ "$(realpath "$mounted_web_dir")" == "$(realpath "$expected_web_dir")" ]] || {
  echo "public-gateway web mount does not match the current release" >&2
  echo "Expected: $(realpath "$expected_web_dir")" >&2
  echo "Actual: $(realpath "$mounted_web_dir")" >&2
  exit 1
}

for _ in $(seq 1 30); do
  if curl --fail --silent --show-error --insecure --max-time 5 "$health_url" >/dev/null; then
    echo "public-gateway now serves $(realpath "$expected_web_dir")"
    exit 0
  fi
  sleep 1
done

echo "public-gateway failed health check: $health_url" >&2
exit 1
