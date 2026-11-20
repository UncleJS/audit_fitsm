#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 UncleJS
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

ALLOWED_FILE="apps/web/app/components/date-only-input.tsx"

FORBIDDEN_MATCHES="$(grep -rn -e 'type="date"' -e "type='date'" apps/web/app \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.next-dev \
  | grep -v "^${ALLOWED_FILE}:" || true)"

if [[ -n "${FORBIDDEN_MATCHES}" ]]; then
  printf "Forbidden raw date input usage found outside %s:\n" "${ALLOWED_FILE}" >&2
  printf "%s\n" "${FORBIDDEN_MATCHES}" >&2
  exit 1
fi

printf "UI date input policy check passed.\n"
