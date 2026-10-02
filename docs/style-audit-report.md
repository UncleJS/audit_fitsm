# Documentation style audit report

![License: CC BY 4.0](https://img.shields.io/badge/License-CC_BY_4.0-lightgrey.svg)
![Docs](https://img.shields.io/badge/docs-audit-blue)
![Result](https://img.shields.io/badge/result-pass-green)

Audit timestamp (UTC): 2026-10-02

## Table of Contents

- [Scope and rules checked](#scope-and-rules-checked)
- [Per-file results](#per-file-results)
- [Findings](#findings)
- [License footer](#license-footer)

## Scope and rules checked

Checked user-facing `*.md` files for:

1. shields.io badge presence
2. `## Table of Contents` section
3. `[Go to TOC](#table-of-contents)` link in each major section
4. `## License footer` section with CC BY text

`AGENTS.md` is exempt. See `docs/documentation-style.md`.

[Go to TOC](#table-of-contents)

## Per-file results

| File | Badge | TOC | Go-to-TOC | License footer | Overall |
|---|---|---|---|---|---|
| `AGENTS.md` | exempt | exempt | exempt | exempt | **EXEMPT** |
| `LICENSE.md` | yes | yes | yes | yes | **PASS** |
| `README.md` | yes | yes | yes | yes | **PASS** |
| `docs/TEMPLATE.md` | yes | yes | yes | yes | **PASS** |
| `docs/README.md` | yes | yes | yes | yes | **PASS** |
| `docs/api-surface.md` | yes | yes | yes | yes | **PASS** |
| `docs/audit-workspace.md` | yes | yes | yes | yes | **PASS** |
| `docs/ci-runbook.md` | yes | yes | yes | yes | **PASS** |
| `docs/development-runtime.md` | yes | yes | yes | yes | **PASS** |
| `docs/documentation-style.md` | yes | yes | yes | yes | **PASS** |
| `docs/integration-testing.md` | yes | yes | yes | yes | **PASS** |
| `docs/ods-operational-mapping.md` | yes | yes | yes | yes | **PASS** |
| `docs/security-model.md` | yes | yes | yes | yes | **PASS** |
| `docs/style-audit-report.md` | yes | yes | yes | yes | **PASS** |
| `docs/ui-date-formatting.md` | yes | yes | yes | yes | **PASS** |

[Go to TOC](#table-of-contents)

## Findings

User-facing docs match the style standard, including the pages added after the March 2026 audit. `AGENTS.md` stays exempt as a machine instruction file.

[Go to TOC](#table-of-contents)

## License footer

© Audit FitSM contributors. Licensed under [CC BY 4.0](../LICENSE.md).

[Go to TOC](#table-of-contents)
