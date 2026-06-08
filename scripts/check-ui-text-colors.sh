#!/usr/bin/env bash
set -euo pipefail

# High-contrast dark theme: ALL text must use text-foreground (or an accent
# token), never muted/gray/zinc/slate text colors.
FORBIDDEN_MATCHES="$(rg -n -e 'text-slate-[0-9]+' -e 'text-zinc-[0-9]+' -e 'text-gray-[0-9]+' -e 'text-muted-foreground' apps/web/app --glob '!node_modules/**' || true)"

if [[ -n "${FORBIDDEN_MATCHES}" ]]; then
  printf "❌ Forbidden text color classes found (use text-foreground):\n" >&2
  printf "%s\n" "${FORBIDDEN_MATCHES}" >&2
  exit 1
fi

printf "✅ UI text color policy check passed.\n"
