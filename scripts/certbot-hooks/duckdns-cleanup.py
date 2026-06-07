#!/usr/bin/env python3

import os
import urllib.parse
import urllib.request


def duckdns_subdomain(domain: str) -> str:
    domain = domain.strip().lower().removeprefix("https://").removeprefix("http://").split("/", 1)[0].split(":", 1)[0]
    suffix = ".duckdns.org"
    if not domain.endswith(suffix):
        raise SystemExit("ORF_DUCKDNS_DOMAIN must be a duckdns.org domain")
    subdomain = domain[: -len(suffix)]
    if not subdomain:
        raise SystemExit("ORF_DUCKDNS_DOMAIN is missing the DuckDNS subdomain")
    return subdomain


def clear_duckdns_txt(subdomain: str, token: str) -> None:
    query = urllib.parse.urlencode({
        "domains": subdomain,
        "token": token,
        "txt": "",
        "clear": "true",
        "verbose": "true",
    })
    with urllib.request.urlopen(f"https://www.duckdns.org/update?{query}", timeout=20) as response:
        body = response.read().decode("utf-8", errors="replace")
    if not body.startswith("OK"):
        raise SystemExit("DuckDNS TXT cleanup failed")


def main() -> None:
    domain = os.environ.get("ORF_DUCKDNS_DOMAIN") or os.environ.get("DUCKDNS_DOMAIN") or os.environ.get("CERTBOT_DOMAIN")
    token = os.environ.get("ORF_DUCKDNS_TOKEN") or os.environ.get("DUCKDNS_TOKEN")

    if not domain:
        raise SystemExit("ORF_DUCKDNS_DOMAIN is required")
    if not token:
        raise SystemExit("ORF_DUCKDNS_TOKEN is required")

    clear_duckdns_txt(duckdns_subdomain(domain), token)
    print("DuckDNS TXT challenge cleared.")


if __name__ == "__main__":
    main()
