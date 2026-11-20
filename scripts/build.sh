#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 UncleJS
#
# Build or rebuild the dev image (localhost/audit-fitsm-dev:latest).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=scripts/common.sh
source scripts/common.sh

usage() {
  cat <<'USAGE'
Usage: scripts/build.sh [--no-cache]

Builds the dev image through the Quadlet build unit (audit-fitsm-dev-build.service)
when it is installed, otherwise with podman build directly.
  --no-cache  build without the layer cache (uses podman build directly)
  -h, --help  show this help
Restart the stack afterwards (scripts/restart.sh) to run the new image.
USAGE
}

NO_CACHE="false"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-cache) NO_CACHE="true" ;;
    -h|--help) usage; exit 0 ;;
    *) printf "Unknown option: %s\n" "$1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

require_prereqs

if [[ "${NO_CACHE}" == "false" ]] && unit_installed "${BUILD_QUADLET_FILE}"; then
  log "building ${DEV_IMAGE} via ${BUILD_SERVICE}"
  # oneshot + RemainAfterExit: restart forces a fresh build run.
  systemctl --user restart "${BUILD_SERVICE}"
else
  args=(build --label "${PROJECT_LABEL}" --tag "${DEV_IMAGE}" --file Containerfile)
  [[ "${NO_CACHE}" == "true" ]] && args+=(--no-cache)
  log "building ${DEV_IMAGE} with podman build"
  podman "${args[@]}" .
fi
# Drop dangling layers left by earlier builds of this image only.
podman image prune -f --filter "label=${PROJECT_LABEL}" >/dev/null 2>&1 || true
log "image ready: ${DEV_IMAGE}"
