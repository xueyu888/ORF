#!/usr/bin/env python3

import os
import time
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


def update_duckdns_txt(subdomain: str, token: str, validation: str) -> None:
    query = urllib.parse.urlencode({
        "domains": subdomain,
        "token": token,
        "txt": validation,
        "verbose": "true",
    })
    with urllib.request.urlopen(f"https://www.duckdns.org/update?{query}", timeout=20) as response:
        body = response.read().decode("utf-8", errors="replace")
    if not body.startswith("OK"):
        raise SystemExit("DuckDNS TXT update failed")


def main() -> None:
    domain = os.environ.get("ORF_DUCKDNS_DOMAIN") or os.environ.get("DUCKDNS_DOMAIN") or os.environ.get("CERTBOT_DOMAIN")
    token = os.environ.get("ORF_DUCKDNS_TOKEN") or os.environ.get("DUCKDNS_TOKEN")
    validation = os.environ.get("CERTBOT_VALIDATION")
    propagation_seconds = int(os.environ.get("ORF_DUCKDNS_PROPAGATION_SECONDS", "120"))

    if not domain:
        raise SystemExit("ORF_DUCKDNS_DOMAIN is required")
    if not token:
        raise SystemExit("ORF_DUCKDNS_TOKEN is required")
    if not validation:
        raise SystemExit("CERTBOT_VALIDATION is required")

    update_duckdns_txt(duckdns_subdomain(domain), token, validation)
    print("DuckDNS TXT challenge updated; waiting for DNS propagation.")
    time.sleep(max(0, propagation_seconds))


if __name__ == "__main__":
    main()
