#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 UncleJS
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/restore-db.sh /workspace/data/backups/<file>.zip [--force] [--skip-pre-backup]

Restores a backup inside the audit-fitsm-dev container. A pre-restore backup is
taken first unless --skip-pre-backup is given; --force skips the DB-name check.
USAGE
}

ZIP_FILE=""
extra=()
for arg in "$@"; do
  case "${arg}" in
    -h|--help) usage; exit 0 ;;
    --force|--skip-pre-backup) extra+=("${arg}") ;;
    -*) printf 'Unknown option: %s\n' "${arg}" >&2; usage >&2; exit 2 ;;
    *) ZIP_FILE="${arg}" ;;
  esac
done

if [[ -z "${ZIP_FILE}" ]]; then
  usage >&2
  exit 1
fi

podman exec audit-fitsm-dev bun run --cwd /workspace/apps/api restore:db -- "${ZIP_FILE}" --yes "${extra[@]}"
