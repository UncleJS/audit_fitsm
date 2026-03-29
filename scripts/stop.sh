#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/_common.sh"

require_prereqs
stop_services
printf "Stopped %s services.\n" "${PROJECT_PREFIX}"
