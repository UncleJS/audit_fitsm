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

DEV_VOLUME_SERVICE="${PROJECT_PREFIX}-dev-volume.service"
DB_VOLUME_SERVICE="${PROJECT_PREFIX}-db-volume.service"
BUN_CACHE_VOLUME_SERVICE="${PROJECT_PREFIX}-bun-cache-volume.service"
EXPORTS_VOLUME_SERVICE="${PROJECT_PREFIX}-exports-volume.service"
BACKUPS_VOLUME_SERVICE="${PROJECT_PREFIX}-backups-volume.service"

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

STOPPABLE_SERVICES=(
  "${WEB_SERVICE}"
  "${API_SERVICE}"
  "${PHPMYADMIN_SERVICE}"
  "${DEV_SERVICE}"
  "${DB_SERVICE}"
  "${POD_SERVICE}"
  "${BUILD_SERVICE}"
)

DISABLABLE_SERVICES=(
  "${WEB_SERVICE}"
  "${API_SERVICE}"
  "${PHPMYADMIN_SERVICE}"
  "${DEV_SERVICE}"
  "${DB_SERVICE}"
  "${POD_SERVICE}"
  "${BUILD_SERVICE}"
  "${DEV_VOLUME_SERVICE}"
  "${DB_VOLUME_SERVICE}"
  "${BUN_CACHE_VOLUME_SERVICE}"
  "${EXPORTS_VOLUME_SERVICE}"
  "${BACKUPS_VOLUME_SERVICE}"
)

PRIMARY_PODS=(
  "${PROJECT_PREFIX}"
)

PRIMARY_CONTAINERS=(
  "${PROJECT_PREFIX}-dev"
  "${PROJECT_PREFIX}-db"
  "${PROJECT_PREFIX}-phpmyadmin"
)

PRIMARY_VOLUMES=(
  "${PROJECT_PREFIX}-dev"
  "${PROJECT_PREFIX}-db"
  "${PROJECT_PREFIX}-bun-cache"
  "${PROJECT_PREFIX}-exports"
  "${PROJECT_PREFIX}-backups"
)

PRIMARY_IMAGES=(
  "localhost/${PROJECT_PREFIX}-dev:latest"
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

reload_user_systemd() {
  systemctl --user daemon-reload
}

install_quadlets() {
  mkdir -p "${QUADLET_UNIT_DIR}"
  for file in "${QUADLET_FILES[@]}"; do
    cp "${PROJECT_ROOT}/.quadlet/${file}" "${QUADLET_UNIT_DIR}/${file}"
  done
}

install_app_units() {
  mkdir -p "${SYSTEMD_UNIT_DIR}"
  for file in "${APP_UNIT_FILES[@]}"; do
    cp "${PROJECT_ROOT}/.systemd/${file}" "${SYSTEMD_UNIT_DIR}/${file}"
  done
}

remove_quadlets() {
  for file in "${QUADLET_FILES[@]}"; do
    rm -f "${QUADLET_UNIT_DIR}/${file}"
  done
}

remove_app_units() {
  for file in "${APP_UNIT_FILES[@]}"; do
    rm -f "${SYSTEMD_UNIT_DIR}/${file}"
  done
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
  for svc in "${STOPPABLE_SERVICES[@]}"; do
    systemctl --user stop "${svc}" >/dev/null 2>&1 || true
  done
}

disable_services() {
  for svc in "${DISABLABLE_SERVICES[@]}"; do
    systemctl --user disable "${svc}" >/dev/null 2>&1 || true
  done
}

reset_service_state() {
  for svc in "${DISABLABLE_SERVICES[@]}"; do
    systemctl --user reset-failed "${svc}" >/dev/null 2>&1 || true
  done
}

remove_primary_runtime() {
  for pod in "${PRIMARY_PODS[@]}"; do
    podman pod rm -f "${pod}" >/dev/null 2>&1 || true
  done

  for ctr in "${PRIMARY_CONTAINERS[@]}"; do
    podman rm -f "${ctr}" >/dev/null 2>&1 || true
  done
}

remove_primary_images() {
  for image in "${PRIMARY_IMAGES[@]}"; do
    podman image rm -f "${image}" >/dev/null 2>&1 || true
  done
}

purge_primary_volumes() {
  for vol in "${PRIMARY_VOLUMES[@]}"; do
    podman volume rm -f "${vol}" >/dev/null 2>&1 || true
  done
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
