# UI Date and Timestamp Formatting

![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC_BY--NC--SA_4.0-lightgrey.svg)
![UI](https://img.shields.io/badge/ui-date_formatting-purple)
![Format](https://img.shields.io/badge/format-yyyy--mm--dd%20%7C%20YYYY--MM--DD%20HH:mm:ss-2ea44f)

Policy for date-only inputs and timestamp rendering in the web UI.

## Table of Contents

- [Standards](#standards)
- [Date-only input rule](#date-only-input-rule)
- [Timestamp display rule](#timestamp-display-rule)
- [Implementation in this repo](#implementation-in-this-repo)
- [Acceptance checks](#acceptance-checks)
- [License footer](#license-footer)

## Standards

- Date-only UI display: `yyyy-mm-dd` (locale-independent)
- Timestamp UI display: local `YYYY-MM-DD HH:mm:ss`
- DB storage: UTC
- API transport: ISO-8601 UTC

[Go to TOC](#table-of-contents)

## Date-only input rule

- Do **not** use raw `<input type="date">` directly in page/form code.
- Use a wrapper component that enforces consistent text rendering (`yyyy-mm-dd`) via transparent overlay pattern.
- Native date input is allowed only inside that wrapper component.

[Go to TOC](#table-of-contents)

## Timestamp display rule

- Never rely on browser locale renderers for operational timestamps.
- Convert API UTC timestamps to local time in UI and render as `YYYY-MM-DD HH:mm:ss`.
- Use a shared formatter utility to keep output consistent across pages.

[Go to TOC](#table-of-contents)

## Implementation in this repo

- Date-only input wrapper: `apps/web/app/components/date-only-input.tsx`
- Shared formatters: `apps/web/app/lib/date-format.ts`
- Current usage examples:
  - `apps/web/app/page.tsx`
  - `apps/web/app/audits/[auditId]/page.tsx`

[Go to TOC](#table-of-contents)

## Acceptance checks

- Policy script:

```bash
scripts/check-ui-date-inputs.sh
```

- `rg -n "type=\"date\"|type='date'" apps/web/app`
  - expected: only wrapper component path
- Open UI and verify:
  - audit date field shows `yyyy-mm-dd`
  - event/note/export timestamps show local `YYYY-MM-DD HH:mm:ss`

[Go to TOC](#table-of-contents)

## License footer

© Audit FitSM contributors. Licensed under [CC BY-NC-SA 4.0](../LICENSE.md).

[Go to TOC](#table-of-contents)
