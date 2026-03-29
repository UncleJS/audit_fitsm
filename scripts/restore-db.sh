#!/usr/bin/env bash
set -euo pipefail

ZIP_FILE="${1:-}"
if [[ -z "${ZIP_FILE}" ]]; then
  printf "Usage: scripts/restore-db.sh /workspace/data/backups/<file>.zip\n" >&2
  exit 1
fi

podman exec audit-fitsm-dev bun run --cwd /workspace/apps/api restore:db -- "${ZIP_FILE}" --yes
