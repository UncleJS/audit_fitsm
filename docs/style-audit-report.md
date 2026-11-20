# Documentation Compliance Checklist

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](../LICENSE) [![CI](https://github.com/UncleJS/audit_fitsm/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/UncleJS/audit_fitsm/actions/workflows/ci.yml)

Checklist date: 2026-11-20. State of the Markdown pages after the relicensing to AGPL-3.0-or-later and the documentation overhaul, checked against [documentation-style.md](documentation-style.md).

## Table of Contents

- [Rules checked](#rules-checked)
- [How it was checked](#how-it-was-checked)
- [Per-file results](#per-file-results)
- [Changes in this pass](#changes-in-this-pass)
- [Known gaps](#known-gaps)

## Rules checked

1. H1 followed by a shields.io badge row with the AGPL license badge; no CC BY badges
2. `## Table of Contents` listing every `##` and nested `###`, without the H1 or the TOC itself
3. every TOC anchor resolves to a heading (GitHub slug rules)
4. every listed section ends with `[↑ Back to TOC](#table-of-contents)`
5. `---` and the AGPL footer are the last lines; no "License footer" section
6. diagrams are Mermaid only
7. dates as `yyyy-MM-dd`, no month-name dates

[↑ Back to TOC](#table-of-contents)

## How it was checked

A small script ran in a throwaway `docker.io/oven/bun:1.2.22` container (files streamed in with `tar`, no mounts). It parsed headings outside code fences, computed GitHub slugs, compared them with the TOC links, checked the last non-blank line of every section, and checked the badge row and footer. Rules 6 and 7 were checked by reading and `grep`.

[↑ Back to TOC](#table-of-contents)

## Per-file results

| File | Badges | TOC complete | Anchors resolve | Back links | Footer | Mermaid only |
|------|--------|--------------|-----------------|------------|--------|--------------|
| `README.md` | yes | yes | yes | yes | yes | yes |
| `docs/README.md` | yes | yes | yes | yes | yes | n/a |
| `docs/api-surface.md` | yes | yes | yes | yes | yes | n/a |
| `docs/audit-workspace.md` | yes | yes | yes | yes | yes | n/a |
| `docs/ci-runbook.md` | yes | yes | yes | yes | yes | yes |
| `docs/development-runtime.md` | yes | yes | yes | yes | yes | n/a |
| `docs/documentation-style.md` | yes | yes | yes | yes | yes | yes |
| `docs/integration-testing.md` | yes | yes | yes | yes | yes | n/a |
| `docs/ods-operational-mapping.md` | yes | yes | yes | yes | yes | n/a |
| `docs/security-model.md` | yes | yes | yes | yes | yes | yes |
| `docs/style-audit-report.md` | yes | yes | yes | yes | yes | n/a |
| `docs/TEMPLATE.md` | yes | yes | yes | yes | yes | n/a |
| `docs/ui-date-formatting.md` | yes | yes | yes | yes | yes | n/a |
| `AGENTS.md` | exempt | exempt | exempt | exempt | exempt | exempt |

`n/a` means the page has no diagrams.

[↑ Back to TOC](#table-of-contents)

## Changes in this pass

- License changed from CC BY 4.0 to AGPL-3.0-or-later: `LICENSE.md` removed, the full AGPL v3 text added as `LICENSE`, all CC BY badges and "License footer" sections replaced with the AGPL badge and footer.
- `README.md`: TOC no longer lists the H1 and the TOC; documentation index completed; lifecycle scripts section, Mermaid architecture diagram, upgrade notes and the license notice added.
- `docs/ci-runbook.md` and `docs/documentation-style.md`: `###` headings added to the TOC with back links.
- `docs/api-surface.md`: stray mid-section TOC link removed; `POST /auth/refresh` and status codes added.
- `docs/security-model.md`: rewritten for cookie-only sessions, CSRF header, rate limits and Podman secrets; Mermaid sequence diagram added.
- Stale references removed: `.systemd/` services, published DB and phpMyAdmin ports, bearer tokens, `ALLOW_INSECURE_DEFAULTS` as local policy, `/tmp/api.log`, `Containerfile.dev`, `.quadlet/`.
- `docs/TEMPLATE.md` and `scripts/new-doc.sh` now produce compliant pages.

[↑ Back to TOC](#table-of-contents)

## Known gaps

- Database date/time columns use the `*_UTC` suffix (migration `0016_utc_column_names.sql`).
- `apps/api/src/config.ts` still reads a legacy `ALLOW_INSECURE_DEFAULTS` flag; nothing in the repo sets it.

[↑ Back to TOC](#table-of-contents)

---

© 2026 UncleJS — Licensed under [AGPL-3.0-or-later](https://www.gnu.org/licenses/agpl-3.0.txt)
