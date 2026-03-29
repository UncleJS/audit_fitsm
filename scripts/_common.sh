#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QUADLET_UNIT_DIR="${HOME}/.config/containers/systemd"
SYSTEMD_UNIT_DIR="${HOME}/.config/systemd/user"
PROJECT_PREFIX="audit-fitsm"

DB_SERVICE="${PROJECT_PREFIX}-db.service"
DEV_SERVICE="${PROJECT_PREFIX}-dev.service"
BUILD_SERVICE="${PROJECT_PREFIX}-dev-build.service"
POD_SERVICE="${PROJECT_PREFIX}-pod-pod.service"
API_SERVICE="${PROJECT_PREFIX}-api.service"
WEB_SERVICE="${PROJECT_PREFIX}-web.service"
PHPMYADMIN_SERVICE="${PROJECT_PREFIX}-phpmyadmin.service"

QUADLET_FILES=(
  "${PROJECT_PREFIX}-pod.pod"
  "${PROJECT_PREFIX}-db.container"
  "${PROJECT_PREFIX}-dev.container"
  "${PROJECT_PREFIX}-phpmyadmin.container"
  "${PROJECT_PREFIX}-dev.build"
  "${PROJECT_PREFIX}-dev.volume"
  "${PROJECT_PREFIX}-db.volume"
  "${PROJECT_PREFIX}-bun-cache.volume"
  "${PROJECT_PREFIX}-exports.volume"
  "${PROJECT_PREFIX}-backups.volume"
)

APP_UNIT_FILES=(
  "${PROJECT_PREFIX}-api.service"
  "${PROJECT_PREFIX}-web.service"
)

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    printf "Missing required command: %s\n" "$1" >&2
    exit 1
  }
}

require_prereqs() {
  require_cmd podman
  require_cmd systemctl
}

install_quadlets() {
  mkdir -p "${QUADLET_UNIT_DIR}"
  for file in "${QUADLET_FILES[@]}"; do
    cp "${PROJECT_ROOT}/.quadlet/${file}" "${QUADLET_UNIT_DIR}/${file}"
  done
  systemctl --user daemon-reload
}

install_app_units() {
  mkdir -p "${SYSTEMD_UNIT_DIR}"
  for file in "${APP_UNIT_FILES[@]}"; do
    cp "${PROJECT_ROOT}/.systemd/${file}" "${SYSTEMD_UNIT_DIR}/${file}"
  done
  systemctl --user daemon-reload
}

remove_quadlets() {
  for file in "${QUADLET_FILES[@]}"; do
    rm -f "${QUADLET_UNIT_DIR}/${file}"
  done
  systemctl --user daemon-reload
}

remove_app_units() {
  for file in "${APP_UNIT_FILES[@]}"; do
    rm -f "${SYSTEMD_UNIT_DIR}/${file}"
  done
  systemctl --user daemon-reload
}

start_services() {
  systemctl --user start "${BUILD_SERVICE}"
  systemctl --user start "${POD_SERVICE}"
  systemctl --user start "${DB_SERVICE}"
  systemctl --user start "${PHPMYADMIN_SERVICE}"
  systemctl --user start "${DEV_SERVICE}"
  systemctl --user start "${API_SERVICE}"
  systemctl --user start "${WEB_SERVICE}"
}

stop_services() {
  systemctl --user stop "${WEB_SERVICE}" || true
  systemctl --user stop "${API_SERVICE}" || true
  systemctl --user stop "${PHPMYADMIN_SERVICE}" || true
  systemctl --user stop "${DEV_SERVICE}" || true
  systemctl --user stop "${DB_SERVICE}" || true
  systemctl --user stop "${POD_SERVICE}" || true
}

status_services() {
  systemctl --user status \
    "${POD_SERVICE}" \
    "${DB_SERVICE}" \
    "${PHPMYADMIN_SERVICE}" \
    "${DEV_SERVICE}" \
    "${API_SERVICE}" \
    "${WEB_SERVICE}" \
    --no-pager
}
