#!/usr/bin/env bash
set -euo pipefail

podman exec audit-fitsm-dev sh -lc 'ls -lh /workspace/data/backups/*.zip 2>/dev/null || echo "No backups found"'
