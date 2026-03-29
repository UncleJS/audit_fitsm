#!/usr/bin/env bash
set -euo pipefail

EMAIL="${1:-admin@example.com}"
PASSWORD="${2:-ChangeMe123!}"
DISPLAY_NAME="${3:-System Admin}"
ORG_NAME="${4:-Default Organization}"

podman exec audit-fitsm-dev bun run --cwd /workspace/apps/api bootstrap:admin -- \
  "${EMAIL}" \
  "${PASSWORD}" \
  "${DISPLAY_NAME}" \
  "${ORG_NAME}"
