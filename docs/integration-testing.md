# Integration Testing

![License: CC BY 4.0](https://img.shields.io/badge/License-CC_BY_4.0-lightgrey.svg)
![Tests](https://img.shields.io/badge/tests-integration-blue)

Run full API/UI integration checks against a running containerized stack.

## Table of Contents

- [Scope](#scope)
- [Prerequisites](#prerequisites)
- [Run the suite](#run-the-suite)
- [Run readiness modes](#run-readiness-modes)
- [What is validated](#what-is-validated)
- [License footer](#license-footer)

## Scope

The suite validates:

- auth/login
- client + audit creation
- workspace/scope/assessment updates
- notes/history
- details/conclusion updates
- status transitions and completed-audit lock
- CSV export endpoints
- PDF generate/list/download
- org RBAC admin endpoints

[Go to TOC](#table-of-contents)

## Prerequisites

- services installed and running (`scripts/install.sh`, `scripts/start.sh`)
- migrations applied (`scripts/migrate.sh`)
- admin bootstrapped (`scripts/bootstrap-admin.sh`)

Optional env overrides:

- `TEST_ADMIN_EMAIL`
- `TEST_ADMIN_PASSWORD`
- `API_BASE_URL` (default `http://localhost:1261`)

[Go to TOC](#table-of-contents)

## Run the suite

From project root:

```bash
scripts/integration-test.sh
```

or directly:

```bash
podman exec audit-fitsm-dev bun run --cwd /workspace/apps/api integration:test
```

[Go to TOC](#table-of-contents)

## Run readiness modes

From project root:

```bash
scripts/health-readiness.sh basic
scripts/health-readiness.sh extended
scripts/health-readiness.sh strict
```

Mode behavior:

- `basic`: DB ping + migration presence + `GET /health` + `GET /ready` + web HTTP reachability
- `extended`: basic + auth login + `GET /me`
- `strict`: extended + full integration suite (`integration:test`)

[Go to TOC](#table-of-contents)

## What is validated

Output is JSON with `ok: true` when successful and includes generated IDs.

Failure behavior:

- exits non-zero
- prints failing step, status code, and response body snippet

[Go to TOC](#table-of-contents)

## License footer

© Audit FitSM contributors. Licensed under [CC BY 4.0](../LICENSE.md).

[Go to TOC](#table-of-contents)
