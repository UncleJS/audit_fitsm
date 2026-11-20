#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 UncleJS
#
# Container-first strict CI: build the image, run MariaDB + dev container in a
# throwaway pod, migrate/bootstrap/import, backup/restore, web build, then the
# strict readiness checks. All credentials are random per run (Podman secrets).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# Capture caller port overrides before common.sh assigns the defaults.
CI_APP_PORT_OVERRIDE="${APP_PORT:-}"
CI_WEB_PORT_OVERRIDE="${WEB_PORT:-}"
# shellcheck source=scripts/common.sh
source scripts/common.sh

case "${1:-}" in
  "") ;;
  -h|--help)
    printf 'Usage: scripts/ci-strict.sh\n\nEnv: APP_PORT (1261), WEB_PORT (1260), TEST_ADMIN_EMAIL,\n'
    printf '     TEST_ADMIN_PASSWORD (random if unset), KEEP_CONTAINERS=1 to keep the pod.\n'
    exit 0
    ;;
  *) printf "Unknown option: %s\n" "$1" >&2; exit 2 ;;
esac

APP_HOST_PORT="${CI_APP_PORT_OVERRIDE:-1261}"
WEB_HOST_PORT="${CI_WEB_PORT_OVERRIDE:-1260}"
INTERNAL_DB_PORT="3306"
INTERNAL_APP_PORT="1261"
INTERNAL_WEB_PORT="1260"

DB_USER="audit_app"
DB_NAME="audit_fitsm"

TEST_ADMIN_EMAIL="${TEST_ADMIN_EMAIL:-admin@example.com}"
if [[ -z "${TEST_ADMIN_PASSWORD:-}" ]]; then
  TEST_ADMIN_PASSWORD="$(random_secret)"
  TEST_ADMIN_PASSWORD="${TEST_ADMIN_PASSWORD:0:24}"
fi
export TEST_ADMIN_PASSWORD

CI_DEV_IMAGE="${CI_IMAGE}"
CI_POD="${CI_POD_NAME}"
DEV_CTR="${PROJECT_PREFIX}-dev-ci"
DB_CTR="${PROJECT_PREFIX}-db-ci"
DEV_VOLUME="${PROJECT_PREFIX}-dev-ci"
DB_VOLUME="${PROJECT_PREFIX}-db-ci"
BUN_CACHE_VOLUME="${PROJECT_PREFIX}-bun-cache-ci"
EXPORTS_VOLUME="${PROJECT_PREFIX}-exports-ci"
BACKUPS_VOLUME="${PROJECT_PREFIX}-backups-ci"
CI_DB_PASSWORD_SECRET="${CI_SECRETS[0]}"
CI_DB_ROOT_SECRET="${CI_SECRETS[1]}"
CI_JWT_SECRET="${CI_SECRETS[2]}"

FITSM_ODS_PATH="${FITSM_ODS_PATH:-/workspace/FitSM-6_Assessment_and_Audit_Tool_V3.0.3.ods}"

remove_ci_resources() {
  podman rm -f -v "${DEV_CTR}" "${DB_CTR}" >/dev/null 2>&1 || true
  podman pod rm -f "${CI_POD}" >/dev/null 2>&1 || true
  podman volume rm -f "${DEV_VOLUME}" "${DB_VOLUME}" "${BUN_CACHE_VOLUME}" \
    "${EXPORTS_VOLUME}" "${BACKUPS_VOLUME}" >/dev/null 2>&1 || true
  podman secret rm "${CI_DB_PASSWORD_SECRET}" "${CI_DB_ROOT_SECRET}" "${CI_JWT_SECRET}" >/dev/null 2>&1 || true
}

on_exit() {
  local rc=$?
  if [[ "${rc}" -ne 0 ]]; then
    printf '\n[ci] FAILED (exit %s). Container logs follow.\n' "${rc}" >&2
    for f in /tmp/api.log /tmp/web.log; do
      printf '\n===== %s (%s) =====\n' "${f}" "${DEV_CTR}" >&2
      podman exec "${DEV_CTR}" sh -c "tail -n 200 ${f}" >&2 2>/dev/null || printf '(not available)\n' >&2
    done
    printf '\n===== podman logs %s =====\n' "${DEV_CTR}" >&2
    podman logs --tail 200 "${DEV_CTR}" >&2 2>/dev/null || true
    printf '\n===== podman logs %s =====\n' "${DB_CTR}" >&2
    podman logs --tail 200 "${DB_CTR}" >&2 2>/dev/null || true
  fi
  if [[ "${KEEP_CONTAINERS:-0}" != "1" ]]; then
    remove_ci_resources
  fi
  exit "${rc}"
}
trap on_exit EXIT

remove_ci_resources

"${PROJECT_ROOT}/scripts/preflight-ports.sh" "${WEB_HOST_PORT}" "${APP_HOST_PORT}"

printf "[ci] creating random per-run secrets\n"
for s in "${CI_DB_PASSWORD_SECRET}" "${CI_DB_ROOT_SECRET}" "${CI_JWT_SECRET}"; do
  random_secret | podman secret create --label "${PROJECT_LABEL}" "${s}" - >/dev/null
done

printf "[ci] building %s\n" "${CI_DEV_IMAGE}"
podman build --label "${PROJECT_LABEL}" -t "${CI_DEV_IMAGE}" -f Containerfile .

