#!/usr/bin/env bash
set -euo pipefail

ORG_ID="${1:-1}"
USER_ID="${2:-1}"
AUDIT_NAME="${3:-Imported FitSM Assessment}"
AUDIT_DATE="${4:-$(date -u +%F)}"

podman exec audit-fitsm-dev bun run --cwd /workspace/apps/api import:fitsm -- \
  /workspace/FitSM-6_Assessment_and_Audit_Tool_V3.0.3.ods \
  "${ORG_ID}" \
  "${USER_ID}" \
  "${AUDIT_NAME}" \
  "${AUDIT_DATE}"
