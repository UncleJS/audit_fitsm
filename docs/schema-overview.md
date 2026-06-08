# Database Schema Overview

![License: CC BY 4.0](https://img.shields.io/badge/License-CC_BY_4.0-lightgrey.svg)
![Database: MariaDB](https://img.shields.io/badge/database-MariaDB-003545)

The authoritative schema lives in `db/migrations/*.sql` (applied via `scripts/migrate.sh`).
`apps/api/drizzle/schema.ts` is a partial typed-query reference only and does not drive
migrations.

## Table of Contents

- [Entity relationships](#entity-relationships)
- [Domains](#domains)
- [Reporting views](#reporting-views)
- [Conventions](#conventions)
- [Known gaps](#known-gaps)
- [License footer](#license-footer)

## Entity relationships

Audit-trail / `created_by` / `updated_by` columns reference `users(id)` from almost every
table; those edges are omitted below to keep the core structure readable.

```mermaid
erDiagram
  organizations ||--o{ org_user_roles : "membership"
  users ||--o{ org_user_roles : "membership"
  roles ||--o{ org_user_roles : "grants"
  roles ||--o{ role_permissions : "has"
  permissions ||--o{ role_permissions : "in"

  processes ||--o{ requirements : "contains"
  requirements ||--o{ requirement_level_guidance : "describes"

  organizations ||--o{ audits : "owns"
  audits ||--o{ audit_scope_targets : "scopes"
  processes ||--o{ audit_scope_targets : "targeted_by"
  target_levels ||--o{ audit_scope_targets : "goal"
  scope_options ||--o{ audit_scope_targets : "in_out"

  audits ||--o{ audit_assessments : "assesses"
  requirements ||--o{ audit_assessments : "scored_in"
  capability_scores ||--o{ audit_assessments : "rated"
  audit_assessments ||--o{ assessment_notes : "annotated"
  audit_assessments ||--o{ assessment_evidence : "evidenced"
  audit_assessments ||--o{ assessment_events : "history"

  audits ||--o{ audit_events : "history"
  audit_detail_fields ||--o{ audit_detail_responses : "answered_by"
  audits ||--o{ audit_detail_responses : "details"
  audits ||--o{ audit_conclusions : "concludes"
  audits ||--o{ audit_pdf_exports : "exports"
  organizations ||--o{ audit_pdf_exports : "owns"
```

## Domains

- Identity and access: `organizations`, `users`, `roles`, `permissions`, `role_permissions`,
  `org_user_roles`. Non-system-admin users are scoped to a single organization.
- FitSM reference catalog: `processes`, `requirements`, `requirement_level_guidance`,
  `capability_scores`, `target_levels`, `scope_options`.
- Audit lifecycle: `audits`, `audit_scope_targets`, `audit_assessments`, `assessment_notes`,
  `assessment_evidence`, `audit_detail_fields`, `audit_detail_responses`, `audit_conclusions`,
  `audit_pdf_exports`.
- Activity trail: `audit_events`, `assessment_events`.

## Reporting views

Defined in `db/migrations/0012_views.sql`:

- `v_all_results` - every assessment result joined to its process/requirement/score.
- `v_certification_results` - results filtered to certification scope.
- `v_gap_analysis` - requirements below their target level.
- `v_trends` - per-audit aggregates for trend reporting.

## Conventions

- Every UTC datetime column name ends with `_UTC` (e.g. `created_at_UTC`, `archived_at_UTC`,
  `pii_redacted_at_UTC`).
- Archive-only lifecycle: rows are never hard-deleted. "Delete" sets `archived_at_UTC`;
  "restore" sets it back to `NULL`. Uniqueness among active rows is enforced with generated
  `active_*` columns that are `NULL` when archived.

## Known gaps

- PII redaction columns (`users.pii_redacted_at_UTC`, `audit_assessments.pii_redacted_at_UTC`)
  are modeled but no API action or script performs in-place redaction yet. Redaction is a
  planned capability; until implemented these columns remain `NULL`.

## License footer

© Audit FitSM contributors. Licensed under [CC BY 4.0](../LICENSE.md).
