#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 UncleJS
#
# Start the pod and its services, then print the URLs.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=scripts/common.sh
source scripts/common.sh

usage() {
  cat <<'USAGE'
Usage: scripts/start.sh

Starts audit-fitsm-pod, MariaDB, the dev container (builds the image first if
needed) and phpMyAdmin when its unit is installed.
  -h, --help  show this help
USAGE
}
case "${1:-}" in
  "") ;;
  -h|--help) usage; exit 0 ;;
  *) printf "Unknown option: %s\n" "$1" >&2; usage >&2; exit 2 ;;
esac

require_prereqs
require_installed
require_secrets
preflight_ports

services=("${POD_SERVICE}" "${DB_SERVICE}" "${DEV_SERVICE}")
phpmyadmin_installed && services+=("${PMA_SERVICE}")
log "starting ${services[*]} (the first start builds the image and may take a few minutes)"
systemctl --user start "${services[@]}"

log "started"
print_urls
