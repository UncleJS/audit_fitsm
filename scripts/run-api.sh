#!/usr/bin/env bash
set -euo pipefail

podman exec audit-fitsm-dev bun run --cwd /workspace/apps/api dev
