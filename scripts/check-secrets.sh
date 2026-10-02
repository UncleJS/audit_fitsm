#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"

if rg -n --glob '!node_modules/**' --glob '!bun.lock' 'BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY' .; then
  printf "private key material found\n" >&2
  exit 1
fi

if rg -n --glob '!node_modules/**' --glob '!bun.lock' --glob '!docs/**' --glob '!*.md' --glob '!scripts/check-secrets.sh' 'JWT_SECRET=[^$"{][^[:space:]]+' . \
  | rg -v 'replace-with-strong-secret'; then
  printf "unexpected JWT_SECRET assignment\n" >&2
  exit 1
fi

printf "secret scan passed\n"
