#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 UncleJS
#
# Fail if any of the given host ports is already in use. Ports published by the
# pod named with --allow-pod (this project's own pod) are not conflicts, so the
# lifecycle scripts stay idempotent while the stack is running.
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/preflight-ports.sh [--allow-pod NAME] [PORT ...]

Checks that each host PORT (default: 1260 1261) is free.
  --allow-pod NAME  treat ports published by podman pod NAME as OK
  -h, --help        show this help
USAGE
}

ALLOW_POD=""
PORTS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --allow-pod)
      [[ $# -ge 2 ]] || { usage >&2; exit 2; }
      ALLOW_POD="$2"
      shift 2
      ;;
    -*) printf "Unknown option: %s\n" "$1" >&2; usage >&2; exit 2 ;;
    *) PORTS+=("$1"); shift ;;
  esac
done
if [[ "${#PORTS[@]}" -eq 0 ]]; then
  PORTS=(1260 1261)
fi

is_port_in_use() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -H -ltn "sport = :${port}" | grep -q .
    return $?
  fi
  (echo >"/dev/tcp/127.0.0.1/${port}") >/dev/null 2>&1
}

# Host ports currently published by the allowed pod's infra container.
own_ports=" "
if [[ -n "${ALLOW_POD}" ]] && podman pod exists "${ALLOW_POD}" 2>/dev/null; then
  infra_id="$(podman pod inspect "${ALLOW_POD}" --format '{{.InfraContainerID}}' 2>/dev/null || true)"
  if [[ -n "${infra_id}" ]]; then
    while IFS= read -r line; do
      [[ -z "${line}" ]] && continue
      own_ports+="${line##*:} "
    done < <(podman port "${infra_id}" 2>/dev/null || true)
  fi
fi

in_use=()
for port in "${PORTS[@]}"; do
  if [[ ! "${port}" =~ ^[0-9]+$ ]] || (( port < 1 || port > 65535 )); then
    printf "Invalid port value: %s\n" "${port}" >&2
    exit 1
  fi
  if is_port_in_use "${port}"; then
    if [[ "${own_ports}" == *" ${port} "* ]]; then
      printf "Port %s is held by pod %s (ok)\n" "${port}" "${ALLOW_POD}"
      continue
    fi
    in_use+=("${port}")
  fi
done

if [[ "${#in_use[@]}" -gt 0 ]]; then
  printf "Port preflight failed. Host ports in use: %s\n" "${in_use[*]}" >&2
  printf "Inspect conflicts with:\n  scripts/ports.sh %s\n" "${in_use[*]}" >&2
  printf "Stop conflicting services, then retry.\n" >&2
  printf "For the CI strict test you can override ports, e.g.:\n" >&2
  printf "  APP_PORT=2261 WEB_PORT=2260 scripts/ci-strict.sh\n" >&2
  exit 1
fi

printf "Port preflight passed for host ports: %s\n" "${PORTS[*]}"
