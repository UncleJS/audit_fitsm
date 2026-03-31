#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "$0")" && pwd)/_common.sh"

require_prereqs

PURGE_DATA="false"
if [[ "${1:-}" == "--purge-data" ]]; then
  PURGE_DATA="true"
elif [[ "${1:-}" == "--help" ]]; then
  printf "Usage: scripts/clean-old-runtime.sh [--purge-data]\n"
  printf "  default: remove legacy/CI pods, containers, CI volumes, CI image\n"
  printf "  --purge-data: also remove primary named volumes (destructive)\n"
  exit 0
elif [[ -n "${1:-}" ]]; then
  printf "Unknown option: %s\n" "${1}" >&2
  printf "Usage: scripts/clean-old-runtime.sh [--purge-data]\n" >&2
  exit 1
fi

PODS=(
  "${PROJECT_PREFIX}-ci"
)

CONTAINERS=(
  "${PROJECT_PREFIX}-dev-ci"
  "${PROJECT_PREFIX}-db-ci"
)

CI_VOLUMES=(
  "${PROJECT_PREFIX}-dev-ci"
  "${PROJECT_PREFIX}-db-ci"
  "${PROJECT_PREFIX}-bun-cache-ci"
  "${PROJECT_PREFIX}-exports-ci"
  "${PROJECT_PREFIX}-backups-ci"
)

printf "Stopping user services (ignore if unavailable)...\n"
stop_services

printf "Removing primary runtime...\n"
remove_primary_runtime

printf "Removing CI pods...\n"
for pod in "${PODS[@]}"; do
  podman pod rm -f "${pod}" >/dev/null 2>&1 || true
done

printf "Removing CI containers...\n"
for ctr in "${CONTAINERS[@]}"; do
  podman rm -f "${ctr}" >/dev/null 2>&1 || true
done

printf "Removing CI volumes...\n"
for vol in "${CI_VOLUMES[@]}"; do
  podman volume rm -f "${vol}" >/dev/null 2>&1 || true
done

printf "Removing dev image tags...\n"
remove_primary_images
podman image rm -f "localhost/${PROJECT_PREFIX}-dev:ci" >/dev/null 2>&1 || true

if [[ "${PURGE_DATA}" == "true" ]]; then
  printf "Purging primary data volumes...\n"
  purge_primary_volumes
fi

printf "Runtime cleanup completed.\n"
