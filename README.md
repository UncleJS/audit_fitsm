# Audit FitSM

![License: CC BY 4.0](https://img.shields.io/badge/License-CC_BY_4.0-lightgrey.svg)
![Frontend: Next.js](https://img.shields.io/badge/frontend-Next.js-000000?logo=nextdotjs)
![API: Elysia](https://img.shields.io/badge/api-Elysia-1f2937)
![Runtime: Bun](https://img.shields.io/badge/runtime-Bun-black)
![Database: MariaDB](https://img.shields.io/badge/database-MariaDB-003545)
![Container: Podman](https://img.shields.io/badge/container-Podman-892CA0?logo=podman)
![Mode: rootless](https://img.shields.io/badge/mode-rootless-2ea44f)
![DB Admin: phpMyAdmin](https://img.shields.io/badge/db_admin-phpMyAdmin-6C78AF)


Audit FitSM is a purpose-built tool designed to support organizations in conducting efficient, structured, and repeatable audits aligned with the FitSM framework. FitSM is a lightweight, pragmatic service management framework designed to support IT service management (ITSM) in a simple and effective way, making it particularly suitable for small to medium-sized organizations or teams seeking to implement best practices without the overhead of more complex frameworks.

The Audit FitSM tool streamlines the audit process by providing a centralized platform for managing audit criteria, capturing evidence, tracking findings, and generating reports. It enables auditors to work through FitSM requirements systematically, ensuring consistency and completeness across all assessments. By digitizing the audit workflow, the tool reduces manual effort, minimizes errors, and improves overall audit quality.

Key features include predefined FitSM audit checklists, customizable assessment templates, and structured scoring mechanisms to evaluate compliance levels. Auditors can record observations, attach supporting documentation, and classify findings based on severity and impact. The tool also facilitates collaboration between auditors and client stakeholders by allowing shared visibility into audit progress and results.

In addition, Audit FitSM provides reporting capabilities that translate audit findings into clear, actionable insights. These reports help organizations understand their current maturity level, identify gaps, and prioritize improvement initiatives. Over time, the tool can support trend analysis, enabling organizations to track their progress toward achieving and maintaining FitSM compliance.

Designed with usability and practicality in mind, Audit FitSM aligns with the core philosophy of FitSM: delivering effective service management with minimal complexity. It empowers auditors and organizations alike to focus on meaningful improvements rather than administrative overhead, ultimately enhancing service quality and operational efficiency.

## Table of Contents

- [Audit FitSM](#audit-fitsm)
  - [Table of Contents](#table-of-contents)
  - [Highlights](#highlights)
  - [Ports](#ports)
  - [Prerequisites](#prerequisites)
  - [Project layout](#project-layout)
  - [Documentation index](#documentation-index)
  - [Quick start](#quick-start)
  - [Daily workflow](#daily-workflow)
  - [Audit workspace save behavior](#audit-workspace-save-behavior)
  - [Development runtime model](#development-runtime-model)
  - [Authentication and authorization](#authentication-and-authorization)
  - [API and OpenAPI docs](#api-and-openapi-docs)
  - [Health checks and testing](#health-checks-and-testing)
  - [Management scripts](#management-scripts)
  - [Operational notes](#operational-notes)
  - [License footer](#license-footer)

## Highlights

- audit creation and client-scoped audit management
- grouped FitSM process workspace with requirement scoring, evidence, notes, and history
- audit details and conclusion capture
- autosave plus explicit manual save controls in the audit workspace
- PDF export generation and stored PDF download
- CSV exports for audit and trend reporting
- rootless Podman + systemd user-service runtime only
- OpenAPI JSON at `/openapi.json` and Swagger UI at `/docs`

[Go to TOC](#table-of-contents)

## Ports

- Web UI: `1260`
- API: `1261`
- MariaDB: `1262`
- phpMyAdmin: `1263`

[Go to TOC](#table-of-contents)

## Prerequisites

- Linux host with `systemd --user`
- rootless `podman`
- `bash`, `git`, and `systemctl`
- free host ports `1260`, `1261`, `1262`, `1263`

This project is Podman-only. Do not use Docker or rootful containers.

[Go to TOC](#table-of-contents)

## Project layout

- `apps/web/` - Next.js web UI
- `apps/api/` - Bun + Elysia API and integration suite
- `db/migrations/` - SQL schema and reporting views
- `.quadlet/` - rootless Podman Quadlet units
- `.systemd/` - app services that execute web/api inside the dev container
- `scripts/` - install, lifecycle, health, import, backup, and test helpers
- `docs/` - operator, developer, API, and workflow documentation

[Go to TOC](#table-of-contents)

## Documentation index

- `docs/README.md` - documentation landing page
- `docs/audit-workspace.md` - audit workspace user guide
- `docs/development-runtime.md` - container-first development and rebuild workflow
- `docs/api-surface.md` - route inventory and behavior notes
- `docs/schema-overview.md` - database schema, ERD, and reporting views
- `docs/integration-testing.md` - integration and readiness validation
- `docs/ci-runbook.md` - CI troubleshooting
- `docs/ui-date-formatting.md` - date and timestamp formatting policy

[Go to TOC](#table-of-contents)

## Quick start

Preferred lifecycle commands are in `scripts/*.sh`.

1. Install units and start the local runtime:

```bash
scripts/install.sh
```

2. Apply migrations:

```bash
scripts/migrate.sh
```

3. Bootstrap an admin:

```bash
scripts/bootstrap-admin.sh admin@example.com 'ChangeMe123!'
```

4. Optional: import the full FitSM workbook inside the dev container:

```bash
scripts/import-fitsm.sh 1 1 "Initial Imported Audit"
```

5. Open:

- `http://localhost:1260/login`
- `http://localhost:1261/docs`
- `http://localhost:1261/openapi.json`
- `http://localhost:1263/`

[Go to TOC](#table-of-contents)

## Daily workflow

1. Sign in at `/login`.
2. Use `/admin` to create a client and manage org-scoped users/roles.
3. Use `/clients` to select a client and register a new audit.
4. Open `/audits/:auditId` for the full audit workspace.
5. Score requirements, add comments/evidence, capture audit details, and write the conclusion.
6. Generate CSV/PDF outputs when the audit content is ready.

[Go to TOC](#table-of-contents)

## Audit workspace save behavior

The audit workspace now supports both autosave and explicit save actions.

- Autosave runs after a short pause while editing.
- Autosave also runs when a user leaves a field (`blur`) in the workspace.
- A visible manual save block appears near the top of the page.
- A sticky save controls panel stays available while scrolling.

Manual save actions:

- `Save scope & targets`
- `Save assessments`
- `Save details`
- `Save conclusion`
- `Save all`
- `Save status` (manual only)

Permission and lock behavior:

- scope and certification targets are editable only while status is `draft`
- non-lead users cannot keep editing once an audit is `completed`
- conclusion and `Save all` require lead auditor or org admin permissions

See `docs/audit-workspace.md` for the full operator guide.

[Go to TOC](#table-of-contents)

## Development runtime model

This repo does not use bind mounts for source code. The dev container copies the repository into `/workspace` when the image is built.

Implication: after changing source files locally, rebuild and restart the dev runtime before expecting the running app to serve those changes.

Typical refresh flow:

```bash
systemctl --user restart audit-fitsm-dev-build.service
systemctl --user restart audit-fitsm-dev.service
```

Useful checks:

```bash
scripts/status.sh
scripts/logs.sh web
scripts/logs.sh api
```

See `docs/development-runtime.md` for the full workflow.

[Go to TOC](#table-of-contents)

## Authentication and authorization

- `/login` and `/logout` are dedicated auth routes
- protected routes redirect to `/login` when the session token is missing or invalid
- the browser stores the JWT in `sessionStorage` under `audit_fitsm_token`
- JWTs are short-lived and role/password changes revoke active sessions
- non-system-admin users are scoped to a single client/org

[Go to TOC](#table-of-contents)

## API and OpenAPI docs

- API base URL: `http://localhost:1261`
- Swagger UI: `http://localhost:1261/docs`
- OpenAPI JSON: `http://localhost:1261/openapi.json`

See `docs/api-surface.md` for the route inventory.

[Go to TOC](#table-of-contents)

## Health checks and testing

Readiness modes:

```bash
scripts/health-readiness.sh basic
scripts/health-readiness.sh extended
scripts/health-readiness.sh strict
```

Integration suite:

```bash
scripts/integration-test.sh
```

`strict` includes the full integration suite.

[Go to TOC](#table-of-contents)

## Management scripts

- `scripts/install.sh`
- `scripts/start.sh`
- `scripts/stop.sh`
- `scripts/restart.sh`
- `scripts/status.sh`
- `scripts/logs.sh [pod|db|pma|phpmyadmin|dev|api|web|all]`
- `scripts/migrate.sh`
- `scripts/bootstrap-admin.sh <email> <password> [display] [org]`
- `scripts/import-fitsm.sh [org-id] [user-id] [audit-name] [audit-date]`
- `scripts/backup-db.sh`
- `scripts/restore-db.sh /workspace/data/backups/<file>.zip`
- `scripts/check-ui-date-inputs.sh`
- `scripts/health-readiness.sh [basic|extended|strict]`
- `scripts/integration-test.sh`

[Go to TOC](#table-of-contents)

## Operational notes

- archive-only data lifecycle; do not hard-delete audit data
- PDFs are stored under `/workspace/data/exports`
- backups are stored under `/workspace/data/backups`
- reporting views include `v_all_results`, `v_certification_results`, `v_gap_analysis`, and `v_trends`
- UI date-only inputs use `yyyy-mm-dd`
- UI timestamps display local `YYYY-MM-DD HH:mm:ss`

[Go to TOC](#table-of-contents)

## License footer

© Audit FitSM contributors. Licensed under [CC BY 4.0](./LICENSE.md).

FitSM framework attribution: source framework and terminology credited to [FitSM](https://www.fitsm.eu/).

[Go to TOC](#table-of-contents)