printf "[ci] creating named volumes\n"
for v in "${DEV_VOLUME}" "${DB_VOLUME}" "${BUN_CACHE_VOLUME}" "${EXPORTS_VOLUME}" "${BACKUPS_VOLUME}"; do
  podman volume create --label "${PROJECT_LABEL}" "${v}" >/dev/null
done

printf "[ci] creating pod %s (MariaDB is not published)\n" "${CI_POD}"
podman pod create --name "${CI_POD}" --label "${PROJECT_LABEL}" \
  -p "127.0.0.1:${WEB_HOST_PORT}:${INTERNAL_WEB_PORT}" \
  -p "127.0.0.1:${APP_HOST_PORT}:${INTERNAL_APP_PORT}" >/dev/null

printf "[ci] starting mariadb container\n"
podman run -d --name "${DB_CTR}" \
  --pod "${CI_POD}" \
  --label "${PROJECT_LABEL}" \
  -e TZ=UTC \
  -e MARIADB_AUTO_UPGRADE=1 \
  -e MARIADB_DATABASE="${DB_NAME}" \
  -e MARIADB_USER="${DB_USER}" \
  --secret "${CI_DB_PASSWORD_SECRET},type=env,target=MARIADB_PASSWORD" \
  --secret "${CI_DB_ROOT_SECRET},type=env,target=MARIADB_ROOT_PASSWORD" \
  --health-cmd "healthcheck.sh --connect --innodb_initialized" \
  --health-interval 5s \
  -v "${DB_VOLUME}:/var/lib/mysql:Z" \
  "${MARIADB_IMAGE}" --default-time-zone=+00:00 >/dev/null

printf "[ci] starting dev container\n"
podman run -d --name "${DEV_CTR}" \
  --pod "${CI_POD}" \
  --label "${PROJECT_LABEL}" \
  -e TZ=UTC \
  -e DB_HOST=127.0.0.1 \
  -e DB_PORT="${INTERNAL_DB_PORT}" \
  -e DB_USER="${DB_USER}" \
  -e DB_NAME="${DB_NAME}" \
  -e APP_PORT="${INTERNAL_APP_PORT}" \
  -e EXPORTS_DIR=/workspace/data/exports \
  -e BACKUPS_DIR=/workspace/data/backups \
  --secret "${CI_DB_PASSWORD_SECRET},type=env,target=DB_PASSWORD" \
  --secret "${CI_JWT_SECRET},type=env,target=JWT_SECRET" \
  -v "${DEV_VOLUME}:/workspace/.dev-volume:Z,U" \
  -v "${BUN_CACHE_VOLUME}:/home/app/.bun/install/cache:Z,U" \
  -v "${EXPORTS_VOLUME}:/workspace/data/exports:Z,U" \
  -v "${BACKUPS_VOLUME}:/workspace/data/backups:Z,U" \
  "${CI_DEV_IMAGE}" sleep infinity >/dev/null

printf "[ci] waiting for mariadb health\n"
healthy="false"
for _ in $(seq 1 90); do
  if podman healthcheck run "${DB_CTR}" >/dev/null 2>&1; then
    healthy="true"
    break
  fi
  sleep 2
done
[[ "${healthy}" == "true" ]] || die "mariadb did not become healthy"

printf "[ci] running migrations/bootstrap/import\n"
podman exec "${DEV_CTR}" bun run --cwd /workspace/apps/api db:migrate
podman exec -e BOOTSTRAP_ADMIN_PASSWORD="${TEST_ADMIN_PASSWORD}" "${DEV_CTR}" \
  bun run --cwd /workspace/apps/api bootstrap:admin -- \
  "${TEST_ADMIN_EMAIL}" \
  "" \
  "CI Admin" \
  "CI Organization"

if podman exec "${DEV_CTR}" test -f "${FITSM_ODS_PATH}"; then
  printf "[ci] importing FitSM workbook from %s\n" "${FITSM_ODS_PATH}"
  podman exec "${DEV_CTR}" bun run --cwd /workspace/apps/api import:fitsm -- \
    "${FITSM_ODS_PATH}" \
    1 \
    1 \
    "CI Imported Audit"
else
  printf "[ci] FITSM workbook not found at %s; using minimal seeded catalog from migrations\n" "${FITSM_ODS_PATH}"
fi

printf "[ci] backup and restore smoke\n"
podman exec "${DEV_CTR}" bun run --cwd /workspace/apps/api backup:db
podman exec "${DEV_CTR}" sh -lc 'latest=$(ls -1t /workspace/data/backups/*.zip | head -1); test -n "$latest"; bun run --cwd /workspace/apps/api restore:db -- "$latest" --yes'

printf "[ci] production web build\n"
podman exec "${DEV_CTR}" bun run --cwd /workspace/apps/web build

printf "[ci] starting api and web processes\n"
podman exec -d "${DEV_CTR}" sh -lc "bun run --cwd /workspace/apps/api dev >/tmp/api.log 2>&1"
podman exec -d "${DEV_CTR}" sh -lc "bun run --cwd /workspace/apps/web dev >/tmp/web.log 2>&1"

printf "[ci] running strict readiness and integration checks\n"
podman exec \
  -e API_BASE_URL="http://127.0.0.1:${INTERNAL_APP_PORT}" \
  -e WEB_BASE_URL="http://127.0.0.1:${INTERNAL_WEB_PORT}" \
  -e TEST_ADMIN_EMAIL="${TEST_ADMIN_EMAIL}" \
  -e TEST_ADMIN_PASSWORD \
  "${DEV_CTR}" \
  bun run --cwd /workspace/apps/api health:readiness -- strict

printf "[ci] strict checks passed\n"
