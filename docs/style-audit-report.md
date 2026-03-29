# Documentation Style Audit Report

![License: CC BY 4.0](https://img.shields.io/badge/License-CC_BY_4.0-lightgrey.svg)
![Docs](https://img.shields.io/badge/docs-audit-blue)
![Result](https://img.shields.io/badge/result-8%2F9%20pass-yellow)

Audit timestamp (UTC): 2026-03-29

## Table of Contents

- [Scope and rules checked](#scope-and-rules-checked)
- [Per-file results](#per-file-results)
- [Findings](#findings)
- [Remediation options](#remediation-options)
- [License footer](#license-footer)

## Scope and rules checked

Checked all `*.md` files in repository root and subdirectories for:

1. shields.io badge presence
2. `## Table of Contents` section
3. `[Go to TOC](#table-of-contents)` link in each major section
4. `## License footer` section with CC BY text

[Go to TOC](#table-of-contents)

## Per-file results

| File | Badge | TOC | Go-to-TOC | License footer | Overall |
|---|---|---|---|---|---|
| `AGENTS.md` | ❌ | ❌ | ❌ | ❌ | **FAIL** |
| `LICENSE.md` | ✅ | ✅ | ✅ | ✅ | **PASS** |
| `README.md` | ✅ | ✅ | ✅ | ✅ | **PASS** |
| `docs/TEMPLATE.md` | ✅ | ✅ | ✅ | ✅ | **PASS** |
| `docs/api-surface.md` | ✅ | ✅ | ✅ | ✅ | **PASS** |
| `docs/documentation-style.md` | ✅ | ✅ | ✅ | ✅ | **PASS** |
| `docs/integration-testing.md` | ✅ | ✅ | ✅ | ✅ | **PASS** |
| `docs/ods-operational-mapping.md` | ✅ | ✅ | ✅ | ✅ | **PASS** |
| `docs/style-audit-report.md` | ✅ | ✅ | ✅ | ✅ | **PASS** |

[Go to TOC](#table-of-contents)

## Findings

- **Pass rate:** 8 / 9 markdown files.
- All user-facing project docs now conform to the style standard.
- `AGENTS.md` is a machine-instruction file and currently does not follow the doc style format.

[Go to TOC](#table-of-contents)

## Remediation options

Option A (recommended): Keep `AGENTS.md` as-is and classify it as an operational/system instruction file exempt from documentation style checks.

Option B: Reformat `AGENTS.md` to match style standard (badges, TOC, section footers, license footer).

[Go to TOC](#table-of-contents)

## License footer

© Audit FitSM contributors. Licensed under [CC BY 4.0](../LICENSE.md).

[Go to TOC](#table-of-contents)
