# UI Date and Timestamp Formatting

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](../LICENSE) [![CI](https://github.com/UncleJS/audit_fitsm/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/UncleJS/audit_fitsm/actions/workflows/ci.yml) [![Format](https://img.shields.io/badge/format-yyyy--MM--dd_HH:mm:ss-2ea44f)](#standards)

Policy for date-only inputs, timestamp rendering and UTC handling across the database, API and web UI.

## Table of Contents

- [Standards](#standards)
- [UTC storage and transport](#utc-storage-and-transport)
- [Date-only input rule](#date-only-input-rule)
- [Timestamp display rule](#timestamp-display-rule)
- [Implementation in this repo](#implementation-in-this-repo)
- [Acceptance checks](#acceptance-checks)

## Standards

| Layer | Format |
|-------|--------|
| UI date-only | `yyyy-MM-dd` (locale-independent), e.g. `2026-11-20` |
| UI timestamp | viewer's local time as `yyyy-MM-dd HH:mm:ss`, 24-hour, e.g. `2026-11-20 14:05:09` |
| API transport | ISO 8601 UTC with `Z`, e.g. `2026-11-20T14:05:09Z` |
| Database | UTC |
| Logs and backend output | UTC |

[↑ Back to TOC](#table-of-contents)

## UTC storage and transport

- MariaDB runs with `--default-time-zone=+00:00` and `TZ=UTC` (`quadlet/audit-fitsm-db.container`).
- The API connection pool uses `timezone: "Z"` and runs `SET time_zone = '+00:00'` on every connection (`apps/api/src/db.ts`).
- The dev container runs with `TZ=UTC`.
- The API returns ISO 8601 UTC strings; the UI converts them to local time for display and converts local input back to UTC before saving.
- Known gap: the timestamp columns still use `*_at` names (for example `created_at`). The rename to the `*_UTC` suffix is deferred; the values are already UTC.

[↑ Back to TOC](#table-of-contents)

## Date-only input rule

- Do **not** use a raw `<input type="date">` in page or form code.
- Use the wrapper component, which renders `yyyy-MM-dd` consistently through a transparent overlay.
- The native date input is allowed only inside that wrapper.

[↑ Back to TOC](#table-of-contents)

## Timestamp display rule

- Never rely on browser locale renderers for operational timestamps.
- Convert API UTC timestamps to local time and render them as `yyyy-MM-dd HH:mm:ss`.
- Use the shared formatter so output is the same on every page.

[↑ Back to TOC](#table-of-contents)

## Implementation in this repo

- Date-only input wrapper: `apps/web/app/components/date-only-input.tsx`
- Shared formatters: `apps/web/app/lib/date-format.ts` (`formatDateOnly`, `formatLocalTimestamp`, `localDateString`, `isValidDateOnly`), tested in `apps/web/app/lib/date-format.test.ts`
- Main users: the dashboard (`apps/web/app/(main)/page.tsx`) and the audit workspace (`apps/web/app/(main)/audits/[auditId]/page.tsx`)

[↑ Back to TOC](#table-of-contents)

## Acceptance checks

- Policy script (also runs in CI):

```bash
scripts/check-ui-date-inputs.sh
```

- Open the UI and verify:
  - the audit date field shows `yyyy-MM-dd`
  - event, note and export timestamps show local `yyyy-MM-dd HH:mm:ss`

[↑ Back to TOC](#table-of-contents)

---

© 2026 UncleJS — Licensed under [AGPL-3.0-or-later](https://www.gnu.org/licenses/agpl-3.0.txt)
