#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-strict}"

case "${MODE}" in
  basic|extended|strict)
    ;;
  *)
    printf "Usage: scripts/health-readiness.sh [basic|extended|strict]\n" >&2
    exit 1
    ;;
esac

podman exec audit-fitsm-dev bun run --cwd /workspace/apps/api health:readiness -- "${MODE}"
