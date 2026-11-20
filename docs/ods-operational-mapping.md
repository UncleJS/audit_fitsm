# ODS Operational Mapping

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](../LICENSE) [![CI](https://github.com/UncleJS/audit_fitsm/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/UncleJS/audit_fitsm/actions/workflows/ci.yml) [![Source: FitSM workbook](https://img.shields.io/badge/source-FitSM_ODS-0A7E07)](https://www.fitsm.eu/) [![MariaDB 12.3 LTS](https://img.shields.io/badge/MariaDB-12.3_LTS-003545?logo=mariadb)](https://mariadb.org)

How the FitSM workbook `FitSM-6_Assessment_and_Audit_Tool_V3.0.3` (`.xlsx` from [fitsm.eu](https://www.fitsm.eu/downloads/), or `.ods`) maps to the database. The schema lives in `db/migrations/`.

## Table of Contents

- [Catalog seed](#catalog-seed)
- [Included sheets](#included-sheets)
- [Dropdown FK mapping](#dropdown-fk-mapping)
- [History](#history)
- [Reporting parity](#reporting-parity)

## Catalog seed

- The FitSM-6 catalog (processes, requirements and the guidance for each capability score) ships as migration `0017_fitsm6_catalog_seed.sql`, so every install has it without the workbook.
- The texts are reproduced verbatim from the workbook, which is licensed under [CC BY-ND 4.0](https://creativecommons.org/licenses/by-nd/4.0/); never edit them by hand. See [NOTICE](../NOTICE).
- Regenerate the seed after a new FitSM release with `scripts/generate-fitsm-seed.sh <workbook>` (dev container running), then review the diff.
- `scripts/import-fitsm.sh` is only needed to import a filled-in workbook as an example audit.

[↑ Back to TOC](#table-of-contents)

## Included sheets

- `2. Scope & Goals` -> `audit_scope_targets`
- `3. Assessment` -> `processes`, `requirements`, `requirement_level_guidance`, `audit_assessments`
- `8. Audit Details` -> `audit_detail_responses` (with seeded `audit_detail_fields`)
- `7. Conclusions` -> `audit_conclusions`
- `Sources` -> `capability_scores` + `scope_options` (seeded by migration)

[↑ Back to TOC](#table-of-contents)

## Dropdown FK mapping

- Assessment score (`Select …`, `0`, `1`, `2`, `3`, `4`) -> `capability_scores.id`
- Scope (`In scope`, `Out of scope`) -> `scope_options.id`
- Certification/custom target (`1..4`) -> `target_levels.level`

[↑ Back to TOC](#table-of-contents)

## History

- Every assessment change can be written to `assessment_events`.
- User notes are stored in `assessment_notes`.
- Evidence references are stored in `assessment_evidence`.
- Timestamps are stored in UTC in columns with the `*_UTC` suffix (for example `created_UTC`, `audit_date_UTC`); see [ui-date-formatting.md](ui-date-formatting.md).

[↑ Back to TOC](#table-of-contents)

## Reporting parity

Views in `db/migrations/0012_views.sql` mirror the workbook logic:

- `v_all_results`
- `v_certification_results`
- `v_gap_analysis`
- `v_trends`

[↑ Back to TOC](#table-of-contents)

---

© 2026 UncleJS — Licensed under [AGPL-3.0-or-later](https://www.gnu.org/licenses/agpl-3.0.txt)
