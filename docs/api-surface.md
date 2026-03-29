# API Surface (v0.1)

![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC_BY--NC--SA_4.0-lightgrey.svg)
![API: OpenAPI](https://img.shields.io/badge/spec-OpenAPI-6BA539)
![Base URL](https://img.shields.io/badge/base%20url-http%3A%2F%2Flocalhost%3A1261-2ea44f)

Base URL: `http://localhost:1261`

## Table of Contents

- [Auth](#auth)
- [Health and readiness](#health-and-readiness)
- [Clients (organizations)](#clients-organizations)
- [Audits](#audits)
- [Scope / Targets](#scope--targets)
- [Assessments](#assessments)
- [PDF exports](#pdf-exports)
- [CSV exports](#csv-exports)
- [Audit details & conclusions](#audit-details--conclusions)
- [Reporting](#reporting)
- [License footer](#license-footer)

## Auth

- `POST /auth/login`
- `GET /me`

[Go to TOC](#table-of-contents)

## Health and readiness

- `GET /health`
- `GET /ready`

[Go to TOC](#table-of-contents)

## Clients (organizations)

- `GET /clients`
- `POST /clients`
- `GET /roles`
- `GET /orgs/:orgId/users`
- `POST /orgs/:orgId/users`
- `PUT /orgs/:orgId/users/:userId/roles`

[Go to TOC](#table-of-contents)

## Audits

- `GET /orgs/:orgId/audits`
- `POST /orgs/:orgId/audits`
- `PUT /audits/:auditId/status`

[Go to TOC](#table-of-contents)

## Scope / Targets

- `PUT /audits/:auditId/scope-targets`

[Go to TOC](#table-of-contents)

## Assessments

- `PUT /audits/:auditId/assessments`
- `GET /audits/:auditId/workspace`
- `POST /assessments/:assessmentId/notes`
- `GET /assessments/:assessmentId/history`
- `POST /assessments/:assessmentId/archive`
- `POST /assessments/:assessmentId/restore`

[Go to TOC](#table-of-contents)

## PDF exports

- `GET /audits/:auditId/exports`
- `POST /audits/:auditId/exports/pdf`
- `GET /audits/:auditId/exports/:exportId/download`

[Go to TOC](#table-of-contents)

## CSV exports

- `GET /audits/:auditId/exports/csv?report=all|certification|gaps`
- `GET /orgs/:orgId/exports/csv?report=trends`

[Go to TOC](#table-of-contents)

## Audit details & conclusions

- `GET /audits/:auditId/details`
- `PUT /audits/:auditId/details`
- `GET /audits/:auditId/conclusion`
- `PUT /audits/:auditId/conclusion`

[Go to TOC](#table-of-contents)

## Reporting

- `GET /audits/:auditId/results/all`
- `GET /audits/:auditId/results/certification`
- `GET /audits/:auditId/results/gaps`
- `GET /orgs/:orgId/trends`

[Go to TOC](#table-of-contents)

## License footer

© Audit FitSM contributors. Licensed under [CC BY-NC-SA 4.0](../LICENSE.md).

[Go to TOC](#table-of-contents)
