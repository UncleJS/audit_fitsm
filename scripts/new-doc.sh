#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  printf "Usage: scripts/new-doc.sh <relative-path.md> <title>\n" >&2
  printf "Example: scripts/new-doc.sh docs/security-model.md \"Security Model\"\n" >&2
  exit 1
fi

TARGET="$1"
TITLE="$2"

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ABS_TARGET="${ROOT_DIR}/${TARGET}"

mkdir -p "$(dirname "${ABS_TARGET}")"

if [[ -f "${ABS_TARGET}" ]]; then
  printf "File already exists: %s\n" "${TARGET}" >&2
  exit 1
fi

cat > "${ABS_TARGET}" <<EOF
# ${TITLE}

![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC_BY--NC--SA_4.0-lightgrey.svg)
![Docs](https://img.shields.io/badge/docs-standardized-blue)

Short purpose for ${TITLE}.

## Table of Contents

- [Overview](#overview)
- [Details](#details)
- [References](#references)
- [License footer](#license-footer)

## Overview

<content>

[Go to TOC](#table-of-contents)

## Details

<content>

[Go to TOC](#table-of-contents)

## References

<content>

[Go to TOC](#table-of-contents)

## License footer

© Audit FitSM contributors. Licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).

[Go to TOC](#table-of-contents)

EOF

printf "Created %s\n" "${TARGET}"
