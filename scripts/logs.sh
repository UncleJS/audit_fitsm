#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 UncleJS
#
# Follow logs. The API and the web UI both run in the dev container
# (scripts/dev-entrypoint.sh), so api/web show the dev container output.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=scripts/common.sh
source scripts/common.sh

usage() {
  cat <<'USAGE'
Usage: scripts/logs.sh [pod|db|dev|api|web|pma|phpmyadmin|build|all] [--no-follow]

  pod          journal of audit-fitsm-pod-pod.service
  db           podman logs audit-fitsm-db
  dev|api|web  podman logs audit-fitsm-dev (API and web share this container)
  pma          podman logs audit-fitsm-phpmyadmin
  build        journal of audit-fitsm-dev-build.service
  all          journal of all units (default)
  --no-follow  print and exit instead of following
USAGE
}

TARGET="all"
FOLLOW=(-f)
for arg in "$@"; do
  case "${arg}" in
    -h|--help) usage; exit 0 ;;
    --no-follow) FOLLOW=() ;;
    pod|db|dev|api|web|pma|phpmyadmin|build|all) TARGET="${arg}" ;;
    *) usage >&2; exit 2 ;;
  esac
done

case "${TARGET}" in
  pod) journalctl --user -u "${POD_SERVICE}" "${FOLLOW[@]}" ;;
  build) journalctl --user -u "${BUILD_SERVICE}" "${FOLLOW[@]}" ;;
  db) podman logs "${FOLLOW[@]}" "${DB_CONTAINER}" ;;
  dev|api|web) podman logs "${FOLLOW[@]}" "${DEV_CONTAINER}" ;;
  pma|phpmyadmin) podman logs "${FOLLOW[@]}" "${PMA_CONTAINER}" ;;
  all)
    journalctl --user -u "${POD_SERVICE}" -u "${DB_SERVICE}" -u "${DEV_SERVICE}" \
      -u "${PMA_SERVICE}" -u "${BUILD_SERVICE}" "${FOLLOW[@]}"
    ;;
esac
