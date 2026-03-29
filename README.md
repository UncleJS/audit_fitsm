# Audit FitSM

![License: CC BY 4.0](https://img.shields.io/badge/License-CC_BY_4.0-lightgrey.svg)
![Runtime: Bun](https://img.shields.io/badge/runtime-Bun-black)
![Database: MariaDB](https://img.shields.io/badge/database-MariaDB-003545)

Audit FitSM is a purpose-built tool designed to support organizations in conducting efficient, structured, and repeatable audits aligned with the FitSM framework. FitSM is a lightweight, pragmatic service management framework designed to support IT service management (ITSM) in a simple and effective way, making it particularly suitable for small to medium-sized organizations or teams seeking to implement best practices without the overhead of more complex frameworks.

The Audit FitSM tool streamlines the audit process by providing a centralized platform for managing audit criteria, capturing evidence, tracking findings, and generating reports. It enables auditors to work through FitSM requirements systematically, ensuring consistency and completeness across all assessments. By digitizing the audit workflow, the tool reduces manual effort, minimizes errors, and improves overall audit quality.

Key features include predefined FitSM audit checklists, customizable assessment templates, and structured scoring mechanisms to evaluate compliance levels. Auditors can record observations, attach supporting documentation, and classify findings based on severity and impact. The tool also facilitates collaboration between auditors and client stakeholders by allowing shared visibility into audit progress and results.

In addition, Audit FitSM provides reporting capabilities that translate audit findings into clear, actionable insights. These reports help organizations understand their current maturity level, identify gaps, and prioritize improvement initiatives. Over time, the tool can support trend analysis, enabling organizations to track their progress toward achieving and maintaining FitSM compliance.

Designed with usability and practicality in mind, Audit FitSM aligns with the core philosophy of FitSM: delivering effective service management with minimal complexity. It empowers auditors and organizations alike to focus on meaningful improvements rather than administrative overhead, ultimately enhancing service quality and operational efficiency.

## Table of Contents

- [Audit FitSM](#audit-fitsm)
  - [Table of Contents](#table-of-contents)
  - [Port plan (1260-1269)](#port-plan-1260-1269)
  - [Prerequisites](#prerequisites)
  - [Rootless Podman only](#rootless-podman-only)
  - [Project layout](#project-layout)
  - [Documentation index](#documentation-index)
  - [Container-first setup (no bind mounts)](#container-first-setup-no-bind-mounts)
  - [Authentication UX](#authentication-ux)
  - [Notes](#notes)
  - [Health and readiness checks](#health-and-readiness-checks)
  - [Management scripts](#management-scripts)
  - [CI integration](#ci-integration)
  - [License footer](#license-footer)

## Port plan (1260-1269)

- Web UI: `1260`
- API: `1261`
- MariaDB (host published): `1262`
- phpMyAdmin (manual login): `1263`

[Go to TOC](#table-of-contents)

## Prerequisites

Before running this stack, ensure:

- Linux host with `systemd --user` available
- Rootless `podman` installed and working
- `bash`, `git`, and `systemctl` installed
- Host ports `1260`, `1261`, `1262`, `1263` are free

[Go to TOC](#table-of-contents)

## Rootless Podman only

This project is container-first and **rootless Podman only**:

- Do **not** use Docker
- Do **not** use rootful containers (`sudo podman ...`)
- Use provided `scripts/*.sh` lifecycle commands and Quadlet user units

[Go to TOC](#table-of-contents)

## Project layout

- `db/migrations/` - ordered SQL DDL and reporting views
- `apps/api/` - Bun + Elysia API, migration and importer scripts
- `apps/web/` - Next.js frontend scaffold
- `.quadlet/` - rootless Podman systemd user units
- `.systemd/` - user app services (API/Web via `podman exec`)

[Go to TOC](#table-of-contents)

## Documentation index

- Docs landing page: `docs/README.md`
- UI date/timestamp policy: `docs/ui-date-formatting.md`

[Go to TOC](#table-of-contents)

## Container-first setup (no bind mounts)

Preferred lifecycle commands are in `scripts/*.sh` (install/start/stop/etc).

1. Install units and start runtime services:

```bash
mkdir -p ~/.config/containers/systemd
mkdir -p ~/.config/systemd/user
cp .quadlet/* ~/.config/containers/systemd/
cp .systemd/* ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user start audit-fitsm-dev-build.service
systemctl --user start audit-fitsm-pod-pod.service
systemctl --user start audit-fitsm-db.service
systemctl --user start audit-fitsm-phpmyadmin.service
systemctl --user start audit-fitsm-dev.service
systemctl --user start audit-fitsm-api.service
systemctl --user start audit-fitsm-web.service
```

2. Run migrations inside container:

```bash
podman exec audit-fitsm-dev bun run --cwd /workspace/apps/api db:migrate
```

3. Bootstrap admin/org:

```bash
podman exec audit-fitsm-dev bun run --cwd /workspace/apps/api bootstrap:admin -- admin@example.com 'ChangeMe123!'
```

4. (Optional) Import FitSM workbook for full catalog coverage:

```bash
podman exec audit-fitsm-dev bun run --cwd /workspace/apps/api import:fitsm -- /workspace/FitSM-6_Assessment_and_Audit_Tool_V3.0.3.ods 1 1 "Initial Imported Audit"
```

Note: migrations include a minimal FitSM seed (GR1/GR1.1) so CI/local strict checks can run even when the workbook file is unavailable.

5. Open the UI flow:

- `http://localhost:1260/login`
- `http://localhost:1263/` (phpMyAdmin login, no auto-login)
- Login (local credentials)
- Use `Clients` page for audit work (`/clients`)
- Use `Admin` page for client creation and RBAC (`/admin`)
- Create/select a client from Admin, then select it in Clients
- Register a new audit for that client (with global cert goal at creation)
- Open `/audits/:auditId` workspace to assess grouped requirements for that audit
- Save assessment scores/comments/evidence, audit details, and conclusion
- Use Notes/History per requirement
- Use Save All for scope + assessments + details + conclusion
- Scope + cert-goal edits are allowed only while audit status is `draft`
- Manage status (`draft` -> `in_progress` -> `completed`)
- Manage org users/roles from Admin RBAC section
- Non-system-admin users are client-scoped (single client)
- Use filters/search/sort/dashboard on Clients page
- Generate/store/download PDF exports and CSV exports

[Go to TOC](#table-of-contents)

## Authentication UX

- Dedicated login route: `/login`
- Dedicated logout route: `/logout`
- Protected routes (`/clients`, `/admin`, `/audits/:auditId`) redirect to `/login` when token is missing/invalid
- JWT is stored in browser `sessionStorage` key `audit_fitsm_token`

[Go to TOC](#table-of-contents)

## Notes

- Archive-only lifecycle: tables use `archived_at`
- Stored PDFs are written to `/workspace/data/exports` (named volume)
- DB backups are ZIP files with UTC datetime names under `/workspace/data/backups`
- Reporting views: `v_all_results`, `v_certification_results`, `v_gap_analysis`, `v_trends`
- Security hardening: basic in-memory API rate limiting + security headers enabled
- Health endpoints: `GET /health` and `GET /ready`
- UI date-only input format: `yyyy-mm-dd` (locale-independent)
- UI timestamp format: local `YYYY-MM-DD HH:mm:ss`

[Go to TOC](#table-of-contents)

## Health and readiness checks

- Run strict readiness (DB + API health/ready + web + auth smoke + full integration suite):

```bash
scripts/health-readiness.sh strict
```

- Modes:
  - `basic`: DB + `/health` + `/ready` + web HTTP check
  - `extended`: basic + login + `/me`
  - `strict`: extended + full `integration:test`

[Go to TOC](#table-of-contents)

## Management scripts

- `scripts/install.sh`
- `scripts/uninstall.sh [--purge-data]`
- `scripts/start.sh` / `scripts/stop.sh` / `scripts/restart.sh`
- `scripts/status.sh`
- `scripts/logs.sh [pod|db|pma|phpmyadmin|dev|api|web|all]`
- `scripts/migrate.sh`
- `scripts/run-api.sh`
- `scripts/run-web.sh`
- `scripts/bootstrap-admin.sh <email> <password> [display] [org]`
- `scripts/import-fitsm.sh [org-id] [user-id] [audit-name] [audit-date]`
- `scripts/backup-db.sh`
- `scripts/list-backups.sh`
- `scripts/restore-db.sh /workspace/data/backups/<file>.zip`
- `scripts/clean-old-runtime.sh [--purge-data]` - remove legacy/CI runtime artifacts before fresh pod-style start
- `scripts/preflight-ports.sh [web-port app-port db-port]` - fail fast when host ports are already in use
- `scripts/ports.sh [port ...]` - show host listeners and Podman port mappings for troubleshooting
- `scripts/check-ui-date-inputs.sh` - enforce date-input wrapper policy
- `scripts/health-readiness.sh [basic|extended|strict]`
- `scripts/integration-test.sh` - run full integration suite against running stack
- `scripts/ci-strict.sh` - CI orchestration with Podman + strict readiness checks
- `scripts/new-doc.sh <relative-path.md> <title>` - create docs page with badges + TOC + footer scaffold

Route summary:

- `/login` (auth only)
- `/logout` (clear token)
- `/clients` (audit operations)
- `/admin` (client + RBAC administration)

Docs template: `docs/TEMPLATE.md`

[Go to TOC](#table-of-contents)

## CI integration

- GitHub Actions workflow: `.github/workflows/ci.yml`
- Enforces UI date-input policy before container runtime checks
- Enforces host port preflight in `ci-strict.sh` before pod creation
- Runs `scripts/ci-strict.sh` on pull requests and pushes to `main`/`master`
- Uses Podman-only pod-style runtime (`audit-fitsm-ci` pod), no bind mounts, and executes strict readiness + full integration suite
- Troubleshooting guide: `docs/ci-runbook.md`

[Go to TOC](#table-of-contents)

## License footer

© Audit FitSM contributors. Licensed under [CC BY 4.0](./LICENSE.md).

FitSM framework attribution: source framework and terminology credited to [FitSM](https://www.fitsm.eu/).

[Go to TOC](#table-of-contents)
