# Audit FitSM (ODS -> MariaDB)

![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC_BY--NC--SA_4.0-lightgrey.svg)
![Runtime: Bun](https://img.shields.io/badge/runtime-Bun-black)
![Database: MariaDB](https://img.shields.io/badge/database-MariaDB-003545)

Operational-sheets implementation for `FitSM-6_Assessment_and_Audit_Tool_V3.0.3.ods`.

## Table of Contents

- [Port plan (1260-1269)](#port-plan-1260-1269)
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

4. Import FitSM workbook:

```bash
podman exec audit-fitsm-dev bun run --cwd /workspace/apps/api import:fitsm -- /workspace/FitSM-6_Assessment_and_Audit_Tool_V3.0.3.ods 1 1 "Initial Imported Audit"
```

5. Open the UI flow:

- `http://localhost:1260/`
- `http://localhost:1263/` (phpMyAdmin login, no auto-login)
- Create/select a client
- Register a new audit for that client
- Open `/audits/:auditId` workspace to assess grouped requirements for that audit
- Save assessment scores/comments/evidence, audit details, and conclusion
- Use Notes/History per requirement
- Use Save All for scope + assessments + details + conclusion
- Manage status (`draft` -> `in_progress` -> `completed`)
- Manage org users/roles from home-page RBAC Administration section
- Use filters/search/sort/dashboard on home page
- Generate/store/download PDF exports and CSV exports

[Go to TOC](#table-of-contents)

## Authentication UX

- Login from the home page using local credentials
- JWT is stored in browser `sessionStorage` key `audit_fitsm_token`
- Workspace page reads that token; logout clears it

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

© Audit FitSM contributors. Licensed under [CC BY-NC-SA 4.0](./LICENSE.md).

[Go to TOC](#table-of-contents)
