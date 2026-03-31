#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/_common.sh"

require_prereqs
"${PROJECT_ROOT}/scripts/preflight-ports.sh" 1260 1261 1262 1263
install_quadlets
install_app_units
reload_user_systemd
start_services

printf "Installed and started %s services.\n" "${PROJECT_PREFIX}"
printf "Next:\n"
printf "  scripts/migrate.sh\n"
printf "  scripts/bootstrap-admin.sh <email> <password> [display-name] [org-name]\n"
printf "  scripts/import-fitsm.sh [org-id] [user-id] [audit-name]\n"
