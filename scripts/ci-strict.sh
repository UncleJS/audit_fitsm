#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

DB_HOST_PORT="${DB_PORT:-1262}"
APP_HOST_PORT="${APP_PORT:-1261}"
WEB_HOST_PORT="${WEB_PORT:-1260}"
INTERNAL_DB_PORT="3306"
INTERNAL_APP_PORT="1261"
INTERNAL_WEB_PORT="1260"

DB_USER="${DB_USER:-audit_app}"
DB_PASSWORD="${DB_PASSWORD:-change_me}"
DB_NAME="${DB_NAME:-audit_fitsm}"
DB_ROOT_PASSWORD="${DB_ROOT_PASSWORD:-change_root}"

JWT_SECRET="${JWT_SECRET:-replace-with-strong-secret}"
ALLOW_INSECURE_DEFAULTS="${ALLOW_INSECURE_DEFAULTS:-1}"
TEST_ADMIN_EMAIL="${TEST_ADMIN_EMAIL:-admin@example.com}"
TEST_ADMIN_PASSWORD="${TEST_ADMIN_PASSWORD:-ChangeMe123!}"

DEV_IMAGE="${DEV_IMAGE:-localhost/audit-fitsm-dev:ci}"
POD_NAME="${POD_NAME:-audit-fitsm-ci}"
DEV_CONTAINER="${DEV_CONTAINER:-audit-fitsm-dev-ci}"
DB_CONTAINER="${DB_CONTAINER:-audit-fitsm-db-ci}"

DEV_VOLUME="${DEV_VOLUME:-audit-fitsm-dev-ci}"
DB_VOLUME="${DB_VOLUME:-audit-fitsm-db-ci}"
BUN_CACHE_VOLUME="${BUN_CACHE_VOLUME:-audit-fitsm-bun-cache-ci}"
EXPORTS_VOLUME="${EXPORTS_VOLUME:-audit-fitsm-exports-ci}"
BACKUPS_VOLUME="${BACKUPS_VOLUME:-audit-fitsm-backups-ci}"

FITSM_ODS_PATH="${FITSM_ODS_PATH:-/workspace/FitSM-6_Assessment_and_Audit_Tool_V3.0.3.ods}"

