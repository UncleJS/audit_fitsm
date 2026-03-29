#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/_common.sh"

require_prereqs

PURGE_DATA="false"
if [[ "${1:-}" == "--purge-data" ]]; then
  PURGE_DATA="true"
fi

stop_services
remove_app_units
remove_quadlets

if [[ "${PURGE_DATA}" == "true" ]]; then
  podman volume rm -f \
    "${PROJECT_PREFIX}-dev" \
    "${PROJECT_PREFIX}-db" \
    "${PROJECT_PREFIX}-bun-cache" \
    "${PROJECT_PREFIX}-exports" \
    "${PROJECT_PREFIX}-backups" || true
  printf "Uninstalled and purged data volumes.\n"
else
  printf "Uninstalled services. Data volumes preserved.\n"
  printf "Use --purge-data to remove named volumes.\n"
fi
