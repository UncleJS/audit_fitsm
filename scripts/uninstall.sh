#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/_common.sh"

require_prereqs

PURGE_DATA="false"
if [[ "${1:-}" == "--purge-data" ]]; then
  PURGE_DATA="true"
fi

stop_services
disable_services
remove_primary_runtime
remove_primary_images
reset_service_state
remove_app_units
remove_quadlets
reload_user_systemd

if [[ "${PURGE_DATA}" == "true" ]]; then
  purge_primary_volumes
  printf "Uninstalled and purged data volumes.\n"
else
  printf "Uninstalled services. Data volumes preserved.\n"
  printf "Use --purge-data to remove named volumes.\n"
fi
