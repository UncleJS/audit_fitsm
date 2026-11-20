#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 UncleJS
#
# Stop, then start (calls stop.sh and start.sh).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

case "${1:-}" in
  "") ;;
  -h|--help) printf 'Usage: scripts/restart.sh\n\nRuns scripts/stop.sh, then scripts/start.sh.\n  -h, --help  show this help\n'; exit 0 ;;
  *) printf "Unknown option: %s\n" "$1" >&2; exit 2 ;;
esac

scripts/stop.sh
scripts/start.sh
