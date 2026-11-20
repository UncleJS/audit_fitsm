#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 UncleJS
#
# Fail on committed private keys or hard-coded secret assignments.
# Allowed values: shell/CI expansions ($VAR, ${VAR}, ${{ ... }}) and <placeholders>.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

EXCLUDES=(
  --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.next-dev
  --exclude-dir=docs --exclude=bun.lock --exclude='*.md' --exclude='*.tsbuildinfo'
  --exclude=check-secrets.sh
)
status=0

if grep -rnIE "${EXCLUDES[@]}" -e '-----BEGIN ([A-Z]+ )?PRIVATE KEY-----' .; then
  printf "private key material found\n" >&2
  status=1
fi

SECRET_VARS='(MARIADB_PASSWORD|MARIADB_ROOT_PASSWORD|DB_PASSWORD|DB_ROOT_PASSWORD|JWT_SECRET|BOOTSTRAP_ADMIN_PASSWORD|TEST_ADMIN_PASSWORD)'
# NAME=value (any file) or NAME: value (YAML) where value is a literal, not
# $..., <...>, a comparison (==) or empty. Quotes around the value are allowed.
VALUE="[[:space:]]*[\"']?[^\"'\$<=[:space:]{}()]"
ASSIGN="(^|[^A-Za-z0-9_.])${SECRET_VARS}[[:space:]]*=${VALUE}"
YAML_KEY="(^|[[:space:]-])${SECRET_VARS}:[[:space:]]${VALUE}"

if {
  grep -rnIE "${EXCLUDES[@]}" -e "${ASSIGN}" . || true
  grep -rnIE --include="*.yml" --include="*.yaml" "${EXCLUDES[@]}" -e "${YAML_KEY}" . || true
} | grep -vE 'process\.env|Bun\.env|=\.\.\.|^[^:]+:[0-9]+:[[:space:]]*(#|//)' | grep .; then
  printf "hard-coded secret assignment found (use Podman secrets or env expansion)\n" >&2
  status=1
fi

[[ "${status}" -eq 0 ]] && printf "secret scan passed\n"
exit "${status}"
