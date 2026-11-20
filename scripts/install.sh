#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 UncleJS
#
# Check prerequisites, create Podman secrets, copy the Quadlet units to
# ~/.config/containers/systemd/, daemon-reload and build the dev image.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=scripts/common.sh
source scripts/common.sh

usage() {
  cat <<'USAGE'
Usage: scripts/install.sh [--with-phpmyadmin] [--start] [--no-build]

  --with-phpmyadmin  also install phpMyAdmin (http://127.0.0.1:1263) and the
                     pod drop-in that publishes its port. Without this flag a
                     previously installed phpMyAdmin unit is removed.
  --start            run scripts/start.sh after installing
  --no-build         skip building the dev image now (start builds it anyway)
  -h, --help         show this help
USAGE
}

WITH_PMA="false"
DO_START="false"
DO_BUILD="true"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-phpmyadmin) WITH_PMA="true" ;;
    --start) DO_START="true" ;;
    --no-build) DO_BUILD="false" ;;
    -h|--help) usage; exit 0 ;;
    *) printf "Unknown option: %s\n" "$1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

require_prereqs
preflight_ports

log "creating Podman secrets (if missing)"
ensure_secrets

log "installing Quadlet units to ${QUADLET_UNIT_DIR}"
install_core_quadlets
if [[ "${WITH_PMA}" == "true" ]]; then
  install_pma_quadlets
  log "phpMyAdmin units installed"
elif phpmyadmin_installed; then
  systemctl --user stop "${PMA_SERVICE}" >/dev/null 2>&1 || true
  remove_pma_quadlets
  log "phpMyAdmin units removed (re-run with --with-phpmyadmin to keep them)"
fi
reload_user_systemd

if [[ "${DO_BUILD}" == "true" ]]; then
  "${PROJECT_ROOT}/scripts/build.sh"
fi

log "installed"
if [[ "${DO_START}" == "true" ]]; then
  "${PROJECT_ROOT}/scripts/start.sh"
else
  printf 'Next:\n'
  printf '  scripts/start.sh\n'
  printf '  scripts/migrate.sh\n'
  printf '  scripts/bootstrap-admin.sh <email> [display-name] [org-name]\n'
  printf '  scripts/import-fitsm.sh [org-id] [user-id] [audit-name]\n'
fi
