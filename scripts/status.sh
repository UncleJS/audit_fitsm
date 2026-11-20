#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 UncleJS
#
# Show the state of the systemd user services, the pod and its containers.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=scripts/common.sh
source scripts/common.sh

case "${1:-}" in
  "") ;;
  -h|--help) printf 'Usage: scripts/status.sh\n\nShows service, pod and container status.\n  -h, --help  show this help\n'; exit 0 ;;
  *) printf "Unknown option: %s\n" "$1" >&2; exit 2 ;;
esac

require_prereqs
services=("${POD_SERVICE}" "${DB_SERVICE}" "${DEV_SERVICE}" "${BUILD_SERVICE}")
phpmyadmin_installed && services+=("${PMA_SERVICE}")
systemctl --user status "${services[@]}" --no-pager || true
printf '\n'
podman pod ps --filter "name=^${POD_NAME}$"
podman ps -a --filter "pod=${POD_NAME}" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || true
