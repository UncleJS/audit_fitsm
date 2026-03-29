#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/_common.sh"

require_prereqs
"${PROJECT_ROOT}/scripts/preflight-ports.sh" 1260 1261 1262
start_services
printf "Started %s services.\n" "${PROJECT_PREFIX}"
