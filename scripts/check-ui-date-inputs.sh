#!/usr/bin/env bash
set -euo pipefail

ALLOWED_FILE="apps/web/app/components/date-only-input.tsx"

FORBIDDEN_MATCHES="$(rg -n -e 'type="date"' -e "type='date'" apps/web/app --glob '!node_modules/**' --glob "!${ALLOWED_FILE}" || true)"

if [[ -n "${FORBIDDEN_MATCHES}" ]]; then
  printf "❌ Forbidden raw date input usage found outside %s:\n" "${ALLOWED_FILE}" >&2
  printf "%s\n" "${FORBIDDEN_MATCHES}" >&2
  exit 1
fi

printf "✅ UI date input policy check passed.\n"
