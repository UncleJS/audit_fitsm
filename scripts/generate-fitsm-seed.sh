#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 UncleJS
#
# Regenerate db/migrations/0017_fitsm6_catalog_seed.sql from the official FitSM-6 workbook.
# The generator runs inside the dev container; the workbook is podman cp'd in and the SQL copied back out.
set -euo pipefail
CALLER_PWD="${PWD}"
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=scripts/common.sh
source scripts/common.sh

usage() {
  cat <<USAGE
Usage: scripts/generate-fitsm-seed.sh [workbook-path]

Parses the FitSM-6 Assessment and Audit Tool workbook (.xlsx or .ods) in the
running dev container (${DEV_CONTAINER}) and writes ${FITSM_SEED_MIGRATION}.
  workbook-path  defaults to ${FITSM_WORKBOOK_BASENAME}.xlsx in the repo root,
                 falling back to the .ods
  -h, --help     show this help
The workbook is CC BY-ND 4.0: never commit it. Apply the result with scripts/migrate.sh.
USAGE
}

case "${1:-}" in
  -h|--help) usage; exit 0 ;;
esac
[[ $# -le 1 ]] || { usage >&2; exit 2; }

if [[ $# -eq 1 ]]; then
  WORKBOOK="$1"
  [[ "${WORKBOOK}" == /* ]] || WORKBOOK="${CALLER_PWD}/${WORKBOOK}"
else
  WORKBOOK="$(default_fitsm_workbook)" \
    || die "no workbook found; place ${FITSM_WORKBOOK_BASENAME}.xlsx (or .ods) in the repo root or pass a path"
fi

require_cmd podman
require_container_running "${DEV_CONTAINER}"

CTR_WORKBOOK="$(copy_workbook_into "${DEV_CONTAINER}" "${WORKBOOK}")"
CTR_SQL="${CONTAINER_TMP_PREFIX}-fitsm-seed-$$.sql"
cleanup() {
  remove_container_file "${DEV_CONTAINER}" "${CTR_WORKBOOK}"
  remove_container_file "${DEV_CONTAINER}" "${CTR_SQL}"
}
trap cleanup EXIT

log "generating ${FITSM_SEED_MIGRATION} from ${WORKBOOK}"
podman exec "${DEV_CONTAINER}" bun run --cwd /workspace/apps/api generate:fitsm-seed -- "${CTR_WORKBOOK}" "${CTR_SQL}"
podman cp "${DEV_CONTAINER}:${CTR_SQL}" "${FITSM_SEED_MIGRATION}"
log "wrote ${FITSM_SEED_MIGRATION}"
