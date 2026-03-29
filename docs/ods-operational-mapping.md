# ODS Operational Mapping

![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC_BY--NC--SA_4.0-lightgrey.svg)
![Source: ODS](https://img.shields.io/badge/source-ODS-0A7E07)
![Target: MariaDB](https://img.shields.io/badge/target-MariaDB-003545)

Workbook: `FitSM-6_Assessment_and_Audit_Tool_V3.0.3.ods`

## Table of Contents

- [Included sheets](#included-sheets)
- [Dropdown FK mapping](#dropdown-fk-mapping)
- [History](#history)
- [Reporting parity](#reporting-parity)
- [License footer](#license-footer)

## Included sheets

- `2. Scope & Goals` -> `audit_scope_targets`
- `3. Assessment` -> `processes`, `requirements`, `requirement_level_guidance`, `audit_assessments`
- `8. Audit Details` -> `audit_detail_responses` (with seeded `audit_detail_fields`)
- `7. Conclusions` -> `audit_conclusions`
- `Sources` -> `capability_scores` + `scope_options` (seeded by migration)

[Go to TOC](#table-of-contents)

## Dropdown FK mapping

- Assessment score (`Select …`, `0`, `1`, `2`, `3`, `4`) -> `capability_scores.id`
- Scope (`In scope`, `Out of scope`) -> `scope_options.id`
- Certification/custom target (`1..4`) -> `target_levels.level`

[Go to TOC](#table-of-contents)

## History

- Every assessment change can be emitted to `assessment_events`.
- User notes are stored in `assessment_notes`.
- Evidence references are stored in `assessment_evidence`.

[Go to TOC](#table-of-contents)

## Reporting parity

Views in `0012_views.sql` mirror workbook logic:

- `v_all_results`
- `v_certification_results`
- `v_gap_analysis`
- `v_trends`

[Go to TOC](#table-of-contents)

## License footer

© Audit FitSM contributors. Licensed under [CC BY-NC-SA 4.0](../LICENSE.md).

[Go to TOC](#table-of-contents)
