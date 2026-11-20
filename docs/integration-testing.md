# Integration Testing

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](../LICENSE) [![CI](https://github.com/UncleJS/audit_fitsm/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/UncleJS/audit_fitsm/actions/workflows/ci.yml) [![Bun 1.2.22](https://img.shields.io/badge/Bun-1.2.22-000000?logo=bun)](https://bun.sh)

Run the API integration suite and readiness checks against the running containerized stack. Everything runs inside the `audit-fitsm-dev` container.

## Table of Contents

- [Scope](#scope)
- [Prerequisites](#prerequisites)
- [Run the suite](#run-the-suite)
- [Run readiness modes](#run-readiness-modes)
- [What is validated](#what-is-validated)

## Scope

The suite validates:

- auth: cookie-session login (every write sends `x-audit-fitsm: 1`)
- client and audit creation
- workspace, scope and assessment updates (the endpoints behind autosave)
- notes and history
- details and conclusion updates
- status transitions and the completed-audit lock
- session revocation after org-role changes
- CSV export endpoints
- PDF generate, list and download
- audit-level history for details, conclusion and status
- assessment archive and restore
- result routes for all, certification and gaps
- organization trend JSON
- bad password and missing session
- cross-organization denial for a non-member
- org RBAC admin endpoints
- client-scoped user enforcement (non-system-admin cross-client assignment blocked)
- web HTML-entity decoding regression (`&amp;` to `&`)
- Swagger UI and OpenAPI docs availability

[↑ Back to TOC](#table-of-contents)

## Prerequisites

- stack installed and running (`scripts/install.sh --start`)
- migrations applied (`scripts/migrate.sh`)
- admin bootstrapped (`scripts/bootstrap-admin.sh`)

The suite reads these variables inside the dev container:

- `TEST_ADMIN_EMAIL` (default `admin@example.com`)
- `TEST_ADMIN_PASSWORD` (the bootstrap admin password)
- `API_BASE_URL` (default `http://localhost:1261`)
- `WEB_BASE_URL` (readiness only, default `http://127.0.0.1:1260`)

`podman exec` does not forward host variables, so pass them with `-e`, as shown below.

[↑ Back to TOC](#table-of-contents)

## Run the suite

From the project root:

```bash
scripts/integration-test.sh
```

or directly, with credentials:

```bash
podman exec -e TEST_ADMIN_PASSWORD="$TEST_ADMIN_PASSWORD" audit-fitsm-dev \
  bun run --cwd /workspace/apps/api integration:test
```

[↑ Back to TOC](#table-of-contents)

## Run readiness modes

```bash
scripts/health-readiness.sh basic
scripts/health-readiness.sh extended
scripts/health-readiness.sh strict
```

Mode behavior:

- `basic`: DB ping, migration presence, `GET /health`, `GET /ready` and web HTTP reachability
- `extended`: basic plus login and `GET /me`
- `strict` (default): extended plus the full integration suite and the web text-entity regression test (`apps/web/app/lib/text-format.test.ts`)

[↑ Back to TOC](#table-of-contents)

## What is validated

Output is JSON with `ok: true` on success and includes the generated IDs. On failure the script exits non-zero and prints the failing step, status code and a response body snippet.

The suite covers the API endpoints used by autosave and the manual save controls. Browser timing and blur behavior stay a frontend concern, but the underlying save endpoints are covered end to end.

[↑ Back to TOC](#table-of-contents)

---

© 2026 UncleJS — Licensed under [AGPL-3.0-or-later](https://www.gnu.org/licenses/agpl-3.0.txt)
