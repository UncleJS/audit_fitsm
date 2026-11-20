#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 UncleJS
#
# Create a new Markdown page from docs/TEMPLATE.md: badge row, TOC, back links
# and the AGPL footer, with the license link adjusted to the page's depth.
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/new-doc.sh <relative-path.md> <title>

Creates <relative-path.md> (relative to the repo root) from docs/TEMPLATE.md.
Example: scripts/new-doc.sh docs/backup-runbook.md "Backup Runbook"

  -h, --help  show this help
USAGE
}

case "${1:-}" in
  -h|--help) usage; exit 0 ;;
esac

if [[ $# -ne 2 ]]; then
  usage >&2
  exit 1
fi

TARGET="$1"
TITLE="$2"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE="${ROOT_DIR}/docs/TEMPLATE.md"

case "${TARGET}" in
  /*|*..*) printf "Path must be relative to the repo root and stay inside it: %s\n" "${TARGET}" >&2; exit 1 ;;
  *.md) ;;
  *) printf "Path must end in .md: %s\n" "${TARGET}" >&2; exit 1 ;;
esac
TARGET="${TARGET#./}"
ABS_TARGET="${ROOT_DIR}/${TARGET}"

[[ -f "${TEMPLATE}" ]] || { printf "Template not found: %s\n" "${TEMPLATE}" >&2; exit 1; }
if [[ -e "${ABS_TARGET}" ]]; then
  printf "File already exists: %s\n" "${TARGET}" >&2
  exit 1
fi

# Relative prefix from the new page back to the repo root (LICENSE lives there).
depth="$(tr -cd '/' <<<"${TARGET}" | wc -c)"
prefix=""
for ((i = 0; i < depth; i++)); do
  prefix+="../"
done

# Literal replacements only (no '&' back-references in bash 5.2+).
shopt -u patsub_replacement 2>/dev/null || true
content="$(<"${TEMPLATE}")"
content="${content//<Document Title>/${TITLE}}"
content="${content//<Short document purpose>/Short purpose for ${TITLE}.}"
content="${content//](..\/LICENSE)/](${prefix}LICENSE)}"

mkdir -p "$(dirname "${ABS_TARGET}")"
printf '%s\n' "${content}" >"${ABS_TARGET}"

printf "Created %s\n" "${TARGET}"
printf "Next: rename the placeholder sections, keep the TOC in sync, and add the page to docs/README.md and the README documentation index.\n"
