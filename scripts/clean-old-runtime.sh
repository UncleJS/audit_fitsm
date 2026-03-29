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

SERVICES=(
  "${API_SERVICE}"
  "${WEB_SERVICE}"
  "${DEV_SERVICE}"
  "${DB_SERVICE}"
  "${POD_SERVICE}"
  "${BUILD_SERVICE}"
)

PODS=(
  "${PROJECT_PREFIX}"
  "${PROJECT_PREFIX}-ci"
)

CONTAINERS=(
  "${PROJECT_PREFIX}-dev"
  "${PROJECT_PREFIX}-db"
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

PRIMARY_VOLUMES=(
  "${PROJECT_PREFIX}-dev"
  "${PROJECT_PREFIX}-db"
  "${PROJECT_PREFIX}-bun-cache"
  "${PROJECT_PREFIX}-exports"
  "${PROJECT_PREFIX}-backups"
)

printf "Stopping user services (ignore if unavailable)...\n"
for svc in "${SERVICES[@]}"; do
  systemctl --user stop "${svc}" >/dev/null 2>&1 || true
done

printf "Removing pods...\n"
for pod in "${PODS[@]}"; do
  podman pod rm -f "${pod}" >/dev/null 2>&1 || true
done

printf "Removing containers...\n"
for ctr in "${CONTAINERS[@]}"; do
  podman rm -f "${ctr}" >/dev/null 2>&1 || true
done

printf "Removing CI volumes...\n"
for vol in "${CI_VOLUMES[@]}"; do
  podman volume rm -f "${vol}" >/dev/null 2>&1 || true
done

printf "Removing CI image tag...\n"
podman image rm -f "localhost/${PROJECT_PREFIX}-dev:ci" >/dev/null 2>&1 || true

if [[ "${PURGE_DATA}" == "true" ]]; then
  printf "Purging primary data volumes...\n"
  for vol in "${PRIMARY_VOLUMES[@]}"; do
    podman volume rm -f "${vol}" >/dev/null 2>&1 || true
  done
fi

printf "Runtime cleanup completed.\n"
