#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/_common.sh"

SERVICE="${1:-all}"

case "${SERVICE}" in
  pod)
    journalctl --user -u "${POD_SERVICE}" -f
    ;;
  db)
    journalctl --user -u "${DB_SERVICE}" -f
    ;;
  dev)
    journalctl --user -u "${DEV_SERVICE}" -f
    ;;
  api)
    journalctl --user -u "${API_SERVICE}" -f
    ;;
  web)
    journalctl --user -u "${WEB_SERVICE}" -f
    ;;
  all)
    journalctl --user -u "${POD_SERVICE}" -u "${DB_SERVICE}" -u "${DEV_SERVICE}" -u "${API_SERVICE}" -u "${WEB_SERVICE}" -f
    ;;
  *)
    printf "Usage: scripts/logs.sh [pod|db|dev|api|web|all]\n" >&2
    exit 1
    ;;
esac
