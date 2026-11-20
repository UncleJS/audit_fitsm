#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 UncleJS
#
# Remove stale runtime state (primary + CI containers/pods, CI volumes, built
# images) without touching Quadlet units or secrets. For a full cleanup use
# scripts/uninstall.sh.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=scripts/common.sh
source scripts/common.sh

usage() {
  printf "Usage: scripts/clean-old-runtime.sh [--purge-data]\n"
  printf "  default: stop services; remove pods, containers, CI volumes, built images\n"
  printf "  --purge-data: also remove primary named volumes (destructive)\n"
}

PURGE_DATA="false"
case "${1:-}" in
  "") ;;
  --purge-data) PURGE_DATA="true" ;;
  -h|--help) usage; exit 0 ;;
  *) printf "Unknown option: %s\n" "${1}" >&2; usage >&2; exit 2 ;;
esac

require_prereqs

log "stopping services"
stop_services
reset_failed_services

log "removing pods and containers"
for ctr in "${ALL_CONTAINERS[@]}"; do
  podman rm -f -v "${ctr}" >/dev/null 2>&1 || true
done
for pod in "${ALL_PODS[@]}"; do
  podman pod rm -f "${pod}" >/dev/null 2>&1 || true
done

log "removing CI volumes"
for vol in "${CI_VOLUMES[@]}"; do
  podman volume rm -f "${vol}" >/dev/null 2>&1 || true
done

log "removing built images"
for image in "${BUILT_IMAGES[@]}"; do
  podman image rm -f "${image}" >/dev/null 2>&1 || true
done
podman image prune -f --filter "label=${PROJECT_LABEL}" >/dev/null 2>&1 || true

if [[ "${PURGE_DATA}" == "true" ]]; then
  log "purging primary data volumes"
  for vol in "${VOLUME_NAMES[@]}"; do
    podman volume rm -f "${vol}" >/dev/null 2>&1 || true
  done
fi

log "runtime cleanup completed"
