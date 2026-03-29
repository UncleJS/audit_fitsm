#!/usr/bin/env bash
set -euo pipefail

PORTS=("$@")
if [[ "${#PORTS[@]}" -eq 0 ]]; then
  PORTS=(1260 1261 1262 1263)
fi

is_port_in_use() {
  local port="$1"

  if command -v ss >/dev/null 2>&1; then
    ss -H -ltn "sport = :${port}" | grep -q .
    return $?
  fi

  (echo >"/dev/tcp/127.0.0.1/${port}") >/dev/null 2>&1
}

in_use=()

for port in "${PORTS[@]}"; do
  if [[ ! "${port}" =~ ^[0-9]+$ ]]; then
    printf "Invalid port value: %s\n" "${port}" >&2
    exit 1
  fi
  if (( port < 1 || port > 65535 )); then
    printf "Port out of range (1-65535): %s\n" "${port}" >&2
    exit 1
  fi

  if is_port_in_use "${port}"; then
    in_use+=("${port}")
  fi
done

if [[ "${#in_use[@]}" -gt 0 ]]; then
  printf "❌ Port preflight failed. Host ports in use: %s\n" "${in_use[*]}" >&2
  printf "Inspect conflicts with:\n" >&2
  printf "  scripts/ports.sh %s\n" "${in_use[*]}" >&2
  printf "Stop conflicting services, then retry.\n" >&2
  printf "For CI/local strict test you can override ports, e.g.:\n" >&2
  printf "  DB_PORT=2262 APP_PORT=2261 WEB_PORT=2260 bash ./scripts/ci-strict.sh\n" >&2
  exit 1
fi

printf "✅ Port preflight passed for host ports: %s\n" "${PORTS[*]}"
