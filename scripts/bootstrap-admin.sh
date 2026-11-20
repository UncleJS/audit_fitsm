#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 UncleJS
#
# Create (or update) the first admin user inside the running dev container.
# The password comes from BOOTSTRAP_ADMIN_PASSWORD or an interactive prompt;
# it is passed as an env var, never as a command-line argument.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=scripts/common.sh
source scripts/common.sh

usage() {
  cat <<'USAGE'
Usage: scripts/bootstrap-admin.sh [email] [display-name] [org-name]

  email         default: admin@example.com
  display-name  default: System Admin
  org-name      default: Default Organization
Password: set BOOTSTRAP_ADMIN_PASSWORD (min 12 chars) or enter it at the prompt.
USAGE
}
case "${1:-}" in
  -h|--help) usage; exit 0 ;;
esac

EMAIL="${1:-admin@example.com}"
DISPLAY_NAME="${2:-System Admin}"
ORG_NAME="${3:-Default Organization}"

PASSWORD="${BOOTSTRAP_ADMIN_PASSWORD:-}"
if [[ -z "${PASSWORD}" ]]; then
  [[ -t 0 ]] || die "BOOTSTRAP_ADMIN_PASSWORD is not set and stdin is not a terminal"
  read -r -s -p "Admin password for ${EMAIL} (min 12 chars): " PASSWORD
  printf '\n'
  read -r -s -p "Repeat password: " confirm
  printf '\n'
  [[ "${PASSWORD}" == "${confirm}" ]] || die "passwords do not match"
fi
[[ "${#PASSWORD}" -ge 12 ]] || die "password must be at least 12 characters"

# The 2nd positional (argv password) stays empty; the env var takes precedence.
BOOTSTRAP_ADMIN_PASSWORD="${PASSWORD}" podman exec -e BOOTSTRAP_ADMIN_PASSWORD "${DEV_CONTAINER}" \
  bun run --cwd /workspace/apps/api bootstrap:admin -- \
  "${EMAIL}" \
  "" \
  "${DISPLAY_NAME}" \
  "${ORG_NAME}"