cleanup() {
  if [[ "${KEEP_CONTAINERS:-0}" != "1" ]]; then
    podman logs "${DEV_CONTAINER}" >/tmp/audit-fitsm-dev.log 2>&1 || true
    podman logs "${DB_CONTAINER}" >/tmp/audit-fitsm-db.log 2>&1 || true

    podman rm -f "${DEV_CONTAINER}" >/dev/null 2>&1 || true
    podman rm -f "${DB_CONTAINER}" >/dev/null 2>&1 || true
    podman pod rm -f "${POD_NAME}" >/dev/null 2>&1 || true

    podman volume rm "${DEV_VOLUME}" >/dev/null 2>&1 || true
    podman volume rm "${DB_VOLUME}" >/dev/null 2>&1 || true
    podman volume rm "${BUN_CACHE_VOLUME}" >/dev/null 2>&1 || true
    podman volume rm "${EXPORTS_VOLUME}" >/dev/null 2>&1 || true
    podman volume rm "${BACKUPS_VOLUME}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

podman rm -f "${DEV_CONTAINER}" >/dev/null 2>&1 || true
podman rm -f "${DB_CONTAINER}" >/dev/null 2>&1 || true
podman pod rm -f "${POD_NAME}" >/dev/null 2>&1 || true
podman volume rm "${DEV_VOLUME}" >/dev/null 2>&1 || true
podman volume rm "${DB_VOLUME}" >/dev/null 2>&1 || true
podman volume rm "${BUN_CACHE_VOLUME}" >/dev/null 2>&1 || true
podman volume rm "${EXPORTS_VOLUME}" >/dev/null 2>&1 || true
podman volume rm "${BACKUPS_VOLUME}" >/dev/null 2>&1 || true

bash "${SCRIPT_DIR}/preflight-ports.sh" "${WEB_HOST_PORT}" "${APP_HOST_PORT}" "${DB_HOST_PORT}"

printf "[ci] building %s\n" "${DEV_IMAGE}"
podman build -t "${DEV_IMAGE}" -f Containerfile.dev .

printf "[ci] creating named volumes\n"
podman volume create "${DEV_VOLUME}" >/dev/null
podman volume create "${DB_VOLUME}" >/dev/null
podman volume create "${BUN_CACHE_VOLUME}" >/dev/null
podman volume create "${EXPORTS_VOLUME}" >/dev/null
podman volume create "${BACKUPS_VOLUME}" >/dev/null

printf "[ci] creating pod %s\n" "${POD_NAME}"
podman pod create --name "${POD_NAME}" \
  -p "127.0.0.1:${WEB_HOST_PORT}:${INTERNAL_WEB_PORT}" \
  -p "127.0.0.1:${APP_HOST_PORT}:${INTERNAL_APP_PORT}" \
  -p "127.0.0.1:${DB_HOST_PORT}:${INTERNAL_DB_PORT}" >/dev/null

printf "[ci] starting mariadb container\n"
podman run -d --name "${DB_CONTAINER}" \
  --pod "${POD_NAME}" \
  -e MARIADB_DATABASE="${DB_NAME}" \
  -e MARIADB_USER="${DB_USER}" \
  -e MARIADB_PASSWORD="${DB_PASSWORD}" \
  -e MARIADB_ROOT_PASSWORD="${DB_ROOT_PASSWORD}" \
  -v "${DB_VOLUME}:/var/lib/mysql:Z" \
  mariadb:11.4 >/dev/null

printf "[ci] starting dev container\n"
podman run -d --name "${DEV_CONTAINER}" \
  --pod "${POD_NAME}" \
  -e DB_HOST=127.0.0.1 \
  -e DB_PORT="${INTERNAL_DB_PORT}" \
  -e DB_USER="${DB_USER}" \
  -e DB_PASSWORD="${DB_PASSWORD}" \
  -e DB_NAME="${DB_NAME}" \
  -e JWT_SECRET="${JWT_SECRET}" \
  -e ALLOW_INSECURE_DEFAULTS="${ALLOW_INSECURE_DEFAULTS}" \
  -e APP_PORT="${INTERNAL_APP_PORT}" \
  -e EXPORTS_DIR=/workspace/data/exports \
  -e BACKUPS_DIR=/workspace/data/backups \
  -v "${DEV_VOLUME}:/workspace/.dev-volume:Z" \
  -v "${BUN_CACHE_VOLUME}:/root/.bun:Z" \
  -v "${EXPORTS_VOLUME}:/workspace/data/exports:Z" \
  -v "${BACKUPS_VOLUME}:/workspace/data/backups:Z" \
  "${DEV_IMAGE}" sleep infinity >/dev/null

printf "[ci] waiting for mariadb\n"
for _ in $(seq 1 60); do
  if podman exec "${DEV_CONTAINER}" mariadb \
    -h 127.0.0.1 \
    -P "${INTERNAL_DB_PORT}" \
    -u"${DB_USER}" \
    -p"${DB_PASSWORD}" \
    -D "${DB_NAME}" \
    -e "SELECT 1" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

printf "[ci] running migrations/bootstrap/import\n"
podman exec "${DEV_CONTAINER}" bun run --cwd /workspace/apps/api db:migrate
podman exec "${DEV_CONTAINER}" bun run --cwd /workspace/apps/api bootstrap:admin -- \
  "${TEST_ADMIN_EMAIL}" \
  "${TEST_ADMIN_PASSWORD}" \
  "CI Admin" \
  "CI Organization"

if podman exec "${DEV_CONTAINER}" test -f "${FITSM_ODS_PATH}"; then
  printf "[ci] importing FitSM workbook from %s\n" "${FITSM_ODS_PATH}"
  podman exec "${DEV_CONTAINER}" bun run --cwd /workspace/apps/api import:fitsm -- \
    "${FITSM_ODS_PATH}" \
    1 \
    1 \
    "CI Imported Audit"
else
  printf "[ci] FITSM workbook not found at %s; using minimal seeded catalog from migrations\n" "${FITSM_ODS_PATH}"
fi

printf "[ci] backup and restore smoke\n"
podman exec "${DEV_CONTAINER}" bun run --cwd /workspace/apps/api backup:db
podman exec "${DEV_CONTAINER}" sh -lc 'latest=$(ls -1t /workspace/data/backups/*.zip | head -1); test -n "$latest"; bun run --cwd /workspace/apps/api restore:db -- "$latest" --yes'

printf "[ci] production web build\n"
podman exec "${DEV_CONTAINER}" bun run --cwd /workspace/apps/web build

printf "[ci] starting api and web processes\n"
podman exec -d "${DEV_CONTAINER}" sh -lc "bun run --cwd /workspace/apps/api dev >/tmp/api.log 2>&1"
podman exec -d "${DEV_CONTAINER}" sh -lc "bun run --cwd /workspace/apps/web dev >/tmp/web.log 2>&1"

printf "[ci] running strict readiness and integration checks\n"
podman exec "${DEV_CONTAINER}" env \
  API_BASE_URL="http://127.0.0.1:${INTERNAL_APP_PORT}" \
  WEB_BASE_URL="http://127.0.0.1:${INTERNAL_WEB_PORT}" \
  TEST_ADMIN_EMAIL="${TEST_ADMIN_EMAIL}" \
  TEST_ADMIN_PASSWORD="${TEST_ADMIN_PASSWORD}" \
  bun run --cwd /workspace/apps/api health:readiness -- strict

printf "[ci] strict checks passed\n"
