#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 UncleJS
set -euo pipefail

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  cat <<'USAGE'
Usage: scripts/integration-test.sh

Runs the API integration suite inside the audit-fitsm-dev container.
Pass the bootstrapped admin with TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD
(forwarded into the container); TEST_API_URL is forwarded too when set.
USAGE
  exit 0
fi

env_args=()
for var in TEST_ADMIN_EMAIL TEST_ADMIN_PASSWORD TEST_API_URL; do
  if [[ -n "${!var:-}" ]]; then
    env_args+=(-e "${var}")
  fi
done

podman exec "${env_args[@]}" audit-fitsm-dev bun run --cwd /workspace/apps/api integration:test
