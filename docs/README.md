# Documentation Index

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](../LICENSE) [![CI](https://github.com/UncleJS/audit_fitsm/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/UncleJS/audit_fitsm/actions/workflows/ci.yml) [![Docs: Mermaid diagrams](https://img.shields.io/badge/diagrams-Mermaid-FF3670?logo=mermaid)](https://mermaid.js.org)

Index of the project documentation pages. The project overview, lifecycle scripts and license are in the [root README](../README.md).

## Table of Contents

- [Core docs](#core-docs)
- [Workflow and runtime docs](#workflow-and-runtime-docs)
- [Operational docs](#operational-docs)
- [Style and templates](#style-and-templates)

## Core docs

- [api-surface.md](api-surface.md) - HTTP route inventory, status codes and behavior notes
- [security-model.md](security-model.md) - cookie sessions, CSRF header, authorization, rate limits and secrets
- [ods-operational-mapping.md](ods-operational-mapping.md) - FitSM workbook import and database mapping
- [integration-testing.md](integration-testing.md) - readiness and integration validation
- [ui-date-formatting.md](ui-date-formatting.md) - date, timestamp and UTC rules

[↑ Back to TOC](#table-of-contents)

## Workflow and runtime docs

- [audit-workspace.md](audit-workspace.md) - workspace layout, save flow and troubleshooting
- [development-runtime.md](development-runtime.md) - rootless Podman + Quadlet runtime and rebuild workflow

[↑ Back to TOC](#table-of-contents)

## Operational docs

- [ci-runbook.md](ci-runbook.md) - CI pipeline, failure classes and rerun guidance

Schema reference: the SQL migrations in [`db/migrations/`](../db/migrations) are the source of truth for tables and reporting views.

[↑ Back to TOC](#table-of-contents)

## Style and templates

- [documentation-style.md](documentation-style.md) - Markdown rules for this repo (badges, TOC, back links, footer, Mermaid, dates)
- [style-audit-report.md](style-audit-report.md) - dated documentation compliance checklist
- [TEMPLATE.md](TEMPLATE.md) - template copied by `scripts/new-doc.sh`

[↑ Back to TOC](#table-of-contents)

---

© 2026 UncleJS — Licensed under [AGPL-3.0-or-later](https://www.gnu.org/licenses/agpl-3.0.txt)
