# API Surface

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](../LICENSE) [![CI](https://github.com/UncleJS/audit_fitsm/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/UncleJS/audit_fitsm/actions/workflows/ci.yml) [![Spec: OpenAPI](https://img.shields.io/badge/spec-OpenAPI-6BA539?logo=openapiinitiative)](../apps/api/openapi/openapi.json) [![API: Elysia](https://img.shields.io/badge/API-Elysia-1f2937)](https://elysiajs.com)

Route inventory for API v0.1. Base URL: `http://127.0.0.1:1261`. The machine-readable spec is `apps/api/openapi/openapi.json`.

## Table of Contents

- [Conventions](#conventions)
- [Auth](#auth)
- [Health and readiness](#health-and-readiness)
- [OpenAPI and Swagger](#openapi-and-swagger)
- [Clients (organizations)](#clients-organizations)
- [Audits](#audits)
- [Scope / Targets](#scope--targets)
- [Assessments](#assessments)
- [PDF exports](#pdf-exports)
- [CSV exports](#csv-exports)
- [Audit details & conclusions](#audit-details--conclusions)
- [Reporting](#reporting)

## Conventions

- Authentication: session cookie only (`audit_fitsm_session`); bearer tokens are not accepted. See [security-model.md](security-model.md).
- CSRF: every non-GET/HEAD/OPTIONS request needs header `x-audit-fitsm: 1`.
- Timestamps are ISO 8601 UTC with `Z`, for example `2026-11-20T14:05:09Z`; date-only fields are `yyyy-MM-dd`.

| Status | Meaning |
|--------|---------|
| `400` | invalid payload (zod validation), bad reference or value too long |
| `401` | no or invalid session |
| `403` | missing `x-audit-fitsm` header, or role not allowed |
| `404` | not found |
| `409` | duplicate, conflicting state or race |
| `429` | rate limit exceeded |
| `500` | generic `{"error":"Internal server error"}`; details are only logged |

[↑ Back to TOC](#table-of-contents)

## Auth

- `POST /auth/login` - body `{ email, password }`; sets the cookie and returns `{ ok: true, expiresInSec }`
- `POST /auth/refresh` - re-issues the cookie; returns `{ ok: true, expiresInSec }`
- `POST /auth/logout` - clears the cookie and revokes all sessions of the user
- `GET /me` - current user and roles

Behavior notes:

- frontend routes redirect to `/login` when `/me` returns `401`
- login is rate limited per IP (30) and per email (10) per 15 minutes

[↑ Back to TOC](#table-of-contents)

## Health and readiness

- `GET /health`
- `GET /ready`

[↑ Back to TOC](#table-of-contents)

## OpenAPI and Swagger

- `GET /openapi.json`
- `GET /docs`

Behavior notes:

- both need a session unless `NODE_ENV` is `development` or `test`
- `/docs` serves Swagger UI with its own CSP; the integration suite checks availability and CSP

[↑ Back to TOC](#table-of-contents)

## Clients (organizations)

- `GET /clients`
- `POST /clients`
- `GET /roles`
- `GET /orgs/:orgId/users`
- `POST /orgs/:orgId/users`
- `PUT /orgs/:orgId/users/:userId/roles`

Behavior notes:

- non-system-admin users are client-scoped (single org); cross-client assignment returns `409`
- the `system_admin` role cannot be assigned through org-scoped endpoints
- an org admin cannot reset the password of, or demote, a system admin

[↑ Back to TOC](#table-of-contents)

## Audits

- `GET /orgs/:orgId/audits`
- `POST /orgs/:orgId/audits`
- `PUT /audits/:auditId/status`
- `GET /audits/:auditId/workspace`

Behavior notes:

- `POST /orgs/:orgId/audits` accepts `certGoalLevel` and applies it to all process targets at creation
- `GET /audits/:auditId/workspace` returns the combined payload used by the audit page

[↑ Back to TOC](#table-of-contents)

## Scope / Targets

- `PUT /audits/:auditId/scope-targets`

Behavior notes:

- scope and certification target updates are allowed only while the audit status is `draft`
- the web workspace uses this endpoint for autosave and the explicit save actions

[↑ Back to TOC](#table-of-contents)

## Assessments

- `PUT /audits/:auditId/assessments`
- `POST /assessments/:assessmentId/notes`
- `GET /assessments/:assessmentId/history`
- `POST /assessments/:assessmentId/archive`
- `POST /assessments/:assessmentId/restore`

Behavior notes:

- score, comment and evidence updates are saved through `PUT /audits/:auditId/assessments`
- the web workspace uses debounced autosave and visible manual save controls for these updates

[↑ Back to TOC](#table-of-contents)

## PDF exports

- `GET /audits/:auditId/exports`
- `POST /audits/:auditId/exports/pdf`
- `GET /audits/:auditId/exports/:exportId/download`

[↑ Back to TOC](#table-of-contents)

## CSV exports

- `GET /audits/:auditId/exports/csv?report=all|certification|gaps`
- `GET /orgs/:orgId/exports/csv?report=trends`

[↑ Back to TOC](#table-of-contents)

## Audit details & conclusions

- `GET /audits/:auditId/details`
- `PUT /audits/:auditId/details`
- `GET /audits/:auditId/conclusion`
- `PUT /audits/:auditId/conclusion`

Behavior notes:

- details can be edited by normal audit editors while the audit is writable
- conclusion editing requires lead-auditor-level access
- the web workspace autosaves these fields and also offers `Save details` and `Save conclusion`

[↑ Back to TOC](#table-of-contents)

## Reporting

- `GET /audits/:auditId/results/all`
- `GET /audits/:auditId/results/certification`
- `GET /audits/:auditId/results/gaps`
- `GET /orgs/:orgId/trends`

[↑ Back to TOC](#table-of-contents)

---

© 2026 UncleJS — Licensed under [AGPL-3.0-or-later](https://www.gnu.org/licenses/agpl-3.0.txt)
