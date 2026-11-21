#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 UncleJS
#
# Import a filled-in FitSM-6 workbook (.xlsx or .ods) as a new draft audit, refreshing the catalog on the way.
# The workbook is podman cp'd into the running dev container and removed again afterwards.
set -euo pipefail
CALLER_PWD="${PWD}"
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=scripts/common.sh
source scripts/common.sh

usage() {
  cat <<USAGE
Usage: scripts/import-fitsm.sh [--file PATH] [org-id] [user-id] [audit-name] [audit-date]

Imports the workbook into the database through the dev container (${DEV_CONTAINER}).
  --file PATH  workbook to import (.xlsx or .ods); defaults to
               ${FITSM_WORKBOOK_BASENAME}.xlsx in the repo root, falling back to the .ods
  org-id       organization id (default 1)
  user-id      acting user id (default 1)
  audit-name   default "Imported FitSM Assessment"
  audit-date   yyyy-MM-dd, default today (UTC)
  -h, --help   show this help
USAGE
}

WORKBOOK=""
POSITIONAL=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --file)
      [[ $# -ge 2 ]] || { usage >&2; exit 2; }
      WORKBOOK="$2"
      shift
      ;;
    --file=*) WORKBOOK="${1#--file=}" ;;
    *) POSITIONAL+=("$1") ;;
  esac
  shift
done

ORG_ID="${POSITIONAL[0]:-1}"
USER_ID="${POSITIONAL[1]:-1}"
AUDIT_NAME="${POSITIONAL[2]:-Imported FitSM Assessment}"
AUDIT_DATE="${POSITIONAL[3]:-$(date -u +%F)}"

if [[ -n "${WORKBOOK}" ]]; then
  [[ "${WORKBOOK}" == /* ]] || WORKBOOK="${CALLER_PWD}/${WORKBOOK}"
else
  WORKBOOK="$(default_fitsm_workbook)" \
    || die "no workbook found; place ${FITSM_WORKBOOK_BASENAME}.xlsx (or .ods) in the repo root or use --file PATH"
fi

require_cmd podman
require_container_running "${DEV_CONTAINER}"

CTR_WORKBOOK="$(copy_workbook_into "${DEV_CONTAINER}" "${WORKBOOK}")"
trap 'remove_container_file "${DEV_CONTAINER}" "${CTR_WORKBOOK}"' EXIT

log "importing ${WORKBOOK}"
podman exec "${DEV_CONTAINER}" bun run --cwd /workspace/apps/api import:fitsm -- \
  "${CTR_WORKBOOK}" \
  "${ORG_ID}" \
  "${USER_ID}" \
  "${AUDIT_NAME}" \
  "${AUDIT_DATE}"
