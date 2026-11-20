#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 UncleJS
#
# Stop the pod and all its services.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=scripts/common.sh
source scripts/common.sh

usage() {
  printf 'Usage: scripts/stop.sh\n\nStops all %s services (data volumes are kept).\n  -h, --help  show this help\n' "${PROJECT_PREFIX}"
}
case "${1:-}" in
  "") ;;
  -h|--help) usage; exit 0 ;;
  *) printf "Unknown option: %s\n" "$1" >&2; usage >&2; exit 2 ;;
esac

require_prereqs
stop_services
log "stopped"
