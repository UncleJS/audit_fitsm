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

printf "Port diagnostics (host listeners + Podman mappings)\n"

for port in "${PORTS[@]}"; do
  if [[ ! "${port}" =~ ^[0-9]+$ ]] || (( port < 1 || port > 65535 )); then
    printf "\n[%s] invalid port\n" "${port}"
    continue
  fi

  printf "\n[%s]\n" "${port}"
  if is_port_in_use "${port}"; then
    printf -- "- host listener: in use\n"
    if command -v ss >/dev/null 2>&1; then
      ss -H -ltn "sport = :${port}" | sed 's/^/  /'
    fi
  else
    printf -- "- host listener: free\n"
  fi

  printf -- "- podman mappings:\n"
  found_mapping=0
  while IFS= read -r line; do
    [[ -z "${line}" ]] && continue
    if [[ "${line}" == *":${port}->"* || "${line}" == *":${port}/"* || "${line}" == *":${port},"* ]]; then
      printf "  %s\n" "${line}"
      found_mapping=1
    fi
  done < <(podman ps --format '{{.Names}} | {{.Ports}}' 2>/dev/null || true)

  if [[ "${found_mapping}" -eq 0 ]]; then
    printf "  (none)\n"
  fi
done
